/* ============================================================
   Module: TDW Atlas Engine — Core
   ------------------------------------------------------------
   Purpose
   - Provide a per-container Core instance as a factory (no singleton)
   - Keep state + navigation logic independent from any render engine
  
   Responsibilities
   - Export ONE public factory: `window.TDW.Atlas.Core.create`
   - Create isolated Core instances (one per shortcode container)
   - Call the selected Adapter via a minimal contract (no vendor specifics)
  
   Non-responsibilities
   - Does NOT scan the DOM
   - Does NOT fetch config or GeoJSON
   - Does NOT register adapters
  
   Public surface
   - `window.TDW.Atlas.Core.create()` → Core instance
  
   Core → Adapter contract (minimum)
   - init({ el, config, geojson, core })
   - showWorld()
   - showRegion(regionId)
   - onResize(activeRegionId)
   - destroy() (optional but recommended)
  
   Contracts
   - Contract 5 (Global Namespace)
   - Contract 7 (Core Factory)
   - Contract 8 (Core Instance API)
   - Contract 9 (Adapter Contract)
   ============================================================ */

// ============================================================
// 1) MODULE INIT: Namespace (idempotent)
// ============================================================

window.TDW = window.TDW || {};
window.TDW.Atlas = window.TDW.Atlas || {};
window.TDW.Atlas.Core = window.TDW.Atlas.Core || {};

const SCOPE = 'ATLAS CORE'; //activated hard in boot

const {
  log: _log = () => {},
  warn: _warn = () => {},
  error: _error = (scope, el, message, ...meta) => console.error('[TDW ATLAS FATAL]', scope, message, ...meta),
} = window?.TDW?._logger || {};

const dlog = (...args) => _log(SCOPE, ...args);
const dwarn = (...args) => _warn(SCOPE, ...args);
const derror = (el, message, ...meta) => _error(SCOPE, el || null, message, ...meta);


// ============================================================
// 2) FUNCTIONS
// ============================================================

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
      derror(null, 'Core.init: No adapter provided');
      return;
    }
    if (!element) {
      derror(null, 'Core.init: No container element provided');
      return;
    }

    adapter = a;
    el = element;

    // Allow adapters to read state and call core methods.
    // NOTE: Core does not fetch GeoJSON. Boot may provide it, and we just pass it through.
    if (typeof adapter?.init !== 'function') {
      derror(el, 'Core.init: Adapter missing required init({ el, config, geojson, core })');
      return;
    }

    adapter.init({
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
// 3) PUBLIC API (window.TDW.Atlas.Core.create)
// ============================================================

// Register the factory.
// If something already registered a factory, keep the existing one.
if (typeof window.TDW.Atlas.Core.create !== 'function') {
  window.TDW.Atlas.Core.create = createCore;
  dlog('Core factory registered.');
} else {
  // Dual-load scenario: keep the first factory to avoid breaking live instances.
  dwarn('Core factory already exists; keeping existing factory (dual-load suspected).');
}