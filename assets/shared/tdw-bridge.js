/**
 * TDW Shared Bridge
 * ------------------------------------------------------------
 * Hybrid vendor bridge for TDW modules.
 * - Eager contracts: loaded immediately (always-load)
 * - Lazy contracts: loaded only when requested (load-on-call)
 * - Conditional eager: loaded when a condition returns true
 *
 * Public global contracts:
 * - window.TDW.vendor.<LibName>
 * - window.TDW.bridge.define(name, loader, options?)
 * - window.TDW.bridge.get(name) -> Promise<lib>
 * - window.TDW.bridge.getSync(name) -> lib|null
 */

import CookiesLib from '../vendor/js-cookie/3.0.5/api.mjs';

const TDW = (window.TDW ??= {});
TDW.vendor ??= {};
TDW.bridge ??= {};

const bridge = TDW.bridge;
bridge._registry ??= new Map();
bridge._pending ??= new Map();
bridge._resolved ??= new Map();

function asError(message) {
  return message instanceof Error ? message : new Error(String(message || 'TDW bridge error'));
}

function getExistingVendor(name, validate) {
  const existing = TDW?.vendor?.[name];
  if (typeof validate === 'function') return validate(existing) ? existing : null;
  return existing ?? null;
}

function define(name, loader, options = {}) {
  const key = String(name || '').trim();
  if (!key) throw asError('TDW.bridge.define: missing name');
  if (typeof loader !== 'function') throw asError(`TDW.bridge.define(${key}): loader must be a function`);

  const entry = {
    loader,
    eager: Boolean(options.eager),
    attachToVendor: options.attachToVendor !== false,
    condition: options.condition,
    validate: options.validate,
  };

  bridge._registry.set(key, entry);

  if (entry.eager && shouldLoad(entry)) {
    // Fire-and-forget eager init; errors are visible in console.
    bridge.get(key).catch((err) => console.error('[TDW BRIDGE]', err));
  }

  return key;
}

function shouldLoad(entry) {
  if (typeof entry.condition === 'function') {
    try {
      return Boolean(entry.condition());
    } catch {
      return false;
    }
  }
  return entry.condition === undefined ? true : Boolean(entry.condition);
}

function resolveLoadedValue(name, entry, value) {
  const loaded = value && value.default ? value.default : value;
  const valid = typeof entry.validate === 'function' ? entry.validate(loaded) : true;
  if (!valid) throw asError(`TDW.bridge.get(${name}): loaded value failed validation`);

  if (entry.attachToVendor && loaded != null) {
    if (!TDW.vendor[name]) TDW.vendor[name] = loaded;
  }

  const finalValue = entry.attachToVendor ? (TDW.vendor[name] || loaded) : loaded;
  bridge._resolved.set(name, finalValue);
  return finalValue;
}

function get(name) {
  const key = String(name || '').trim();
  if (!key) return Promise.reject(asError('TDW.bridge.get: missing name'));

  if (bridge._resolved.has(key)) return Promise.resolve(bridge._resolved.get(key));
  if (bridge._pending.has(key)) return bridge._pending.get(key);

  const entry = bridge._registry.get(key);
  if (!entry) return Promise.reject(asError(`TDW.bridge.get: unknown contract "${key}"`));
  if (!shouldLoad(entry)) return Promise.reject(asError(`TDW.bridge.get(${key}): condition not met`));

  const existing = getExistingVendor(key, entry.validate);
  if (existing != null) {
    bridge._resolved.set(key, existing);
    return Promise.resolve(existing);
  }

  const run = Promise.resolve()
    .then(() => entry.loader())
    .then((loaded) => resolveLoadedValue(key, entry, loaded))
    .finally(() => bridge._pending.delete(key));

  bridge._pending.set(key, run);
  return run;
}

function getSync(name) {
  const key = String(name || '').trim();
  if (!key) return null;

  if (bridge._resolved.has(key)) return bridge._resolved.get(key);

  const entry = bridge._registry.get(key);
  const existing = entry ? getExistingVendor(key, entry.validate) : TDW?.vendor?.[key];
  if (existing != null) {
    bridge._resolved.set(key, existing);
    return existing;
  }

  return null;
}

if (typeof bridge.define !== 'function') bridge.define = define;
if (typeof bridge.get !== 'function') bridge.get = get;
if (typeof bridge.getSync !== 'function') bridge.getSync = getSync;

define(
  'Cookies',
  () => CookiesLib,
  {
    eager: true,
    attachToVendor: true,
    validate: (value) => Boolean(value) && typeof value.get === 'function' && typeof value.set === 'function',
  }
);

export default bridge;
