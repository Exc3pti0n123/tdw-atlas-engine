/* ============================================================
   Module: TDW Atlas Engine — Boot Loader
   ------------------------------------------------------------
   Purpose:
   - Orchestrate per-page startup for Atlas instances rendered by the shortcode.

   Responsibilities:
   - Wait for DOM ready.
   - Discover Atlas containers (`.tdw-atlas[data-tdw-atlas="1"]`).
   - Load runtime config from `data-config-url` once.
   - Enable/disable debug logging based on config.debug (Contract 4).
   - For each container: resolve map + view, load GeoJSON, create Core instance,
     and call `core.init({ adapter, el, config, geojson })`.

   Non-responsibilities:
   - Does not register adapters (Contract 6).
   - Does not implement rendering logic (adapters do; Contract 9).

   Contracts:
   - Contract 1–2 (Shortcode + Container)
   - Contract 4 (Logging & Debugging)
   - Contract 10 (Boot Orchestration)
   - Contract 3 (JS file structure convention)
   ============================================================ */

/* ============================================================
   1) MODULE INIT
   ============================================================ */

const CONTAINER_SELECTOR = '.tdw-atlas[data-tdw-atlas="1"]';
const CONFIG_ATTR = 'data-config-url';
const ADAPTER_NAME = 'leaflet'; // MVP default

const SCOPE = 'ATLAS BOOT';

const {
  log: _log = () => {},
  warn: _warn = () => {},
  error: _error = (scope, el, message, ...meta) => console.error('[TDW ATLAS FATAL]', message, ...meta),
  setDebugEnabled: _setDebug = () => {},
  isDebugEnabled: _isDebug = () => false,
} = window?.TDW?._logger || {};

const dlog = (...args) => _log(SCOPE, ...args);
const dwarn = (...args) => _warn(SCOPE, ...args);
const derror = (el, message, ...meta) => _error(SCOPE, el || null, message, ...meta);
const cookieOps = window?.TDW?.Atlas?.CookieOps || null;
const setAtlasDebug = (enabled) => {
  _setDebug("ATLAS BOOT", Boolean(enabled));
  _setDebug("ATLAS CORE", Boolean(enabled));
  _setDebug("ATLAS API", Boolean(enabled));
  _setDebug("ATLAS LF-ADAPTER", Boolean(enabled));
}


/**
 * Helper: DOM Ready
 * Ensures we only start after the page is fully parsed.
 *
 * @param {Function} callback
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

function syncDebugCookie(enabled) {
  if (!cookieOps || typeof cookieOps.setDebugFlag !== 'function') return;
  cookieOps.setDebugFlag(Boolean(enabled), { days: 30 });
}

function getBootDebugState() {
  return Boolean(_isDebug('ATLAS BOOT'));
}

/**
 * Loads runtime config from a URL.
 *
 * @param {string} url Absolute URL (from data-config-url).
 * @returns {Promise<object|null>} Parsed config object.
 */
async function loadAtlasConfig(url) {
  if (!url) return null;

  try {
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) {
      derror(null, `Failed to load config (${res.status} ${res.statusText}).`, { url });
      return null;
    }

    const json = await res.json();
    dlog('Loaded runtime config.', { url });
    return json;
  } catch (err) {
    derror(null, 'Failed to load config (network/parse error).', { url, err });
    return null;
  }
}

/**
 * Returns the Atlas Core factory (or null if not present).
 *
 * @returns {Function|null}
 */
function getCoreFactory() {
  const create = window?.TDW?.Atlas?.Core?.create;

  if (typeof create !== 'function') {
    derror(null, 'Core not found (expected window.TDW.Atlas.Core.create).');
    return null;
  }

  return create;
}

/**
 * Returns the adapter implementation from the Atlas API (or null if missing).
 *
 * @returns {object|null}
 */
function getAdapter() {
  const getAdapterFn = window?.TDW?.Atlas?.API?.getAdapter;

  if (typeof getAdapterFn !== 'function') {
    derror(null, 'API not found (expected window.TDW.Atlas.API.getAdapter).');
    return null;
  }

  const adapter = getAdapterFn(ADAPTER_NAME);
  if (!adapter) {
    derror(null, `Adapter not registered: ${ADAPTER_NAME}`);
    return null;
  }

  return adapter;
}

/**
 * Boots a single atlas container.
 *
 * @param {HTMLElement} el The atlas container element.
 * @param {Function} createCore The core factory function.
 * @param {{config: object|null, configUrl: string}} shared Shared config + config URL.
 */
async function bootOne(el, createCore, shared) {
  const mapId = el.getAttribute('data-map-id');
  const config = shared?.config || null;
  const configUrl = shared?.configUrl || el.getAttribute(CONFIG_ATTR) || '';

  if (!mapId) {
    derror(el, 'Missing map id (data-map-id).');
    return;
  }

  if (!config) {
    derror(el, 'Missing runtime config (could not be loaded).');
    return;
  }

  if (!config.maps || !config.maps[mapId]) {
    derror(el, `Unknown map id: ${mapId}.`);
    return;
  }

  const geojsonRel = config.maps[mapId].geojson;
  if (!geojsonRel) {
    derror(el, `Missing geojson path for map id: ${mapId}.`);
    return;
  }

  let geojsonUrl;
  try {
    const configBaseUrl = config?.meta?.baseUrl;
    const geojsonBase = typeof configBaseUrl === 'string' && configBaseUrl
      ? configBaseUrl
      : configUrl;
    geojsonUrl = new URL(geojsonRel, geojsonBase).href;
  } catch (e) {
    derror(el, `Invalid geojson URL for map id: ${mapId}.`);
    return;
  }

  let geojson;
  try {
    const res = await fetch(geojsonUrl, { credentials: 'same-origin' });
    if (!res.ok) {
      derror(el, `Failed to load GeoJSON (${res.status}).`);
      return;
    }
    geojson = await res.json();
  } catch (err) {
    derror(el, 'Failed to load GeoJSON (network/parse error).');
    return;
  }

  const adapter = getAdapter();
  if (!adapter) {
    derror(el, 'Atlas adapter missing. See console for details.');
    return;
  }

  const coreInstance = createCore();
  if (!coreInstance || typeof coreInstance.init !== 'function') {
    derror(null, 'Core.create() did not return a valid instance with init().', { mapId, coreInstance });
    derror(el, 'Core initialization failed.');
    return;
  }

  dlog('Boot: initializing core', { mapId, adapter: ADAPTER_NAME });
  coreInstance.init({ adapter, el, config, geojson });
}

/**
 * PRE-BOOT
 * - Load shared runtime config (once)
 * - Set debug enablement from config.debug
 *
 * @returns {Promise<{config: object|null, configUrl: string}|null>}
 */
async function preBoot() {
  const containers = document.querySelectorAll(CONTAINER_SELECTOR);
  if (!containers.length) return null;

  const first = containers[0];
  const configUrl = first.getAttribute(CONFIG_ATTR);

  if (!configUrl) {
    derror(first, `Missing ${CONFIG_ATTR} on atlas container.`, { el: first });
    return { config: null, configUrl: '' };
  }

  const config = await loadAtlasConfig(configUrl);

  // Debug enablement (Contract 4): config.debug is the single source of truth.
  if (config && typeof config.debug === 'boolean') {
    const debugWasEnabled = getBootDebugState();
    const debugWillBeEnabled = Boolean(config.debug);

    if (debugWasEnabled && !debugWillBeEnabled) {
      dlog('Logging turned off.');
    }

    setAtlasDebug(config.debug);

    if (!debugWasEnabled && debugWillBeEnabled) {
      dlog('Logging activated, reload for complete log.');
    }

    syncDebugCookie(config.debug);
  } else {
    derror(null, 'Runtime config missing valid boolean debug flag.', { configUrl, debug: config?.debug });
  }

  return { config, configUrl };
}

/**
 * BOOT-ALL
 * - Boot each map container sequentially (MVP)
 *
 * @param {{config: object|null, configUrl: string}|null} shared
 */
async function bootAll(shared) {
  const createCore = getCoreFactory();
  if (!createCore) return;

  const containers = document.querySelectorAll(CONTAINER_SELECTOR);
  if (!containers.length) return;

  for (const el of containers) {
    // eslint-disable-next-line no-await-in-loop
    await bootOne(el, createCore, shared);
  }
}

/**
 * START
 * Entry point of the Boot module.
 */
async function start() {
  dlog('start()');
  const shared = await preBoot();
  await bootAll(shared);
}

/* ============================================================
   3) PUBLIC API
   ============================================================ */

// Boot exposes no public API by design.

/* ============================================================
   4) AUTO-RUN
   ============================================================ */

onReady(start);
