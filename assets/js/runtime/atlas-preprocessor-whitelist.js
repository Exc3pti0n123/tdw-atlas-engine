/* ============================================================
   Module: TDW Atlas Engine — Runtime Preprocessor Whitelist
   ------------------------------------------------------------
   Purpose:
   - Normalize whitelist runtime config.
   - Provide deterministic include/exclude decisions.

   Public surface (ESM export):
   - buildWhitelistModel(mapMeta)
   - isCountryIncluded(countryCode, whitelistModel)
   ============================================================ */

import { isPlainObject, normalizeBool, normalizeCountryCode } from '../helpers/atlas-shared.js';

/* ============================================================
   1) MODULE INIT
   ============================================================ */

const SCOPE = 'ATLAS PREPROCESSOR';
const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;

const { dlog = () => {}, dwarn = () => {},
  derror = (...args) => console.error('[TDW ATLAS FATAL]', `[${SCOPE}]`, ...args),
} = window.TDW?.Logger?.createScopedLogger?.(SCOPE) || {};

/* ============================================================
   2) FUNCTIONS
   ============================================================ */

/**
 * @param {object} mapMeta
 * @returns {{enabled: boolean, defaultIncluded: boolean, includeByCountry: Record<string, boolean>}}
 */
export function buildWhitelistModel(mapMeta) {
  const whitelist = isPlainObject(mapMeta?.whitelist) ? mapMeta.whitelist : null;
  if (!whitelist) {
    // ATTENTION: intentional hard-stop for diagnosability; runtime could continue with implicit whitelist defaults.
    throw new Error('mapMeta.whitelist is required and must be an object.');
  }

  const includeByCountryRaw = isPlainObject(whitelist.includeByCountry) ? whitelist.includeByCountry : {};
  const includeByCountry = {};

  for (const [rawCountry, rawFlag] of Object.entries(includeByCountryRaw)) {
    const country = normalizeCountryCode(rawCountry);
    if (!COUNTRY_CODE_PATTERN.test(country)) continue;
    includeByCountry[country] = normalizeBool(rawFlag, false);
  }

  const model = {
    enabled: normalizeBool(whitelist.enabled, true),
    defaultIncluded: normalizeBool(whitelist.defaultIncluded, false),
    includeByCountry,
  };

  dlog('Whitelist model built.', {
    enabled: model.enabled,
    defaultIncluded: model.defaultIncluded,
    countryOverrides: Object.keys(model.includeByCountry).length,
  });

  return model;
}

/**
 * @param {string} countryCode
 * @param {{enabled: boolean, defaultIncluded: boolean, includeByCountry: Record<string, boolean>}} whitelistModel
 * @returns {boolean}
 */
export function isCountryIncluded(countryCode, whitelistModel) {
  if (!whitelistModel.enabled) return true;
  if (Object.prototype.hasOwnProperty.call(whitelistModel.includeByCountry, countryCode)) {
    return whitelistModel.includeByCountry[countryCode] === true;
  }
  return whitelistModel.defaultIncluded === true;
}

/* ============================================================
   3) PUBLIC API
   ============================================================ */

// Exported functions are declared inline above.

/* ============================================================
   4) AUTO-RUN
   ============================================================ */

// No autorun logic by design.
