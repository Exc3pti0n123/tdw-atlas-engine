/* ============================================================
   Module: TDW Atlas Engine — Runtime Preprocessor Orchestrator
   ------------------------------------------------------------
   Purpose:
   - Compose whitelist/grouping/transform steps into one bundle.
   - Expose one boot-facing preprocessor entrypoint.

   Public surface (ESM export):
   - preparePreprocessedBundle({ mapData, mapMeta, mapConfig })
   ============================================================ */

import { isPlainObject, normalizeBool } from '../helpers/atlas-shared.js';
import { buildWhitelistModel } from './atlas-preprocessor-whitelist.js';
import {
  buildCountryGrouping,
  applyCountryGroupingToRuntimeMap,
  toRegionLayerRuntimeMap,
} from './atlas-preprocessor-grouping.js';
import {
  normalizeDatasetKey,
  prepareRuntimeMapData,
  buildPassthroughPreprocessedBundle,
  resolveCountryCodeAliases,
} from './atlas-preprocessor-transform.js';

/* ============================================================
   1) MODULE INIT
   ============================================================ */

const SCOPE = 'ATLAS PREPROCESSOR';

const { dlog = () => {}, dwarn = () => {},
  derror = (...args) => console.error('[TDW ATLAS FATAL]', `[${SCOPE}]`, ...args),
} = window.TDW?.Logger?.createScopedLogger?.(SCOPE) || {};

/* ============================================================
   2) FUNCTIONS
   ============================================================ */

/**
 * Prepare runtime bundle in Boot before Core/Adapter startup.
 *
 * @param {{mapData: object, mapMeta: object, mapConfig: object}} params
 * @returns {{
 *   datasetKey: string,
 *   flags: {preprocessEnabled: boolean, whitelistEnabled: boolean, groupingEnabled: boolean, groupingMode: string, regionLayerEnabled: boolean},
 *   countryGrouping: object,
 *   countryRuntimeMap: object,
 *   regionRuntimeMap: object|null,
 *   countryAudit: object,
 *   regionAudit: object|null,
 *   diagnostics: object
 * }}
 */
export function preparePreprocessedBundle({ mapData, mapMeta, mapConfig } = {}) {
  try {
    if (!isPlainObject(mapData)) {
      // ATTENTION: intentional hard-stop for diagnosability; runtime could continue with weak mapData assumptions.
      throw new Error('Runtime preprocessor requires mapData object.');
    }
    if (!isPlainObject(mapMeta)) {
      // ATTENTION: intentional hard-stop for diagnosability; runtime could continue with implicit mapMeta defaults.
      throw new Error('Runtime preprocessor requires mapMeta object.');
    }
    if (!isPlainObject(mapConfig)) {
      // ATTENTION: intentional hard-stop for diagnosability; runtime could continue with weak mapConfig assumptions.
      throw new Error('Runtime preprocessor requires mapConfig object.');
    }

    const preprocess = isPlainObject(mapMeta?.preprocess) ? mapMeta.preprocess : {};
    const preprocessEnabled = normalizeBool(preprocess?.enabled, true);
    const datasetKey = normalizeDatasetKey(mapConfig?.datasetKey || mapMeta?.datasetKey || '', 'world-v1');

    if (!preprocessEnabled) {
      dlog('Runtime preprocessor running in passthrough mode (preprocess.enabled=0).');
      return buildPassthroughPreprocessedBundle(mapData, datasetKey);
    }

    const buildRegionLayer = normalizeBool(mapMeta?.regionLayer?.enabled, true);
    const countryCodeAliases = resolveCountryCodeAliases(preprocess);
    const whitelistModel = buildWhitelistModel(mapMeta);
    const countryGrouping = buildCountryGrouping({
      mapMeta,
      sourceMapData: mapData,
      whitelistModel,
      countryCodeAliases,
    });

    const countryPrepared = prepareRuntimeMapData(mapData, {
      whitelistModel,
      preprocess,
      datasetKey,
      countryCodeAliases,
    });

    const countryRuntimeMap = countryGrouping.enabled
      ? applyCountryGroupingToRuntimeMap(countryPrepared.runtimeMap, countryGrouping)
      : countryPrepared.runtimeMap;

    let regionRuntimeMap = null;
    let regionAudit = null;
    if (buildRegionLayer && countryGrouping.enabled) {
      regionRuntimeMap = toRegionLayerRuntimeMap(countryRuntimeMap);
      regionAudit = {
        ...countryPrepared.audit,
        source: 'countryRuntimeMap',
      };
    } else if (buildRegionLayer && !countryGrouping.enabled) {
      dwarn('Region layer requested but grouping is disabled/off; region layer skipped.');
    }

    const flags = {
      preprocessEnabled: true,
      whitelistEnabled: whitelistModel.enabled,
      groupingEnabled: countryGrouping.enabled,
      groupingMode: countryGrouping.mode || 'off',
      regionLayerEnabled: !!regionRuntimeMap,
    };

    return {
      datasetKey,
      flags,
      countryGrouping,
      countryRuntimeMap,
      regionRuntimeMap,
      countryAudit: countryPrepared.audit,
      regionAudit,
      diagnostics: {
        preprocessorMode: 'preprocessed',
        templateCountriesMissingInSource: Array.isArray(countryGrouping?.diagnostics?.templateCountriesMissingInSource)
          ? countryGrouping.diagnostics.templateCountriesMissingInSource
          : [],
      },
    };
  } catch (err) {
    derror('preparePreprocessedBundle failed.', { err });
    throw err;
  }
}

/* ============================================================
   3) PUBLIC API
   ============================================================ */

// Exported function is declared inline above.

/* ============================================================
   4) AUTO-RUN
   ============================================================ */

// No autorun logic by design.
