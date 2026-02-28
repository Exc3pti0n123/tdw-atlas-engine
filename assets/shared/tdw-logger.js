/**
 * TDW Shared Logger (tdw-logger.js)
 * ------------------------------------------------------------
 * Goal: keep other modules (boot/core/adapter) tiny.
 * - log/warn are shown ONLY when debug is enabled for a given "scope".
 * - error/fatal are ALWAYS shown.
 * - fatal also renders a visible error UI into the provided container element.
 *
 * Scopes
 * - Use short strings like: "atlas", "site-core", "media", ...
 * - Debug can be enabled per scope: setDebugEnabled('atlas', true)
 */

/* ============================================================
   1) MODULE INIT
   ============================================================ */

// Ensure a stable global root.
window.TDW = window.TDW || {};

// Idempotent global logger object (may already exist if loaded twice).
const existing = window.TDW._logger || {};

// Internal state is stored on the global object so it survives double-load.
// _scopes: { [scope: string]: boolean }
existing._scopes = existing._scopes || Object.create(null);

const PREFIX = '[TDW]';
const SCOPE = 'TDW LOGGER';

/* ============================================================
   2) FUNCTIONS
   ============================================================ */

/**
 * Normalize any value to a readable message.
 * @param {unknown} message
 * @returns {string}
 */
function normalizeMessage(message) {
  if (typeof message === 'string' && message.trim()) return message.trim();
  if (message == null) return 'Unknown error.';
  try {
    return String(message);
  } catch {
    return 'Unknown error.';
  }
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isElementLike(value) {
  if (!value) return false;
  if (typeof HTMLElement !== 'undefined' && value instanceof HTMLElement) return true;
  return typeof value === 'object' && value !== null && Number.isFinite(Number(value?.nodeType));
}

/**
 * Enable/disable debug logging for a given scope.
 * @param {string} scope
 * @param {boolean} enabled
 */
function setDebugEnabled(scope, enabled) {
  const key = String(scope || 'global');
  existing._scopes[key] = Boolean(enabled);
}

/**
 * Check whether debug logging is enabled for a given scope.
 * @param {string} scope
 * @returns {boolean}
 */
function isDebugEnabled(scope) {
  const key = String(scope || 'global');
  return Boolean(existing._scopes[key]);
}

/**
 * Debug log (only when enabled for the scope).
 * @param {string} scope
 * @param  {...any} args
 */
function log(scope, ...args) {
  if (!isDebugEnabled(scope)) return;
  // eslint-disable-next-line no-console
  console.log(PREFIX, `[${scope}]`, ...args);
}

/**
 * Debug warn (only when enabled for the scope).
 * @param {string} scope
 * @param  {...any} args
 */
function warn(scope, ...args) {
  if (!isDebugEnabled(scope)) return;
  // eslint-disable-next-line no-console
  console.warn(PREFIX, `[${scope}]`, ...args);
}

/**
 * Always-visible error.
 * If a container element is provided, also renders fatal UI.
 *
 * @param {string} scope
 * @param {HTMLElement|null|undefined} el
 * @param {unknown} message
 * @param  {...any} meta
 */
function error(scope, el, message, ...meta) {
  const text = normalizeMessage(message);

  // Always log to console
  // eslint-disable-next-line no-console
  console.error(PREFIX, `[${scope}]`, text, ...meta);

  // If a valid container is provided → render visible error UI
  if (!el || !(el instanceof HTMLElement)) return;
  // Mark container as failed state (CSS hook)
  el.classList.add('tdw-atlas-failed');

  // Clear container
  while (el.firstChild) el.removeChild(el.firstChild);

  const box = document.createElement('div');
  box.className = 'tdw-error';
  box.setAttribute('role', 'alert');
  box.setAttribute('data-tdw-error-scope', String(scope || 'global'));

  const strong = document.createElement('strong');
  strong.textContent = 'TDW Error:';

  const msg = document.createElement('span');
  msg.textContent = ` ${text}`;

  box.appendChild(strong);
  box.appendChild(msg);
  el.appendChild(box);
}

/**
 * Create scoped logger shorthand.
 *
 * Supports:
 * - derror(el, message, ...meta)
 * - derror(message, ...meta)
 *
 * @param {string} scope
 * @returns {{dlog: Function, dwarn: Function, derror: Function}}
 */
function createScopedLogger(scope) {
  const safeScope = String(scope || 'global');
  const dlog = (...args) => log(safeScope, ...args);
  const dwarn = (...args) => warn(safeScope, ...args);
  const derror = (...args) => {
    if (args.length >= 2 && (args[0] === null || isElementLike(args[0]))) {
      const [el, message, ...meta] = args;
      error(safeScope, el || null, message, ...meta);
      return;
    }
    const [message, ...meta] = args;
    error(safeScope, null, message, ...meta);
  };
  return { dlog, dwarn, derror };
}

/* ============================================================
   3) PUBLIC API
   ============================================================ */

// Publish/merge onto the stable global object (do not overwrite if already present).
window.TDW._logger = existing;
window.TDW.Logger = window.TDW.Logger || {};

if (typeof existing.setDebugEnabled !== 'function') existing.setDebugEnabled = setDebugEnabled;
if (typeof existing.isDebugEnabled !== 'function') existing.isDebugEnabled = isDebugEnabled;
if (typeof existing.log !== 'function') existing.log = log;
if (typeof existing.warn !== 'function') existing.warn = warn;
if (typeof existing.error !== 'function') existing.error = error;
if (typeof existing.createScopedLogger !== 'function') existing.createScopedLogger = createScopedLogger;
if (typeof window.TDW.Logger.createScopedLogger !== 'function') {
  window.TDW.Logger.createScopedLogger = createScopedLogger;
}

const { dlog = () => {}, dwarn = () => {},
  derror = (...args) => console.error('[TDW ATLAS FATAL]', `[${SCOPE}]`, ...args),
} = window.TDW?.Logger?.createScopedLogger?.(SCOPE) || {};

/* ============================================================
   4) AUTO-RUN
   ============================================================ */

// Keep scoped shorthand active in this module without side effects.
void dlog;
void dwarn;
void derror;
