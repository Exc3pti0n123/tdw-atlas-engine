/**
 * TDW Shared Bridge (lean)
 * ------------------------------------------------------------
 * Single responsibility today:
 * - expose vendored js-cookie under window.TDW.vendor.Cookies
 * - provide minimal read access via window.TDW.bridge.get/getSync
 */

import CookiesLib from '../vendor/js-cookie/3.0.5/api.mjs';

const TDW = (window.TDW ??= {});
TDW.vendor ??= {};
TDW.bridge ??= {};

if (!TDW.vendor.Cookies) {
  TDW.vendor.Cookies = CookiesLib;
}

/**
 * @param {string} name
 * @returns {any|null}
 */
function getSync(name) {
  const key = String(name || '').trim();
  if (!key) return null;
  return TDW.vendor[key] ?? null;
}

/**
 * @param {string} name
 * @returns {Promise<any>}
 */
function get(name) {
  const value = getSync(name);
  if (value == null) {
    return Promise.reject(new Error(`TDW.bridge.get: unknown contract "${String(name || '').trim()}"`));
  }
  return Promise.resolve(value);
}

if (typeof TDW.bridge.getSync !== 'function') TDW.bridge.getSync = getSync;
if (typeof TDW.bridge.get !== 'function') TDW.bridge.get = get;

export default TDW.bridge;
