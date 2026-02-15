/**
 * TDW Atlas Engine — API (Adapter Registry)
 * ------------------------------------------------------------
 * MODULE ROLE
 * - Provides a stable namespace + adapter registry
 * - Lets adapters self-register (e.g. Leaflet) and Core fetch them by name
 *
 * LOAD BEHAVIOR
 * - Runs immediately when the browser evaluates the script tag.
 * - Must NOT scan the DOM, fetch config, or boot anything.
 *
 * CONSUMERS
 * - Adapters call: window.TDW.Atlas.API.registerAdapter('leaflet', adapter)
 * - Core/Boot call: window.TDW.Atlas.API.getAdapter('leaflet')
 */

(function (window) {
  'use strict';

  // ============================================================
  // MODULE INIT: Namespace (idempotent)
  // ============================================================

  if (!window) return;

  // Create namespaces without overwriting existing objects.
  window.TDW = window.TDW || {};
  window.TDW.Atlas = window.TDW.Atlas || {};
  window.TDW.Atlas.API = window.TDW.Atlas.API || {};

  // Optional debug helper (only if tdw-site-core debug is loaded)
  window.TDWAtlasDebug?.checkAtlasNamespace?.();

  // Internal registry (kept private; exposed through functions below)
  const _adapters = new Map();

  // ============================================================
  // FUNCTIONS
  // ============================================================

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
      console.error('[TDW ATLAS] API.registerAdapter: missing adapter name');
      return false;
    }
    if (!adapter || typeof adapter.init !== 'function') {
      console.error('[TDW ATLAS] API.registerAdapter: adapter must implement init({ el, config, core })', {
        name: key,
        adapter
      });
      return false;
    }

    // Last write wins (useful during development/hot reloads).
    _adapters.set(key, adapter);

    // Optional debug
    if (window.console && typeof console.debug === 'function') {
      console.debug('[TDW ATLAS] Adapter registered:', { name: key });
    }

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
    return _adapters.get(key) || null;
  }

  /**
   * List registered adapter names (debug utility).
   *
   * @returns {string[]} Adapter names
   */
  function listAdapters() {
    return Array.from(_adapters.keys());
  }

  /**
   * Debug helper: check if Core factory exists (does NOT throw).
   *
   * @returns {boolean}
   */
  function hasCoreFactory() {
    return typeof window.TDW?.Atlas?.Core?.create === 'function';
  }

  // ============================================================
  // PUBLIC API (export)
  // ============================================================

  // Never overwrite if a previous version already exists (idempotent)
  // but DO patch missing functions (safe upgrades).
  const api = window.TDW.Atlas.API;

  if (typeof api.registerAdapter !== 'function') api.registerAdapter = registerAdapter;
  if (typeof api.getAdapter !== 'function') api.getAdapter = getAdapter;
  if (typeof api.listAdapters !== 'function') api.listAdapters = listAdapters;
  if (typeof api.hasCoreFactory !== 'function') api.hasCoreFactory = hasCoreFactory;

  // ============================================================
  // AUTO-RUN
  // ============================================================

  // No boot logic here by design.

})(window);