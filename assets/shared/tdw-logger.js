/**
 * TDW Shared Logger (tdw-logger.js)
 * ------------------------------------------------------------
 * Goal: keep other modules (boot/core/api/adapters) tiny.
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

/* ============================================================
   3) EXPORT
   ============================================================ */

// Publish/merge onto the stable global object (do not overwrite if already present).
window.TDW._logger = existing;

if (typeof existing.setDebugEnabled !== 'function') existing.setDebugEnabled = setDebugEnabled;
if (typeof existing.isDebugEnabled !== 'function') existing.isDebugEnabled = isDebugEnabled;
if (typeof existing.log !== 'function') existing.log = log;
if (typeof existing.warn !== 'function') existing.warn = warn;
if (typeof existing.error !== 'function') existing.error = error;

// Global namespace wrappers (module-agnostic)
// These allow any TDW plugin to call dlog/dwarn/derror
// without importing this file.
window.TDW.dlog = function (scope, ...args) {
  window.TDW._logger?.log?.(scope, ...args);
};

window.TDW.dwarn = function (scope, ...args) {
  window.TDW._logger?.warn?.(scope, ...args);
};

window.TDW.derror = function (scope, el, message, ...meta) {
  window.TDW._logger?.error?.(scope, el, message, ...meta);
};

window.TDW.setDebug = function (scope, enabled) {
  window.TDW._logger?.setDebugEnabled?.(scope, enabled);
};

window.TDW.isDebug = function (scope) {
  return Boolean(window.TDW._logger?.isDebugEnabled?.(scope));
};