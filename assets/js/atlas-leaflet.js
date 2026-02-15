/* ============================================================
   TDW Atlas Engine — Leaflet Adapter (Mini‑MVP)
   ------------------------------------------------------------
   Goals (Mini‑MVP)
   - Render ONE GeoJSON dataset into a Leaflet map inside a given container.
   - Fit the view to the GeoJSON bounds.
   - No tiles, no interactions, no regions yet.

   Important (Leaflet 2.x / ESM)
   - Leaflet is loaded via dynamic `import()` (ESM) from a vendor URL.
   - We do NOT rely on `window.L`.
   - The vendor module URL must be provided via config:
       config.vendor.leafletJs  (absolute or site-relative URL)
       config.vendor.leafletCss (optional URL; we inject a <link> if provided)
  ============================================================ */

(function (window) {
  'use strict';

  // ============================================================
  // MODULE INIT: Adapter object + namespace (idempotent)
  // ============================================================
  window.TDW = window.TDW || {};
  window.TDW.Atlas = window.TDW.Atlas || {};
  const Adapter = {};
  const dbg = window.TDWAtlasDebug || null;

  // ---------------------------------------------------------------------------
  // Internal state (one map per adapter instance)
  // ---------------------------------------------------------------------------
  let leaflet = null;   // Leaflet module namespace (loaded via dynamic import)
  let map = null;       // Leaflet Map instance
  let geoLayer = null;  // Leaflet GeoJSON layer instance
  let el = null;        // HTMLElement
  let config = null;    // plain object
  let core = null;      // core instance reference (unused in MVP)

  // ============================================================
  // FUNCTIONS
  // ============================================================

  /**
   * Resolve a URL that may be site-relative (starts with "/") or absolute.
   * @param {string} url
   * @returns {string}
   */
  const toAbsoluteUrl = (url) => {
    if (!url) return '';
    try {
      // Absolute already?
      return new URL(url).href;
    } catch (_) {
      // Treat as relative to current origin
      return new URL(url, window.location.origin).href;
    }
  };

  /**
   * Ensure Leaflet CSS is present (optional; only if a URL is provided).
   * @param {string} cssUrl
   */
  const ensureLeafletCss = (cssUrl) => {
    if (!cssUrl) return;

    const href = toAbsoluteUrl(cssUrl);
    const already = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
      .some((l) => (l.getAttribute('href') || '') === href);

    if (already) return;

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  };

  /**
   * Lazy-load Leaflet as an ESM module.
   * Expects `config.vendor.leafletJs` to be set.
   * @param {object} cfg
   * @returns {Promise<object>} Leaflet module namespace
   */
  const loadLeafletModule = async (cfg) => {
    if (leaflet) return leaflet;

    const jsUrl = cfg?.vendor?.leafletJs;
    if (!jsUrl) {
      throw new Error('Missing config.vendor.leafletJs (Leaflet module URL).');
    }

    // Optional CSS injection
    ensureLeafletCss(cfg?.vendor?.leafletCss);

    const abs = toAbsoluteUrl(jsUrl);

    // Dynamic import: Leaflet 2.x alpha ships ESM (uses `export`), so this must NOT be enqueued as a classic script.
    // Note: `import()` caches the module after first load.
    leaflet = await import(abs);

    return leaflet;
  };

  const getCtor = (name, fallbackName) => {
    // Leaflet 2.x: constructors are expected (e.g., new Map(...))
    // Leaflet 1.x: factory functions exist (e.g., L.map(...))
    return leaflet?.[name] || (fallbackName ? leaflet?.[fallbackName] : null);
  };

  const createMap = (container, options) => {
    const MapCtor = getCtor('Map');
    const mapFactory = getCtor('map');

    if (MapCtor) return new MapCtor(container, options);
    if (typeof mapFactory === 'function') return mapFactory(container, options);

    throw new Error('Leaflet Map constructor/factory not found on provided `leaflet` object.');
  };

  const createGeoJsonLayer = (geojson, options) => {
    const GeoJSONCtor = getCtor('GeoJSON');
    const geoJsonFactory = getCtor('geoJSON') || getCtor('geoJson');

    if (GeoJSONCtor) return new GeoJSONCtor(geojson, options);
    if (typeof geoJsonFactory === 'function') return geoJsonFactory(geojson, options);

    throw new Error('Leaflet GeoJSON constructor/factory not found on provided `leaflet` object.');
  };

  const safeFitBounds = (bounds, fitOptions) => {
    if (!map) return;
    try {
      map.fitBounds(bounds, fitOptions);
    } catch (err) {
      // fallback: neutral view (world-ish)
      try {
        map.setView([20, 0], 2);
      } catch (_) {
        // ignore
      }
    }
  };

  // ---------------------------------------------------------------------------
  // Minimal style (tokens come from CSS; this is just a safe default)
  // ---------------------------------------------------------------------------
  const defaultStyle = () => ({
    color: '#666',
    weight: 1,
    fillColor: '#999',
    fillOpacity: 0.2,
  });

  // ============================================================
  // PUBLIC ADAPTER API
  // ============================================================

  Adapter.init = async function init({ el: container, config: cfg, geojson, core: coreRef }) {
    // Defensive: destroy previous instance if someone re-inits accidentally.
    Adapter.destroy();

    el = container || null;
    config = cfg || {};
    core = coreRef || null;

    if (!el) {
      dbg?.warn?.('[TDW ATLAS] Leaflet adapter: missing container element (el).');
      return;
    }

    if (!geojson) {
      dbg?.warn?.('[TDW ATLAS] Leaflet adapter: missing GeoJSON object.');
      return;
    }

    // Load Leaflet on demand (ESM)
    try {
      await loadLeafletModule(config);
    } catch (err) {
      dbg?.warn?.('[TDW ATLAS] Leaflet adapter: failed to load Leaflet module:', err);
      return;
    }

    // Create map (locked interactions for MVP)
    const mapOptions = {
      zoomControl: true,
      attributionControl: false,

      // MVP: lock manual interaction (we control view programmatically)
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      tap: false,

      ...(config.mapOptions || {}),
    };

    try {
      map = createMap(el, mapOptions);
    } catch (err) {
      dbg?.warn?.('[TDW ATLAS] Leaflet adapter: failed to create map:', err);
      Adapter.destroy();
      return;
    }

    // Create + add GeoJSON layer
    try {
      geoLayer = createGeoJsonLayer(geojson, {
        style: config.style || defaultStyle,
      });

      // Leaflet 1.x/2.x both commonly support addTo(map)
      if (typeof geoLayer.addTo === 'function') {
        geoLayer.addTo(map);
      } else if (typeof map.addLayer === 'function') {
        map.addLayer(geoLayer);
      }
    } catch (err) {
      dbg?.warn?.('[TDW ATLAS] Leaflet adapter: failed to create GeoJSON layer:', err);
      Adapter.destroy();
      return;
    }

    // Initial view
    Adapter.showWorld();
  };

  Adapter.showWorld = function showWorld() {
    if (!map || !geoLayer) return;

    // GeoJSON bounds
    const bounds = typeof geoLayer.getBounds === 'function' ? geoLayer.getBounds() : null;
    if (!bounds) {
      // fallback
      try {
        map.setView([20, 0], 2);
      } catch (_) {}
      return;
    }

    safeFitBounds(bounds, { padding: [20, 20], animate: false });
  };

  // Not needed yet (kept to satisfy the Core contract)
  Adapter.showRegion = function showRegion(_regionId) {
    // Mini‑MVP: regions are handled later.
    Adapter.showWorld();
  };

  Adapter.onResize = function onResize(_activeRegionId) {
    if (!map) return;

    // Tell Leaflet it needs to recompute internal sizes.
    if (typeof map.invalidateSize === 'function') {
      map.invalidateSize(false);
    }

    // Keep it simple for MVP
    Adapter.showWorld();
  };

  Adapter.destroy = function destroy() {
    if (map && typeof map.remove === 'function') {
      try {
        map.remove();
      } catch (_) {
        // ignore
      }
    }

    // Keep `leaflet` cached (module is reusable across instances).
    map = null;
    geoLayer = null;
    el = null;
    config = null;
    core = null;
  };

  // ============================================================
  // AUTO-RUN: Register adapter in API registry
  // ============================================================
  const api = window.TDW?.Atlas?.API;
  if (typeof api?.registerAdapter === 'function') {
    api.registerAdapter('leaflet', Adapter);
    dbg?.log?.('[TDW ATLAS] Leaflet adapter registered via API.');
  } else {
    window.TDW.Atlas._pendingAdapters = window.TDW.Atlas._pendingAdapters || {};
    window.TDW.Atlas._pendingAdapters.leaflet = Adapter;
    dbg?.warn?.('[TDW ATLAS] Leaflet adapter stored in pending adapters (API not ready).');
  }
})(window);