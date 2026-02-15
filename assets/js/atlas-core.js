/**
 * TDW Atlas Engine — Core
 * ------------------------------------------------------------
 * MODULE ROLE
 * - Exposes a Core *factory* (not a singleton)
 * - Each Core instance holds per-map state (activeRegionId)
 * - Core is map-library-agnostic (Leaflet etc. live in adapters)
 *
 * LOAD BEHAVIOR
 * - This file runs immediately when the browser evaluates the script tag.
 * - It should ONLY register the factory on `window.TDW.Atlas.Core.create`.
 * - It must NOT auto-scan the DOM or fetch data.
 *
 * Adapter contract (minimum)
 * - init({ el, config, geojson, core })
 * - showWorld()
 * - showRegion(regionId)
 * - onResize(activeRegionId)
 * - destroy()                 (optional but recommended)
 */

(function (window) {
  'use strict';

  // ============================================================
  // MODULE INIT: Namespace (idempotent)
  // ============================================================
  // We attach exactly one export:
  //   window.TDW.Atlas.Core.create
  // This must be safe to execute multiple times.

  if (!window) return;

  // Create namespaces without overwriting existing objects.
  window.TDW = window.TDW || {};
  window.TDW.Atlas = window.TDW.Atlas || {};
  window.TDW.Atlas.Core = window.TDW.Atlas.Core || {};

  // Optional debug: verify namespace is actually there 
  window.TDWAtlasDebug?.checkAtlasNamespace?.();

  // ============================================================
  // FUNCTIONS
  // ============================================================


  // 1) FACTORY: createCore()

  /**
   * Create a new Core instance (isolated state).
   *
   * @returns {object} Core instance
   */
  function createCore() {
    // ---------- Private instance state ----------
    let adapter = null;
    let activeRegionId = null;
    let el = null; // container element reference

    // ---------- Public API (instance) ----------
    const Core = {};

    /**
     * Initialize this Core instance.
     *
     * @param {object} params
     * @param {object} params.adapter  Adapter implementation (required)
     * @param {HTMLElement} params.el  Container element (required)
     * @param {object} [params.config] Config object (optional)
     * @param {object} [params.geojson] GeoJSON FeatureCollection (optional, provided by boot)
     */
    Core.init = function init({ adapter: a, el: element, config, geojson } = {}) {
      if (!a) {
        console.error('[TDW ATLAS] Core.init: No adapter provided');
        return;
      }
      if (!element) {
        console.error('[TDW ATLAS] Core.init: No container element provided');
        return;
      }

      adapter = a;
      el = element;

      // Allow adapters to read state and call core methods.
      // NOTE: Core does not fetch GeoJSON. Boot may provide it, and we just pass it through.
      adapter.init?.({
        config: config || {},
        geojson: geojson || null,
        el,
        core: Core,
      });
    };

    /**
     * Switch back to the world view.
     */
    Core.showWorld = function showWorld() {
      activeRegionId = null;
      adapter?.showWorld?.();
    };

    /**
     * Switch to a specific region.
     *
     * @param {string} regionId
     */
    Core.showRegion = function showRegion(regionId) {
      if (!regionId) return;
      activeRegionId = String(regionId);
      adapter?.showRegion?.(activeRegionId);
    };

    /**
     * Read-only snapshot of current state.
     */
    Core.getState = function getState() {
      return { activeRegionId };
    };

    /**
     * Notify adapter that the container size changed.
     * (Boot code should call this on resize or via ResizeObserver.)
     */
    Core.onResize = function onResize() {
      adapter?.onResize?.(activeRegionId);
    };

    /**
     * Clean up adapter resources.
     * Useful when re-initializing or when WP re-renders blocks.
     */
    Core.destroy = function destroy() {
      try {
        adapter?.destroy?.();
      } finally {
        adapter = null;
        el = null;
        activeRegionId = null;
      }
    };

    /**
     * Expose the container element (debugging / adapter convenience).
     */
    Core.getEl = function getEl() {
      return el;
    };

    return Core;
  }

  // ============================================================
  // PUBLIC API (window.TDW.Atlas.Core.create)
  // ============================================================

  // Register the factory.
  // If something already registered a factory, keep the existing one.
  if (typeof window.TDW.Atlas.Core.create !== 'function') {
    window.TDW.Atlas.Core.create = createCore;
  }

  // Debug: confirm factory registration
  if (window.console && typeof console.debug === 'function') {
    console.debug('[TDW ATLAS] Core factory registered:', {
      hasCreate: typeof window.TDW?.Atlas?.Core?.create === 'function'
    });
  }

})(window);