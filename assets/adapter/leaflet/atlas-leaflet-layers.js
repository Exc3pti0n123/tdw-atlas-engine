/* ============================================================
   Module: TDW Atlas Engine — Leaflet Layer Helpers
   ------------------------------------------------------------
   Purpose:
   - Provide layer/index/feature helpers for Leaflet adapter runtime.
   ============================================================ */

import { normalizeGroupId } from './atlas-leaflet-focus.js';
import { isPlainObject } from '../../js/helpers/atlas-shared.js';

/* ============================================================
   1) MODULE INIT
   ============================================================ */

const SCOPE = 'ATLAS LF-LAYERS';

const { dlog, dwarn, derror } = window?.TDW?.Logger?.createScopedLogger?.(SCOPE) || {
  dlog: () => {},
  dwarn: () => {},
  derror: (...args) => console.error('[TDW ATLAS FATAL]', `[${SCOPE}]`, ...args),
};

export const HYBRID_KIND_REGION = 'region';
export const HYBRID_KIND_COUNTRY = 'country';

/* ============================================================
   2) FUNCTIONS
   ============================================================ */

/**
 * @param {object} layer
 * @returns {{[key: string]: unknown}}
 */
export function getLayerProps(layer) {
  return isPlainObject(layer?.feature?.properties) ? layer.feature.properties : {};
}

/**
 * @param {object} layer
 * @returns {string}
 */
export function getLayerGroupId(layer) {
  const props = getLayerProps(layer);
  return String(props.tdwGroupId || '').trim();
}

/**
 * @param {object} layer
 * @returns {string}
 */
export function getLayerGroupLabel(layer) {
  const props = getLayerProps(layer);
  return String(props.tdwGroupLabel || '').trim();
}

/**
 * @param {object} layer
 * @returns {string}
 */
export function getLayerCountryCode(layer) {
  const props = getLayerProps(layer);
  return String(props.tdwCountryCode || '').trim().toUpperCase();
}

/**
 * @param {object} layer
 * @returns {string}
 */
export function getLayerCountryName(layer) {
  const props = getLayerProps(layer);
  return String(props.tdwCountryName || props.NAME_EN || props.NAME || props.ADMIN || '').trim();
}

/**
 * @param {object} layer
 * @returns {string}
 */
export function getLayerHybridKind(layer) {
  const props = getLayerProps(layer);
  return String(props.tdwHybridKind || '').trim().toLowerCase();
}

/**
 * @param {object} geoLayer
 * @returns {{layersByGroup: Map<string, object[]>}}
 */
export function buildGroupLayerIndex(geoLayer) {
  const layersByGroup = new Map();

  geoLayer.eachLayer((layer) => {
    const groupId = getLayerGroupId(layer);
    if (!groupId) return;

    if (!layersByGroup.has(groupId)) {
      layersByGroup.set(groupId, []);
    }
    layersByGroup.get(groupId).push(layer);
  });

  return { layersByGroup };
}

/**
 * Build per-country lookup so fragmented countries (multi-island) can be handled as one logical country.
 *
 * @param {object} geoLayer
 * @returns {{layersByCountry: Map<string, object[]>}}
 */
export function buildCountryLayerIndex(geoLayer) {
  const layersByCountry = new Map();

  geoLayer.eachLayer((layer) => {
    const countryCode = getLayerCountryCode(layer);
    if (!countryCode) return;

    if (!layersByCountry.has(countryCode)) {
      layersByCountry.set(countryCode, []);
    }
    layersByCountry.get(countryCode).push(layer);
  });

  return { layersByCountry };
}

/**
 * @param {object|null|undefined} runtimeMap
 * @returns {object[]}
 */
function getRuntimeMapFeatures(runtimeMap) {
  return Array.isArray(runtimeMap?.features) ? runtimeMap.features : [];
}

/**
 * @param {object} feature
 * @param {Record<string,unknown>} extraProps
 * @returns {object}
 */
function cloneFeatureWithProperties(feature, extraProps = {}) {
  const props = isPlainObject(feature?.properties) ? feature.properties : {};
  return {
    ...feature,
    properties: {
      ...props,
      ...extraProps,
    },
  };
}

/**
 * Build one hybrid feature collection:
 * - active region countries => country-kind
 * - all other regions => region-kind
 *
 * @param {object} params
 * @param {object} params.countryRuntimeMap
 * @param {object} params.regionRuntimeMap
 * @param {string} params.activeGroupId
 * @returns {object}
 */
export function buildHybridRuntimeMapData({ countryRuntimeMap, regionRuntimeMap, activeGroupId }) {
  const groupId = normalizeGroupId(activeGroupId);
  const countryFeatures = getRuntimeMapFeatures(countryRuntimeMap);
  const regionFeatures = getRuntimeMapFeatures(regionRuntimeMap);

  if (!groupId) {
    throw new Error('Hybrid runtime map requires activeGroupId.');
  }

  if (!countryFeatures.length || !regionFeatures.length) {
    throw new Error('Hybrid runtime map requires both countryRuntimeMap and regionRuntimeMap features.');
  }

  const hybridFeatures = [];

  for (const feature of countryFeatures) {
    const featureGroupId = normalizeGroupId(feature?.properties?.tdwGroupId || '');
    if (featureGroupId !== groupId) continue;
    hybridFeatures.push(cloneFeatureWithProperties(feature, { tdwHybridKind: HYBRID_KIND_COUNTRY }));
  }

  for (const feature of regionFeatures) {
    const featureGroupId = normalizeGroupId(feature?.properties?.tdwGroupId || '');
    if (!featureGroupId || featureGroupId === groupId) continue;
    hybridFeatures.push(cloneFeatureWithProperties(feature, { tdwHybridKind: HYBRID_KIND_REGION }));
  }

  if (!hybridFeatures.length) {
    // ATTENTION: intentional hard-stop for diagnosability; runtime could continue with fallback to region layer only.
    throw new Error(`Hybrid runtime map resolved to zero features for group "${groupId}".`);
  }

  return {
    type: 'FeatureCollection',
    features: hybridFeatures,
  };
}

/* ============================================================
   3) PUBLIC API
   ============================================================ */

// Exported helper surface is defined inline above.

/* ============================================================
   4) AUTO-RUN
   ============================================================ */

// No autorun side effects.
