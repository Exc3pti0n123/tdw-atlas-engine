/* ============================================================
   Module: TDW Atlas Engine — Boot Loader
   ------------------------------------------------------------
   Purpose:
   - Orchestrate per-page startup for shortcode containers.

   Responsibilities:
   - Wait for DOM ready.
   - Discover Atlas containers.
   - Load runtime config once via data-config-url.
   - Build renderer-agnostic runtime bundle via preprocessor.
   - Build adapter instance via Adapter Factory.
   - Create Core instance and run core.init({ adapter, el, mapData, mapMeta, adapterConfig }).

   Non-responsibilities:
   - No adapter registration.
   - No renderer implementation.
   ============================================================ */

import { preparePreprocessedBundle } from './runtime/atlas-preprocessor.js';

/* ============================================================
   1) MODULE INIT
   ============================================================ */

const CONTAINER_SELECTOR = '.tdw-atlas[data-tdw-atlas="1"]';
const CONFIG_ATTR = 'data-config-url';
const runtimeBundleCache = new Map();

const SCOPE = 'ATLAS BOOT';

const { dlog = () => {}, dwarn = () => {},
  derror = (...args) => console.error('[TDW ATLAS FATAL]', `[${SCOPE}]`, ...args),
} = window.TDW?.Logger?.createScopedLogger?.(SCOPE) || {};
const _logger = window?.TDW?._logger || {};
const _setDebug = typeof _logger.setDebugEnabled === 'function' ? _logger.setDebugEnabled : () => {};
const _isDebug = typeof _logger.isDebugEnabled === 'function' ? _logger.isDebugEnabled : () => false;
const cookieOps = window?.TDW?.Atlas?.CookieOps || null;

/**
 * Apply Atlas debug state to all runtime scopes.
 *
 * @param {boolean} enabled Debug enabled flag.
 * @returns {void}
 */
function setAtlasDebug(enabled) {
  const value = Boolean(enabled);
  _setDebug('ATLAS BOOT', value);
  _setDebug('ATLAS CORE', value);
  _setDebug('ATLAS ADAPTER', value);
  _setDebug('ATLAS LF-ADAPTER', value);
  _setDebug('ATLAS PREPROCESSOR', value);
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
 * @param {unknown} value
 * @returns {unknown}
 */
function normalizeForStableStringify(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeForStableStringify(entry));
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    const out = {};
    for (const key of keys) {
      out[key] = normalizeForStableStringify(value[key]);
    }
    return out;
  }
  return value;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function stableStringify(value) {
  try {
    return JSON.stringify(normalizeForStableStringify(value));
  } catch (_) {
    return String(value);
  }
}

/**
 * @param {{
 *   mapId: string,
 *   configBaseUrl: string,
 *   mapConfig: object
 * }} params
 * @returns {string}
 */
function buildRuntimeBundleCacheKey({ mapId, configBaseUrl, mapConfig }) {
  const signature = {
    mapId: String(mapId || '').trim(),
    baseUrl: String(configBaseUrl || '').trim(),
    geojson: mapConfig?.geojson || '',
    datasetKey: mapConfig?.datasetKey || '',
    grouping: mapConfig?.grouping || null,
    whitelist: mapConfig?.whitelist || null,
    preprocess: mapConfig?.preprocess || null,
    regionLayer: mapConfig?.regionLayer || null,
  };
  return stableStringify(signature);
}

/**
 * @template T
 * @param {string} cacheKey
 * @param {() => Promise<T>} factory
 * @returns {Promise<T>}
 */
async function getOrCreateCachedRuntimeBundle(cacheKey, factory) {
  if (runtimeBundleCache.has(cacheKey)) {
    return runtimeBundleCache.get(cacheKey);
  }

  const promise = (async () => factory())();
  runtimeBundleCache.set(cacheKey, promise);

  try {
    return await promise;
  } catch (err) {
    runtimeBundleCache.delete(cacheKey);
    throw err;
  }
}

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
 * @param {NodeListOf<HTMLElement>} containers
 * @returns {string[]}
 */
function collectRequestedMapIds(containers) {
  const ids = new Set();
  for (const el of containers) {
    const mapId = String(el?.getAttribute?.('data-map-id') || '').trim();
    if (!mapId) continue;
    ids.add(mapId);
  }
  return Array.from(ids);
}

/**
 * @param {string} url
 * @param {string[]} mapIds
 * @returns {Promise<object|null>}
 */
async function loadRuntimeConfig(url, mapIds = []) {
  if (!url) return null;

  const requestUrl = (() => {
    try {
      const u = new URL(url, window.location.origin);
      if (Array.isArray(mapIds) && mapIds.length) {
        u.searchParams.set('map_ids', mapIds.join(','));
      }
      return u.href;
    } catch (_) {
      return url;
    }
  })();

  try {
    const res = await fetch(requestUrl, { credentials: 'same-origin' });
    if (!res.ok) {
      derror(null, `Failed to load runtime config (${res.status} ${res.statusText}).`, { url: requestUrl });
      return null;
    }

    const json = await res.json();
    dlog('Loaded runtime config.', { url: requestUrl, requestedMaps: mapIds.length });
    return json;
  } catch (err) {
    derror(null, 'Failed to load runtime config (network/parse error).', { url: requestUrl, err });
    return null;
  }
}

/**
 * @param {string} relPath
 * @param {string} configBaseUrl
 * @param {string} configUrl
 * @returns {string|null}
 */
function resolveMapAssetUrl(relPath, configBaseUrl, configUrl) {
  if (!relPath) return null;
  try {
    const base = typeof configBaseUrl === 'string' && configBaseUrl ? configBaseUrl : configUrl;
    return new URL(relPath, base).href;
  } catch (_) {
    return null;
  }
}

/**
 * @param {string} label
 * @param {string} url
 * @param {HTMLElement|null} el
 * @returns {Promise<object|null>}
 */
async function loadJsonResource(label, url, el) {
  try {
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) {
      derror(el, `Failed to load ${label} (${res.status} ${res.statusText}).`, { url });
      return null;
    }

    const json = await res.json();
    if (!json || typeof json !== 'object') {
      derror(el, `Invalid ${label} payload (expected JSON object).`, { url });
      return null;
    }

    return json;
  } catch (err) {
    derror(el, `Failed to load ${label} (network/parse error).`, { url, err });
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

  const datasetKey = String(mapConfig.datasetKey || '').trim();
  if (!datasetKey) {
    // ATTENTION: intentional hard-stop for diagnosability; runtime could continue with implicit dataset key fallback.
    derror(el, `Missing datasetKey for map id: ${mapId}.`);
    return;
  }

  const configBaseUrl = config?.meta?.baseUrl || '';
  const geojsonUrl = resolveMapAssetUrl(geojsonRel, configBaseUrl, configUrl);
  if (!geojsonUrl) {
    derror(el, `Invalid geojson URL for map id: ${mapId}.`);
    return;
  }

  const mapMeta = {
    grouping: mapConfig?.grouping || null,
    whitelist: mapConfig?.whitelist || null,
    preprocess: mapConfig?.preprocess || null,
    regionLayer: mapConfig?.regionLayer || null,
  };

  const viewKey = String(mapConfig.view || '').trim();
  const adapterConfig = {
    mapId,
    adapter: adapterKey,
    vendor: config?.vendor || {},
    map: mapConfig,
    viewKey,
    view: viewKey ? (config?.views?.[viewKey] || null) : null,
    mapOptions: mapConfig?.mapOptions || null,
    style: mapConfig?.style || null,
  };

  if (!adapterConfig.view && viewKey) {
    dwarn('Configured view key not found in runtime config.', { mapId, viewKey });
  }

  const runtimeCacheKey = buildRuntimeBundleCacheKey({
    mapId,
    configBaseUrl,
    mapConfig,
  });
  let runtimeBundle;
  try {
    runtimeBundle = await getOrCreateCachedRuntimeBundle(runtimeCacheKey, async () => {
      const sourceMapData = await loadJsonResource('GeoJSON', geojsonUrl, el);
      if (!sourceMapData) {
        // ATTENTION: intentional hard-stop for diagnosability; runtime could continue by skipping this map instance.
        throw new Error('GeoJSON load failed before runtime preprocessor.');
      }
      return preparePreprocessedBundle({
        mapData: sourceMapData,
        mapMeta,
        mapConfig,
      });
    });
  } catch (err) {
    const reason = String(err?.message || err || 'Unknown preprocessor error');
    derror(el, `Runtime preprocessor failed for map id: ${mapId}. Cause: ${reason}`, { mapId, err });
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
  coreInstance.init({ adapter, el, mapData: runtimeBundle, mapMeta, adapterConfig });
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

  const requestedMapIds = collectRequestedMapIds(containers);
  const config = await loadRuntimeConfig(configUrl, requestedMapIds);

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
