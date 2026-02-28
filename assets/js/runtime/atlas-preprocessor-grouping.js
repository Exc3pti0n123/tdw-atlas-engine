/* ============================================================
   Module: TDW Atlas Engine — Runtime Preprocessor Grouping
   ------------------------------------------------------------
   Purpose:
   - Build country-to-group assignments.
   - Apply group annotations to runtime feature maps.

   Public surface (ESM export):
   - buildCountryGrouping({ mapMeta, sourceMapData, whitelistModel, countryCodeAliases })
   - applyCountryGroupingToRuntimeMap(runtimeMap, countryGrouping)
   - toRegionLayerRuntimeMap(groupedRuntimeMap)
   ============================================================ */

import {
  isPlainObject,
  normalizeCountryCode,
  normalizeGroupId,
} from '../helpers/atlas-shared.js';
import { isCountryIncluded } from './atlas-preprocessor-whitelist.js';
import {
  COUNTRY_CODE_PATTERN,
  getFeatureList,
  resolveCountryCode,
} from './atlas-preprocessor-transform.js';

/* ============================================================
   1) MODULE INIT
   ============================================================ */

const SCOPE = 'ATLAS PREPROCESSOR';
const GROUP_MODE_SET = 'set';
const GROUP_MODE_GEOJSON = 'geojson';
const GROUP_MODE_OFF = 'off';
const UNGROUPED_FALLBACK_ID = 'ungrouped';

const { dlog = () => {}, dwarn = () => {},
  derror = (...args) => console.error('[TDW ATLAS FATAL]', `[${SCOPE}]`, ...args),
} = window.TDW?.Logger?.createScopedLogger?.(SCOPE) || {};

/* ============================================================
   2) FUNCTIONS
   ============================================================ */

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
    // ATTENTION: intentional hard-stop for diagnosability; runtime could continue with an empty map.
    throw new Error('Whitelist excluded all countries from source map data.');
  }

  return list;
}

/**
 * @param {{mapMeta: object, sourceMapData: object, whitelistModel: object, countryCodeAliases: Record<string, string>}} params
 * @returns {{enabled: boolean, mode: string, setKey: string, geojsonProperty: string, groups: Record<string, string[]>, countryToRegion: Record<string, string>, includedCountries: string[], groupLabels: Record<string,string>, diagnostics: object}}
 */
export function buildCountryGrouping({ mapMeta, sourceMapData, whitelistModel, countryCodeAliases }) {
  const grouping = isPlainObject(mapMeta?.grouping) ? mapMeta.grouping : null;
  if (!grouping) {
    // ATTENTION: intentional hard-stop for diagnosability; runtime could continue with grouping disabled by default.
    throw new Error('mapMeta.grouping is required and must be an object.');
  }

  const sourceFeatures = getFeatureList(sourceMapData);
  const enabled = Boolean(grouping.enabled);
  const requestedMode = String(grouping.mode || GROUP_MODE_SET).trim().toLowerCase();
  const mode = [GROUP_MODE_SET, GROUP_MODE_GEOJSON, GROUP_MODE_OFF].includes(requestedMode)
    ? requestedMode
    : GROUP_MODE_SET;

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
    dlog('Grouping disabled/off; using country-only grouping model.');
    return base;
  }

  if (base.mode === GROUP_MODE_SET) {
    const rawCountryToRegion = grouping.countryToRegion;
    if (!isPlainObject(rawCountryToRegion)) {
      // ATTENTION: intentional hard-stop for diagnosability; runtime could continue with grouping disabled.
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
        // ATTENTION: intentional hard-stop for diagnosability; runtime could continue by dropping invalid mapping rows.
        throw new Error(`grouping.countryToRegion contains invalid country code "${rawCountry}".`);
      }

      if (!groupId) {
        // ATTENTION: intentional hard-stop for diagnosability; runtime could continue by assigning fallback groups.
        throw new Error(`grouping.countryToRegion contains empty region id for country "${countryCode}".`);
      }

      if (countryToRegion[countryCode]) {
        // ATTENTION: intentional hard-stop for diagnosability; runtime could continue by keeping first mapping.
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
      groupLabels[groupId] = groupId === UNGROUPED_FALLBACK_ID ? (fromMeta || 'Ungrouped') : (fromMeta || groupId);
    }

    dlog('Grouping model built (set mode).', {
      groups: Object.keys(groups).length,
      countries: includedCountries.length,
    });

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
      // ATTENTION: intentional hard-stop for diagnosability; runtime could continue with grouping disabled.
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
        // ATTENTION: intentional hard-stop for diagnosability; runtime could continue by assigning fallback groups.
        throw new Error(`Grouping mode "geojson" missing property "${property}" for country "${countryCode}".`);
      }

      const existing = countryToRegion[countryCode] || '';
      if (existing && existing !== groupId) {
        // ATTENTION: intentional hard-stop for diagnosability; runtime could continue by keeping first seen assignment.
        throw new Error(`Grouping mode "geojson" has conflicting groups for country "${countryCode}".`);
      }

      countryToRegion[countryCode] = groupId;
    }

    const includedCountries = Object.keys(countryToRegion).sort();
    if (!includedCountries.length) {
      // ATTENTION: intentional hard-stop for diagnosability; runtime could continue with country-only mode.
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

    dlog('Grouping model built (geojson mode).', {
      groups: Object.keys(groups).length,
      countries: includedCountries.length,
      property,
    });

    return {
      ...base,
      groups,
      countryToRegion,
      includedCountries,
      groupLabels,
    };
  }

  // ATTENTION: intentional hard-stop for diagnosability; runtime could continue with grouping disabled.
  throw new Error(`Unsupported grouping mode "${base.mode}".`);
}

/**
 * @param {object} runtimeMap
 * @param {{groups: Record<string, string[]>, countryToRegion: Record<string, string>, groupLabels: Record<string,string>}} countryGrouping
 * @returns {object}
 */
export function applyCountryGroupingToRuntimeMap(runtimeMap, countryGrouping) {
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
export function toRegionLayerRuntimeMap(groupedRuntimeMap) {
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

// Exported functions are declared inline above.

/* ============================================================
   4) AUTO-RUN
   ============================================================ */

// No autorun logic by design.
