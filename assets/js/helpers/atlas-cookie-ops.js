/* ============================================================
   Module: TDW Atlas Engine — CookieOps Helper
   ------------------------------------------------------------
   Purpose:
   - Provide atlas-specific cookie read/write helpers on a stable namespace.
   - Hide js-cookie details from Boot/Core/Adapter modules.

   Public surface:
   - window.TDW.Atlas.CookieOps
     - getRaw(name)
     - setRaw(name, value, options?)
     - remove(name, options?)
     - getBool(name)
     - setBool(name, enabled, options?)
     - getJson(name)
     - setJson(name, value, options?)
     - getDebugFlag()
     - setDebugFlag(enabled, options?)
     - clearDebugFlag(options?)
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

function normalizeName(name) {
  return String(name || '').trim();
}

function getRaw(name) {
  const key = normalizeName(name);
  if (!key) return undefined;

  const client = getClient();
  if (!client) return undefined;

  return client.get(key);
}

function setRaw(name, value, options = {}) {
  const key = normalizeName(name);
  if (!key) return false;

  const client = getClient();
  if (!client) return false;

  client.set(key, String(value ?? ''), buildAttributes(options));
  return true;
}

function remove(name, options = {}) {
  const key = normalizeName(name);
  if (!key) return false;

  const client = getClient();
  if (!client) return false;

  client.remove(key, buildAttributes(options));
  return true;
}

function getBool(name) {
  const raw = getRaw(name);
  if (raw == null) return null;

  const norm = String(raw).trim().toLowerCase();
  if (norm === '1' || norm === 'true') return true;
  if (norm === '0' || norm === 'false') return false;
  return null;
}

function setBool(name, enabled, options = {}) {
  return setRaw(name, enabled ? '1' : '0', options);
}

function getJson(name) {
  const raw = getRaw(name);
  if (raw == null || raw === '') return null;

  try {
    return JSON.parse(raw);
  } catch (err) {
    dwarn('Invalid JSON cookie payload.', { name, err });
    return null;
  }
}

function setJson(name, value, options = {}) {
  try {
    return setRaw(name, JSON.stringify(value), options);
  } catch (err) {
    dwarn('Failed to serialize JSON cookie payload.', { name, err });
    return false;
  }
}

function getDebugFlag() {
  return getBool(DEBUG_COOKIE_NAME);
}

function setDebugFlag(enabled, options = {}) {
  const withDefaults = Object.assign({ days: DEFAULT_COOKIE_DAYS }, options);
  return setBool(DEBUG_COOKIE_NAME, Boolean(enabled), withDefaults);
}

function clearDebugFlag(options = {}) {
  const attrs = Object.assign({}, options);
  return remove(DEBUG_COOKIE_NAME, { attributes: attrs });
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

if (typeof existing.getRaw !== 'function') existing.getRaw = getRaw;
if (typeof existing.setRaw !== 'function') existing.setRaw = setRaw;
if (typeof existing.remove !== 'function') existing.remove = remove;
if (typeof existing.getBool !== 'function') existing.getBool = getBool;
if (typeof existing.setBool !== 'function') existing.setBool = setBool;
if (typeof existing.getJson !== 'function') existing.getJson = getJson;
if (typeof existing.setJson !== 'function') existing.setJson = setJson;
if (typeof existing.getDebugFlag !== 'function') existing.getDebugFlag = getDebugFlag;
if (typeof existing.setDebugFlag !== 'function') existing.setDebugFlag = setDebugFlag;
if (typeof existing.clearDebugFlag !== 'function') existing.clearDebugFlag = clearDebugFlag;
if (typeof existing.initDebugFromCookie !== 'function') existing.initDebugFromCookie = initDebugFromCookie;

/* ============================================================
   4) AUTO-RUN (check all cookies at program-start)
   ============================================================ */

const _cookieDebug = existing.initDebugFromCookie();
if (_cookieDebug !== null) dlog('Debug initialized from cookie.', { enabled: _cookieDebug });
dlog('CookieOps ready.');
