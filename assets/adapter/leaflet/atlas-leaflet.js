/* ============================================================
   Module: TDW Atlas Engine — Leaflet Adapter Factory
   ------------------------------------------------------------
   Purpose:
   - Adapt Atlas Core contract to Leaflet 2.x renderer.
   - Orchestrate Leaflet runtime state and interaction stages.
   - Consume prepared runtime bundle from Boot pipeline.

   Public surface (ESM export):
   - createAdapter() -> { init, onResize, destroy }
   ============================================================ */

import { create as createPreviewOverlay } from '../../js/ui/atlas-preview.js';

/* ============================================================
   1) MODULE INIT
   ============================================================ */

window.TDW = window.TDW || {};
window.TDW.Atlas = window.TDW.Atlas || {};

const SCOPE = 'ATLAS LF-ADAPTER';
const STAGE_WORLD = 'world';
const STAGE_REGION = 'region';
const STAGE_COUNTRY = 'country';
const HYBRID_KIND_REGION = 'region';
const HYBRID_KIND_COUNTRY = 'country';
const REGION_LAYER_SOURCE_DERIVED_COUNTRY = 'derived-country';
const REGION_LAYER_SOURCE_EXTERNAL_REGION_MAP = 'external-region-map';
const DEFAULT_FOCUS_PADDING = Object.freeze({
  world: [28, 28],
  region: [24, 24],
  country: [20, 20],
});
const DEFAULT_PREVIEW_CONFIG = Object.freeze({
  mapId: '',
  showRegionPreview: true,
  showCountryPreview: true,
  desktopSide: 'right',
  switchToBottomMaxWHRatio: 0.85,
});
const INTERACTION_STYLE = Object.freeze({
  world: {
    base: {
      color: '#66737c',
      fillColor: '#98a2a9',
      opacity: 0.82,
      fillOpacity: 0.22,
      weight: 1.0,
    },
    highlighted: {
      color: '#2f4b59',
      fillColor: '#8eaab9',
      opacity: 1,
      fillOpacity: 0.42,
      weight: 1.8,
    },
  },
  hybrid: {
    country: {
      base: {
        color: '#60707a',
        fillColor: '#95a2ad',
        opacity: 0.86,
        fillOpacity: 0.24,
        weight: 1.0,
      },
      hover: {
        color: '#2f4b59',
        fillColor: '#86b4cc',
        opacity: 1,
        fillOpacity: 0.42,
        weight: 1.4,
      },
      selected: {
        color: '#1d2f3a',
        fillColor: '#5e91ae',
        opacity: 1,
        fillOpacity: 0.52,
        weight: 1.8,
      },
    },
    region: {
      base: {
        color: '#6e7880',
        fillColor: '#939ca4',
        opacity: 0.74,
        fillOpacity: 0.16,
        weight: 1.0,
      },
      hover: {
        color: '#385363',
        fillColor: '#89a6b6',
        opacity: 1,
        fillOpacity: 0.38,
        weight: 1.4,
      },
    },
  },
});

const {
  log: _log = () => {},
  warn: _warn = () => {},
  error: _error = (scope, el, message, ...meta) => console.error('[TDW ATLAS FATAL]', message, ...meta),
} = window?.TDW?._logger || {};

const dlog = (...args) => _log(SCOPE, ...args);
const dwarn = (...args) => _warn(SCOPE, ...args);
const derror = (el, message, ...meta) => _error(SCOPE, el || null, message, ...meta);

let leafletModule = null;

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
 * @param {string} url
 * @returns {string}
 */
function toAbsoluteUrl(url) {
  if (!url) return '';
  try {
    return new URL(url).href;
  } catch (_) {
    return new URL(url, window.location.origin).href;
  }
}

/**
 * @param {string} cssUrl
 */
function ensureLeafletCss(cssUrl) {
  if (!cssUrl) return;

  const href = toAbsoluteUrl(cssUrl);
  const alreadyLoaded = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
    .some((link) => (link.getAttribute('href') || '') === href);

  if (alreadyLoaded) return;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

/**
 * @param {object} adapterConfig
 * @returns {Promise<object>}
 */
async function loadLeafletModule(adapterConfig) {
  if (leafletModule) return leafletModule;

  const jsUrl = adapterConfig?.vendor?.leafletJs;
  if (!jsUrl) {
    throw new Error('Missing adapterConfig.vendor.leafletJs (Leaflet module URL).');
  }

  ensureLeafletCss(adapterConfig?.vendor?.leafletCss || '');
  leafletModule = await import(toAbsoluteUrl(jsUrl));
  return leafletModule;
}

/**
 * @param {object} runtimeBundle
 * @returns {boolean}
 */
function hasRuntimeBundleContract(runtimeBundle) {
  if (!isPlainObject(runtimeBundle)) return false;
  if (!isPlainObject(runtimeBundle.countryRuntimeMap)) return false;

  const countryFeatures = runtimeBundle?.countryRuntimeMap?.features;
  const regionMap = runtimeBundle?.regionRuntimeMap;
  const hasCountryFeatures = Array.isArray(countryFeatures);
  const hasRegionMap = regionMap === null || isPlainObject(regionMap);
  const hasCountryGrouping = isPlainObject(runtimeBundle?.countryGrouping);
  const hasFlags = isPlainObject(runtimeBundle?.flags);

  return hasCountryFeatures && hasRegionMap && hasCountryGrouping && hasFlags;
}

/**
 * @param {object} moduleNs
 * @returns {{MapCtor: Function, GeoJSONCtor: Function}}
 */
function getStrictConstructors(moduleNs) {
  const MapCtor = moduleNs?.Map;
  const GeoJSONCtor = moduleNs?.GeoJSON;

  if (typeof MapCtor !== 'function') {
    throw new Error('Leaflet 2.x contract error: Map constructor missing.');
  }

  if (typeof GeoJSONCtor !== 'function') {
    throw new Error('Leaflet 2.x contract error: GeoJSON constructor missing.');
  }

  return { MapCtor, GeoJSONCtor };
}

/**
 * @returns {object}
 */
function defaultStyle() {
  return {
    color: '#666',
    weight: 1,
    fillColor: '#999',
    fillOpacity: 0.2,
  };
}

/**
 * @param {unknown} styleConfig
 * @returns {Function|object}
 */
function resolveStyle(styleConfig) {
  if (styleConfig === undefined || styleConfig === null) {
    return defaultStyle;
  }

  const isValid = typeof styleConfig === 'function' || isPlainObject(styleConfig);
  if (!isValid) {
    // ATTENTION: intentional hard-stop for diagnosability; runtime could continue with forced default style.
    throw new Error('Leaflet adapter: invalid adapterConfig.style (expected function or object).');
  }

  return styleConfig;
}

/**
 * @param {object} adapterConfig
 * @returns {object}
 */
function resolveMapOptions(adapterConfig) {
  const provided = isPlainObject(adapterConfig?.mapOptions) ? adapterConfig.mapOptions : {};
  const sanitized = { ...provided };
  // Click-only interaction: zoom buttons are disabled by contract.
  delete sanitized.zoomControl;

  return {
    zoomControl: false,
    attributionControl: false,
    // Keep fit/fly zoom continuous; integer snapping leaves large unused margins.
    zoomSnap: 0,
    zoomDelta: 0.25,
    dragging: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    boxZoom: false,
    keyboard: false,
    tap: false,
    ...sanitized,
  };
}

/**
 * @param {unknown} candidate
 * @param {[number, number]} fallback
 * @returns {[number, number]}
 */
function normalizePaddingPair(candidate, fallback) {
  const defaultPair = Array.isArray(fallback) && fallback.length >= 2
    ? [Number(fallback[0]) || 0, Number(fallback[1]) || 0]
    : [0, 0];

  if (!Array.isArray(candidate) || candidate.length < 2) {
    return defaultPair;
  }

  const x = Number(candidate[0]);
  const y = Number(candidate[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return defaultPair;
  }

  return [Math.max(0, x), Math.max(0, y)];
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
 * @returns {string}
 */
function normalizeCountryCode(value) {
  return String(value || '').trim().toUpperCase();
}

/**
 * @param {object} adapterConfig
 * @returns {Map<string, Set<string>>}
 */
function resolveRegionFocusExclusions(adapterConfig) {
  const raw = adapterConfig?.map?.focus?.region?.excludeCountriesByGroup;
  const result = new Map();
  if (!isPlainObject(raw)) return result;

  for (const [rawGroup, rawCodes] of Object.entries(raw)) {
    const groupId = normalizeGroupId(rawGroup);
    if (!groupId || !Array.isArray(rawCodes)) continue;

    const codes = new Set();
    for (const rawCode of rawCodes) {
      const code = normalizeCountryCode(rawCode);
      if (/^[A-Z]{2}$/.test(code)) {
        codes.add(code);
      }
    }
    if (codes.size > 0) {
      result.set(groupId, codes);
    }
  }

  return result;
}

/**
 * @param {object} adapterConfig
 * @returns {{world:[number,number],region:[number,number],country:[number,number]}}
 */
function resolveFocusPaddingConfig(adapterConfig) {
  const focus = isPlainObject(adapterConfig?.map?.focus) ? adapterConfig.map.focus : {};
  const world = normalizePaddingPair(
    isPlainObject(focus.world) ? focus.world.padding : null,
    DEFAULT_FOCUS_PADDING.world
  );
  const region = normalizePaddingPair(
    isPlainObject(focus.region) ? focus.region.padding : null,
    DEFAULT_FOCUS_PADDING.region
  );
  const country = normalizePaddingPair(
    isPlainObject(focus.country) ? focus.country.padding : null,
    DEFAULT_FOCUS_PADDING.country
  );

  return { world, region, country };
}

/**
 * @param {object} adapterConfig
 * @returns {{mapId:string,showRegionPreview:boolean,showCountryPreview:boolean,desktopSide:'left'|'right',switchToBottomMaxWHRatio:number}}
 */
function resolvePreviewConfig(adapterConfig) {
  const preview = isPlainObject(adapterConfig?.map?.ui?.preview) ? adapterConfig.map.ui.preview : {};
  const mapIdValue = String(adapterConfig?.mapId || adapterConfig?.map?.id || '').trim();
  const sideRaw = String(preview.desktopSide || DEFAULT_PREVIEW_CONFIG.desktopSide).trim().toLowerCase();
  const desktopSide = sideRaw === 'left' ? 'left' : 'right';
  const switchRatioRaw = Number(preview.switchToBottomMaxWHRatio ?? DEFAULT_PREVIEW_CONFIG.switchToBottomMaxWHRatio);
  const switchToBottomMaxWHRatio = Number.isFinite(switchRatioRaw) && switchRatioRaw > 0
    ? switchRatioRaw
    : DEFAULT_PREVIEW_CONFIG.switchToBottomMaxWHRatio;

  return {
    mapId: mapIdValue || DEFAULT_PREVIEW_CONFIG.mapId,
    showRegionPreview: normalizeBool(preview.showRegionPreview, DEFAULT_PREVIEW_CONFIG.showRegionPreview),
    showCountryPreview: normalizeBool(preview.showCountryPreview, DEFAULT_PREVIEW_CONFIG.showCountryPreview),
    desktopSide,
    switchToBottomMaxWHRatio,
  };
}

/**
 * @param {object} layer
 * @param {object|null} viewConfig
 * @returns {{bounds: object|Array, source: string}|null}
 */
function resolveViewBounds(layer, viewConfig) {
  if (isPlainObject(viewConfig) && Array.isArray(viewConfig.bounds)) {
    return {
      bounds: viewConfig.bounds,
      source: 'view-config',
    };
  }

  // Use antimeridian-aware focus for grouped/country layers when no explicit view override exists.
  if (layer && typeof layer.eachLayer === 'function') {
    const layers = [];
    layer.eachLayer((leafletLayer) => {
      layers.push(leafletLayer);
    });
    const computed = computeFocusBoundsFromLayers(layers);
    if (computed) {
      return {
        bounds: computed,
        source: 'auto-antimeridian',
      };
    }
  }

  if (layer && typeof layer.getBounds === 'function') {
    return {
      bounds: layer.getBounds(),
      source: 'leaflet-layer',
    };
  }

  return null;
}

/**
 * @param {object} map
 * @param {object} layer
 * @param {object|null} viewConfig
 * @param {{paddingTopLeft:[number,number],paddingBottomRight:[number,number]}} boundsOptions
 * @returns {object}
 */
function fitInitialView(map, layer, viewConfig, boundsOptions) {
  const resolved = resolveViewBounds(layer, viewConfig);
  const bounds = resolved?.bounds;

  if (!bounds) {
    // ATTENTION: intentional hard-stop for diagnosability; runtime could continue with static setView fallback.
    throw new Error('Leaflet adapter: missing bounds for initial view fit.');
  }

  try {
    map.fitBounds(bounds, {
      paddingTopLeft: boundsOptions?.paddingTopLeft || [0, 0],
      paddingBottomRight: boundsOptions?.paddingBottomRight || [0, 0],
      animate: false,
    });
  } catch (err) {
    dwarn('Leaflet fitBounds failed; fallback setView applied.', { err });
    map.setView([20, 0], 2);
  }

  return bounds;
}

/**
 * @param {object} layer
 * @returns {{[key: string]: unknown}}
 */
function getLayerProps(layer) {
  return isPlainObject(layer?.feature?.properties) ? layer.feature.properties : {};
}

/**
 * @param {object} layer
 * @returns {string}
 */
function getLayerGroupId(layer) {
  const props = getLayerProps(layer);
  return String(props.tdwGroupId || '').trim();
}

/**
 * @param {object} layer
 * @returns {string}
 */
function getLayerGroupLabel(layer) {
  const props = getLayerProps(layer);
  return String(props.tdwGroupLabel || '').trim();
}

/**
 * @param {object} layer
 * @returns {string}
 */
function getLayerCountryCode(layer) {
  const props = getLayerProps(layer);
  return String(props.tdwCountryCode || '').trim().toUpperCase();
}

/**
 * @param {object} layer
 * @returns {string}
 */
function getLayerCountryName(layer) {
  const props = getLayerProps(layer);
  return String(props.tdwCountryName || props.NAME_EN || props.NAME || props.ADMIN || '').trim();
}

/**
 * @param {object} layer
 * @returns {string}
 */
function getLayerHybridKind(layer) {
  const props = getLayerProps(layer);
  return String(props.tdwHybridKind || '').trim().toLowerCase();
}

/**
 * @param {number} value
 * @returns {number}
 */
function normalizeLongitude360(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return NaN;
  const wrapped = ((n % 360) + 360) % 360;
  return wrapped;
}

/**
 * @param {number[]} longitudes360
 * @returns {{west: number, east: number}|null}
 */
function computeMinimalLongitudeInterval(longitudes360) {
  if (!Array.isArray(longitudes360) || !longitudes360.length) return null;

  const sorted = [...longitudes360]
    .filter((entry) => Number.isFinite(entry))
    .sort((a, b) => a - b);

  if (!sorted.length) return null;

  if (sorted.length === 1) {
    const west = sorted[0];
    const east = sorted[0];
    return { west, east };
  }

  let maxGap = -1;
  let maxGapIndex = 0;

  for (let i = 0; i < sorted.length; i += 1) {
    const current = sorted[i];
    const next = i === sorted.length - 1 ? (sorted[0] + 360) : sorted[i + 1];
    const gap = next - current;
    if (gap > maxGap) {
      maxGap = gap;
      maxGapIndex = i;
    }
  }

  let west = sorted[(maxGapIndex + 1) % sorted.length];
  let east = sorted[maxGapIndex];
  if (east < west) east += 360;

  let center = (west + east) / 2;
  while (center >= 180) {
    west -= 360;
    east -= 360;
    center -= 360;
  }
  while (center < -180) {
    west += 360;
    east += 360;
    center += 360;
  }

  return { west, east };
}

/**
 * @param {object} geometry
 * @param {Array<{lat:number,lng:number}>} out
 */
function collectGeometryPoints(geometry, out) {
  if (!isPlainObject(geometry)) return;
  const type = String(geometry.type || '');
  const coords = geometry.coordinates;

  const pushPoint = (pair) => {
    if (!Array.isArray(pair) || pair.length < 2) return;
    const lng = Number(pair[0]);
    const lat = Number(pair[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    out.push({ lat, lng });
  };

  if (type === 'Point') {
    pushPoint(coords);
    return;
  }

  if (type === 'MultiPoint' || type === 'LineString') {
    if (!Array.isArray(coords)) return;
    coords.forEach(pushPoint);
    return;
  }

  if (type === 'MultiLineString' || type === 'Polygon') {
    if (!Array.isArray(coords)) return;
    coords.forEach((ring) => {
      if (!Array.isArray(ring)) return;
      ring.forEach(pushPoint);
    });
    return;
  }

  if (type === 'MultiPolygon') {
    if (!Array.isArray(coords)) return;
    coords.forEach((polygon) => {
      if (!Array.isArray(polygon)) return;
      polygon.forEach((ring) => {
        if (!Array.isArray(ring)) return;
        ring.forEach(pushPoint);
      });
    });
    return;
  }

  if (type === 'GeometryCollection') {
    const geometries = Array.isArray(geometry.geometries) ? geometry.geometries : [];
    geometries.forEach((part) => collectGeometryPoints(part, out));
  }
}

/**
 * Build antimeridian-aware bounds from a set of Leaflet feature layers.
 *
 * @param {object[]} layers
 * @returns {[[number, number], [number, number]]|null}
 */
function computeFocusBoundsFromLayers(layers) {
  const list = Array.isArray(layers) ? layers : [];
  if (!list.length) return null;

  const points = [];
  list.forEach((layer) => {
    const geometry = layer?.feature?.geometry;
    collectGeometryPoints(geometry, points);
  });

  if (!points.length) return null;

  let south = Infinity;
  let north = -Infinity;
  const longitudes360 = [];

  for (const point of points) {
    south = Math.min(south, point.lat);
    north = Math.max(north, point.lat);
    const wrappedLng = normalizeLongitude360(point.lng);
    if (Number.isFinite(wrappedLng)) {
      longitudes360.push(wrappedLng);
    }
  }

  if (!Number.isFinite(south) || !Number.isFinite(north) || !longitudes360.length) return null;

  const interval = computeMinimalLongitudeInterval(longitudes360);
  if (!interval) return null;

  let west = interval.west;
  let east = interval.east;

  // Avoid degenerate bounds that can break fit/fly calculations.
  if (Math.abs(east - west) < 0.000001) {
    west -= 0.5;
    east += 0.5;
  }
  if (Math.abs(north - south) < 0.000001) {
    south -= 0.5;
    north += 0.5;
  }

  return [[south, west], [north, east]];
}

/**
 * @param {unknown} bounds
 * @returns {{south:number, west:number, north:number, east:number, lngSpan:number, latSpan:number}|null}
 */
function summarizeBounds(bounds) {
  if (Array.isArray(bounds) && bounds.length >= 2) {
    const sw = Array.isArray(bounds[0]) ? bounds[0] : [];
    const ne = Array.isArray(bounds[1]) ? bounds[1] : [];
    const south = Number(sw[0]);
    const west = Number(sw[1]);
    const north = Number(ne[0]);
    const east = Number(ne[1]);
    if ([south, west, north, east].every((value) => Number.isFinite(value))) {
      return {
        south,
        west,
        north,
        east,
        lngSpan: east - west,
        latSpan: north - south,
      };
    }
  }

  if (bounds && typeof bounds.getSouthWest === 'function' && typeof bounds.getNorthEast === 'function') {
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    const south = Number(sw?.lat);
    const west = Number(sw?.lng);
    const north = Number(ne?.lat);
    const east = Number(ne?.lng);
    if ([south, west, north, east].every((value) => Number.isFinite(value))) {
      return {
        south,
        west,
        north,
        east,
        lngSpan: east - west,
        latSpan: north - south,
      };
    }
  }

  return null;
}

/**
 * Estimate theoretical map fill ratio from container and bounds aspect.
 *
 * @param {object} map
 * @param {{lngSpan:number,latSpan:number}|null} boundsSummary
 * @returns {{containerW:number,containerH:number,containerAspect:number,boundsAspect:number,estFillW:number,estFillH:number,estFillArea:number}|null}
 */
function estimateFitFill(map, boundsSummary) {
  if (!map || typeof map.getSize !== 'function' || !boundsSummary) return null;

  const size = map.getSize();
  const containerW = Number(size?.x || 0);
  const containerH = Number(size?.y || 0);
  const lngSpan = Math.abs(Number(boundsSummary.lngSpan || 0));
  const latSpan = Math.abs(Number(boundsSummary.latSpan || 0));

  if (containerW <= 0 || containerH <= 0 || lngSpan <= 0 || latSpan <= 0) return null;

  const containerAspect = containerW / containerH;
  const boundsAspect = lngSpan / latSpan;

  let estFillW = 1;
  let estFillH = 1;
  if (boundsAspect > containerAspect) {
    estFillH = containerAspect / boundsAspect;
  } else {
    estFillW = boundsAspect / containerAspect;
  }

  return {
    containerW,
    containerH,
    containerAspect,
    boundsAspect,
    estFillW,
    estFillH,
    estFillArea: estFillW * estFillH,
  };
}

/**
 * @param {object} geoLayer
 * @returns {{layersByGroup: Map<string, object[]>}}
 */
function buildGroupLayerIndex(geoLayer) {
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
function buildCountryLayerIndex(geoLayer) {
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
function buildHybridRuntimeMapData({ countryRuntimeMap, regionRuntimeMap, activeGroupId }) {
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

/**
 * @param {object} map
 * @param {Function|null} pendingHandler
 */
function clearPendingMoveHandler(map, pendingHandler) {
  if (!map || typeof map.off !== 'function' || typeof pendingHandler !== 'function') return;
  map.off('moveend', pendingHandler);
}

/* ============================================================
   3) PUBLIC API
   ============================================================ */

/**
 * Create one adapter instance for one Core instance.
 *
 * @param {{adapterKey?: string, mapId?: string, el?: HTMLElement|null}} [_context]
 * @returns {{init: Function, onResize: Function, destroy: Function}}
 */
export function createAdapter(_context = {}) {
  const mapId = String(_context?.mapId || '').trim();

  // Per-instance mutable state; never shared across containers.
  let map = null;
  let regionLayer = null;
  let hybridLayer = null;
  let countryLayer = null;
  let el = null;
  let stage = STAGE_WORLD;
  let activeGroupId = '';
  let selectedCountryCode = '';
  let selectedCountryTitle = '';
  let hoveredCountryCode = '';
  let hoveredRegionGroupId = '';
  let activeGroupBounds = null;
  let worldBounds = null;
  let groupIndex = null;
  let countryIndex = null;
  let countryRuntimeMap = null;
  let regionRuntimeMap = null;
  let leafletGeoJsonCtor = null;
  let layerStyle = defaultStyle;
  let regionLayerSource = REGION_LAYER_SOURCE_DERIVED_COUNTRY;
  let regionFocusExcludeByGroup = new Map();
  let mapClickHandler = null;
  let pendingMoveHandler = null;
  let pendingMoveFallbackTimer = null;
  let focusPadding = { ...DEFAULT_FOCUS_PADDING };
  let preview = null;
  let previewConfig = { ...DEFAULT_PREVIEW_CONFIG, mapId: mapId || '' };
  let countryGrouping = null;

  /**
   * @returns {{top:number,right:number,bottom:number,left:number}}
   */
  function resolvePreviewInsets() {
    if (!preview || typeof preview.getInsets !== 'function') {
      return { top: 0, right: 0, bottom: 0, left: 0 };
    }
    const insets = preview.getInsets();
    if (!isPlainObject(insets)) {
      return { top: 0, right: 0, bottom: 0, left: 0 };
    }
    return {
      top: Math.max(0, Number(insets.top || 0)),
      right: Math.max(0, Number(insets.right || 0)),
      bottom: Math.max(0, Number(insets.bottom || 0)),
      left: Math.max(0, Number(insets.left || 0)),
    };
  }

  /**
   * @param {'world'|'region'|'country'} stage
   * @returns {{paddingTopLeft:[number,number],paddingBottomRight:[number,number]}}
   */
  function resolveStageBoundsOptions(stage) {
    const basePadding = Array.isArray(focusPadding?.[stage]) ? focusPadding[stage] : [0, 0];
    const baseX = Math.max(0, Number(basePadding[0] || 0));
    const baseY = Math.max(0, Number(basePadding[1] || 0));
    const insets = resolvePreviewInsets();

    return {
      paddingTopLeft: [baseX + insets.left, baseY + insets.top],
      paddingBottomRight: [baseX + insets.right, baseY + insets.bottom],
    };
  }

  /**
   * @param {string} groupId
   * @param {string} [titleHint]
   * @returns {boolean}
   */
  function openRegionPreview(groupId, titleHint = '') {
    if (!preview || !previewConfig.showRegionPreview) {
      if (preview) preview.close({ reason: 'region-preview-disabled', notify: false });
      return false;
    }

    const key = String(groupId || '').trim();
    if (!key) return false;

    preview.open({
      scope: 'region',
      key,
      titleHint: String(titleHint || countryGrouping?.groupLabels?.[key] || key),
    }).catch((err) => {
      dwarn('Region preview open failed.', { key, err });
    });

    if (typeof preview.reposition === 'function') {
      preview.reposition();
    }
    return true;
  }

  /**
   * @param {string} countryCode
   * @param {string} [titleHint]
   * @returns {boolean}
   */
  function openCountryPreview(countryCode, titleHint = '') {
    if (!preview || !previewConfig.showCountryPreview) {
      if (preview) preview.close({ reason: 'country-preview-disabled', notify: false });
      return false;
    }

    const key = String(countryCode || '').trim().toUpperCase();
    if (!key) return false;

    preview.open({
      scope: 'country',
      key,
      titleHint: String(titleHint || key),
    }).catch((err) => {
      dwarn('Country preview open failed.', { key, err });
    });

    if (typeof preview.reposition === 'function') {
      preview.reposition();
    }
    return true;
  }

  /**
   * @param {string} reason
   */
  function closePreview(reason) {
    if (!preview) return;
    preview.close({ reason, notify: false });
  }

  /**
   * Leaflet 2 uses pointerover/pointerout for interactive vector hover.
   *
   * @param {object} layer
   * @param {Function} onEnter
   * @param {Function} onLeave
   */
  function bindHoverHandlers(layer, onEnter, onLeave) {
    if (!layer || typeof layer.on !== 'function') return;
    layer.on('pointerover', onEnter);
    layer.on('pointerout', onLeave);
  }

  /**
   * @param {object} targetBounds
   * @param {Function} onDone
   * @param {{paddingTopLeft:[number,number],paddingBottomRight:[number,number]}} boundsOptions
   */
  function flyAndSwitch(targetBounds, onDone, boundsOptions) {
    if (!map || !targetBounds) return;

    clearPendingMoveHandler(map, pendingMoveHandler);
    if (pendingMoveFallbackTimer) {
      window.clearTimeout(pendingMoveFallbackTimer);
      pendingMoveFallbackTimer = null;
    }

    pendingMoveHandler = () => {
      clearPendingMoveHandler(map, pendingMoveHandler);
      pendingMoveHandler = null;
      if (pendingMoveFallbackTimer) {
        window.clearTimeout(pendingMoveFallbackTimer);
        pendingMoveFallbackTimer = null;
      }
      onDone();
    };

    if (typeof map.on === 'function') {
      map.on('moveend', pendingMoveHandler);
    }

    if (typeof map.flyToBounds === 'function') {
      map.flyToBounds(targetBounds, {
        paddingTopLeft: boundsOptions?.paddingTopLeft || [0, 0],
        paddingBottomRight: boundsOptions?.paddingBottomRight || [0, 0],
        duration: 0.42,
      });
      pendingMoveFallbackTimer = window.setTimeout(() => {
        if (typeof pendingMoveHandler === 'function') {
          pendingMoveHandler();
        }
      }, 900);
      return;
    }

    map.fitBounds(targetBounds, {
      paddingTopLeft: boundsOptions?.paddingTopLeft || [0, 0],
      paddingBottomRight: boundsOptions?.paddingBottomRight || [0, 0],
      animate: true,
    });
  }

  /**
   * @param {string} groupId
   * @param {object|null} [fallbackLayer]
   * @returns {object|null}
   */
  function resolveGroupFocusBounds(groupId, fallbackLayer = null) {
    const normalizedGroupId = normalizeGroupId(groupId);
    const groupLayers = groupIndex?.layersByGroup?.get(normalizedGroupId) || [];
    const excludedCodes = regionFocusExcludeByGroup.get(normalizedGroupId);
    const layersForFocus = (excludedCodes && excludedCodes.size)
      ? groupLayers.filter((layer) => !excludedCodes.has(getLayerCountryCode(layer)))
      : groupLayers;

    const autoBounds = computeFocusBoundsFromLayers(layersForFocus);
    if (!autoBounds && layersForFocus !== groupLayers) {
      // ATTENTION: intentional hard-stop for diagnosability; runtime could continue with empty layer focus.
      dwarn('Region focus exclusions produced no usable bounds; falling back to full group bounds.', {
        groupId: normalizedGroupId,
        excludedCountries: Array.from(excludedCodes || []),
      });
    }
    if (!autoBounds && layersForFocus !== groupLayers) {
      const fallbackAutoBounds = computeFocusBoundsFromLayers(groupLayers);
      if (fallbackAutoBounds) return fallbackAutoBounds;
    }

    if (autoBounds) return autoBounds;
    if (fallbackLayer && typeof fallbackLayer.getBounds === 'function') {
      return fallbackLayer.getBounds();
    }
    return null;
  }

  /**
   * @param {string} countryCode
   * @param {object|null} [fallbackLayer]
   * @returns {object|null}
   */
  function resolveCountryFocusBounds(countryCode, fallbackLayer = null) {
    const code = normalizeCountryCode(countryCode);
    if (!code) return null;

    const countryLayers = countryIndex?.layersByCountry?.get(code) || [];
    const autoBounds = computeFocusBoundsFromLayers(countryLayers);
    if (autoBounds) return autoBounds;

    if (fallbackLayer && typeof fallbackLayer.getBounds === 'function') {
      return fallbackLayer.getBounds();
    }
    return null;
  }

  /**
   * @param {string} groupId
   */
  function applyWorldLayerStyle(groupId = '') {
    if (!regionLayer || typeof regionLayer.eachLayer !== 'function') return;

    const highlightedGroupId = normalizeGroupId(groupId);
    regionLayer.eachLayer((layer) => {
      if (typeof layer.setStyle !== 'function') return;
      const layerGroupId = normalizeGroupId(getLayerGroupId(layer));
      const isHighlighted = highlightedGroupId && layerGroupId === highlightedGroupId;
      layer.setStyle(isHighlighted ? INTERACTION_STYLE.world.highlighted : INTERACTION_STYLE.world.base);
      if (isHighlighted && typeof layer.bringToFront === 'function') {
        layer.bringToFront();
      }
    });
  }

  /**
   * Apply deterministic styles for hybrid stage layer.
   */
  function applyHybridStageStyle() {
    if (!hybridLayer || typeof hybridLayer.eachLayer !== 'function') return;

    const normalizedSelectedCountry = normalizeCountryCode(selectedCountryCode);
    const normalizedHoveredCountry = normalizeCountryCode(hoveredCountryCode);
    const normalizedHoveredRegion = normalizeGroupId(hoveredRegionGroupId);

    hybridLayer.eachLayer((layer) => {
      if (typeof layer.setStyle !== 'function') return;

      const kind = getLayerHybridKind(layer);
      const layerGroupId = normalizeGroupId(getLayerGroupId(layer));
      if (!layerGroupId) {
        // ATTENTION: intentional hard-stop for diagnosability; runtime could continue by silently dropping this feature from interaction.
        derror(el, 'Leaflet adapter: hybrid feature is missing tdwGroupId.', {
          kind,
          properties: getLayerProps(layer),
        });
        return;
      }

      if (kind === HYBRID_KIND_COUNTRY) {
        const countryCode = normalizeCountryCode(getLayerCountryCode(layer));
        const isHovered = !!normalizedHoveredCountry && countryCode === normalizedHoveredCountry;
        const isSelected = stage === STAGE_COUNTRY && !!normalizedSelectedCountry && countryCode === normalizedSelectedCountry;
        if (isSelected) {
          layer.setStyle(INTERACTION_STYLE.hybrid.country.selected);
          if (typeof layer.bringToFront === 'function') layer.bringToFront();
          return;
        }
        if (isHovered) {
          layer.setStyle(INTERACTION_STYLE.hybrid.country.hover);
          if (typeof layer.bringToFront === 'function') layer.bringToFront();
          return;
        }
        layer.setStyle(INTERACTION_STYLE.hybrid.country.base);
        return;
      }

      if (kind === HYBRID_KIND_REGION) {
        const isHoveredRegion = !!normalizedHoveredRegion && layerGroupId === normalizedHoveredRegion;
        layer.setStyle(isHoveredRegion ? INTERACTION_STYLE.hybrid.region.hover : INTERACTION_STYLE.hybrid.region.base);
        if (isHoveredRegion && typeof layer.bringToFront === 'function') {
          layer.bringToFront();
        }
        return;
      }

      // ATTENTION: intentional hard-stop for diagnosability; runtime could continue by treating unknown kind as passive region feature.
      derror(el, 'Leaflet adapter: hybrid feature has unknown tdwHybridKind.', {
        kind,
        properties: getLayerProps(layer),
      });
    });
  }

  /**
   * @param {string} groupId
   * @returns {object}
   */
  function buildHybridLayerForGroup(groupId) {
    if (!leafletGeoJsonCtor) {
      throw new Error('Leaflet adapter: GeoJSON constructor missing while building hybrid layer.');
    }

    if (regionLayerSource !== REGION_LAYER_SOURCE_DERIVED_COUNTRY) {
      // ATTENTION: intentional hard-stop for diagnosability; runtime could continue by falling back to derived-country source.
      throw new Error(
        `Leaflet adapter: regionLayerSource "${regionLayerSource}" not implemented yet.`
      );
    }

    const hybridRuntimeMap = buildHybridRuntimeMapData({
      countryRuntimeMap,
      regionRuntimeMap,
      activeGroupId: groupId,
    });

    return new leafletGeoJsonCtor(hybridRuntimeMap, {
      style: layerStyle,
      interactive: true,
      onEachFeature: (_feature, layer) => {
        const hybridKind = getLayerHybridKind(layer);
        const regionLabel = getLayerGroupLabel(layer);
        const countryName = getLayerCountryName(layer);

        const tooltipLabel = hybridKind === HYBRID_KIND_COUNTRY
          ? countryName
          : `switch to: ${String(regionLabel || getLayerGroupId(layer) || '').trim()}`;

        if (tooltipLabel && typeof layer.bindTooltip === 'function') {
          layer.bindTooltip(tooltipLabel, {
            sticky: true,
            direction: 'top',
            opacity: 0.92,
          });
        }

        bindHoverHandlers(layer, () => {
          if (stage === STAGE_WORLD) return;

          if (hybridKind === HYBRID_KIND_COUNTRY) {
            hoveredCountryCode = normalizeCountryCode(getLayerCountryCode(layer));
            hoveredRegionGroupId = '';
          } else if (hybridKind === HYBRID_KIND_REGION) {
            hoveredCountryCode = '';
            hoveredRegionGroupId = normalizeGroupId(getLayerGroupId(layer));
          }
          applyHybridStageStyle();
        }, () => {
          if (stage === STAGE_WORLD) return;
          hoveredCountryCode = '';
          hoveredRegionGroupId = '';
          applyHybridStageStyle();
        });

        layer.on('click', (event) => {
          if (map?.stop) map.stop();

          if (event?.originalEvent && leafletModule?.DomEvent?.stopPropagation) {
            leafletModule.DomEvent.stopPropagation(event.originalEvent);
          }
          if (leafletModule?.DomEvent?.stopPropagation) {
            leafletModule.DomEvent.stopPropagation(event);
          }

          if (stage !== STAGE_REGION && stage !== STAGE_COUNTRY) return;

          if (hybridKind === HYBRID_KIND_REGION) {
            const targetGroupId = normalizeGroupId(getLayerGroupId(layer));
            const targetBounds = resolveGroupFocusBounds(targetGroupId, layer);
            if (!targetGroupId || !targetBounds) {
              derror(el, 'Leaflet adapter: region-kind hybrid click missing group bounds.', {
                targetGroupId,
              });
              return;
            }
            enterRegionStage({ groupId: targetGroupId, bounds: targetBounds, reason: 'region-kind-click' });
            return;
          }

          if (hybridKind === HYBRID_KIND_COUNTRY) {
            const countryCode = normalizeCountryCode(getLayerCountryCode(layer));
            const groupIdForCountry = normalizeGroupId(getLayerGroupId(layer));
            const countryBounds = resolveCountryFocusBounds(countryCode, layer);

            if (!countryCode || !groupIdForCountry || !countryBounds) {
              derror(el, 'Leaflet adapter: country-kind hybrid click is missing contract fields.', {
                countryCode,
                groupIdForCountry,
              });
              return;
            }

            if (groupIdForCountry !== normalizeGroupId(activeGroupId)) {
              // ATTENTION: intentional hard-stop for diagnosability; runtime could continue by treating this as region switch.
              derror(el, 'Leaflet adapter: country-kind click outside active region detected.', {
                countryCode,
                groupIdForCountry,
                activeGroupId,
              });
              return;
            }

            enterCountryStage({
              countryCode,
              groupId: groupIdForCountry,
              bounds: countryBounds,
              titleHint: countryName || countryCode,
              reason: 'country-kind-click',
            });
            return;
          }

          // ATTENTION: intentional hard-stop for diagnosability; runtime could continue by ignoring unknown kind.
          derror(el, 'Leaflet adapter: hybrid click has unknown kind.', {
            hybridKind,
            properties: getLayerProps(layer),
          });
        });
      },
    });
  }

  /**
   * @param {string} groupId
   */
  function mountHybridLayer(groupId) {
    if (!map) return;

    if (hybridLayer && map.hasLayer(hybridLayer)) {
      map.removeLayer(hybridLayer);
    }

    hybridLayer = buildHybridLayerForGroup(groupId);
    if (regionLayer && map.hasLayer(regionLayer)) {
      map.removeLayer(regionLayer);
    }
    if (!map.hasLayer(hybridLayer)) {
      hybridLayer.addTo(map);
    }
    applyHybridStageStyle();
  }

  /**
   * @param {'world'|'region'|'country'} nextStage
   */
  function applyPreviewForStage(nextStage) {
    if (nextStage === STAGE_WORLD) {
      closePreview('stage-world');
      return;
    }

    if (nextStage === STAGE_REGION) {
      const previewOpened = openRegionPreview(activeGroupId);
      if (!previewOpened) closePreview('stage-region');
      return;
    }

    if (nextStage === STAGE_COUNTRY) {
      const previewOpened = openCountryPreview(selectedCountryCode, selectedCountryTitle || selectedCountryCode);
      if (!previewOpened) closePreview('stage-country');
    }
  }

  /**
   * @param {{reason?:string}} [ctx]
   */
  function enterWorldStage(ctx = {}) {
    if (!map || !regionLayer) return;

    const reason = String(ctx.reason || 'world-transition');
    closePreview(`enter-world:${reason}`);
    const worldOptions = resolveStageBoundsOptions(STAGE_WORLD);

    const commit = () => {
      if (hybridLayer && map.hasLayer(hybridLayer)) {
        map.removeLayer(hybridLayer);
      }
      if (!map.hasLayer(regionLayer)) {
        regionLayer.addTo(map);
      }
      stage = STAGE_WORLD;
      activeGroupId = '';
      activeGroupBounds = null;
      selectedCountryCode = '';
      selectedCountryTitle = '';
      hoveredCountryCode = '';
      hoveredRegionGroupId = '';
      applyWorldLayerStyle('');
      applyPreviewForStage(STAGE_WORLD);
    };

    if (worldBounds) {
      flyAndSwitch(worldBounds, commit, worldOptions);
      return;
    }

    commit();
  }

  /**
   * @param {{groupId:string,bounds?:object|null,reason?:string}} params
   */
  function enterRegionStage({ groupId, bounds = null, reason = 'region-transition' }) {
    if (!map || !regionLayer || !regionRuntimeMap) return;

    const normalizedGroupId = normalizeGroupId(groupId);
    const targetBounds = bounds || resolveGroupFocusBounds(normalizedGroupId);
    if (!normalizedGroupId || !targetBounds) {
      derror(el, 'Leaflet adapter: enterRegionStage missing group/bounds.', {
        groupId: normalizedGroupId,
        reason,
      });
      return;
    }

    activeGroupId = normalizedGroupId;
    activeGroupBounds = targetBounds;
    selectedCountryCode = '';
    selectedCountryTitle = '';
    hoveredCountryCode = '';
    hoveredRegionGroupId = '';
    applyPreviewForStage(STAGE_REGION);

    const regionOptions = resolveStageBoundsOptions(STAGE_REGION);
    const commit = () => {
      stage = STAGE_REGION;
      mountHybridLayer(normalizedGroupId);
      applyHybridStageStyle();
    };

    flyAndSwitch(targetBounds, commit, regionOptions);
  }

  /**
   * @param {{countryCode:string,groupId?:string,bounds?:object|null,titleHint?:string,reason?:string}} params
   */
  function enterCountryStage({
    countryCode,
    groupId = '',
    bounds = null,
    titleHint = '',
    reason = 'country-transition',
  }) {
    if (!map || !regionLayer || !regionRuntimeMap) return;

    const normalizedCountryCode = normalizeCountryCode(countryCode);
    const inferredGroupId = normalizeGroupId(
      groupId || countryGrouping?.countryToRegion?.[normalizedCountryCode] || activeGroupId
    );
    const countryBounds = bounds || resolveCountryFocusBounds(normalizedCountryCode);
    const regionBounds = resolveGroupFocusBounds(inferredGroupId);

    if (!normalizedCountryCode || !inferredGroupId || !countryBounds || !regionBounds) {
      derror(el, 'Leaflet adapter: enterCountryStage missing contract fields.', {
        countryCode: normalizedCountryCode,
        groupId: inferredGroupId,
        reason,
      });
      return;
    }

    activeGroupId = inferredGroupId;
    activeGroupBounds = regionBounds;
    selectedCountryCode = normalizedCountryCode;
    selectedCountryTitle = String(titleHint || normalizedCountryCode);
    hoveredCountryCode = '';
    hoveredRegionGroupId = '';
    applyPreviewForStage(STAGE_COUNTRY);

    const countryOptions = resolveStageBoundsOptions(STAGE_COUNTRY);
    const commit = () => {
      stage = STAGE_COUNTRY;
      mountHybridLayer(inferredGroupId);
      applyHybridStageStyle();
    };

    flyAndSwitch(countryBounds, commit, countryOptions);
  }

  return {
    async init({ el: containerEl, mapData, mapMeta, adapterConfig }) {
      this.destroy();

      if (!(containerEl instanceof HTMLElement)) {
        // ATTENTION: intentional hard-stop for diagnosability; runtime could continue with weak element assumptions.
        throw new Error('Leaflet adapter: missing/invalid container element (el).');
      }

      if (!adapterConfig || typeof adapterConfig !== 'object') {
        // ATTENTION: intentional hard-stop for diagnosability; runtime could continue with weak adapter config assumptions.
        throw new Error('Leaflet adapter: adapterConfig is missing or invalid.');
      }

      if (!hasRuntimeBundleContract(mapData)) {
        // ATTENTION: intentional hard-stop for diagnosability; runtime could continue with weak runtime bundle assumptions.
        throw new Error(
          'Leaflet adapter: mapData must be a prepared runtime bundle (countryRuntimeMap/regionRuntimeMap/countryGrouping/flags).'
        );
      }

      el = containerEl;

      const runtimeLayers = mapData;
      const runtimeFlags = isPlainObject(runtimeLayers?.flags) ? runtimeLayers.flags : {};
      const pipelinePreprocessEnabled = normalizeBool(runtimeFlags.preprocessEnabled, true);
      const regionLayerEnabled = normalizeBool(runtimeFlags.regionLayerEnabled, true);
      const whitelistEnabled = normalizeBool(runtimeFlags.whitelistEnabled, true);
      const groupingEnabled = normalizeBool(runtimeFlags.groupingEnabled, true);
      const groupingMode = String(runtimeFlags.groupingMode || runtimeLayers?.countryGrouping?.mode || 'off');
      const datasetKey = String(runtimeLayers?.datasetKey || adapterConfig?.map?.datasetKey || 'world-v1').trim() || 'world-v1';
      regionLayerSource = String(
        adapterConfig?.map?.regionLayer?.source || REGION_LAYER_SOURCE_DERIVED_COUNTRY
      ).trim().toLowerCase();
      if (
        regionLayerSource !== REGION_LAYER_SOURCE_DERIVED_COUNTRY
        && regionLayerSource !== REGION_LAYER_SOURCE_EXTERNAL_REGION_MAP
      ) {
        regionLayerSource = REGION_LAYER_SOURCE_DERIVED_COUNTRY;
      }
      focusPadding = resolveFocusPaddingConfig(adapterConfig);
      regionFocusExcludeByGroup = resolveRegionFocusExclusions(adapterConfig);
      previewConfig = resolvePreviewConfig(adapterConfig);

      try {
        preview = createPreviewOverlay({
          rootEl: el,
          config: {
            ...previewConfig,
            mapId: previewConfig.mapId || mapId || '',
          },
          onClose: ({ reason }) => {
            if (reason !== 'user-close') return;

            // UX rule: close means close the preview flow and return to world stage.
            enterWorldStage({ reason: 'preview-close' });
          },
        });
      } catch (err) {
        preview = null;
        dwarn('Preview overlay creation failed; map continues without preview.', { err });
      }

      countryGrouping = runtimeLayers.countryGrouping || null;
      countryRuntimeMap = runtimeLayers.countryRuntimeMap || null;
      regionRuntimeMap = runtimeLayers.regionRuntimeMap || null;

      const countryFeatureCount = Array.isArray(countryRuntimeMap?.features) ? countryRuntimeMap.features.length : 0;
      if (!countryFeatureCount) {
        // ATTENTION: intentional hard-stop for diagnosability; runtime could continue with empty fallback map.
        throw new Error('Leaflet adapter: runtime bundle has no countryRuntimeMap features.');
      }

      dlog('Leaflet runtime config.', {
        mapId: mapId || null,
        datasetKey,
        pipelinePreprocessEnabled,
        whitelistEnabled,
        groupingEnabled,
        groupingMode,
        regionLayerEnabled,
        regionLayerSource,
        focusPadding,
        regionFocusExclusionGroups: regionFocusExcludeByGroup.size,
        previewConfig,
      });

      if (!pipelinePreprocessEnabled) {
        dwarn(
          'Runtime pipeline passthrough mode active (preprocess.enabled=0); grouping/whitelist/part-rules are ignored for this map instance.'
        );
      }

      dlog('Runtime pipeline audit.', {
        mapId: mapId || null,
        datasetKey,
        groupedCountries: runtimeLayers.countryGrouping?.includedCountries?.length || 0,
        templateCountriesMissingInSource: Array.isArray(runtimeLayers?.countryGrouping?.diagnostics?.templateCountriesMissingInSource)
          ? runtimeLayers.countryGrouping.diagnostics.templateCountriesMissingInSource.length
          : 0,
        countryFeatures: runtimeLayers.countryRuntimeMap?.features?.length || 0,
        regionFeatures: runtimeLayers.regionRuntimeMap?.features?.length || 0,
        audit: runtimeLayers.countryAudit,
      });

      const moduleNs = await loadLeafletModule(adapterConfig);
      const { MapCtor, GeoJSONCtor } = getStrictConstructors(moduleNs);
      layerStyle = resolveStyle(adapterConfig.style);
      leafletGeoJsonCtor = GeoJSONCtor;

      map = new MapCtor(el, resolveMapOptions(adapterConfig));

      countryLayer = new GeoJSONCtor(runtimeLayers.countryRuntimeMap, {
        style: layerStyle,
        interactive: true,
      });

      countryIndex = buildCountryLayerIndex(countryLayer);

      if (runtimeLayers.regionRuntimeMap) {
        regionLayer = new GeoJSONCtor(runtimeLayers.regionRuntimeMap, {
          style: layerStyle,
          interactive: true,
        });

        groupIndex = buildGroupLayerIndex(regionLayer);

        // Bind hover/click per feature for grouped navigation.
        regionLayer.eachLayer((layer) => {
          const label = getLayerGroupLabel(layer);
          if (label && typeof layer.bindTooltip === 'function') {
            layer.bindTooltip(label, {
              sticky: true,
              direction: 'top',
              opacity: 0.92,
            });
          }

          bindHoverHandlers(layer, () => {
            if (stage !== STAGE_WORLD || !regionLayer) return;
            const groupId = getLayerGroupId(layer);
            if (!groupId || !groupIndex?.layersByGroup?.has(groupId)) return;

            applyWorldLayerStyle(groupId);
          }, () => {
            if (stage !== STAGE_WORLD || !regionLayer) return;
            applyWorldLayerStyle('');
          });

          layer.on('click', (event) => {
            if (moduleNs?.DomEvent?.stopPropagation) {
              moduleNs.DomEvent.stopPropagation(event);
              if (event?.originalEvent) moduleNs.DomEvent.stopPropagation(event.originalEvent);
            }

            if (stage !== STAGE_WORLD) return;

            const groupId = getLayerGroupId(layer);
            const targetBounds = resolveGroupFocusBounds(groupId, layer);
            if (!groupId || !targetBounds) {
              derror(el, 'Leaflet adapter: clicked region is missing group bounds.', { groupId });
              return;
            }

            const autoGroupBounds = computeFocusBoundsFromLayers(groupIndex?.layersByGroup?.get(groupId) || []);
            if (!autoGroupBounds) {
              dwarn('Region focus bounds fallback used (single-layer bounds).', { groupId });
            }

            enterRegionStage({ groupId, bounds: targetBounds, reason: 'world-region-click' });
          });
        });
      }

      // Start in world stage when a region layer is available.
      if (regionLayer) {
        regionLayer.addTo(map);
        stage = STAGE_WORLD;
        activeGroupId = '';
        selectedCountryCode = '';
        selectedCountryTitle = '';
        hoveredCountryCode = '';
        hoveredRegionGroupId = '';
        worldBounds = fitInitialView(map, regionLayer, adapterConfig.view || null, resolveStageBoundsOptions('world'));
        applyWorldLayerStyle('');
        applyPreviewForStage(STAGE_WORLD);
      } else {
        // ATTENTION: intentional hard-stop for diagnosability; runtime could continue with country-only mode.
        dwarn('Region layer disabled or unavailable; falling back to country-only startup.');
        countryLayer.addTo(map);
        stage = STAGE_COUNTRY;
        worldBounds = fitInitialView(map, countryLayer, adapterConfig.view || null, resolveStageBoundsOptions('world'));
        selectedCountryCode = '';
        selectedCountryTitle = '';
        hoveredCountryCode = '';
        hoveredRegionGroupId = '';
      }

      // Refit once after first paint so initial bounds use final container size.
      window.requestAnimationFrame(() => {
        if (!map || !worldBounds) return;
        try {
          map.invalidateSize(false);
          const worldOptions = resolveStageBoundsOptions('world');
          map.fitBounds(worldBounds, {
            paddingTopLeft: worldOptions.paddingTopLeft,
            paddingBottomRight: worldOptions.paddingBottomRight,
            animate: false,
          });
        } catch (err) {
          dwarn('Deferred initial fit failed.', { err });
        }
      });

      // Background click keeps staged navigation:
      // country -> region, region -> world.
      mapClickHandler = () => {
        if (stage === STAGE_COUNTRY) {
          const regionKey = String(activeGroupId || '').trim();
          const targetBounds = activeGroupBounds || resolveGroupFocusBounds(regionKey);
          if (regionLayer && targetBounds && regionKey) {
            enterRegionStage({ groupId: regionKey, bounds: targetBounds, reason: 'sea-click-country' });
            return;
          }
          enterWorldStage({ reason: 'sea-click-country-fallback' });
          return;
        }

        if (stage === STAGE_REGION) {
          enterWorldStage({ reason: 'sea-click-region' });
          return;
        }

        // World stage sea click is intentionally a no-op.
      };

      if (typeof map.on === 'function') {
        map.on('click', mapClickHandler);
      }

      const initialBounds = summarizeBounds(worldBounds);
      const initialFit = estimateFitFill(map, initialBounds);
      const mapSize = (map && typeof map.getSize === 'function') ? map.getSize() : null;
      dlog('Leaflet map initialized.', {
        mapId: mapId || null,
        stage,
        activeGroupId,
        selectedCountryCode,
        regionLayerActive: !!regionLayer && stage === STAGE_WORLD,
        hybridLayerActive: !!hybridLayer && (stage === STAGE_REGION || stage === STAGE_COUNTRY),
        containerW: Number(mapSize?.x || 0),
        containerH: Number(mapSize?.y || 0),
        initialFocus: {
          source: String(resolveViewBounds(regionLayer || countryLayer, adapterConfig.view || null)?.source || 'unknown'),
          bounds: initialBounds,
          fit: initialFit,
        },
      });
    },

    onResize(_activeRegionId) {
      if (!map) return;

      if (typeof map.invalidateSize === 'function') {
        map.invalidateSize(false);
      }

      if (preview && typeof preview.reposition === 'function') {
        preview.reposition();
      }
    },

    destroy() {
      if (map) {
        clearPendingMoveHandler(map, pendingMoveHandler);
        pendingMoveHandler = null;
        if (pendingMoveFallbackTimer) {
          window.clearTimeout(pendingMoveFallbackTimer);
          pendingMoveFallbackTimer = null;
        }

        if (mapClickHandler && typeof map.off === 'function') {
          map.off('click', mapClickHandler);
        }
      }

      if (map && typeof map.remove === 'function') {
        try {
          map.remove();
        } catch (_) {
          dwarn('Leaflet adapter: map.remove failed during destroy.');
        }
      }

      if (preview && typeof preview.destroy === 'function') {
        try {
          preview.destroy();
        } catch (_) {
          dwarn('Leaflet adapter: preview.destroy failed during destroy.');
        }
      }

      map = null;
      regionLayer = null;
      hybridLayer = null;
      countryLayer = null;
      el = null;
      stage = STAGE_WORLD;
      activeGroupId = '';
      activeGroupBounds = null;
      selectedCountryCode = '';
      selectedCountryTitle = '';
      hoveredCountryCode = '';
      hoveredRegionGroupId = '';
      worldBounds = null;
      groupIndex = null;
      countryIndex = null;
      countryRuntimeMap = null;
      regionRuntimeMap = null;
      leafletGeoJsonCtor = null;
      layerStyle = defaultStyle;
      regionLayerSource = REGION_LAYER_SOURCE_DERIVED_COUNTRY;
      regionFocusExcludeByGroup = new Map();
      mapClickHandler = null;
      pendingMoveHandler = null;
      pendingMoveFallbackTimer = null;
      focusPadding = { ...DEFAULT_FOCUS_PADDING };
      preview = null;
      previewConfig = { ...DEFAULT_PREVIEW_CONFIG, mapId: mapId || '' };
      countryGrouping = null;
    },
  };
}

/* ============================================================
   4) AUTO-RUN
   ============================================================ */

// No autorun registration; adapter factory imports this module on demand.
