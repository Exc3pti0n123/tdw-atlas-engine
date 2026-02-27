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

const {
  log: _log = () => {},
  warn: _warn = () => {},
  error: _error = (scope, el, message, ...meta) => console.error('[TDW ATLAS FATAL]', message, ...meta),
} = window?.TDW?._logger || {};

const dlog = (...args) => _log(SCOPE, ...args);
const dwarn = (...args) => _warn(SCOPE, ...args);
const derror = (message, ...meta) => _error(SCOPE, null, message, ...meta);

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

function buildAttributes(options = {}) {
  const attrs = Object.assign({}, options.attributes || {});
  const days = Number.isFinite(options.days) ? Number(options.days) : DEFAULT_COOKIE_DAYS;
  attrs.expires = days;
  return attrs;
}

function getCookieRaw(name) {
  const key = String(name || '').trim();
  if (!key) return undefined;

  const client = getClient();
  if (!client) return undefined;

  return client.get(key);
}

function setCookieRaw(name, value, options = {}) {
  const key = String(name || '').trim();
  if (!key) return false;

  const client = getClient();
  if (!client) return false;

  client.set(key, String(value ?? ''), buildAttributes(options));
  return true;
}

function getCookieBool(name) {
  const raw = getCookieRaw(name);
  if (raw == null) return null;

  const norm = String(raw).trim().toLowerCase();
  if (norm === '1' || norm === 'true') return true;
  if (norm === '0' || norm === 'false') return false;
  return null;
}

function getDebugFlag() {
  return getCookieBool(DEBUG_COOKIE_NAME);
}

function setDebugFlag(enabled, options = {}) {
  const withDefaults = Object.assign({ days: DEFAULT_COOKIE_DAYS }, options);
  return setCookieRaw(DEBUG_COOKIE_NAME, enabled ? '1' : '0', withDefaults);
}

function applyAtlasDebugScopes(enabled) {
  const setDebugEnabled = window?.TDW?._logger?.setDebugEnabled;
  if (typeof setDebugEnabled !== 'function') return;

  for (const scope of ATLAS_DEBUG_SCOPES) {
    setDebugEnabled(scope, Boolean(enabled));
  }
}

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
