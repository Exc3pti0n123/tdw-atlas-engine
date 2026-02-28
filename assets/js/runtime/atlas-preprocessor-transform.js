/* ============================================================
   Module: TDW Atlas Engine — Runtime Preprocessor Transform
   ------------------------------------------------------------
   Purpose:
   - Prepare renderer-agnostic runtime map artifacts.
   - Build per-map runtime geometry artifacts.
   - Keep geometry transformations out of adapters.

   Public surface (ESM export):
   - prepareRuntimeMapData(sourceMapData, options)
   - buildPassthroughPreprocessedBundle(mapData, datasetKey)
   ============================================================ */

import {
  isPlainObject,
  normalizeBool,
  normalizeCountryCode,
} from '../helpers/atlas-shared.js';
import { isCountryIncluded } from './atlas-preprocessor-whitelist.js';

/* ============================================================
   1) MODULE INIT
   ============================================================ */

const root = typeof window !== 'undefined' ? window : globalThis;
root.TDW = root.TDW || {};
root.TDW.Atlas = root.TDW.Atlas || {};

const SCOPE = 'ATLAS PREPROCESSOR';

const { dlog = () => {}, dwarn = () => {},
  derror = (...args) => console.error('[TDW ATLAS FATAL]', `[${SCOPE}]`, ...args),
} = window.TDW?.Logger?.createScopedLogger?.(SCOPE) || {};

export const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;
const DEFAULT_COUNTRY_CODE_ALIASES = Object.freeze({
  // Natural Earth ships Somaliland as ADM0_A3=SOL without usable ISO_A2.
  SOL: 'SO',
});

const DEFAULT_MULTI_POLYGON_TASK = Object.freeze({
  mode: 'keepLargestPolygon',
  topN: 1,
  dropPartIndexes: [],
  idByPartIndex: {},
  countryCodeByPartIndex: {},
});

const DEFAULT_GEOMETRY_QUALITY = Object.freeze({
  minArea: 0,
  minVertices: 0,
  microPolygon: {
    enabled: false,
    absMinArea: 0,
    relMinRatio: 0,
  },
});

/* ============================================================
   2) FUNCTIONS
   ============================================================ */

/**
 * @param {unknown} value
 * @param {string} fallback
 * @returns {string}
 */
export function normalizeDatasetKey(value, fallback = 'world-v1') {
  const key = String(value || '').trim().toLowerCase();
  return key || fallback;
}

/**
 * @param {object} properties
 * @param {Record<string, string>} countryCodeAliases
 * @returns {string}
 */
export function resolveCountryCode(properties, countryCodeAliases = DEFAULT_COUNTRY_CODE_ALIASES) {
  const props = isPlainObject(properties) ? properties : {};
  const primary = normalizeCountryCode(props.ISO_A2_EH);
  if (COUNTRY_CODE_PATTERN.test(primary)) return primary;

  const fallback = normalizeCountryCode(props.ISO_A2);
  if (COUNTRY_CODE_PATTERN.test(fallback)) return fallback;

  const adm0A3 = String(props.ADM0_A3 || '').trim().toUpperCase();
  const aliased = normalizeCountryCode(countryCodeAliases?.[adm0A3] || '');
  if (COUNTRY_CODE_PATTERN.test(aliased)) return aliased;

  return '';
}

/**
 * @param {object} properties
 * @param {string} fallbackCode
 * @returns {string}
 */
export function resolveCountryName(properties, fallbackCode) {
  const props = isPlainObject(properties) ? properties : {};
  return String(props.NAME_EN || props.NAME || props.ADMIN || fallbackCode || '').trim();
}

/**
 * Resolve a display name from ISO-A2 for promoted/overridden parts.
 *
 * @param {string} countryCode
 * @param {string} fallbackName
 * @returns {string}
 */
function resolveCountryNameFromCode(countryCode, fallbackName = '') {
  const code = normalizeCountryCode(countryCode);
  if (!COUNTRY_CODE_PATTERN.test(code)) return String(fallbackName || '').trim();

  try {
    if (typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function') {
      const displayNames = new Intl.DisplayNames(['en'], { type: 'region' });
      const resolved = String(displayNames.of(code) || '').trim();
      if (resolved) return resolved;
    }
  } catch (_err) {
    // Use fallback when DisplayNames is unavailable.
  }

  return String(fallbackName || code).trim();
}

/**
 * @param {object} geojson
 * @returns {object[]}
 */
export function getFeatureList(geojson) {
  if (!isPlainObject(geojson) || geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
    // ATTENTION: intentional hard-stop for diagnosability; runtime could continue with empty fallback feature list.
    throw new Error('GeoJSON must be a FeatureCollection with a features array.');
  }
  return geojson.features;
}

/**
 * @param {object} feature
 * @returns {number}
 */
function getFeatureVertexCount(feature) {
  const coordinates = feature?.geometry?.coordinates;
  if (!Array.isArray(coordinates)) return 0;

  let count = 0;
  for (const ring of coordinates) {
    if (!Array.isArray(ring)) continue;
    count += ring.length;
  }
  return count;
}

/**
 * Shoelace formula over outer ring for a cheap area proxy.
 *
 * @param {number[][]} ring
 * @returns {number}
 */
function ringArea(ring) {
  if (!Array.isArray(ring) || ring.length < 3) return 0;

  let area = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    if (!Array.isArray(a) || !Array.isArray(b)) continue;
    area += ((Number(a[0]) || 0) * (Number(b[1]) || 0)) - ((Number(b[0]) || 0) * (Number(a[1]) || 0));
  }

  return Math.abs(area / 2);
}

/**
 * @param {object} feature
 * @returns {number}
 */
function getFeatureArea(feature) {
  const coordinates = feature?.geometry?.coordinates;
  if (!Array.isArray(coordinates) || !Array.isArray(coordinates[0])) return 0;
  return ringArea(coordinates[0]);
}

/**
 * @param {string} datasetKey
 * @param {string} countryCode
 * @param {number} featureIndex
 * @param {number} partIndex
 * @returns {string}
 */
function makePartId(datasetKey, countryCode, featureIndex, partIndex) {
  return `${datasetKey}:${countryCode}:${featureIndex}:${partIndex}`;
}

/**
 * @param {object} feature
 * @param {number} featureIndex
 * @param {string} countryCode
 * @param {string} countryName
 * @param {string} datasetKey
 * @returns {object[]}
 */
function splitToPolygonFeatures(feature, featureIndex, countryCode, countryName, datasetKey) {
  const geometry = feature?.geometry;
  const baseProps = isPlainObject(feature?.properties) ? { ...feature.properties } : {};

  if (!isPlainObject(geometry) || !Array.isArray(geometry.coordinates)) {
    // ATTENTION: intentional hard-stop for diagnosability; runtime could continue by skipping malformed features.
    throw new Error(`Feature #${featureIndex} has invalid geometry.`);
  }

  if (geometry.type === 'Polygon') {
    return [{
      type: 'Feature',
      id: feature?.id ?? `f-${featureIndex}:0`,
      properties: {
        ...baseProps,
        tdwSplitPartIndex: 0,
        tdwCountryCode: countryCode,
        tdwCountryName: countryName,
        tdwPartId: makePartId(datasetKey, countryCode, featureIndex, 0),
      },
      geometry: {
        type: 'Polygon',
        coordinates: geometry.coordinates,
      },
    }];
  }

  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.map((polygonCoords, polygonIndex) => ({
      type: 'Feature',
      id: `${feature?.id ?? `f-${featureIndex}`}:${polygonIndex}`,
      properties: {
        ...baseProps,
        tdwSplitPartIndex: polygonIndex,
        tdwCountryCode: countryCode,
        tdwCountryName: countryName,
        tdwPartId: makePartId(datasetKey, countryCode, featureIndex, polygonIndex),
      },
      geometry: {
        type: 'Polygon',
        coordinates: polygonCoords,
      },
    }));
  }

  // ATTENTION: intentional hard-stop for diagnosability; runtime could continue by skipping unsupported geometry types.
  throw new Error(`Unsupported geometry type "${String(geometry.type)}" in feature #${featureIndex}.`);
}

/**
 * @param {object[]} polygonParts
 * @returns {object[]}
 */
function keepLargestPolygon(polygonParts) {
  if (!polygonParts.length) return [];
  const sorted = [...polygonParts].sort((a, b) => getFeatureArea(b) - getFeatureArea(a));
  return [sorted[0]];
}

/**
 * @param {object[]} polygonParts
 * @returns {object[]}
 */
function keepAll(polygonParts) {
  return [...polygonParts];
}

/**
 * @param {object[]} polygonParts
 * @param {number} topN
 * @returns {object[]}
 */
function keepTopN(polygonParts, topN) {
  const n = Number.isInteger(topN) ? topN : Number.parseInt(String(topN || ''), 10);
  if (!Number.isFinite(n) || n <= 0) {
    // ATTENTION: intentional hard-stop for diagnosability; runtime could continue by falling back to keepLargestPolygon.
    throw new Error('keepTopN requires a positive integer topN value.');
  }
  return [...polygonParts]
    .sort((a, b) => getFeatureArea(b) - getFeatureArea(a))
    .slice(0, n);
}

/**
 * @param {object[]} polygonParts
 * @param {number[]} dropPartIndexes
 * @returns {object[]}
 */
function dropParts(polygonParts, dropPartIndexes) {
  if (!Array.isArray(dropPartIndexes) || !dropPartIndexes.length) return [...polygonParts];

  const drop = new Set(
    dropPartIndexes
      .map((entry) => Number.parseInt(String(entry), 10))
      .filter((entry) => Number.isInteger(entry) && entry >= 0)
  );

  if (!drop.size) return [...polygonParts];

  return polygonParts.filter((part) => {
    const index = Number.parseInt(String(part?.properties?.tdwSplitPartIndex ?? '-1'), 10);
    return !drop.has(index);
  });
}

/**
 * @param {object[]} polygonParts
 * @param {string} fallbackCountryCode
 * @param {object} task
 * @returns {object[]}
 */
function setPolygonId(polygonParts, fallbackCountryCode, task) {
  const idByPartIndex = isPlainObject(task?.idByPartIndex) ? task.idByPartIndex : {};
  const countryCodeByPartIndex = isPlainObject(task?.countryCodeByPartIndex) ? task.countryCodeByPartIndex : {};

  return polygonParts.map((part, listIndex) => {
    const props = isPlainObject(part?.properties) ? { ...part.properties } : {};
    const partIndex = Number.parseInt(String(props.tdwSplitPartIndex ?? listIndex), 10);

    const overrideCountryCode = normalizeCountryCode(countryCodeByPartIndex[String(partIndex)] || '');
    const finalCountryCode = COUNTRY_CODE_PATTERN.test(overrideCountryCode)
      ? overrideCountryCode
      : fallbackCountryCode;

    const overridePolygonId = String(idByPartIndex[String(partIndex)] || '').trim();
    const polygonId = overridePolygonId || `${finalCountryCode}:${partIndex}`;

    return {
      ...part,
      properties: {
        ...props,
        tdwCountryCode: finalCountryCode,
        tdwPolygonId: polygonId,
      },
    };
  });
}

/**
 * @param {object[]} polygonParts
 * @param {object} task
 * @returns {object[]}
 */
function applyMultiPolygonTask(polygonParts, task) {
  const mode = String(task?.mode || 'keepLargestPolygon');

  if (mode === 'keepLargestPolygon') return keepLargestPolygon(polygonParts);
  if (mode === 'keepAll') return keepAll(polygonParts);
  if (mode === 'keepTopN') return keepTopN(polygonParts, task?.topN);
  if (mode === 'dropParts') return dropParts(polygonParts, task?.dropPartIndexes);

  // ATTENTION: intentional hard-stop for diagnosability; runtime could continue by falling back to keepLargestPolygon.
  throw new Error(`Unsupported multiPolygon mode "${mode}".`);
}

/**
 * @param {object[]} polygonParts
 * @param {string} countryCode
 * @param {object} rulesByPartId
 * @returns {{parts: object[], dropped: number}}
 */
function applyPartRules(polygonParts, countryCode, rulesByPartId) {
  if (!isPlainObject(rulesByPartId)) {
    return { parts: polygonParts, dropped: 0 };
  }

  const next = [];
  let dropped = 0;

  for (const part of polygonParts) {
    const props = isPlainObject(part?.properties) ? { ...part.properties } : {};
    const partId = String(props.tdwPartId || '').trim();
    const rule = partId ? rulesByPartId[partId] : null;

    if (!isPlainObject(rule)) {
      next.push(part);
      continue;
    }

    const action = String(rule.action || '').trim().toLowerCase();

    if (action === 'drop') {
      dropped += 1;
      continue;
    }

    if (action === 'keep' || action === 'promote') {
      const countryOverride = normalizeCountryCode(rule.countryCodeOverride || '');
      const polygonOverride = String(rule.polygonIdOverride || '').trim();
      const hasCountryOverride = COUNTRY_CODE_PATTERN.test(countryOverride);
      const finalCountryCode = hasCountryOverride ? countryOverride : countryCode;
      const fallbackName = String(props.tdwCountryName || props.NAME_EN || props.NAME || props.ADMIN || countryCode).trim();
      const finalCountryName = hasCountryOverride
        ? resolveCountryNameFromCode(finalCountryCode, fallbackName)
        : fallbackName;

      next.push({
        ...part,
        properties: {
          ...props,
          tdwCountryCode: finalCountryCode,
          tdwCountryName: finalCountryName,
          tdwPolygonId: polygonOverride || String(props.tdwPolygonId || '').trim(),
        },
      });
      continue;
    }

    // ATTENTION: intentional hard-stop for diagnosability; runtime could continue by ignoring unknown rule actions.
    throw new Error(`Unsupported part rule action "${action}" for country ${countryCode}.`);
  }

  return { parts: next, dropped };
}

/**
 * Mini-workflow for one country feature:
 * 1) split
 * 2) (MultiPolygon only) micro-polygon cleanup
 * 3) apply task mode
 * 4) assign polygon ids
 *
 * @param {object} feature
 * @param {number} featureIndex
 * @param {string} countryCode
 * @param {string} countryName
 * @param {object} task
 * @param {string} datasetKey
 * @param {{enabled?: boolean, absMinArea?: number, relMinRatio?: number}} microPolygon
 * @returns {{splitCount: number, microKeptCount: number, selectedCount: number, microDropped: number, parts: object[]}}
 */
function processMultiPolygon(feature, featureIndex, countryCode, countryName, task, datasetKey, microPolygon) {
  const splitParts = splitToPolygonFeatures(feature, featureIndex, countryCode, countryName, datasetKey);
  const geometryType = String(feature?.geometry?.type || '');
  const isMultiPolygon = geometryType === 'MultiPolygon';
  const microCleaned = isMultiPolygon
    ? applyMicroPolygonCleanup(splitParts, microPolygon)
    : { parts: splitParts, dropped: 0 };
  const selectedParts = applyMultiPolygonTask(microCleaned.parts, task);
  const finalizedParts = setPolygonId(selectedParts, countryCode, task);

  return {
    splitCount: splitParts.length,
    microKeptCount: microCleaned.parts.length,
    selectedCount: selectedParts.length,
    microDropped: microCleaned.dropped,
    parts: finalizedParts,
  };
}

/**
 * Drop tiny polygon parts by absolute and relative area thresholds.
 * Safety guard keeps the largest part if all parts would be removed.
 *
 * @param {object[]} polygonParts
 * @param {{enabled?: boolean, absMinArea?: number, relMinRatio?: number}} microPolygon
 * @returns {{parts: object[], dropped: number}}
 */
function applyMicroPolygonCleanup(polygonParts, microPolygon) {
  const enabled = normalizeBool(microPolygon?.enabled, false);
  if (!enabled || !Array.isArray(polygonParts) || polygonParts.length <= 1) {
    return { parts: Array.isArray(polygonParts) ? polygonParts : [], dropped: 0 };
  }

  const absMinArea = Math.max(0, Number(microPolygon?.absMinArea || 0));
  const relMinRatio = Math.max(0, Number(microPolygon?.relMinRatio || 0));
  const withArea = polygonParts.map((part) => ({ part, area: getFeatureArea(part) }));
  const largestArea = withArea.reduce((max, entry) => Math.max(max, entry.area), 0);

  const filtered = withArea
    .filter((entry) => {
      if (absMinArea > 0 && entry.area < absMinArea) return false;
      if (relMinRatio > 0 && largestArea > 0 && (entry.area / largestArea) < relMinRatio) return false;
      return true;
    })
    .map((entry) => entry.part);

  if (!filtered.length) {
    const largest = [...withArea].sort((a, b) => b.area - a.area)[0]?.part;
    if (largest) {
      return { parts: [largest], dropped: Math.max(0, polygonParts.length - 1) };
    }
    return { parts: [], dropped: polygonParts.length };
  }

  return { parts: filtered, dropped: Math.max(0, polygonParts.length - filtered.length) };
}

/**
 * @param {object[]} polygonParts
 * @param {object} geometryQuality
 * @returns {object[]}
 */
function applyGeometryQuality(polygonParts, geometryQuality) {
  const minArea = Number(geometryQuality?.minArea || 0);
  const minVertices = Number(geometryQuality?.minVertices || 0);

  return polygonParts.filter((part) => {
    if (minArea > 0 && getFeatureArea(part) < minArea) return false;
    if (minVertices > 0 && getFeatureVertexCount(part) < minVertices) return false;
    return true;
  });
}

/**
 * @param {object} preprocessConfig
 * @param {string} countryCode
 * @returns {object}
 */
function resolveCountryTask(preprocessConfig, countryCode) {
  const multiPolygon = isPlainObject(preprocessConfig?.multiPolygon) ? preprocessConfig.multiPolygon : {};

  const defaults = {
    ...DEFAULT_MULTI_POLYGON_TASK,
    ...(isPlainObject(multiPolygon.default) ? multiPolygon.default : {}),
  };

  const countryTasks = isPlainObject(multiPolygon.countries) ? multiPolygon.countries : {};
  const countryOverride = isPlainObject(countryTasks[countryCode]) ? countryTasks[countryCode] : {};

  return {
    ...defaults,
    ...countryOverride,
  };
}

/**
 * @param {object} preprocessConfig
 * @returns {object}
 */
function resolveGeometryQuality(preprocessConfig) {
  const geometryQuality = isPlainObject(preprocessConfig?.geometryQuality) ? preprocessConfig.geometryQuality : {};
  const rawMicroPolygon = isPlainObject(geometryQuality?.microPolygon) ? geometryQuality.microPolygon : {};
  const defaultMicroPolygon = isPlainObject(DEFAULT_GEOMETRY_QUALITY.microPolygon)
    ? DEFAULT_GEOMETRY_QUALITY.microPolygon
    : { enabled: false, absMinArea: 0, relMinRatio: 0 };
  const microPolygon = {
    enabled: normalizeBool(rawMicroPolygon.enabled, defaultMicroPolygon.enabled),
    absMinArea: Math.max(0, Number(rawMicroPolygon.absMinArea ?? defaultMicroPolygon.absMinArea ?? 0)),
    relMinRatio: Math.max(0, Number(rawMicroPolygon.relMinRatio ?? defaultMicroPolygon.relMinRatio ?? 0)),
  };

  return {
    ...DEFAULT_GEOMETRY_QUALITY,
    ...geometryQuality,
    microPolygon,
  };
}

/**
 * @param {object} preprocessConfig
 * @returns {object}
 */
function resolvePartRules(preprocessConfig) {
  return isPlainObject(preprocessConfig?.partRules) ? preprocessConfig.partRules : {};
}

/**
 * @param {object} preprocessConfig
 * @returns {Record<string, string>}
 */
export function resolveCountryCodeAliases(preprocessConfig) {
  const rawAliases = isPlainObject(preprocessConfig?.countryCodeAliases)
    ? preprocessConfig.countryCodeAliases
    : {};

  const aliases = { ...DEFAULT_COUNTRY_CODE_ALIASES };
  for (const [rawKey, rawValue] of Object.entries(rawAliases)) {
    const key = String(rawKey || '').trim().toUpperCase();
    const value = normalizeCountryCode(rawValue);
    if (!/^[A-Z0-9]{3}$/.test(key)) continue;
    if (!COUNTRY_CODE_PATTERN.test(value)) continue;
    aliases[key] = value;
  }

  return aliases;
}

/**
 * @param {object[]} runtimeFeatures
 */
function validateOutput(runtimeFeatures) {
  if (!runtimeFeatures.length) {
    // ATTENTION: intentional hard-stop for diagnosability; runtime could continue with an empty map canvas.
    throw new Error('GeoJSON preprocessing removed all features; check whitelist and preprocess policy.');
  }
}

/**
 * @param {object[]} runtimeFeatures
 * @param {object} audit
 * @returns {{runtimeMap: object, audit: object}}
 */
function emitArtifacts(runtimeFeatures, audit) {
  return {
    runtimeMap: {
      type: 'FeatureCollection',
      features: runtimeFeatures,
    },
    audit,
  };
}

/* ============================================================
   3) PUBLIC API
   ============================================================ */

/**
 * Prepare one runtime map artifact from one source.
 *
 * @param {object} sourceMapData
 * @param {{whitelistModel: object, preprocess?: object, datasetKey?: string, countryCodeAliases?: Record<string,string>}} options
 * @returns {{runtimeMap: object, audit: object}}
 */
export function prepareRuntimeMapData(sourceMapData, options = {}) {
  const sourceFeatures = getFeatureList(sourceMapData);
  const preprocess = isPlainObject(options?.preprocess) ? options.preprocess : {};
  const preprocessEnabled = normalizeBool(preprocess?.enabled, true);
  const geometryQuality = preprocessEnabled
    ? resolveGeometryQuality(preprocess)
    : { ...DEFAULT_GEOMETRY_QUALITY };
  const partRules = preprocessEnabled ? resolvePartRules(preprocess) : {};
  const microPolygon = isPlainObject(geometryQuality?.microPolygon)
    ? geometryQuality.microPolygon
    : { enabled: false, absMinArea: 0, relMinRatio: 0 };

  const whitelistModel = isPlainObject(options?.whitelistModel) ? options.whitelistModel : null;
  if (!whitelistModel) {
    // ATTENTION: intentional hard-stop for diagnosability; runtime could continue with implicit include-all whitelist.
    throw new Error('Runtime preprocessor requires whitelistModel.');
  }

  const datasetKey = normalizeDatasetKey(options?.datasetKey, 'world-v1');
  const countryCodeAliases = isPlainObject(options?.countryCodeAliases)
    ? options.countryCodeAliases
    : DEFAULT_COUNTRY_CODE_ALIASES;

  const runtimeFeatures = [];
  const audit = {
    sourceFeatures: sourceFeatures.length,
    keptFeatures: 0,
    droppedByWhitelist: 0,
    droppedByMultiPolygonTask: 0,
    droppedByMicroPolygonCleanup: 0,
    droppedByGeometryQuality: 0,
    droppedByPartRules: 0,
  };

  sourceFeatures.forEach((feature, featureIndex) => {
    const sourceProps = isPlainObject(feature?.properties) ? feature.properties : {};
    const countryCode = resolveCountryCode(sourceProps, countryCodeAliases);
    if (!countryCode || !isCountryIncluded(countryCode, whitelistModel)) {
      audit.droppedByWhitelist += 1;
      return;
    }

    const countryName = resolveCountryName(sourceProps, countryCode);
    const task = preprocessEnabled
      ? resolveCountryTask(preprocess, countryCode)
      : { ...DEFAULT_MULTI_POLYGON_TASK, mode: 'keepAll' };
    const processed = processMultiPolygon(
      feature,
      featureIndex,
      countryCode,
      countryName,
      task,
      datasetKey,
      microPolygon
    );
    const qualityFiltered = applyGeometryQuality(processed.parts, geometryQuality);

    const rulesByCountry = isPlainObject(partRules[countryCode]) ? partRules[countryCode] : {};
    const ruled = applyPartRules(qualityFiltered, countryCode, rulesByCountry);

    audit.droppedByMicroPolygonCleanup += processed.microDropped;
    audit.droppedByMultiPolygonTask += Math.max(0, processed.microKeptCount - processed.selectedCount);
    audit.droppedByGeometryQuality += Math.max(0, processed.selectedCount - qualityFiltered.length);
    audit.droppedByPartRules += ruled.dropped;

    runtimeFeatures.push(...ruled.parts);
  });

  validateOutput(runtimeFeatures);

  audit.keptFeatures = runtimeFeatures.length;
  const artifacts = emitArtifacts(runtimeFeatures, audit);

  return artifacts;
}

/**
 * Build runtime bundle without preprocessing.
 *
 * @param {object} mapData
 * @param {string} datasetKey
 * @returns {{
 *   datasetKey: string,
 *   flags: {preprocessEnabled: boolean, whitelistEnabled: boolean, groupingEnabled: boolean, groupingMode: string, regionLayerEnabled: boolean},
 *   countryGrouping: object,
 *   countryRuntimeMap: object,
 *   regionRuntimeMap: null,
 *   countryAudit: object,
 *   regionAudit: null,
 *   diagnostics: object
 * }}
 */
export function buildPassthroughPreprocessedBundle(mapData, datasetKey) {
  const sourceFeatures = getFeatureList(mapData);
  const includedCountries = new Set();
  const passthroughFeatures = sourceFeatures.map((feature, index) => {
    const props = isPlainObject(feature?.properties) ? feature.properties : {};
    const countryCode = normalizeCountryCode(props.tdwCountryCode || props.ISO_A2_EH || props.ISO_A2 || '');
    if (COUNTRY_CODE_PATTERN.test(countryCode)) {
      includedCountries.add(countryCode);
    }

    return {
      ...feature,
      properties: {
        ...props,
        tdwCountryCode: countryCode,
        tdwCountryName: String(
          props.tdwCountryName
          || props.NAME_EN
          || props.NAME
          || props.ADMIN
          || countryCode
          || `feature-${index}`
        ),
      },
    };
  });

  if (!passthroughFeatures.length) {
    // ATTENTION: intentional hard-stop for diagnosability; runtime could continue with empty passthrough map.
    throw new Error('Runtime preprocessor passthrough produced no map features.');
  }

  const countryAudit = {
    sourceFeatures: sourceFeatures.length,
    keptFeatures: passthroughFeatures.length,
    droppedByWhitelist: 0,
    droppedByMultiPolygonTask: 0,
    droppedByMicroPolygonCleanup: 0,
    droppedByGeometryQuality: 0,
    droppedByPartRules: 0,
    source: 'passthrough',
  };

  return {
    datasetKey,
    flags: {
      preprocessEnabled: false,
      whitelistEnabled: false,
      groupingEnabled: false,
      groupingMode: 'off',
      regionLayerEnabled: false,
    },
    countryGrouping: {
      enabled: false,
      mode: 'off',
      setKey: '',
      geojsonProperty: '',
      groups: {},
      countryToRegion: {},
      includedCountries: Array.from(includedCountries).sort(),
      groupLabels: {},
      diagnostics: {},
    },
    countryRuntimeMap: {
      type: 'FeatureCollection',
      features: passthroughFeatures,
    },
    regionRuntimeMap: null,
    countryAudit,
    regionAudit: null,
    diagnostics: {
      preprocessorMode: 'passthrough',
      templateCountriesMissingInSource: [],
    },
  };
}

/* ============================================================
   4) AUTO-RUN
   ============================================================ */

// No autorun logic by design.
