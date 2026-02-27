/* ============================================================
   Module: TDW Atlas Engine — Leaflet Adapter Factory
   ------------------------------------------------------------
   Purpose:
   - Adapt Atlas Core contract to Leaflet 2.x renderer.
   - Orchestrate Leaflet runtime state and interaction stages.
   - Consume prepared runtime bundle from Boot pipeline.

   Public surface (ESM export):
   - createAdapter() -> { init, onResize, destroy }
   ============================================================ */

import { create as createPreviewOverlay } from '../../js/ui/atlas-preview.js';
import {
  DEFAULT_FOCUS_PADDING,
  computeFocusBoundsFromLayers,
  estimateFitFill,
  fitInitialView,
  normalizeBool,
  normalizeCountryCode,
  normalizeGroupId,
  resolveFocusPaddingConfig,
  resolveRegionFocusExclusions,
  resolveViewBounds,
  summarizeBounds,
} from './atlas-leaflet-focus.js';
import {
  buildCountryLayerIndex,
  buildGroupLayerIndex,
  buildHybridRuntimeMapData,
  getLayerCountryCode,
  getLayerGroupId,
} from './atlas-leaflet-layers.js';
import {
  applyHybridStageStyle as applyHybridStageStyleHelper,
  applyWorldLayerStyle as applyWorldLayerStyleHelper,
  defaultStyle,
  resolveStyle,
} from './atlas-leaflet-style.js';
import {
  bindHybridLayerFeatureEvents,
  bindWorldLayerEvents,
} from './atlas-leaflet-events.js';
import { createTransitionController } from './atlas-leaflet-transition.js';
import { isPlainObject } from '../../js/helpers/atlas-shared.js';

/* ============================================================
   1) MODULE INIT
   ============================================================ */

window.TDW = window.TDW || {};
window.TDW.Atlas = window.TDW.Atlas || {};

const SCOPE = 'ATLAS LF-ADAPTER';
const STAGE_WORLD = 'world';
const STAGE_REGION = 'region';
const STAGE_COUNTRY = 'country';
const REGION_LAYER_SOURCE_DERIVED_COUNTRY = 'derived-country';
const REGION_LAYER_SOURCE_EXTERNAL_REGION_MAP = 'external-region-map';
const DEFAULT_PREVIEW_CONFIG = Object.freeze({
  mapId: '',
  showRegionPreview: true,
  showCountryPreview: true,
  desktopSide: 'right',
  switchToBottomMaxWHRatio: 0.85,
});

const { dlog, dwarn, derror } = window?.TDW?.Logger?.createScopedLogger?.(SCOPE) || {
  dlog: () => {},
  dwarn: () => {},
  derror: (...args) => console.error('[TDW ATLAS FATAL]', `[${SCOPE}]`, ...args),
};

let leafletModule = null;

/* ============================================================
   2) FUNCTIONS
   ============================================================ */

/**
 * @param {string} url
 * @returns {string}
 */
function toAbsoluteUrl(url) {
  if (!url) return '';
  try {
    return new URL(url).href;
  } catch (_) {
    return new URL(url, window.location.origin).href;
  }
}

/**
 * @param {string} cssUrl
 */
function ensureLeafletCss(cssUrl) {
  if (!cssUrl) return;

  const href = toAbsoluteUrl(cssUrl);
  const alreadyLoaded = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
    .some((link) => (link.getAttribute('href') || '') === href);

  if (alreadyLoaded) return;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

/**
 * @param {object} adapterConfig
 * @returns {Promise<object>}
 */
async function loadLeafletModule(adapterConfig) {
  if (leafletModule) return leafletModule;

  const jsUrl = adapterConfig?.vendor?.leafletJs;
  if (!jsUrl) {
    throw new Error('Missing adapterConfig.vendor.leafletJs (Leaflet module URL).');
  }

  ensureLeafletCss(adapterConfig?.vendor?.leafletCss || '');
  leafletModule = await import(toAbsoluteUrl(jsUrl));
  return leafletModule;
}

/**
 * @param {object} runtimeBundle
 * @returns {boolean}
 */
function hasRuntimeBundleContract(runtimeBundle) {
  if (!isPlainObject(runtimeBundle)) return false;
  if (!isPlainObject(runtimeBundle.countryRuntimeMap)) return false;

  const countryFeatures = runtimeBundle?.countryRuntimeMap?.features;
  const regionMap = runtimeBundle?.regionRuntimeMap;
  const hasCountryFeatures = Array.isArray(countryFeatures);
  const hasRegionMap = regionMap === null || isPlainObject(regionMap);
  const hasCountryGrouping = isPlainObject(runtimeBundle?.countryGrouping);
  const hasFlags = isPlainObject(runtimeBundle?.flags);

  return hasCountryFeatures && hasRegionMap && hasCountryGrouping && hasFlags;
}

/**
 * @param {object} moduleNs
 * @returns {{MapCtor: Function, GeoJSONCtor: Function}}
 */
function getStrictConstructors(moduleNs) {
  const MapCtor = moduleNs?.Map;
  const GeoJSONCtor = moduleNs?.GeoJSON;

  if (typeof MapCtor !== 'function') {
    throw new Error('Leaflet 2.x contract error: Map constructor missing.');
  }

  if (typeof GeoJSONCtor !== 'function') {
    throw new Error('Leaflet 2.x contract error: GeoJSON constructor missing.');
  }

  return { MapCtor, GeoJSONCtor };
}

/**
 * @param {object} adapterConfig
 * @returns {object}
 */
function resolveMapOptions(adapterConfig) {
  const provided = isPlainObject(adapterConfig?.mapOptions) ? adapterConfig.mapOptions : {};
  const sanitized = { ...provided };
  // Click-only interaction: zoom buttons are disabled by contract.
  delete sanitized.zoomControl;

  return {
    zoomControl: false,
    attributionControl: false,
    // Keep fit/fly zoom continuous; integer snapping leaves large unused margins.
    zoomSnap: 0,
    zoomDelta: 0.25,
    dragging: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    boxZoom: false,
    keyboard: false,
    tap: false,
    ...sanitized,
  };
}

/**
 * @param {object} adapterConfig
 * @returns {{mapId:string,showRegionPreview:boolean,showCountryPreview:boolean,desktopSide:'left'|'right',switchToBottomMaxWHRatio:number}}
 */
function resolvePreviewConfig(adapterConfig) {
  const preview = isPlainObject(adapterConfig?.map?.ui?.preview) ? adapterConfig.map.ui.preview : {};
  const mapIdValue = String(adapterConfig?.mapId || adapterConfig?.map?.id || '').trim();
  const sideRaw = String(preview.desktopSide || DEFAULT_PREVIEW_CONFIG.desktopSide).trim().toLowerCase();
  const desktopSide = sideRaw === 'left' ? 'left' : 'right';
  const switchRatioRaw = Number(preview.switchToBottomMaxWHRatio ?? DEFAULT_PREVIEW_CONFIG.switchToBottomMaxWHRatio);
  const switchToBottomMaxWHRatio = Number.isFinite(switchRatioRaw) && switchRatioRaw > 0
    ? switchRatioRaw
    : DEFAULT_PREVIEW_CONFIG.switchToBottomMaxWHRatio;

  return {
    mapId: mapIdValue || DEFAULT_PREVIEW_CONFIG.mapId,
    showRegionPreview: normalizeBool(preview.showRegionPreview, DEFAULT_PREVIEW_CONFIG.showRegionPreview),
    showCountryPreview: normalizeBool(preview.showCountryPreview, DEFAULT_PREVIEW_CONFIG.showCountryPreview),
    desktopSide,
    switchToBottomMaxWHRatio,
  };
}

/* ============================================================
   3) PUBLIC API
   ============================================================ */

/**
 * Create one adapter instance for one Core instance.
 *
 * @param {{adapterKey?: string, mapId?: string, el?: HTMLElement|null}} [_context]
 * @returns {{init: Function, onResize: Function, destroy: Function}}
 */
export function createAdapter(_context = {}) {
  const mapId = String(_context?.mapId || '').trim();

  // Per-instance mutable state; never shared across containers.
  let map = null;
  let regionLayer = null;
  let hybridLayer = null;
  let countryLayer = null;
  let el = null;
  let stage = STAGE_WORLD;
  let activeGroupId = '';
  let selectedCountryCode = '';
  let selectedCountryTitle = '';
  let hoveredCountryCode = '';
  let hoveredRegionGroupId = '';
  let activeGroupBounds = null;
  let worldBounds = null;
  let groupIndex = null;
  let countryIndex = null;
  let countryRuntimeMap = null;
  let regionRuntimeMap = null;
  let leafletGeoJsonCtor = null;
  let layerStyle = defaultStyle;
  let regionLayerSource = REGION_LAYER_SOURCE_DERIVED_COUNTRY;
  let regionFocusExcludeByGroup = new Map();
  let mapClickHandler = null;
  let transitionController = null;
  let focusPadding = { ...DEFAULT_FOCUS_PADDING };
  let preview = null;
  let previewConfig = { ...DEFAULT_PREVIEW_CONFIG, mapId: mapId || '' };
  let countryGrouping = null;

  /**
   * @returns {{top:number,right:number,bottom:number,left:number}}
   */
  function resolvePreviewInsets() {
    if (!preview || typeof preview.getInsets !== 'function') {
      return { top: 0, right: 0, bottom: 0, left: 0 };
    }
    const insets = preview.getInsets();
    if (!isPlainObject(insets)) {
      return { top: 0, right: 0, bottom: 0, left: 0 };
    }
    return {
      top: Math.max(0, Number(insets.top || 0)),
      right: Math.max(0, Number(insets.right || 0)),
      bottom: Math.max(0, Number(insets.bottom || 0)),
      left: Math.max(0, Number(insets.left || 0)),
    };
  }

  /**
   * @param {'world'|'region'|'country'} stage
   * @returns {{paddingTopLeft:[number,number],paddingBottomRight:[number,number]}}
   */
  function resolveStageBoundsOptions(stage) {
    const basePadding = Array.isArray(focusPadding?.[stage]) ? focusPadding[stage] : [0, 0];
    const baseX = Math.max(0, Number(basePadding[0] || 0));
    const baseY = Math.max(0, Number(basePadding[1] || 0));
    const insets = resolvePreviewInsets();

    return {
      paddingTopLeft: [baseX + insets.left, baseY + insets.top],
      paddingBottomRight: [baseX + insets.right, baseY + insets.bottom],
    };
  }

  /**
   * @param {string} groupId
   * @param {string} [titleHint]
   * @returns {boolean}
   */
  function openRegionPreview(groupId, titleHint = '') {
    if (!preview || !previewConfig.showRegionPreview) {
      if (preview) preview.close({ reason: 'region-preview-disabled', notify: false });
      return false;
    }

    const key = String(groupId || '').trim();
    if (!key) return false;

    preview.open({
      scope: 'region',
      key,
      titleHint: String(titleHint || countryGrouping?.groupLabels?.[key] || key),
    }).catch((err) => {
      dwarn('Region preview open failed.', { key, err });
    });

    if (typeof preview.reposition === 'function') {
      preview.reposition();
    }
    return true;
  }

  /**
   * @param {string} countryCode
   * @param {string} [titleHint]
   * @returns {boolean}
   */
  function openCountryPreview(countryCode, titleHint = '') {
    if (!preview || !previewConfig.showCountryPreview) {
      if (preview) preview.close({ reason: 'country-preview-disabled', notify: false });
      return false;
    }

    const key = String(countryCode || '').trim().toUpperCase();
    if (!key) return false;

    preview.open({
      scope: 'country',
      key,
      titleHint: String(titleHint || key),
    }).catch((err) => {
      dwarn('Country preview open failed.', { key, err });
    });

    if (typeof preview.reposition === 'function') {
      preview.reposition();
    }
    return true;
  }

  /**
   * @param {string} reason
   */
  function closePreview(reason) {
    if (!preview) return;
    preview.close({ reason, notify: false });
  }

  /**
   * @param {string} groupId
   * @param {object|null} [fallbackLayer]
   * @returns {object|null}
   */
  function resolveGroupFocusBounds(groupId, fallbackLayer = null) {
    const normalizedGroupId = normalizeGroupId(groupId);
    const groupLayers = groupIndex?.layersByGroup?.get(normalizedGroupId) || [];
    const excludedCodes = regionFocusExcludeByGroup.get(normalizedGroupId);
    const layersForFocus = (excludedCodes && excludedCodes.size)
      ? groupLayers.filter((layer) => !excludedCodes.has(getLayerCountryCode(layer)))
      : groupLayers;

    const autoBounds = computeFocusBoundsFromLayers(layersForFocus);
    if (!autoBounds && layersForFocus !== groupLayers) {
      // ATTENTION: intentional hard-stop for diagnosability; runtime could continue with empty layer focus.
      dwarn('Region focus exclusions produced no usable bounds; falling back to full group bounds.', {
        groupId: normalizedGroupId,
        excludedCountries: Array.from(excludedCodes || []),
      });
    }
    if (!autoBounds && layersForFocus !== groupLayers) {
      const fallbackAutoBounds = computeFocusBoundsFromLayers(groupLayers);
      if (fallbackAutoBounds) return fallbackAutoBounds;
    }

    if (autoBounds) return autoBounds;
    if (fallbackLayer && typeof fallbackLayer.getBounds === 'function') {
      return fallbackLayer.getBounds();
    }
    return null;
  }

  /**
   * @param {string} countryCode
   * @param {object|null} [fallbackLayer]
   * @returns {object|null}
   */
  function resolveCountryFocusBounds(countryCode, fallbackLayer = null) {
    const code = normalizeCountryCode(countryCode);
    if (!code) return null;

    const countryLayers = countryIndex?.layersByCountry?.get(code) || [];
    const autoBounds = computeFocusBoundsFromLayers(countryLayers);
    if (autoBounds) return autoBounds;

    if (fallbackLayer && typeof fallbackLayer.getBounds === 'function') {
      return fallbackLayer.getBounds();
    }
    return null;
  }

  /**
   * @param {string} groupId
   */
  function applyWorldLayerStyle(groupId = '') {
    applyWorldLayerStyleHelper(regionLayer, groupId);
  }

  /**
   * Apply deterministic styles for hybrid stage layer.
   */
  function applyHybridStageStyle() {
    applyHybridStageStyleHelper({
      hybridLayer,
      selectedCountryCode,
      hoveredCountryCode,
      hoveredRegionGroupId,
      stage,
      countryStageValue: STAGE_COUNTRY,
      onContractError: (message, meta) => derror(el, message, meta),
    });
  }

  /**
   * @param {string} groupId
   * @returns {object}
   */
  function buildHybridLayerForGroup(groupId) {
    if (!leafletGeoJsonCtor) {
      throw new Error('Leaflet adapter: GeoJSON constructor missing while building hybrid layer.');
    }

    if (regionLayerSource !== REGION_LAYER_SOURCE_DERIVED_COUNTRY) {
      // ATTENTION: intentional hard-stop for diagnosability; runtime could continue by falling back to derived-country source.
      throw new Error(
        `Leaflet adapter: regionLayerSource "${regionLayerSource}" not implemented yet.`
      );
    }

    const hybridRuntimeMap = buildHybridRuntimeMapData({
      countryRuntimeMap,
      regionRuntimeMap,
      activeGroupId: groupId,
    });

    return new leafletGeoJsonCtor(hybridRuntimeMap, {
      style: layerStyle,
      interactive: true,
      onEachFeature: (_feature, layer) => {
        bindHybridLayerFeatureEvents({
          layer,
          map,
          moduleNs: leafletModule,
          getStage: () => stage,
          stageRegionValue: STAGE_REGION,
          stageCountryValue: STAGE_COUNTRY,
          getActiveGroupId: () => activeGroupId,
          onHoverCountry: (code) => {
            hoveredCountryCode = code;
            hoveredRegionGroupId = '';
            applyHybridStageStyle();
          },
          onHoverRegion: (groupIdForHover) => {
            hoveredCountryCode = '';
            hoveredRegionGroupId = groupIdForHover;
            applyHybridStageStyle();
          },
          onHoverLeave: () => {
            hoveredCountryCode = '';
            hoveredRegionGroupId = '';
            applyHybridStageStyle();
          },
          onRegionKindClick: ({ groupId: targetGroupId, layer: targetLayer }) => {
            const targetBounds = resolveGroupFocusBounds(targetGroupId, targetLayer);
            if (!targetGroupId || !targetBounds) {
              derror(el, 'Leaflet adapter: region-kind hybrid click missing group bounds.', {
                targetGroupId,
              });
              return;
            }
            enterRegionStage({ groupId: targetGroupId, bounds: targetBounds, reason: 'region-kind-click' });
          },
          onCountryKindClick: ({ countryCode, groupId: groupIdForCountry, countryName, layer: targetLayer }) => {
            const countryBounds = resolveCountryFocusBounds(countryCode, targetLayer);
            if (!countryCode || !groupIdForCountry || !countryBounds) {
              derror(el, 'Leaflet adapter: country-kind hybrid click is missing contract fields.', {
                countryCode,
                groupIdForCountry,
              });
              return;
            }
            enterCountryStage({
              countryCode,
              groupId: groupIdForCountry,
              bounds: countryBounds,
              titleHint: countryName || countryCode,
              reason: 'country-kind-click',
            });
          },
          onContractError: (message, meta) => derror(el, message, meta),
        });
      },
    });
  }

  /**
   * @param {string} groupId
   */
  function mountHybridLayer(groupId) {
    if (!map) return;

    if (hybridLayer && map.hasLayer(hybridLayer)) {
      map.removeLayer(hybridLayer);
    }

    hybridLayer = buildHybridLayerForGroup(groupId);
    if (regionLayer && map.hasLayer(regionLayer)) {
      map.removeLayer(regionLayer);
    }
    if (!map.hasLayer(hybridLayer)) {
      hybridLayer.addTo(map);
    }
    applyHybridStageStyle();
  }

  /**
   * @param {'world'|'region'|'country'} nextStage
   */
  function applyPreviewForStage(nextStage) {
    if (nextStage === STAGE_WORLD) {
      closePreview('stage-world');
      return;
    }

    if (nextStage === STAGE_REGION) {
      const previewOpened = openRegionPreview(activeGroupId);
      if (!previewOpened) closePreview('stage-region');
      return;
    }

    if (nextStage === STAGE_COUNTRY) {
      const previewOpened = openCountryPreview(selectedCountryCode, selectedCountryTitle || selectedCountryCode);
      if (!previewOpened) closePreview('stage-country');
    }
  }

  /**
   * Prime preview visibility before movement starts so bounds padding
   * is computed against final overlay insets.
   *
   * @param {{
   *   stage: 'world'|'region'|'country',
   *   groupId?: string,
   *   countryCode?: string,
   *   titleHint?: string,
   * }} params
   */
  function preflightPreviewForTransition({
    stage: nextStage,
    groupId = '',
    countryCode = '',
    titleHint = '',
  }) {
    if (nextStage === STAGE_WORLD) {
      closePreview('stage-world-preflight');
      return;
    }

    if (nextStage === STAGE_REGION) {
      const opened = openRegionPreview(groupId, titleHint);
      if (!opened) closePreview('stage-region-preflight');
      return;
    }

    if (nextStage === STAGE_COUNTRY) {
      const opened = openCountryPreview(countryCode, titleHint || countryCode);
      if (!opened) closePreview('stage-country-preflight');
    }
  }

  /**
   * @param {{reason?:string}} [ctx]
   */
  function commitWorldStage(_ctx = {}) {
    if (!map || !regionLayer) return;
    if (hybridLayer && map.hasLayer(hybridLayer)) {
      map.removeLayer(hybridLayer);
    }
    if (!map.hasLayer(regionLayer)) {
      regionLayer.addTo(map);
    }
    stage = STAGE_WORLD;
    activeGroupId = '';
    activeGroupBounds = null;
    selectedCountryCode = '';
    selectedCountryTitle = '';
    hoveredCountryCode = '';
    hoveredRegionGroupId = '';
    applyWorldLayerStyle('');
    applyPreviewForStage(STAGE_WORLD);
  }

  /**
   * @param {{groupId:string,targetBounds:object|Array,reason?:string}} params
   */
  function commitRegionStage({ groupId, targetBounds }) {
    const normalizedGroupId = normalizeGroupId(groupId);
    if (!normalizedGroupId) return;
    activeGroupId = normalizedGroupId;
    activeGroupBounds = targetBounds;
    selectedCountryCode = '';
    selectedCountryTitle = '';
    hoveredCountryCode = '';
    hoveredRegionGroupId = '';
    stage = STAGE_REGION;
    mountHybridLayer(normalizedGroupId);
    applyHybridStageStyle();
    applyPreviewForStage(STAGE_REGION);
  }

  /**
   * @param {{
   *   countryCode:string,
   *   groupId:string,
   *   regionBounds:object|Array,
   *   titleHint?:string,
   * }} params
   */
  function commitCountryStage({
    countryCode,
    groupId,
    regionBounds,
    titleHint = '',
  }) {
    const normalizedCountryCode = normalizeCountryCode(countryCode);
    const inferredGroupId = normalizeGroupId(groupId);
    activeGroupId = inferredGroupId;
    activeGroupBounds = regionBounds;
    selectedCountryCode = normalizedCountryCode;
    selectedCountryTitle = String(titleHint || normalizedCountryCode);
    hoveredCountryCode = '';
    hoveredRegionGroupId = '';
    stage = STAGE_COUNTRY;
    mountHybridLayer(inferredGroupId);
    applyHybridStageStyle();
    applyPreviewForStage(STAGE_COUNTRY);
  }

  /**
   * @param {{reason?:string}} [ctx]
   */
  function enterWorldStage(ctx = {}) {
    if (!transitionController) return;
    preflightPreviewForTransition({ stage: STAGE_WORLD });
    transitionController.enterWorldStage(ctx);
  }

  /**
   * @param {{groupId:string,bounds?:object|Array|null,reason?:string}} params
   */
  function enterRegionStage(params) {
    if (!transitionController) return;
    const targetGroupId = normalizeGroupId(params?.groupId || '');
    preflightPreviewForTransition({
      stage: STAGE_REGION,
      groupId: targetGroupId,
    });
    transitionController.enterRegionStage(params);
  }

  /**
   * @param {{
   *   countryCode:string,
   *   groupId?:string,
   *   bounds?:object|Array|null,
   *   titleHint?:string,
   *   reason?:string
   * }} params
   */
  function enterCountryStage(params) {
    if (!transitionController) return;
    const targetCountryCode = normalizeCountryCode(params?.countryCode || '');
    preflightPreviewForTransition({
      stage: STAGE_COUNTRY,
      countryCode: targetCountryCode,
      titleHint: String(params?.titleHint || targetCountryCode || ''),
    });
    transitionController.enterCountryStage(params);
  }

  return {
    async init({ el: containerEl, mapData, mapMeta, adapterConfig }) {
      this.destroy();

      if (!(containerEl instanceof HTMLElement)) {
        // ATTENTION: intentional hard-stop for diagnosability; runtime could continue with weak element assumptions.
        throw new Error('Leaflet adapter: missing/invalid container element (el).');
      }

      if (!adapterConfig || typeof adapterConfig !== 'object') {
        // ATTENTION: intentional hard-stop for diagnosability; runtime could continue with weak adapter config assumptions.
        throw new Error('Leaflet adapter: adapterConfig is missing or invalid.');
      }

      if (!hasRuntimeBundleContract(mapData)) {
        // ATTENTION: intentional hard-stop for diagnosability; runtime could continue with weak runtime bundle assumptions.
        throw new Error(
          'Leaflet adapter: mapData must be a prepared runtime bundle (countryRuntimeMap/regionRuntimeMap/countryGrouping/flags).'
        );
      }

      el = containerEl;

      const runtimeLayers = mapData;
      const runtimeFlags = isPlainObject(runtimeLayers?.flags) ? runtimeLayers.flags : {};
      const pipelinePreprocessEnabled = normalizeBool(runtimeFlags.preprocessEnabled, true);
      const regionLayerEnabled = normalizeBool(runtimeFlags.regionLayerEnabled, true);
      const whitelistEnabled = normalizeBool(runtimeFlags.whitelistEnabled, true);
      const groupingEnabled = normalizeBool(runtimeFlags.groupingEnabled, true);
      const groupingMode = String(runtimeFlags.groupingMode || runtimeLayers?.countryGrouping?.mode || 'off');
      const datasetKey = String(runtimeLayers?.datasetKey || adapterConfig?.map?.datasetKey || 'world-v1').trim() || 'world-v1';
      regionLayerSource = String(
        adapterConfig?.map?.regionLayer?.source || REGION_LAYER_SOURCE_DERIVED_COUNTRY
      ).trim().toLowerCase();
      if (
        regionLayerSource !== REGION_LAYER_SOURCE_DERIVED_COUNTRY
        && regionLayerSource !== REGION_LAYER_SOURCE_EXTERNAL_REGION_MAP
      ) {
        regionLayerSource = REGION_LAYER_SOURCE_DERIVED_COUNTRY;
      }
      focusPadding = resolveFocusPaddingConfig(adapterConfig);
      regionFocusExcludeByGroup = resolveRegionFocusExclusions(adapterConfig);
      previewConfig = resolvePreviewConfig(adapterConfig);

      try {
        preview = createPreviewOverlay({
          rootEl: el,
          config: {
            ...previewConfig,
            mapId: previewConfig.mapId || mapId || '',
          },
          onClose: ({ reason }) => {
            if (reason !== 'user-close') return;

            // UX rule: close means close the preview flow and return to world stage.
            enterWorldStage({ reason: 'preview-close' });
          },
        });
      } catch (err) {
        preview = null;
        dwarn('Preview overlay creation failed; map continues without preview.', { err });
      }

      countryGrouping = runtimeLayers.countryGrouping || null;
      countryRuntimeMap = runtimeLayers.countryRuntimeMap || null;
      regionRuntimeMap = runtimeLayers.regionRuntimeMap || null;

      const countryFeatureCount = Array.isArray(countryRuntimeMap?.features) ? countryRuntimeMap.features.length : 0;
      if (!countryFeatureCount) {
        // ATTENTION: intentional hard-stop for diagnosability; runtime could continue with empty fallback map.
        throw new Error('Leaflet adapter: runtime bundle has no countryRuntimeMap features.');
      }

      dlog('Leaflet runtime config.', {
        mapId: mapId || null,
        datasetKey,
        pipelinePreprocessEnabled,
        whitelistEnabled,
        groupingEnabled,
        groupingMode,
        regionLayerEnabled,
        regionLayerSource,
        focusPadding,
        regionFocusExclusionGroups: regionFocusExcludeByGroup.size,
        previewConfig,
      });

      if (!pipelinePreprocessEnabled) {
        dwarn(
          'Runtime pipeline passthrough mode active (preprocess.enabled=0); grouping/whitelist/part-rules are ignored for this map instance.'
        );
      }

      dlog('Runtime pipeline audit.', {
        mapId: mapId || null,
        datasetKey,
        groupedCountries: runtimeLayers.countryGrouping?.includedCountries?.length || 0,
        templateCountriesMissingInSource: Array.isArray(runtimeLayers?.countryGrouping?.diagnostics?.templateCountriesMissingInSource)
          ? runtimeLayers.countryGrouping.diagnostics.templateCountriesMissingInSource.length
          : 0,
        countryFeatures: runtimeLayers.countryRuntimeMap?.features?.length || 0,
        regionFeatures: runtimeLayers.regionRuntimeMap?.features?.length || 0,
        audit: runtimeLayers.countryAudit,
      });

      const moduleNs = await loadLeafletModule(adapterConfig);
      const { MapCtor, GeoJSONCtor } = getStrictConstructors(moduleNs);
      layerStyle = resolveStyle(adapterConfig.style);
      leafletGeoJsonCtor = GeoJSONCtor;

      map = new MapCtor(el, resolveMapOptions(adapterConfig));
      transitionController = createTransitionController({
        getMap: () => map,
        resolveStageBoundsOptions,
        getWorldBounds: () => worldBounds,
        getActiveGroupId: () => activeGroupId,
        getCountryGrouping: () => countryGrouping,
        resolveGroupFocusBounds,
        resolveCountryFocusBounds,
        commitWorld: (ctx) => commitWorldStage(ctx),
        commitRegion: (ctx) => commitRegionStage(ctx),
        commitCountry: (ctx) => commitCountryStage(ctx),
        onContractError: (message, meta) => derror(el, message, meta),
      });

      countryLayer = new GeoJSONCtor(runtimeLayers.countryRuntimeMap, {
        style: layerStyle,
        interactive: true,
      });

      countryIndex = buildCountryLayerIndex(countryLayer);

      if (runtimeLayers.regionRuntimeMap) {
        regionLayer = new GeoJSONCtor(runtimeLayers.regionRuntimeMap, {
          style: layerStyle,
          interactive: true,
        });

        groupIndex = buildGroupLayerIndex(regionLayer);

        // Bind hover/click per feature for grouped navigation.
        bindWorldLayerEvents({
          regionLayer,
          moduleNs,
          getStage: () => stage,
          stageWorldValue: STAGE_WORLD,
          hasGroup: (groupId) => !!groupIndex?.layersByGroup?.has(groupId),
          onHoverGroup: (groupId) => {
            applyWorldLayerStyle(groupId);
          },
          onHoverLeave: () => {
            applyWorldLayerStyle('');
          },
          onRegionClick: ({ groupId, layer }) => {
            const targetBounds = resolveGroupFocusBounds(groupId, layer);
            if (!groupId || !targetBounds) {
              derror(el, 'Leaflet adapter: clicked region is missing group bounds.', { groupId });
              return;
            }

            const autoGroupBounds = computeFocusBoundsFromLayers(groupIndex?.layersByGroup?.get(groupId) || []);
            if (!autoGroupBounds) {
              dwarn('Region focus bounds fallback used (single-layer bounds).', { groupId });
            }

            enterRegionStage({ groupId, bounds: targetBounds, reason: 'world-region-click' });
          },
        });
      }

      // Start in world stage when a region layer is available.
      if (regionLayer) {
        regionLayer.addTo(map);
        stage = STAGE_WORLD;
        activeGroupId = '';
        selectedCountryCode = '';
        selectedCountryTitle = '';
        hoveredCountryCode = '';
        hoveredRegionGroupId = '';
        worldBounds = fitInitialView(map, regionLayer, adapterConfig.view || null, resolveStageBoundsOptions('world'));
        applyWorldLayerStyle('');
        applyPreviewForStage(STAGE_WORLD);
      } else {
        // ATTENTION: intentional hard-stop for diagnosability; runtime could continue with country-only mode.
        dwarn('Region layer disabled or unavailable; falling back to country-only startup.');
        countryLayer.addTo(map);
        stage = STAGE_COUNTRY;
        worldBounds = fitInitialView(map, countryLayer, adapterConfig.view || null, resolveStageBoundsOptions('world'));
        selectedCountryCode = '';
        selectedCountryTitle = '';
        hoveredCountryCode = '';
        hoveredRegionGroupId = '';
      }

      // Refit once after first paint so initial bounds use final container size.
      window.requestAnimationFrame(() => {
        if (!map || !worldBounds) return;
        try {
          map.invalidateSize(false);
          const worldOptions = resolveStageBoundsOptions('world');
          map.fitBounds(worldBounds, {
            paddingTopLeft: worldOptions.paddingTopLeft,
            paddingBottomRight: worldOptions.paddingBottomRight,
            animate: false,
          });
        } catch (err) {
          dwarn('Deferred initial fit failed.', { err });
        }
      });

      // Background click keeps staged navigation:
      // country -> region, region -> world.
      mapClickHandler = () => {
        if (stage === STAGE_COUNTRY) {
          const regionKey = String(activeGroupId || '').trim();
          const targetBounds = activeGroupBounds || resolveGroupFocusBounds(regionKey);
          if (regionLayer && targetBounds && regionKey) {
            enterRegionStage({ groupId: regionKey, bounds: targetBounds, reason: 'sea-click-country' });
            return;
          }
          enterWorldStage({ reason: 'sea-click-country-fallback' });
          return;
        }

        if (stage === STAGE_REGION) {
          enterWorldStage({ reason: 'sea-click-region' });
          return;
        }

        // World stage sea click is intentionally a no-op.
      };

      if (typeof map.on === 'function') {
        map.on('click', mapClickHandler);
      }

      const initialBounds = summarizeBounds(worldBounds);
      const initialFit = estimateFitFill(map, initialBounds);
      const mapSize = (map && typeof map.getSize === 'function') ? map.getSize() : null;
      dlog('Leaflet map initialized.', {
        mapId: mapId || null,
        stage,
        activeGroupId,
        selectedCountryCode,
        regionLayerActive: !!regionLayer && stage === STAGE_WORLD,
        hybridLayerActive: !!hybridLayer && (stage === STAGE_REGION || stage === STAGE_COUNTRY),
        containerW: Number(mapSize?.x || 0),
        containerH: Number(mapSize?.y || 0),
        initialFocus: {
          source: String(resolveViewBounds(regionLayer || countryLayer, adapterConfig.view || null)?.source || 'unknown'),
          bounds: initialBounds,
          fit: initialFit,
        },
      });
    },

    onResize(_activeRegionId) {
      if (!map) return;

      if (typeof map.invalidateSize === 'function') {
        map.invalidateSize(false);
      }

      if (preview && typeof preview.reposition === 'function') {
        preview.reposition();
      }
    },

    destroy() {
      if (map) {
        if (mapClickHandler && typeof map.off === 'function') {
          map.off('click', mapClickHandler);
        }
      }

      if (transitionController && typeof transitionController.destroy === 'function') {
        try {
          transitionController.destroy();
        } catch (_) {
          dwarn('Leaflet adapter: transition controller destroy failed.');
        }
      }

      if (map && typeof map.remove === 'function') {
        try {
          map.remove();
        } catch (_) {
          dwarn('Leaflet adapter: map.remove failed during destroy.');
        }
      }

      if (preview && typeof preview.destroy === 'function') {
        try {
          preview.destroy();
        } catch (_) {
          dwarn('Leaflet adapter: preview.destroy failed during destroy.');
        }
      }

      map = null;
      regionLayer = null;
      hybridLayer = null;
      countryLayer = null;
      el = null;
      stage = STAGE_WORLD;
      activeGroupId = '';
      activeGroupBounds = null;
      selectedCountryCode = '';
      selectedCountryTitle = '';
      hoveredCountryCode = '';
      hoveredRegionGroupId = '';
      worldBounds = null;
      groupIndex = null;
      countryIndex = null;
      countryRuntimeMap = null;
      regionRuntimeMap = null;
      leafletGeoJsonCtor = null;
      layerStyle = defaultStyle;
      regionLayerSource = REGION_LAYER_SOURCE_DERIVED_COUNTRY;
      regionFocusExcludeByGroup = new Map();
      mapClickHandler = null;
      transitionController = null;
      focusPadding = { ...DEFAULT_FOCUS_PADDING };
      preview = null;
      previewConfig = { ...DEFAULT_PREVIEW_CONFIG, mapId: mapId || '' };
      countryGrouping = null;
    },
  };
}

/* ============================================================
   4) AUTO-RUN
   ============================================================ */

// No autorun registration; adapter factory imports this module on demand.
