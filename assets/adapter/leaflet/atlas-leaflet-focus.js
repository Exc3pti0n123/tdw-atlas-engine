/* ============================================================
   Module: TDW Atlas Engine — Leaflet Focus Helpers
   ------------------------------------------------------------
   Purpose:
   - Provide bounds/focus helpers for the Leaflet adapter.
   - Keep antimeridian and fit estimation logic isolated.
   ============================================================ */

import {
  isPlainObject,
  normalizeBool,
  normalizeCountryCode,
  normalizeGroupId,
} from '../../js/helpers/atlas-shared.js';

/* ============================================================
   1) MODULE INIT
   ============================================================ */

const SCOPE = 'ATLAS LF-FOCUS';

const { dlog, dwarn, derror } = window?.TDW?.Logger?.createScopedLogger?.(SCOPE) || {
  dlog: () => {},
  dwarn: () => {},
  derror: (...args) => console.error('[TDW ATLAS FATAL]', `[${SCOPE}]`, ...args),
};

export const DEFAULT_FOCUS_PADDING = Object.freeze({
  world: [28, 28],
  region: [24, 24],
  country: [20, 20],
});

/* ============================================================
   2) FUNCTIONS
   ============================================================ */

/**
 * @param {unknown} candidate
 * @param {[number, number]} fallback
 * @returns {[number, number]}
 */
export function normalizePaddingPair(candidate, fallback) {
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
 * @param {object} adapterConfig
 * @returns {Map<string, Set<string>>}
 */
export function resolveRegionFocusExclusions(adapterConfig) {
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
export function resolveFocusPaddingConfig(adapterConfig) {
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
export function computeFocusBoundsFromLayers(layers) {
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
 * @param {object} layer
 * @param {object|null} viewConfig
 * @returns {{bounds: object|Array, source: string}|null}
 */
export function resolveViewBounds(layer, viewConfig) {
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
export function fitInitialView(map, layer, viewConfig, boundsOptions) {
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
 * @param {unknown} bounds
 * @returns {{south:number, west:number, north:number, east:number, lngSpan:number, latSpan:number}|null}
 */
export function summarizeBounds(bounds) {
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
export function estimateFitFill(map, boundsSummary) {
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

/* ============================================================
   3) PUBLIC API
   ============================================================ */

// Exported function set is defined inline above.
export { normalizeBool, normalizeCountryCode, normalizeGroupId };

/* ============================================================
   4) AUTO-RUN
   ============================================================ */

// No autorun side effects.
