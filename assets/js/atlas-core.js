/* ============================================================
   Module: TDW Atlas Engine — Core
   ------------------------------------------------------------
   Purpose
   - Provide a per-container Core instance as a factory (no singleton).
   - Keep orchestration state independent from renderer implementation.

   Responsibilities
   - Export ONE public factory: window.TDW.Atlas.Core.create
   - Validate core init payload at Core boundary.
   - Call adapter lifecycle methods for one container instance.

   Non-responsibilities
   - No DOM scanning.
   - No config/GeoJSON fetching.
   - No adapter module loading.
   ============================================================ */


/* ============================================================
   1) MODULE INIT
   ============================================================ */

window.TDW = window.TDW || {};
window.TDW.Atlas = window.TDW.Atlas || {};
window.TDW.Atlas.Core = window.TDW.Atlas.Core || {};

const SCOPE = 'ATLAS CORE';

const { dlog = () => {}, dwarn = () => {},
  derror = (...args) => console.error('[TDW ATLAS FATAL]', `[${SCOPE}]`, ...args),
} = window.TDW?.Logger?.createScopedLogger?.(SCOPE) || {};

/* ============================================================
   2) FUNCTIONS
   ============================================================ */

/**
 * Create one isolated Core instance.
 *
 * @returns {{init: Function, destroy: Function}}
 */
function createCore() {
  let adapter = null;
  let el = null;

  const Core = {};

  /**
   * Initialize one map instance.
   *
   * @param {{adapter: object, el: HTMLElement, mapData: object, mapMeta: object, adapterConfig: object}} params
   * mapData is a prepared runtime bundle (built in Boot pipeline), not raw GeoJSON.
   */
  Core.init = function init({ adapter: adapterInstance, el: element, mapData, mapMeta, adapterConfig } = {}) {
    if (!adapterInstance || typeof adapterInstance !== 'object') {
      // ATTENTION: intentional hard-stop for diagnosability; runtime could continue with implicit adapter defaults.
      derror(null, 'Core.init: no valid adapter instance provided.');
      return;
    }

    if (!(element instanceof HTMLElement)) {
      // ATTENTION: intentional hard-stop for diagnosability; runtime could continue with weak element assumptions.
      derror(null, 'Core.init: no valid container element provided.');
      return;
    }

    if (!mapData || typeof mapData !== 'object') {
      // ATTENTION: intentional hard-stop for diagnosability; runtime could continue with weak mapData assumptions.
      derror(element, 'Core.init: mapData is missing or invalid.');
      return;
    }

    if (!mapMeta || typeof mapMeta !== 'object') {
      // ATTENTION: intentional hard-stop for diagnosability; runtime could continue with weak mapMeta assumptions.
      derror(element, 'Core.init: mapMeta is missing or invalid.');
      return;
    }

    if (!adapterConfig || typeof adapterConfig !== 'object') {
      // ATTENTION: intentional hard-stop for diagnosability; runtime could continue with weak adapterConfig assumptions.
      derror(element, 'Core.init: adapterConfig is missing or invalid.');
      return;
    }

    adapter = adapterInstance;
    el = element;

    try {
      const result = adapter.init({
        mapData,
        mapMeta,
        adapterConfig,
        el,
        core: Core,
      });

      if (result && typeof result.then === 'function') {
        result.catch((err) => {
          derror(el, 'Core.init: adapter.init rejected unexpectedly.', { err });
          Core.destroy();
        });
      }
    } catch (err) {
      derror(el, 'Core.init: adapter.init threw unexpectedly.', { err });
      Core.destroy();
    }
  };

  /**
   * Destroy one map instance and release renderer resources.
   */
  Core.destroy = function destroy() {
    if (!adapter) return;

    try {
      adapter.destroy();
    } catch (err) {
      dwarn('Core.destroy: adapter.destroy threw.', { err });
    } finally {
      adapter = null;
      el = null;
    }
  };

  return Core;
}

/* ============================================================
   3) PUBLIC API
   ============================================================ */

if (typeof window.TDW.Atlas.Core.create !== 'function') {
  window.TDW.Atlas.Core.create = createCore;
  dlog('Core factory registered.');
} else {
  // Existing factory is kept to avoid replacing a live reference during duplicate loads.
  dwarn('Core factory already exists; keeping existing factory (dual-load suspected).');
}

/* ============================================================
   4) AUTO-RUN
   ============================================================ */

// No autorun logic by design.
