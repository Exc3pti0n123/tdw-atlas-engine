/* ============================================================
   Module: TDW Atlas Engine — Shared Helpers
   ------------------------------------------------------------
   Purpose:
   - Provide small shared cross-module helpers for Atlas runtime.
   ============================================================ */


/* ============================================================
   1) MODULE INIT
   ============================================================ */

const SCOPE = 'ATLAS SHARED';

const { dlog, dwarn, derror } = window?.TDW?.Logger?.createScopedLogger?.(SCOPE) || {
  dlog: () => {},
  dwarn: () => {},
  derror: (...args) => console.error('[TDW ATLAS FATAL]', `[${SCOPE}]`, ...args),
};

/* ============================================================
   2) FUNCTIONS
   ============================================================ */

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @param {boolean} fallback
 * @returns {boolean}
 */
export function normalizeBool(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  const raw = String(value || '').trim().toLowerCase();
  if (raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on') return true;
  if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'off') return false;
  return Boolean(fallback);
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeCountryCode(value) {
  return String(value || '').trim().toUpperCase();
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeGroupId(value) {
  return String(value || '').trim().toLowerCase();
}

/* ============================================================
   3) PUBLIC API
   ============================================================ */

// Exported helper surface is defined inline above.

/* ============================================================
   4) AUTO-RUN
   ============================================================ */

// No autorun side effects.
