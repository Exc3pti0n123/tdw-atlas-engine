/* ============================================================
   Module: TDW Atlas Engine — Runtime Map Pipeline
   ------------------------------------------------------------
   Purpose:
   - Prepare renderer-agnostic runtime map artifacts in Boot.
   - Build runtime layer artifacts for one page session.
   - Keep data transformation out of Core and renderer adapters.

   Public surface (ESM export):
   - prepareRuntimeBundle({ mapData, mapMeta, mapConfig })
   ============================================================ */

/* ============================================================
   1) MODULE INIT
   ============================================================ */

const root = typeof window !== 'undefined' ? window : globalThis;
root.TDW = root.TDW || {};
root.TDW.Atlas = root.TDW.Atlas || {};

const SCOPE = 'ATLAS MAP-PIPELINE';

const {
  log: _log = () => {},
  warn: _warn = () => {},
  error: _error = (scope, el, message, ...meta) => console.error('[TDW ATLAS FATAL]', message, ...meta),
} = root?.TDW?._logger || {};

const dlog = (...args) => _log(SCOPE, ...args);
const dwarn = (...args) => _warn(SCOPE, ...args);
const derror = (message, ...meta) => _error(SCOPE, null, message, ...meta);

const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;
const GROUP_MODE_SET = 'set';
const GROUP_MODE_GEOJSON = 'geojson';
const GROUP_MODE_OFF = 'off';
const UNGROUPED_FALLBACK_ID = 'ungrouped';
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
 * @returns {boolean}
 */
function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizeCountryCode(value) {
  return String(value || '').trim().toUpperCase();
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizeGroupId(value) {
  return String(value || '').trim().toLowerCase();
}

/**
 * @param {unknown} value
 * @param {string} fallback
 * @returns {string}
 */
function normalizeDatasetKey(value, fallback = 'world-v1') {
  const key = String(value || '').trim().toLowerCase();
  return key || fallback;
}

/**
 * @param {unknown} value
 * @param {boolean} fallback
 * @returns {boolean}
 */
function normalizeBool(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  const raw = String(value || '').trim().toLowerCase();
  if (raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on') return true;
  if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'off') return false;
  return Boolean(fallback);
}

/**
 * @param {object} properties
 * @param {Record<string, string>} countryCodeAliases
 * @returns {string}
 */
function resolveCountryCode(properties, countryCodeAliases = DEFAULT_COUNTRY_CODE_ALIASES) {
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
function resolveCountryName(properties, fallbackCode) {
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
function getFeatureList(geojson) {
  if (!isPlainObject(geojson) || geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
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
function resolveCountryCodeAliases(preprocessConfig) {
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
 * @param {object} mapMeta
 * @returns {{enabled: boolean, defaultIncluded: boolean, includeByCountry: Record<string, boolean>}}
 */
function buildWhitelistModel(mapMeta) {
  const whitelist = isPlainObject(mapMeta?.whitelist) ? mapMeta.whitelist : null;
  if (!whitelist) {
    // ATTENTION: intentional hard-stop for diagnosability; runtime could continue with implicit whitelist defaults.
    throw new Error('mapMeta.whitelist is required and must be an object.');
  }

  const includeByCountryRaw = isPlainObject(whitelist.includeByCountry) ? whitelist.includeByCountry : {};
  const includeByCountry = {};

  for (const [rawCountry, rawFlag] of Object.entries(includeByCountryRaw)) {
    const country = normalizeCountryCode(rawCountry);
    if (!COUNTRY_CODE_PATTERN.test(country)) continue;
    includeByCountry[country] = normalizeBool(rawFlag, false);
  }

  return {
    enabled: normalizeBool(whitelist.enabled, true),
    defaultIncluded: normalizeBool(whitelist.defaultIncluded, false),
    includeByCountry,
  };
}

/**
 * @param {string} countryCode
 * @param {{enabled: boolean, defaultIncluded: boolean, includeByCountry: Record<string, boolean>}} whitelistModel
 * @returns {boolean}
 */
function isCountryIncluded(countryCode, whitelistModel) {
  if (!whitelistModel.enabled) return true;
  if (Object.prototype.hasOwnProperty.call(whitelistModel.includeByCountry, countryCode)) {
    return whitelistModel.includeByCountry[countryCode] === true;
  }
  return whitelistModel.defaultIncluded === true;
}

/**
 * @param {object[]} sourceFeatures
 * @param {{enabled: boolean, defaultIncluded: boolean, includeByCountry: Record<string, boolean>}} whitelistModel
 * @param {Record<string, string>} countryCodeAliases
 * @returns {string[]}
 */
function deriveIncludedCountriesFromSource(sourceFeatures, whitelistModel, countryCodeAliases) {
  const included = new Set();

  for (const feature of sourceFeatures) {
    const countryCode = resolveCountryCode(feature?.properties || {}, countryCodeAliases);
    if (!COUNTRY_CODE_PATTERN.test(countryCode)) continue;
    if (!isCountryIncluded(countryCode, whitelistModel)) continue;
    included.add(countryCode);
  }

  const list = Array.from(included).sort();
  if (!list.length) {
    throw new Error('Whitelist excluded all countries from source map data.');
  }

  return list;
}

/**
 * @param {object} mapMeta
 * @param {object} sourceMapData
 * @param {{enabled: boolean, defaultIncluded: boolean, includeByCountry: Record<string, boolean>}} whitelistModel
 * @param {Record<string, string>} countryCodeAliases
 * @returns {{enabled: boolean, mode: string, setKey: string, geojsonProperty: string, groups: Record<string, string[]>, countryToRegion: Record<string, string>, includedCountries: string[], groupLabels: Record<string,string>, diagnostics: object}}
 */
function buildCountryGrouping(mapMeta, sourceMapData, whitelistModel, countryCodeAliases) {
  const grouping = isPlainObject(mapMeta?.grouping) ? mapMeta.grouping : null;
  if (!grouping) {
    // ATTENTION: intentional hard-stop for diagnosability; runtime could continue with grouping disabled by default.
    throw new Error('mapMeta.grouping is required and must be an object.');
  }

  const sourceFeatures = getFeatureList(sourceMapData);
  const enabled = normalizeBool(grouping.enabled, true);
  const requestedMode = String(grouping.mode || GROUP_MODE_SET).trim().toLowerCase();
  const mode = [GROUP_MODE_SET, GROUP_MODE_GEOJSON, GROUP_MODE_OFF].includes(requestedMode) ? requestedMode : GROUP_MODE_SET;

  const base = {
    enabled: enabled && mode !== GROUP_MODE_OFF,
    mode: enabled ? mode : GROUP_MODE_OFF,
    setKey: String(grouping.setKey || '').trim(),
    geojsonProperty: String(grouping.geojsonProperty || '').trim(),
    groups: {},
    countryToRegion: {},
    includedCountries: deriveIncludedCountriesFromSource(sourceFeatures, whitelistModel, countryCodeAliases),
    groupLabels: {},
    diagnostics: {},
  };

  if (!base.enabled || base.mode === GROUP_MODE_OFF) {
    base.mode = GROUP_MODE_OFF;
    return base;
  }

  if (base.mode === GROUP_MODE_SET) {
    const rawCountryToRegion = grouping.countryToRegion;
    if (!isPlainObject(rawCountryToRegion)) {
      throw new Error('Grouping mode "set" requires grouping.countryToRegion object.');
    }

    const countryToRegion = {};
    const groups = {};
    const labelsRaw = isPlainObject(grouping.regionLabels) ? grouping.regionLabels : {};
    const groupLabels = {};
    const fallbackAssigned = [];

    for (const [rawCountry, rawRegion] of Object.entries(rawCountryToRegion)) {
      const countryCode = normalizeCountryCode(rawCountry);
      const groupId = normalizeGroupId(rawRegion);

      if (!COUNTRY_CODE_PATTERN.test(countryCode)) {
        throw new Error(`grouping.countryToRegion contains invalid country code "${rawCountry}".`);
      }

      if (!groupId) {
        throw new Error(`grouping.countryToRegion contains empty region id for country "${countryCode}".`);
      }

      if (countryToRegion[countryCode]) {
        throw new Error(`grouping.countryToRegion contains duplicate country assignment "${countryCode}".`);
      }

      countryToRegion[countryCode] = groupId;
    }

    const sourceCountrySet = new Set(base.includedCountries);
    const unmappedInSource = Object.keys(countryToRegion).filter((countryCode) => !sourceCountrySet.has(countryCode));
    const includedCountries = [];
    for (const countryCode of base.includedCountries) {
      let groupId = String(countryToRegion[countryCode] || '').trim();
      if (!groupId) {
        // Keep runtime alive when whitelist includes countries outside explicit set-members.
        groupId = UNGROUPED_FALLBACK_ID;
        countryToRegion[countryCode] = groupId;
        fallbackAssigned.push(countryCode);
      }
      includedCountries.push(countryCode);

      if (!groups[groupId]) groups[groupId] = [];
      groups[groupId].push(countryCode);
    }

    if (fallbackAssigned.length) {
      dwarn('Grouping mode "set": countries without mapping were assigned to fallback group.', {
        fallbackGroup: UNGROUPED_FALLBACK_ID,
        count: fallbackAssigned.length,
        sample: fallbackAssigned.slice(0, 12),
      });
    }

    for (const groupId of Object.keys(groups)) {
      groups[groupId].sort();
      const fromMeta = String(labelsRaw[groupId] || '').trim();
      if (groupId === UNGROUPED_FALLBACK_ID) {
        groupLabels[groupId] = fromMeta || 'Ungrouped';
      } else {
        groupLabels[groupId] = fromMeta || groupId;
      }
    }

    return {
      ...base,
      groups,
      countryToRegion,
      includedCountries,
      groupLabels,
      diagnostics: {
        templateCountriesMissingInSource: unmappedInSource,
      },
    };
  }

  if (base.mode === GROUP_MODE_GEOJSON) {
    const property = base.geojsonProperty;
    if (!property) {
      throw new Error('Grouping mode "geojson" requires grouping.geojsonProperty.');
    }

    const countryToRegion = {};
    const groups = {};

    for (const feature of sourceFeatures) {
      const props = isPlainObject(feature?.properties) ? feature.properties : {};
      const countryCode = resolveCountryCode(props, countryCodeAliases);
      if (!COUNTRY_CODE_PATTERN.test(countryCode)) continue;
      if (!isCountryIncluded(countryCode, whitelistModel)) continue;

      const rawGroup = props[property];
      const groupId = normalizeGroupId(rawGroup);
      if (!groupId) {
        throw new Error(`Grouping mode "geojson" missing property "${property}" for country "${countryCode}".`);
      }

      const existing = countryToRegion[countryCode] || '';
      if (existing && existing !== groupId) {
        throw new Error(`Grouping mode "geojson" has conflicting groups for country "${countryCode}".`);
      }

      countryToRegion[countryCode] = groupId;
    }

    const includedCountries = Object.keys(countryToRegion).sort();
    if (!includedCountries.length) {
      throw new Error('Grouping mode "geojson" produced no country assignments.');
    }

    for (const countryCode of includedCountries) {
      const groupId = countryToRegion[countryCode];
      if (!groups[groupId]) groups[groupId] = [];
      groups[groupId].push(countryCode);
    }

    const groupLabels = {};
    for (const groupId of Object.keys(groups)) {
      groups[groupId].sort();
      groupLabels[groupId] = groupId;
    }

    return {
      ...base,
      groups,
      countryToRegion,
      includedCountries,
      groupLabels,
    };
  }

  throw new Error(`Unsupported grouping mode "${base.mode}".`);
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

/**
 * @param {object} runtimeMap
 * @param {{groups: Record<string, string[]>, countryToRegion: Record<string, string>, groupLabels: Record<string,string>}} countryGrouping
 * @returns {object}
 */
function applyCountryGroupingToRuntimeMap(runtimeMap, countryGrouping) {
  const features = getFeatureList(runtimeMap);
  const annotated = [];

  for (const feature of features) {
    const props = isPlainObject(feature?.properties) ? feature.properties : {};
    const countryCode = normalizeCountryCode(props.tdwCountryCode || props.ISO_A2_EH || props.ISO_A2 || '');
    if (!COUNTRY_CODE_PATTERN.test(countryCode)) {
      // ATTENTION: intentional hard-stop for diagnosability; runtime could continue by skipping unmapped parts.
      throw new Error('Runtime feature missing country code after preprocessing.');
    }

    const groupId = String(countryGrouping?.countryToRegion?.[countryCode] || '').trim();
    if (!groupId) {
      // ATTENTION: intentional hard-stop for diagnosability; runtime could continue by skipping unknown group assignments.
      throw new Error(`No group assignment found for country "${countryCode}".`);
    }

    annotated.push({
      ...feature,
      properties: {
        ...props,
        tdwCountryCode: countryCode,
        tdwGroupId: groupId,
        tdwGroupLabel: String(countryGrouping?.groupLabels?.[groupId] || groupId),
        tdwCountryName: String(props.tdwCountryName || props.NAME_EN || props.NAME || props.ADMIN || countryCode),
      },
    });
  }

  if (!annotated.length) {
    // ATTENTION: intentional hard-stop for diagnosability; runtime could continue with an empty map canvas.
    throw new Error('Country grouping assignment produced no features.');
  }

  return {
    type: 'FeatureCollection',
    features: annotated,
  };
}

/**
 * @param {object} runtimeMap
 * @returns {object}
 */
function cloneRuntimeMap(runtimeMap) {
  return {
    type: 'FeatureCollection',
    features: getFeatureList(runtimeMap).map((feature) => ({
      ...feature,
      properties: isPlainObject(feature?.properties) ? { ...feature.properties } : {},
    })),
  };
}

/**
 * @param {object} groupedRuntimeMap
 * @returns {object}
 */
function toRegionLayerRuntimeMap(groupedRuntimeMap) {
  const cloned = cloneRuntimeMap(groupedRuntimeMap);
  cloned.features = cloned.features.map((feature) => {
    const props = isPlainObject(feature?.properties) ? feature.properties : {};
    const groupId = String(props.tdwGroupId || '').trim();
    const groupLabel = String(props.tdwGroupLabel || groupId || 'group').trim();

    return {
      ...feature,
      properties: {
        ...props,
        tdwLayerKind: 'region',
        tdwDisplayName: groupLabel,
      },
    };
  });

  return cloned;
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
function prepareRuntimeMapData(sourceMapData, options = {}) {
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
    throw new Error('Runtime pipeline requires whitelistModel.');
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
function buildPassthroughRuntimeBundle(mapData, datasetKey) {
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
    throw new Error('Runtime pipeline passthrough produced no map features.');
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
      pipelineMode: 'passthrough',
      templateCountriesMissingInSource: [],
    },
  };
}

/**
 * Prepare runtime bundle in Boot before Core/Adapter startup.
 *
 * @param {{mapData: object, mapMeta: object, mapConfig: object}} params
 * @returns {{
 *   datasetKey: string,
 *   flags: {preprocessEnabled: boolean, whitelistEnabled: boolean, groupingEnabled: boolean, groupingMode: string, regionLayerEnabled: boolean},
 *   countryGrouping: object,
 *   countryRuntimeMap: object,
 *   regionRuntimeMap: object|null,
 *   countryAudit: object,
 *   regionAudit: object|null,
 *   diagnostics: object
 * }}
 */
export function prepareRuntimeBundle({ mapData, mapMeta, mapConfig } = {}) {
  try {
    if (!isPlainObject(mapData)) {
      // ATTENTION: intentional hard-stop for diagnosability; runtime could continue with weak mapData assumptions.
      throw new Error('Runtime pipeline requires mapData object.');
    }
    if (!isPlainObject(mapMeta)) {
      // ATTENTION: intentional hard-stop for diagnosability; runtime could continue with implicit mapMeta defaults.
      throw new Error('Runtime pipeline requires mapMeta object.');
    }
    if (!isPlainObject(mapConfig)) {
      // ATTENTION: intentional hard-stop for diagnosability; runtime could continue with weak mapConfig assumptions.
      throw new Error('Runtime pipeline requires mapConfig object.');
    }

    const preprocess = isPlainObject(mapMeta?.preprocess) ? mapMeta.preprocess : {};
    const preprocessEnabled = normalizeBool(preprocess?.enabled, true);
    const datasetKey = normalizeDatasetKey(mapConfig?.datasetKey || mapMeta?.datasetKey || '', 'world-v1');

    if (!preprocessEnabled) {
      dlog('Runtime pipeline running in passthrough mode (preprocess.enabled=0).');
      return buildPassthroughRuntimeBundle(mapData, datasetKey);
    }

    const buildRegionLayer = normalizeBool(mapMeta?.regionLayer?.enabled, true);
    const countryCodeAliases = resolveCountryCodeAliases(preprocess);
    const whitelistModel = buildWhitelistModel(mapMeta);
    const countryGrouping = buildCountryGrouping(mapMeta, mapData, whitelistModel, countryCodeAliases);

    const countryPrepared = prepareRuntimeMapData(mapData, {
      whitelistModel,
      preprocess,
      datasetKey,
      countryCodeAliases,
    });

    const countryRuntimeMap = countryGrouping.enabled
      ? applyCountryGroupingToRuntimeMap(countryPrepared.runtimeMap, countryGrouping)
      : countryPrepared.runtimeMap;

    let regionRuntimeMap = null;
    let regionAudit = null;
    if (buildRegionLayer && countryGrouping.enabled) {
      regionRuntimeMap = toRegionLayerRuntimeMap(countryRuntimeMap);
      regionAudit = {
        ...countryPrepared.audit,
        source: 'countryRuntimeMap',
      };
    } else if (buildRegionLayer && !countryGrouping.enabled) {
      dwarn('Region layer requested but grouping is disabled/off; region layer skipped.');
    }

    const flags = {
      preprocessEnabled: true,
      whitelistEnabled: whitelistModel.enabled,
      groupingEnabled: countryGrouping.enabled,
      groupingMode: countryGrouping.mode || 'off',
      regionLayerEnabled: !!regionRuntimeMap,
    };

    return {
      datasetKey,
      flags,
      countryGrouping,
      countryRuntimeMap,
      regionRuntimeMap,
      countryAudit: countryPrepared.audit,
      regionAudit,
      diagnostics: {
        pipelineMode: 'preprocessed',
        templateCountriesMissingInSource: Array.isArray(countryGrouping?.diagnostics?.templateCountriesMissingInSource)
          ? countryGrouping.diagnostics.templateCountriesMissingInSource
          : [],
      },
    };
  } catch (err) {
    derror('prepareRuntimeBundle failed.', { err });
    throw err;
  }
}

/* ============================================================
   4) AUTO-RUN
   ============================================================ */

// No autorun logic by design.
