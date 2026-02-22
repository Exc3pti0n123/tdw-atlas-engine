/* ============================================================
   Module: TDW Atlas Engine — Boot Loader
   ------------------------------------------------------------
   Purpose:
   - Orchestrate per-page startup for shortcode containers.

   Responsibilities:
   - Wait for DOM ready.
   - Discover Atlas containers.
   - Load runtime config once via data-config-url.
   - Build adapter instance via Adapter Factory.
   - Create Core instance and run core.init({ adapter, el, config, geojson }).

   Non-responsibilities:
   - No adapter registration.
   - No renderer implementation.
   ============================================================ */

/* ============================================================
   1) MODULE INIT
   ============================================================ */

const CONTAINER_SELECTOR = '.tdw-atlas[data-tdw-atlas="1"]';
const CONFIG_ATTR = 'data-config-url';

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

function setAtlasDebug(enabled) {
  const value = Boolean(enabled);
  _setDebug('ATLAS BOOT', value);
  _setDebug('ATLAS CORE', value);
  _setDebug('ATLAS ADAPTER', value);
  _setDebug('ATLAS LF-ADAPTER', value);
  _setDebug('ATLAS COOKIE-OPS', value);
}

/**
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

/**
 * @param {boolean} enabled
 */
function syncDebugCookie(enabled) {
  if (!cookieOps || typeof cookieOps.setDebugFlag !== 'function') return;
  cookieOps.setDebugFlag(Boolean(enabled), { days: 30 });
}

/**
 * @returns {boolean}
 */
function getBootDebugState() {
  return Boolean(_isDebug('ATLAS BOOT'));
}

/**
 * @param {string} url
 * @returns {Promise<object|null>}
 */
async function loadRuntimeConfig(url) {
  if (!url) return null;

  try {
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) {
      derror(null, `Failed to load runtime config (${res.status} ${res.statusText}).`, { url });
      return null;
    }

    const json = await res.json();
    dlog('Loaded runtime config.', { url });
    return json;
  } catch (err) {
    derror(null, 'Failed to load runtime config (network/parse error).', { url, err });
    return null;
  }
}

/**
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
 * @returns {Function|null}
 */
function getAdapterFactory() {
  const create = window?.TDW?.Atlas?.Adapter?.create;
  if (typeof create !== 'function') {
    derror(null, 'Adapter factory not found (expected window.TDW.Atlas.Adapter.create).');
    return null;
  }
  return create;
}

/**
 * @param {HTMLElement} el
 * @param {Function} createCore
 * @param {Function} createAdapter
 * @param {{config: object|null, configUrl: string}} shared
 */
async function bootOne(el, createCore, createAdapter, shared) {
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

  const mapConfig = config?.maps?.[mapId] || null;
  if (!mapConfig) {
    derror(el, `Unknown map id: ${mapId}.`);
    return;
  }

  const adapterKey = String(mapConfig.adapter || '').trim().toLowerCase();
  if (!adapterKey) {
    // ATTENTION: intentional hard-stop for diagnosability; runtime could continue with implicit adapter fallback.
    derror(el, `Missing adapter for map id: ${mapId}.`);
    return;
  }

  const geojsonRel = mapConfig.geojson;
  if (!geojsonRel) {
    derror(el, `Missing geojson path for map id: ${mapId}.`);
    return;
  }

  let geojsonUrl;
  try {
    const configBaseUrl = config?.meta?.baseUrl;
    const geojsonBase = typeof configBaseUrl === 'string' && configBaseUrl ? configBaseUrl : configUrl;
    geojsonUrl = new URL(geojsonRel, geojsonBase).href;
  } catch (_) {
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
  } catch (_) {
    derror(el, 'Failed to load GeoJSON (network/parse error).');
    return;
  }

  let adapter;
  try {
    adapter = await createAdapter({ adapterKey, mapId, el });
  } catch (err) {
    const reason = String(err?.message || err || 'Unknown adapter error');
    derror(el, `Adapter creation failed for map id: ${mapId}. Cause: ${reason}`, { adapter: adapterKey, err });
    return;
  }

  const coreInstance = createCore();
  if (!coreInstance || typeof coreInstance.init !== 'function') {
    derror(null, 'Core.create() did not return a valid instance with init().', { mapId, coreInstance });
    derror(el, 'Core initialization failed.');
    return;
  }

  dlog('Boot: initializing core', { mapId, adapter: adapterKey });
  coreInstance.init({ adapter, el, config, geojson });
}

/**
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

  const config = await loadRuntimeConfig(configUrl);

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
 * @param {{config: object|null, configUrl: string}|null} shared
 */
async function bootAll(shared) {
  const createCore = getCoreFactory();
  const createAdapter = getAdapterFactory();
  if (!createCore || !createAdapter) return;

  const containers = document.querySelectorAll(CONTAINER_SELECTOR);
  if (!containers.length) return;

  for (const el of containers) {
    // eslint-disable-next-line no-await-in-loop
    await bootOne(el, createCore, createAdapter, shared);
  }
}

/**
 * Entry point of boot module.
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
