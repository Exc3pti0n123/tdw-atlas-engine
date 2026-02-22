/* ============================================================
   Module: TDW Atlas Engine — Leaflet Adapter Factory
   ------------------------------------------------------------
   Purpose:
   - Adapt Atlas Core contract to Leaflet 2.x renderer.

   Public surface (ESM export):
   - createAdapter() -> { init, onResize, destroy }
   ============================================================ */

/* ============================================================
   1) MODULE INIT
   ============================================================ */

window.TDW = window.TDW || {};
window.TDW.Atlas = window.TDW.Atlas || {};

const SCOPE = 'ATLAS LF-ADAPTER';

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
  const already = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
    .some((link) => (link.getAttribute('href') || '') === href);

  if (already) return;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

/**
 * @param {object} config
 * @returns {Promise<object>}
 */
async function loadLeafletModule(config) {
  if (leafletModule) return leafletModule;

  const jsUrl = config?.vendor?.leafletJs;
  if (!jsUrl) {
    throw new Error('Missing config.vendor.leafletJs (Leaflet module URL).');
  }

  ensureLeafletCss(config?.vendor?.leafletCss);
  leafletModule = await import(toAbsoluteUrl(jsUrl));
  return leafletModule;
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
 * @param {object} map
 * @param {object} layer
 */
function fitWorldView(map, layer) {
  if (!map || !layer) return;

  const bounds = typeof layer.getBounds === 'function' ? layer.getBounds() : null;
  if (!bounds) {
    // ATTENTION: intentional hard-stop for diagnosability; runtime could continue with silent no-op.
    throw new Error('Leaflet adapter: GeoJSON layer has no bounds.');
  }

  try {
    map.fitBounds(bounds, { padding: [20, 20], animate: false });
  } catch (err) {
    dwarn('Leaflet fitBounds failed; fallback setView applied.', { err });
    map.setView([20, 0], 2);
  }
}

/**
 * @param {unknown} styleConfig
 * @returns {Function|object}
 */
function resolveStyle(styleConfig) {
  if (styleConfig === undefined || styleConfig === null) {
    return defaultStyle;
  }

  const isValid = typeof styleConfig === 'function' || (typeof styleConfig === 'object' && !Array.isArray(styleConfig));
  if (!isValid) {
    // ATTENTION: intentional hard-stop for diagnosability; runtime could continue with forced default style.
    throw new Error('Leaflet adapter: invalid config.style (expected function or object).');
  }

  return styleConfig;
}

/* ============================================================
   3) PUBLIC API
   ============================================================ */

/**
 * Create one adapter instance for one Core instance.
 *
 * @returns {{init: Function, onResize: Function, destroy: Function}}
 */
export function createAdapter() {
  // Per-instance mutable state; never shared across containers.
  let map = null;
  let geoLayer = null;
  let el = null;

  return {
    async init({ el: containerEl, config, geojson }) {
      this.destroy();

      if (!(containerEl instanceof HTMLElement)) {
        // ATTENTION: intentional hard-stop for diagnosability; runtime could continue with weak element assumptions.
        throw new Error('Leaflet adapter: missing/invalid container element (el).');
      }

      if (!geojson || typeof geojson !== 'object') {
        // ATTENTION: intentional hard-stop for diagnosability; runtime could continue with empty map.
        throw new Error('Leaflet adapter: missing GeoJSON object.');
      }

      el = containerEl;

      const moduleNs = await loadLeafletModule(config || {});
      const { MapCtor, GeoJSONCtor } = getStrictConstructors(moduleNs);

      const mapOptions = {
        zoomControl: true,
        attributionControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false,
        tap: false,
        ...((config && config.mapOptions) || {}),
      };

      map = new MapCtor(el, mapOptions);
      geoLayer = new GeoJSONCtor(geojson, { style: resolveStyle(config?.style) });
      geoLayer.addTo(map);
      fitWorldView(map, geoLayer);
      dlog('Leaflet map initialized.');
    },

    onResize(_activeRegionId) {
      if (!map) return;

      if (typeof map.invalidateSize === 'function') {
        map.invalidateSize(false);
      }

      if (geoLayer) {
        try {
          fitWorldView(map, geoLayer);
        } catch (err) {
          derror(el, 'Leaflet adapter: failed to refit bounds on resize.', { err });
        }
      }
    },

    destroy() {
      if (map && typeof map.remove === 'function') {
        try {
          map.remove();
        } catch (_) {
          dwarn('Leaflet adapter: map.remove failed during destroy.');
        }
      }

      map = null;
      geoLayer = null;
      el = null;
    },
  };
}

/* ============================================================
   4) AUTO-RUN
   ============================================================ */

// No autorun registration; adapter factory imports this module on demand.
