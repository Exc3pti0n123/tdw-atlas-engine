/* ============================================================
   TDW Atlas Engine — Boot Loader
   ------------------------------------------------------------
   Responsibility:
   - Wait for DOM to be ready
   - Find all atlas containers rendered by the shortcode
   - Create a Core instance for each container

   File structure convention:
   1) MODULE INIT (constants + tiny helpers)
   2) FUNCTIONS (all callable logic)
   3) AUTO-RUN (wire up events / start)
   ============================================================ */

(function () {
  'use strict';

  /* ============================================================
     1) MODULE INIT
     ============================================================ */

  const LOG_PREFIX = '[TDW Atlas]';
  const CONTAINER_SELECTOR = '[data-tdw-atlas]';
  const CONFIG_ATTR = 'data-config-url';
  // Used for PHP <-> JS debug coordination
  const DEBUG_COOKIE_NAME = 'tdw_atlas_debug';
  const DEBUG_COOKIE_DAYS = 30;
  const ADAPTER_NAME = 'leaflet';
  const DEBUG_QUERY_PARAM = 'tdw_atlas_debug';

  /**
   * Helper: DOM Ready
   * Ensures we only start after the page is fully parsed.
   */
  function onReady(callback) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', callback, { once: true });
    } else {
      callback();
    }
  }

  /* ============================================================
     2) FUNCTIONS
     ============================================================ */

    /**
   * Loads atlas.config.json (shared config) from a URL.
   * @param {string} url Absolute URL (from data-config-url).
   * @returns {Promise<object>} Parsed config object.
   */
  async function loadAtlasConfig(url) {
    if (!url) return null;

    try {
      const res = await fetch(url, { credentials: 'same-origin' });
      if (!res.ok) {
        console.error(`${LOG_PREFIX} Failed to load config: ${res.status} ${res.statusText}`, { url });
        return null;
      }
      const json = await res.json();
      return json;
    } catch (err) {
      console.error(`${LOG_PREFIX} Failed to load config (network/parse error).`, { url, err });
      return null;
    }
  }

  /**
   * Read a cookie value.
   * @param {string} name
   * @returns {string|null}
   */
  function getCookie(name) {
    const needle = `${name}=`;
    const parts = document.cookie.split('; ').filter(Boolean);
    for (const p of parts) {
      if (p.startsWith(needle)) return p.slice(needle.length);
    }
    return null;
  }

  /**
   * Set or delete a cookie.
   * Uses both Max-Age and Expires for broad browser compatibility.
   *
   * @param {string} name
   * @param {string} value
   * @param {number} maxAgeSeconds Use 0 to delete.
   */
  function setCookie(name, value, maxAgeSeconds) {
    const d = new Date();
    d.setTime(d.getTime() + maxAgeSeconds * 1000);

    const expires = maxAgeSeconds > 0 ? `; Expires=${d.toUTCString()}` : '; Expires=Thu, 01 Jan 1970 00:00:00 GMT';
    const maxAge = `; Max-Age=${maxAgeSeconds}`;

    // Path=/ ensures PHP can read it site-wide.
    // SameSite=Lax is a safe default for WP.
    document.cookie = `${name}=${encodeURIComponent(value)}${expires}${maxAge}; Path=/; SameSite=Lax`;
  }

  /**
   * Sync debug cookie for PHP <-> JS coordination.
   *
   * Policy:
   * - If config.debug === true => set cookie to "1" or create for 30 days
   * - If config.debug === false => set cookie to "0" for next 30 days
   * - Otherwise => do nothing, print error
   *
   * Important:
   * - PHP decides whether to enqueue atlas-debug.js at request time.
   * - So this cookie mainly affects the NEXT page load.
   *
   * @param {object|null} config Atlas config object.
   */
  function syncDebugCookie(config) {
    if (!config || typeof config.debug === 'undefined') {
      console.error(`${LOG_PREFIX} syncDebugCookie: Missing or invalid debug config.`, { config });
      return;
    }

    const maxAge = DEBUG_COOKIE_DAYS * 24 * 60 * 60; // 30 days

    if (config.debug === true) {
      // Enable debug for 30 days
      setCookie(DEBUG_COOKIE_NAME, '1', maxAge);
      return;
    }

    if (config.debug === false) {
      // Explicitly disable debug (value "0") for 30 days
      setCookie(DEBUG_COOKIE_NAME, '0', maxAge);
      return;
    }

    // Any other value is considered invalid
    console.error(`${LOG_PREFIX} syncDebugCookie: Unsupported debug value. Expected true/false.`, { value: config.debug });
  }

  /**
   * Returns the Atlas Core factory (or null if not present).
   * We keep this check here (Boot) so Core/API can stay clean.
   */
  function getCoreFactory() {
    const core = window?.TDW?.Atlas?.Core;
    const create = core?.create;

    if (typeof create !== 'function') {
      console.error(`${LOG_PREFIX} Core not found (expected window.TDW.Atlas.Core.create).`);
      return null;
    }

    return create;
  }

  /**
   * Returns the adapter implementation from the Atlas API (or null if missing).
   * @returns {object|null}
   */
  function getAdapter() {
    const api = window?.TDW?.Atlas?.API;
    const getAdapterFn = api?.getAdapter;

    if (typeof getAdapterFn !== 'function') {
      console.error(`${LOG_PREFIX} API not found (expected window.TDW.Atlas.API.getAdapter).`);
      return null;
    }

    const adapter = getAdapterFn(ADAPTER_NAME);
    if (!adapter) {
      console.error(`${LOG_PREFIX} Adapter not registered: ${ADAPTER_NAME}`);
      return null;
    }

    return adapter;
  }

  /**
   * Boots a single atlas container.
   * Now async; uses adapter via API and passes config.
   * @param {HTMLElement} el The atlas container element.
   * @param {Function} createCore The core factory function.
   * @param {object|null} shared Object containing config and configUrl.
   */
  async function bootOne(el, createCore, shared) {
    const mapId = el.getAttribute('data-map-id');
    const config = shared?.config || null;
    const configUrl = shared?.configUrl || el.getAttribute(CONFIG_ATTR) || '';

    if (!mapId) {
      el.innerHTML = '<div class="tdw-atlas-error">Missing map id (data-map-id).</div>';
      return;
    }

    if (!config) {
      el.innerHTML = '<div class="tdw-atlas-error">Missing atlas config (atlas.config.json could not be loaded).</div>';
      return;
    }

    if (!config.maps || !config.maps[mapId]) {
      el.innerHTML = `<div class="tdw-atlas-error">Unknown map id: <strong>${mapId}</strong>.</div>`;
      return;
    }

    const geojsonRel = config.maps[mapId].geojson;
    if (!geojsonRel) {
      el.innerHTML = `<div class="tdw-atlas-error">Missing geojson path for map id: <strong>${mapId}</strong>.</div>`;
      return;
    }

    let geojsonUrl;
    try {
      geojsonUrl = new URL(geojsonRel, configUrl).href;
    } catch (e) {
      el.innerHTML = `<div class="tdw-atlas-error">Invalid geojson URL for map id: <strong>${mapId}</strong>.</div>`;
      return;
    }

    let geojson;
    try {
      const res = await fetch(geojsonUrl, { credentials: 'same-origin' });
      if (!res.ok) {
        el.innerHTML = `<div class="tdw-atlas-error">Failed to load GeoJSON (${res.status}).</div>`;
        return;
      }
      geojson = await res.json();
    } catch (err) {
      el.innerHTML = `<div class="tdw-atlas-error">Failed to load GeoJSON (network/parse error).</div>`;
      return;
    }

    const adapter = getAdapter();
    if (!adapter) {
      el.innerHTML = '<div class="tdw-atlas-error">Atlas adapter missing. Check console.</div>';
      return;
    }

    // Core is a factory: first create an instance, then init it.
    const coreInstance = createCore();

    if (!coreInstance || typeof coreInstance.init !== 'function') {
      console.error(`${LOG_PREFIX} Core.create() did not return a valid instance with init().`, { mapId, el, coreInstance });
      return;
    }

    coreInstance.init({ adapter, el, config, geojson });
  }

  /**
   * PRE-BOOT
   * ------------------------------------------------------------
   * Runs logic that is NOT directly tied to individual map instances,
   * but required before any map is booted.
   *
   * Responsibilities:
   * - Load shared atlas.config.json (once)
   * - Sync debug cookie (PHP <-> JS coordination)
   *
   * @returns {Promise<{config: object|null, configUrl: string}|null>} The loaded config and URL, or null if no containers.
   */
  async function preBoot() {
    const containers = document.querySelectorAll(CONTAINER_SELECTOR);
    if (!containers.length) return null;

    const first = containers[0];
    const configUrl = first.getAttribute(CONFIG_ATTR);
    console.info(`${LOG_PREFIX} preBoot: found atlas container + config URL.`, { configUrl });

    if (!configUrl) {
      console.warn(`${LOG_PREFIX} Missing ${CONFIG_ATTR} on atlas container. Debug cookie sync skipped.`, { el: first });
      return { config: null, configUrl };
    }

    const config = await loadAtlasConfig(configUrl);
    if (config) {
      syncDebugCookie(config);
    }
    return { config, configUrl };
  }

  /**
   * BOOT-ALL
   * ------------------------------------------------------------
   * Responsible only for booting individual map containers.
   *
   * @param {{config: object|null, configUrl: string}|null} shared The loaded config and URL, or null.
   * @returns {Promise<void>}
   */
  async function bootAll(shared) {
    const createCore = getCoreFactory();
    console.info(`${LOG_PREFIX} bootAll: core factory resolved.`, { hasSharedConfig: !!shared?.config, debug: shared?.config?.debug });
    if (!createCore) return;

    const containers = document.querySelectorAll(CONTAINER_SELECTOR);
    if (!containers.length) return;

    // Boot sequentially (keeps logs readable and avoids race confusion while MVP).
    for (const el of containers) {
      // eslint-disable-next-line no-await-in-loop
      await bootOne(el, createCore, shared);
    }
  }

  /**
   * START
   * ------------------------------------------------------------
   * Entry point of the Boot module.
   * Orchestrates:
   * 1) preBoot()
   * 2) bootAll()
   */
  async function start() {
    console.info(`${LOG_PREFIX} start()`);
    const shared = await preBoot();
    await bootAll(shared);
  }

  /* ============================================================
     3) AUTO-RUN
     ============================================================ */

  onReady(start);
  
})();