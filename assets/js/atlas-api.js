/* ============================================================
   Module: TDW Atlas Engine — API (Adapter Registry)
   ------------------------------------------------------------
   Purpose:
   - Provide the stable plugin namespace entrypoint for adapter lookup.
   - Maintain the in-memory adapter registry (name -> adapter implementation).

   Responsibilities:
   - Expose `registerAdapter(name, adapter)` for adapters to self-register.
   - Expose `getAdapter(name)` for Boot/Core to resolve adapters by name.

   Non-responsibilities:
   - No DOM scanning.
   - No config loading.
   - No boot orchestration.
   - No vendor imports.

   Public surface (Contract):
   - window.TDW.Atlas.API.registerAdapter(name, adapter)
   - window.TDW.Atlas.API.getAdapter(name)

   Notes:
   - This module is safe to evaluate multiple times (idempotent exports).
   - The adapter registry is in-memory for the current page load.
   ============================================================ */

/* ============================================================
   1) MODULE INIT: Namespace (idempotent), debug routing, internal reg
   ============================================================ */

window.TDW = window.TDW || {};
window.TDW.Atlas = window.TDW.Atlas || {};
window.TDW.Atlas.API = window.TDW.Atlas.API || {};

const SCOPE = 'ATLAS API'; //activated hard in boot

const {
  log: _log = () => {},
  warn: _warn = () => {},
  error: _error = (scope, el, message, ...meta) => console.error('[TDW ATLAS FATAL]', message, ...meta),
} = window?.TDW?._logger || {};

const dlog = (...args) => _log(SCOPE, ...args);
const dwarn = (...args) => _warn(SCOPE, ...args);
const derror = (el, message, ...meta) => _error(SCOPE, el || null, message, ...meta);


// Internal registry (kept private; exposed through functions below)
const _adapters = new Map(); // NOTE: private per-load registry (intentional)

/* ============================================================
   2) FUNCTIONS
   ============================================================ */

/**
 * Register an adapter implementation by name.
 *
 * @param {string} name - Adapter name (e.g. "leaflet")
 * @param {object} adapter - Adapter implementation object
 * @returns {boolean} true if registered, false otherwise
 */
function registerAdapter(name, adapter) {
  const key = String(name || '').trim().toLowerCase();

  if (!key) {
    derror(null, 'API.registerAdapter: missing adapter name');
    return false;
  }
  if (!adapter || typeof adapter.init !== 'function') {
    derror(null, 'API.registerAdapter: adapter must implement init({ el, config, geojson, core })', {
      name: key,
      adapter,
    });
    return false;
  }
  if (_adapters.has(key)) {
    // Overwrites are allowed during development/hot reload, but should be visible.
    dwarn('API.registerAdapter: overwriting existing adapter', { name: key });
  }
  // Last write wins (useful during development/hot reloads).
  _adapters.set(key, adapter);

  // Debug 
  dlog('Adapter registered', { name: key });

  return true;
}

/**
 * Get a previously registered adapter by name.
 *
 * @param {string} name - Adapter name (e.g. "leaflet")
 * @returns {object|null} Adapter implementation or null
 */
function getAdapter(name) {
  const key = String(name || '').trim().toLowerCase();
  if (!key) return null;

  // If this file is evaluated twice, a fresh registry starts empty.
  // In that case we want a loud error because Core cannot proceed.
  if (_adapters.size === 0) {
    derror(null, 'API.getAdapter: adapter registry is empty. Likely double-load/order issue (API evaluated after adapter registration).', {
      requested: key,
    });
    return null;
  }

  const adapter = _adapters.get(key) || null;
  if (!adapter) {
    derror(null, 'API.getAdapter: adapter not found', {
      name: key,
      available: Array.from(_adapters.keys()),
    });
    return null;
  }

  return adapter;
}

/* ============================================================
   3) PUBLIC API (export)
   ============================================================ */

// Never overwrite if a previous version already exists (idempotent)
// but DO patch missing functions (safe upgrades).
const api = window.TDW.Atlas.API;

if (typeof api.registerAdapter !== 'function') api.registerAdapter = registerAdapter;
if (typeof api.getAdapter !== 'function') api.getAdapter = getAdapter;

/* ============================================================
   4) AUTO-RUN 
   ============================================================ */

// No boot logic here by design.