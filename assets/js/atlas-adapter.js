/* ============================================================
   Module: TDW Atlas Engine — Adapter Factory
   ------------------------------------------------------------
   Purpose:
   - Resolve configured adapter keys to adapter modules.
   - Create a fresh adapter instance per container.

   Public surface:
   - window.TDW.Atlas.Adapter.create({ adapterKey, mapId, el })
   ============================================================ */


/* ============================================================
   1) MODULE INIT
   ============================================================ */

window.TDW = window.TDW || {};
window.TDW.Atlas = window.TDW.Atlas || {};
window.TDW.Atlas.Adapter = window.TDW.Atlas.Adapter || {};

const SCOPE = 'ATLAS ADAPTER';
const existing = window.TDW.Atlas.Adapter;

const { dlog, dwarn, derror } = window?.TDW?.Logger?.createScopedLogger?.(SCOPE) || {
  dlog: () => {},
  dwarn: () => {},
  derror: (...args) => console.error('[TDW ATLAS FATAL]', `[${SCOPE}]`, ...args),
};

const REQUIRED_ADAPTER_METHODS = ['init', 'onResize', 'destroy'];
const ADAPTER_MODULES = {
  leaflet: '../adapter/leaflet/atlas-leaflet.js',
};

/* ============================================================
   2) FUNCTIONS
   ============================================================ */

/**
 * @param {string} adapterKey
 * @returns {string}
 */
function normalizeAdapterKey(adapterKey) {
  return String(adapterKey || '').trim().toLowerCase();
}

/**
 * @param {object} adapter
 * @returns {boolean}
 */
function hasAdapterContract(adapter) {
  return REQUIRED_ADAPTER_METHODS.every((name) => typeof adapter?.[name] === 'function');
}

/**
 * @param {string} adapterKey
 * @returns {Promise<object>}
 */
async function loadAdapterModule(adapterKey) {
  const modulePath = ADAPTER_MODULES[adapterKey] || '';

  if (!modulePath) {
    // ATTENTION: intentional hard-stop for diagnosability; runtime could continue with implicit default adapter.
    throw new Error(`Unknown adapter key: ${adapterKey}`);
  }

  try {
    return await import(modulePath);
  } catch (err) {
    throw new Error(`Failed to import adapter module for key "${adapterKey}": ${String(err?.message || err)}`);
  }
}

/**
 * Create a fresh adapter instance for one map container.
 *
 * @param {{adapterKey: string, mapId?: string, el?: HTMLElement|null}} params
 * @returns {Promise<object>}
 */
async function create({ adapterKey, mapId = '', el = null } = {}) {
  const key = normalizeAdapterKey(adapterKey);
  if (!key) {
    // ATTENTION: intentional hard-stop for diagnosability; runtime could continue with implicit default adapter.
    throw new Error(`Adapter key missing for map "${mapId || 'unknown'}".`);
  }

  const moduleNs = await loadAdapterModule(key);
  const createAdapter = moduleNs?.createAdapter;

  if (typeof createAdapter !== 'function') {
    // ATTENTION: intentional hard-stop for diagnosability; runtime could continue with module-side singletons.
    throw new Error(`Adapter module "${key}" does not export createAdapter().`);
  }

  const instance = createAdapter({ adapterKey: key, mapId, el });
  if (!instance || typeof instance !== 'object') {
    // ATTENTION: intentional hard-stop for diagnosability; runtime could continue with weak adapter assumptions.
    throw new Error(`Adapter factory "${key}" returned invalid instance.`);
  }

  if (!hasAdapterContract(instance)) {
    // ATTENTION: intentional hard-stop for diagnosability; runtime could continue with partial adapter methods.
    throw new Error(`Adapter "${key}" does not implement required contract (${REQUIRED_ADAPTER_METHODS.join(', ')}).`);
  }

  dlog('Adapter instance created.', { adapter: key, mapId });
  return instance;
}

/* ============================================================
   3) PUBLIC API
   ============================================================ */

if (typeof existing.create !== 'function') {
  existing.create = create;
  dlog('Adapter factory registered.');
} else {
  // Existing function is kept to avoid replacing a live factory during duplicate loads.
  dwarn('Adapter factory already registered; keeping existing function (dual-load suspected).');
}

/* ============================================================
   4) AUTO-RUN
   ============================================================ */

// No autorun logic by design.
