/* ============================================================
   Module: TDW Atlas Engine — CookieOps Helper
   ------------------------------------------------------------
   Purpose:
   - Keep debug-cookie handling centralized for Atlas modules.
   - Hide js-cookie backend details behind a tiny stable API.

   Public surface:
   - window.TDW.Atlas.CookieOps
     - getDebugFlag()
     - setDebugFlag(enabled, options?)
   - initDebugFromCookie()
   ============================================================ */


/* ============================================================
   1) MODULE INIT
   ============================================================ */

window.TDW = window.TDW || {};
window.TDW.Atlas = window.TDW.Atlas || {};
window.TDW.Atlas.CookieOps = window.TDW.Atlas.CookieOps || {};

const SCOPE = 'ATLAS COOKIE-OPS';
const existing = window.TDW.Atlas.CookieOps;

const { dlog = () => {}, dwarn = () => {},
  derror = (...args) => console.error('[TDW ATLAS FATAL]', `[${SCOPE}]`, ...args),
} = window.TDW?.Logger?.createScopedLogger?.(SCOPE) || {};

const DEFAULT_COOKIE_DAYS = 30;
const DEBUG_COOKIE_NAME = 'tdw_atlas_debug';
const ATLAS_DEBUG_SCOPES = ['ATLAS BOOT', 'ATLAS CORE', 'ATLAS ADAPTER', 'ATLAS LF-ADAPTER', 'ATLAS COOKIE-OPS'];
const BASE_COOKIE_ATTRS = {
  path: '/',
  sameSite: 'Lax',
  secure: window.location?.protocol === 'https:',
};

let _client = null;

/* ============================================================
   2) FUNCTIONS
   ============================================================ */

function getClient() {
  if (_client) return _client;

  const Cookies = window?.TDW?.vendor?.Cookies;
  if (!Cookies || typeof Cookies.withAttributes !== 'function') {
    derror('TDW shared bridge Cookies contract missing (expected window.TDW.vendor.Cookies).');
    return null;
  }

  _client = Cookies.withAttributes(BASE_COOKIE_ATTRS);
  return _client;
}

/**
 * Build cookie attributes including normalized expiry days.
 *
 * @param {{days?: number, attributes?: object}} [options={}] Attribute options.
 * @returns {object} Cookie attribute object.
 */
function buildAttributes(options = {}) {
  const attrs = Object.assign({}, options.attributes || {});
  const days = Number.isFinite(options.days) ? Number(options.days) : DEFAULT_COOKIE_DAYS;
  attrs.expires = days;
  return attrs;
}

/**
 * Read raw cookie value by name.
 *
 * @param {string} name Cookie key.
 * @returns {string|undefined} Raw cookie value.
 */
function getCookieRaw(name) {
  const key = String(name || '').trim();
  if (!key) return undefined;

  const client = getClient();
  if (!client) return undefined;

  return client.get(key);
}

/**
 * Write raw cookie value by name.
 *
 * @param {string} name Cookie key.
 * @param {string} value Cookie value.
 * @param {{days?: number, attributes?: object}} [options={}] Write options.
 * @returns {boolean} True when write succeeded.
 */
function setCookieRaw(name, value, options = {}) {
  const key = String(name || '').trim();
  if (!key) return false;

  const client = getClient();
  if (!client) return false;

  client.set(key, String(value ?? ''), buildAttributes(options));
  return true;
}

/**
 * Parse cookie value to strict boolean where possible.
 *
 * @param {string} name Cookie key.
 * @returns {boolean|null} Parsed boolean or null when absent/invalid.
 */
function getCookieBool(name) {
  const raw = getCookieRaw(name);
  if (raw == null) return null;

  const norm = String(raw).trim().toLowerCase();
  if (norm === '1' || norm === 'true') return true;
  if (norm === '0' || norm === 'false') return false;
  return null;
}

/**
 * Get debug flag from cookie storage.
 *
 * @returns {boolean|null} Debug flag or null when unset.
 */
function getDebugFlag() {
  return getCookieBool(DEBUG_COOKIE_NAME);
}

/**
 * Persist debug flag into cookie storage.
 *
 * @param {boolean} enabled Debug flag value.
 * @param {{days?: number, attributes?: object}} [options={}] Cookie options.
 * @returns {boolean} True when cookie write succeeded.
 */
function setDebugFlag(enabled, options = {}) {
  const withDefaults = Object.assign({ days: DEFAULT_COOKIE_DAYS }, options);
  return setCookieRaw(DEBUG_COOKIE_NAME, enabled ? '1' : '0', withDefaults);
}

/**
 * Apply debug flag to all Atlas logger scopes.
 *
 * @param {boolean} enabled Debug state.
 * @returns {void}
 */
function applyAtlasDebugScopes(enabled) {
  const setDebugEnabled = window?.TDW?._logger?.setDebugEnabled;
  if (typeof setDebugEnabled !== 'function') return;

  for (const scope of ATLAS_DEBUG_SCOPES) {
    setDebugEnabled(scope, Boolean(enabled));
  }
}

/**
 * Initialize debug scopes from persisted cookie value.
 *
 * @returns {boolean|null} Applied debug state or null when cookie is absent.
 */
function initDebugFromCookie() {
  const flag = getDebugFlag();
  if (flag === null) return null;
  applyAtlasDebugScopes(flag);
  return flag;
}

/* ============================================================
   3) PUBLIC API
   ============================================================ */

if (typeof existing.getDebugFlag !== 'function') existing.getDebugFlag = getDebugFlag;
if (typeof existing.setDebugFlag !== 'function') existing.setDebugFlag = setDebugFlag;
if (typeof existing.initDebugFromCookie !== 'function') existing.initDebugFromCookie = initDebugFromCookie;

/* ============================================================
   4) AUTO-RUN (check all cookies at program-start)
   ============================================================ */

const _cookieDebug = existing.initDebugFromCookie();
if (_cookieDebug !== null) dlog('Debug initialized from cookie.', { enabled: _cookieDebug });
dlog('CookieOps ready.');
