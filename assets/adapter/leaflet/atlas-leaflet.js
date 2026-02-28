/* ============================================================
   Module: TDW Atlas Engine — Leaflet Adapter Factory
   ------------------------------------------------------------
   Purpose:
   - Adapt Atlas Core contract to Leaflet 2.x.
   - Orchestrate stage transitions and preview coupling.
   - Render prepared runtime map artifacts from preprocessor output.

   Responsibilities:
   - Validate adapter init contract and runtime bundle shape.
   - Manage Leaflet map/layer lifecycle per container instance.
   - Keep world/region/country stage behavior deterministic.

   Non-responsibilities:
   - No fetch of runtime config or geojson data.
   - No DB or REST writes.
   - No preprocessor data transformation logic.

   Public surface:
   - ESM: createAdapter() => { init, onResize, destroy }

   Contracts:
   - Contract 3 (module structure convention)
   - Contract 5 (logging + fail-fast behavior)
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

/* MODULE INIT */

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

const { dlog = () => {}, dwarn = () => {},
  derror = (...args) => console.error('[TDW ATLAS FATAL]', `[${SCOPE}]`, ...args),
} = window.TDW?.Logger?.createScopedLogger?.(SCOPE) || {};

let leafletModule = null;

/* FUNCTIONS */

/**
 * Build an absolute URL from relative or absolute input.
 *
 * @param {string} url Input URL value.
 * @returns {string} Absolute URL or empty string.
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
 * Ensure Leaflet stylesheet is present once in document head.
 *
 * @param {string} cssUrl Leaflet CSS URL.
 * @returns {void}
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
 * Lazy-load Leaflet ESM module from adapter vendor config.
 *
 * @param {object} adapterConfig Adapter configuration payload.
 * @returns {Promise<object>} Leaflet module namespace.
 */
async function loadLeafletModule(adapterConfig) {
  if (leafletModule) return leafletModule;

  const jsUrl = adapterConfig?.vendor?.leafletJs;
  if (!jsUrl) {
    // ATTENTION: intentional hard-stop for diagnosability; runtime could continue with implicit global Leaflet.
    throw new Error('Missing adapterConfig.vendor.leafletJs (Leaflet module URL).');
  }

  ensureLeafletCss(adapterConfig?.vendor?.leafletCss || '');
  leafletModule = await import(toAbsoluteUrl(jsUrl));
  return leafletModule;
}

/**
 * Validate minimum runtime bundle contract from preprocessor.
 *
 * @param {object} runtimeBundle Runtime map bundle candidate.
 * @returns {boolean} True when required bundle members exist.
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
 * Resolve strict Leaflet constructors required by this adapter.
 *
 * @param {object} moduleNs Leaflet module namespace.
 * @returns {{MapCtor: Function, GeoJSONCtor: Function}} Strict constructors.
 */
function getStrictConstructors(moduleNs) {
  const MapCtor = moduleNs?.Map;
  const GeoJSONCtor = moduleNs?.GeoJSON;

  if (typeof MapCtor !== 'function') {
    // ATTENTION: intentional hard-stop for diagnosability; runtime could continue with weak vendor assumptions.
    throw new Error('Leaflet 2.x contract error: Map constructor missing.');
  }

  if (typeof GeoJSONCtor !== 'function') {
    // ATTENTION: intentional hard-stop for diagnosability; runtime could continue with weak vendor assumptions.
    throw new Error('Leaflet 2.x contract error: GeoJSON constructor missing.');
  }

  return { MapCtor, GeoJSONCtor };
}

/**
 * Normalize map options for click-only interaction policy.
 *
 * @param {object} adapterConfig Adapter configuration payload.
 * @returns {object} Leaflet map options.
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
 * Normalize preview settings with safe defaults.
 *
 * @param {object} adapterConfig Adapter configuration payload.
 * @returns {{mapId:string,showRegionPreview:boolean,showCountryPreview:boolean,desktopSide:'left'|'right',switchToBottomMaxWHRatio:number}} Normalized preview config.
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

/* PUBLIC API */

/**
 * Create one isolated adapter instance per Core instance.
 *
 * @param {{adapterKey?: string, mapId?: string, el?: HTMLElement|null}} [_context] Adapter factory context.
 * @returns {{init: Function, onResize: Function, destroy: Function}} Adapter lifecycle API.
 */
export function createAdapter(_context = {}) {
  const mapId = String(_context?.mapId || '').trim();

  // Per-instance mutable state; never shared across containers.
  const state = {
    el: null,
    map: {
      instance: null,
      worldBounds: null,
      transitionController: null,
      geoJsonCtor: null,
    },
    layers: {
      region: null,
      hybrid: null,
      country: null,
      groupIndex: null,
      countryIndex: null,
      style: defaultStyle,
    },
    stage: {
      current: STAGE_WORLD,
      activeGroupId: '',
      selectedCountryCode: '',
      selectedCountryTitle: '',
      hoveredCountryCode: '',
      hoveredRegionGroupId: '',
      activeGroupBounds: null,
    },
    data: {
      countryRuntimeMap: null,
      regionRuntimeMap: null,
      countryGrouping: null,
      regionLayerSource: REGION_LAYER_SOURCE_DERIVED_COUNTRY,
      regionFocusExcludeByGroup: new Map(),
      focusPadding: { ...DEFAULT_FOCUS_PADDING },
    },
    ui: {
      preview: null,
      previewConfig: { ...DEFAULT_PREVIEW_CONFIG, mapId: mapId || '' },
    },
    handlers: {
      mapClick: null,
    },
  };

  /* STATE HELPERS */

  /**
   * Reset stage-local interaction state to world defaults.
   *
   * @returns {void}
   */
  function resetStageState() {
    state.stage.current = STAGE_WORLD;
    state.stage.activeGroupId = '';
    state.stage.selectedCountryCode = '';
    state.stage.selectedCountryTitle = '';
    state.stage.hoveredCountryCode = '';
    state.stage.hoveredRegionGroupId = '';
    state.stage.activeGroupBounds = null;
  }

  /**
   * Reset full adapter instance state after destroy/init handover.
   *
   * @returns {void}
   */
  function resetAdapterState() {
    state.el = null;

    state.map.instance = null;
    state.map.worldBounds = null;
    state.map.transitionController = null;
    state.map.geoJsonCtor = null;

    state.layers.region = null;
    state.layers.hybrid = null;
    state.layers.country = null;
    state.layers.groupIndex = null;
    state.layers.countryIndex = null;
    state.layers.style = defaultStyle;

    resetStageState();

    state.data.countryRuntimeMap = null;
    state.data.regionRuntimeMap = null;
    state.data.countryGrouping = null;
    state.data.regionLayerSource = REGION_LAYER_SOURCE_DERIVED_COUNTRY;
    state.data.regionFocusExcludeByGroup = new Map();
    state.data.focusPadding = { ...DEFAULT_FOCUS_PADDING };

    state.ui.preview = null;
    state.ui.previewConfig = { ...DEFAULT_PREVIEW_CONFIG, mapId: mapId || '' };
    state.handlers.mapClick = null;
  }

  /**
   * Execute cleanup callback with warn-only failure handling.
   *
   * @param {Function} fn Cleanup callback.
   * @param {string} warningMessage Warning message on failure.
   * @returns {void}
   */
  function safeInvoke(fn, warningMessage) {
    try {
      fn();
    } catch (_) {
      dwarn(warningMessage);
    }
  }

  /**
   * Remove map background click handler if currently registered.
   *
   * @returns {void}
   */
  function removeMapClickHandlerIfNeeded() {
    const map = state.map.instance;
    const mapClickHandler = state.handlers.mapClick;
    if (!map || !mapClickHandler || typeof map.off !== 'function') return;
    map.off('click', mapClickHandler);
    state.handlers.mapClick = null;
  }

  /**
   * Destroy transition controller instance if present.
   *
   * @returns {void}
   */
  function destroyTransitionControllerIfNeeded() {
    const controller = state.map.transitionController;
    if (!controller || typeof controller.destroy !== 'function') return;
    safeInvoke(() => controller.destroy(), 'Leaflet adapter: transition controller destroy failed.');
    state.map.transitionController = null;
  }

  /**
   * Remove Leaflet map instance from DOM if present.
   *
   * @returns {void}
   */
  function removeLeafletMapIfNeeded() {
    const map = state.map.instance;
    if (!map || typeof map.remove !== 'function') return;
    safeInvoke(() => map.remove(), 'Leaflet adapter: map.remove failed during destroy.');
    state.map.instance = null;
  }

  /**
   * Destroy preview overlay instance if present.
   *
   * @returns {void}
   */
  function destroyPreviewIfNeeded() {
    const preview = state.ui.preview;
    if (!preview || typeof preview.destroy !== 'function') return;
    safeInvoke(() => preview.destroy(), 'Leaflet adapter: preview.destroy failed during destroy.');
    state.ui.preview = null;
  }

  /* PREVIEW OPS */

  /**
   * Read current preview panel insets used for bounds padding.
   *
   * @returns {{top:number,right:number,bottom:number,left:number}} Insets in px.
   */
  function resolvePreviewInsets() {
    const preview = state.ui.preview;
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
   * Open preview for a specific scope/key or close when disabled.
   *
   * @param {{scope:'region'|'country',key:string,titleHint?:string,enabled:boolean,disabledReason:string}} params Preview open parameters.
   * @returns {boolean} True when preview open request was submitted.
   */
  function openScopedPreview({ scope, key, titleHint = '', enabled, disabledReason }) {
    const preview = state.ui.preview;
    if (!preview || !enabled) {
      if (preview) preview.close({ reason: disabledReason, notify: false });
      return false;
    }

    const normalizedKey = scope === 'country'
      ? String(key || '').trim().toUpperCase()
      : String(key || '').trim();
    if (!normalizedKey) return false;

    preview.open({
      scope,
      key: normalizedKey,
      titleHint: String(titleHint || normalizedKey),
    }).catch((err) => {
      dwarn(`${scope === 'country' ? 'Country' : 'Region'} preview open failed.`, {
        key: normalizedKey,
        err,
      });
    });

    if (typeof preview.reposition === 'function') preview.reposition();
    return true;
  }

  /**
   * Close preview overlay without triggering stage callback.
   *
   * @param {string} reason Internal close reason.
   * @returns {void}
   */
  function closePreview(reason) {
    const preview = state.ui.preview;
    if (!preview) return;
    preview.close({ reason, notify: false });
  }

  /**
   * Synchronize preview visibility/content for a target stage.
   *
   * @param {{stage:'world'|'region'|'country',groupId?:string,countryCode?:string,titleHint?:string,isPreflight?:boolean}} params Stage preview sync payload.
   * @returns {void}
   */
  function syncPreviewForStage({
    stage: nextStage,
    groupId = '',
    countryCode = '',
    titleHint = '',
    isPreflight = false,
  }) {
    const reasonPrefix = isPreflight ? 'stage-preflight' : 'stage';
    if (nextStage === STAGE_WORLD) {
      closePreview(`${reasonPrefix}-world`);
      return;
    }

    if (nextStage === STAGE_REGION) {
      const targetGroupId = String(groupId || state.stage.activeGroupId || '').trim();
      const opened = openScopedPreview({
        scope: 'region',
        key: targetGroupId,
        titleHint: String(titleHint || state.data.countryGrouping?.groupLabels?.[targetGroupId] || targetGroupId),
        enabled: state.ui.previewConfig.showRegionPreview,
        disabledReason: 'region-preview-disabled',
      });
      if (!opened) closePreview(`${reasonPrefix}-region`);
      return;
    }

    if (nextStage === STAGE_COUNTRY) {
      const targetCountryCode = String(countryCode || state.stage.selectedCountryCode || '').trim().toUpperCase();
      const opened = openScopedPreview({
        scope: 'country',
        key: targetCountryCode,
        titleHint: String(titleHint || state.stage.selectedCountryTitle || targetCountryCode),
        enabled: state.ui.previewConfig.showCountryPreview,
        disabledReason: 'country-preview-disabled',
      });
      if (!opened) closePreview(`${reasonPrefix}-country`);
    }
  }

  /**
   * Apply preview side-effects after a transition commit.
   *
   * @param {'world'|'region'|'country'} nextStage Stage after commit.
   * @returns {void}
   */
  function applyPreviewForStage(nextStage) {
    syncPreviewForStage({ stage: nextStage, isPreflight: false });
  }

  /**
   * Prime preview before movement so bounds include preview insets.
   *
   * @param {{stage:'world'|'region'|'country',groupId?:string,countryCode?:string,titleHint?:string}} params Preflight preview payload.
   * @returns {void}
   */
  function preflightPreviewForTransition(params) {
    syncPreviewForStage({ ...params, isPreflight: true });
  }

  /* FOCUS OPS */

  /**
   * Resolve per-stage fitBounds options including preview insets.
   *
   * @param {'world'|'region'|'country'} stageName Target stage.
   * @returns {{paddingTopLeft:[number,number],paddingBottomRight:[number,number]}} Bounds options.
   */
  function resolveStageBoundsOptions(stageName) {
    const basePadding = Array.isArray(state.data.focusPadding?.[stageName]) ? state.data.focusPadding[stageName] : [0, 0];
    const baseX = Math.max(0, Number(basePadding[0] || 0));
    const baseY = Math.max(0, Number(basePadding[1] || 0));
    const insets = resolvePreviewInsets();

    return {
      paddingTopLeft: [baseX + insets.left, baseY + insets.top],
      paddingBottomRight: [baseX + insets.right, baseY + insets.bottom],
    };
  }

  /**
   * Resolve best-fit bounds for a region group.
   *
   * @param {string} groupId Region group id.
   * @param {object|null} [fallbackLayer=null] Fallback Leaflet layer.
   * @returns {object|null} Leaflet bounds or null.
   */
  function resolveGroupFocusBounds(groupId, fallbackLayer = null) {
    const normalizedGroupId = normalizeGroupId(groupId);
    const groupLayers = state.layers.groupIndex?.layersByGroup?.get(normalizedGroupId) || [];
    const excludedCodes = state.data.regionFocusExcludeByGroup.get(normalizedGroupId);
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
   * Resolve best-fit bounds for a country code.
   *
   * @param {string} countryCode Country code.
   * @param {object|null} [fallbackLayer=null] Fallback Leaflet layer.
   * @returns {object|null} Leaflet bounds or null.
   */
  function resolveCountryFocusBounds(countryCode, fallbackLayer = null) {
    const code = normalizeCountryCode(countryCode);
    if (!code) return null;

    const countryLayers = state.layers.countryIndex?.layersByCountry?.get(code) || [];
    const autoBounds = computeFocusBoundsFromLayers(countryLayers);
    if (autoBounds) return autoBounds;

    if (fallbackLayer && typeof fallbackLayer.getBounds === 'function') {
      return fallbackLayer.getBounds();
    }
    return null;
  }

  /* LAYER OPS */

  /**
   * Apply world-stage style highlighting on region layer.
   *
   * @param {string} [groupId=''] Hovered/active group id.
   * @returns {void}
   */
  function applyWorldLayerStyle(groupId = '') {
    applyWorldLayerStyleHelper(state.layers.region, groupId);
  }

  /**
   * Apply current hybrid stage style based on state fields.
   *
   * @returns {void}
   */
  function applyHybridStageStyle() {
    applyHybridStageStyleHelper({
      hybridLayer: state.layers.hybrid,
      selectedCountryCode: state.stage.selectedCountryCode,
      hoveredCountryCode: state.stage.hoveredCountryCode,
      hoveredRegionGroupId: state.stage.hoveredRegionGroupId,
      stage: state.stage.current,
      countryStageValue: STAGE_COUNTRY,
      onContractError: (message, meta) => derror(state.el, message, meta),
    });
  }

  /**
   * Build one hybrid layer where active group stays country-kind.
   *
   * @param {string} groupId Active group id.
   * @returns {object} Leaflet GeoJSON layer instance.
   */
  function buildHybridLayerForGroup(groupId) {
    if (!state.map.geoJsonCtor) {
      // ATTENTION: intentional hard-stop for diagnosability; runtime could continue with weak layer assumptions.
      throw new Error('Leaflet adapter: GeoJSON constructor missing while building hybrid layer.');
    }

    if (state.data.regionLayerSource !== REGION_LAYER_SOURCE_DERIVED_COUNTRY) {
      // ATTENTION: intentional hard-stop for diagnosability; runtime could continue by falling back to derived-country source.
      throw new Error(`Leaflet adapter: regionLayerSource "${state.data.regionLayerSource}" not implemented yet.`);
    }

    const hybridRuntimeMap = buildHybridRuntimeMapData({
      countryRuntimeMap: state.data.countryRuntimeMap,
      regionRuntimeMap: state.data.regionRuntimeMap,
      activeGroupId: groupId,
    });

    return new state.map.geoJsonCtor(hybridRuntimeMap, {
      style: state.layers.style,
      interactive: true,
      onEachFeature: (_feature, layer) => {
        bindHybridLayerFeatureEvents({
          layer,
          map: state.map.instance,
          moduleNs: leafletModule,
          getStage: () => state.stage.current,
          stageRegionValue: STAGE_REGION,
          stageCountryValue: STAGE_COUNTRY,
          getActiveGroupId: () => state.stage.activeGroupId,
          onHoverCountry: (code) => {
            state.stage.hoveredCountryCode = code;
            state.stage.hoveredRegionGroupId = '';
            applyHybridStageStyle();
          },
          onHoverRegion: (groupIdForHover) => {
            state.stage.hoveredCountryCode = '';
            state.stage.hoveredRegionGroupId = groupIdForHover;
            applyHybridStageStyle();
          },
          onHoverLeave: () => {
            state.stage.hoveredCountryCode = '';
            state.stage.hoveredRegionGroupId = '';
            applyHybridStageStyle();
          },
          onRegionKindClick: ({ groupId: targetGroupId, layer: targetLayer }) => {
            const targetBounds = resolveGroupFocusBounds(targetGroupId, targetLayer);
            if (!targetGroupId || !targetBounds) {
              derror(state.el, 'Leaflet adapter: region-kind hybrid click missing group bounds.', {
                targetGroupId,
              });
              return;
            }
            enterRegionStage({ groupId: targetGroupId, bounds: targetBounds, reason: 'region-kind-click' });
          },
          onCountryKindClick: ({ countryCode, groupId: groupIdForCountry, countryName, layer: targetLayer }) => {
            const countryBounds = resolveCountryFocusBounds(countryCode, targetLayer);
            if (!countryCode || !groupIdForCountry || !countryBounds) {
              derror(state.el, 'Leaflet adapter: country-kind hybrid click is missing contract fields.', {
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
          onContractError: (message, meta) => derror(state.el, message, meta),
        });
      },
    });
  }

  /**
   * Mount hybrid layer for active group and unmount world layer.
   *
   * @param {string} groupId Active group id.
   * @returns {void}
   */
  function mountHybridLayer(groupId) {
    const map = state.map.instance;
    if (!map) return;

    if (state.layers.hybrid && map.hasLayer(state.layers.hybrid)) {
      map.removeLayer(state.layers.hybrid);
    }

    state.layers.hybrid = buildHybridLayerForGroup(groupId);
    if (state.layers.region && map.hasLayer(state.layers.region)) {
      map.removeLayer(state.layers.region);
    }
    if (!map.hasLayer(state.layers.hybrid)) {
      state.layers.hybrid.addTo(map);
    }
    applyHybridStageStyle();
  }

  /* STAGE OPS */

  /**
   * Clear selection + hover signals used for style/highlight.
   *
   * @returns {void}
   */
  function clearSelectionAndHover() {
    state.stage.selectedCountryCode = '';
    state.stage.selectedCountryTitle = '';
    state.stage.hoveredCountryCode = '';
    state.stage.hoveredRegionGroupId = '';
  }

  /**
   * Commit world stage visuals, state, and preview.
   *
   * @param {{reason?:string}} [_ctx={}] Optional transition metadata.
   * @returns {void}
   */
  function commitWorldStage(_ctx = {}) {
    const map = state.map.instance;
    if (!map || !state.layers.region) return;

    if (state.layers.hybrid && map.hasLayer(state.layers.hybrid)) {
      map.removeLayer(state.layers.hybrid);
    }
    if (!map.hasLayer(state.layers.region)) {
      state.layers.region.addTo(map);
    }

    state.stage.current = STAGE_WORLD;
    state.stage.activeGroupId = '';
    state.stage.activeGroupBounds = null;
    clearSelectionAndHover();
    applyWorldLayerStyle('');
    applyPreviewForStage(STAGE_WORLD);
  }

  /**
   * Commit region stage visuals, state, and preview.
   *
   * @param {{groupId:string,targetBounds:object|Array}} params Commit payload.
   * @returns {void}
   */
  function commitRegionStage({ groupId, targetBounds }) {
    const normalizedGroupId = normalizeGroupId(groupId);
    if (!normalizedGroupId) return;

    state.stage.activeGroupId = normalizedGroupId;
    state.stage.activeGroupBounds = targetBounds;
    state.stage.current = STAGE_REGION;
    clearSelectionAndHover();
    mountHybridLayer(normalizedGroupId);
    applyHybridStageStyle();
    applyPreviewForStage(STAGE_REGION);
  }

  /**
   * Commit country stage visuals, state, and preview.
   *
   * @param {{countryCode:string,groupId:string,regionBounds:object|Array,titleHint?:string}} params Commit payload.
   * @returns {void}
   */
  function commitCountryStage({ countryCode, groupId, regionBounds, titleHint = '' }) {
    const normalizedCountryCode = normalizeCountryCode(countryCode);
    const inferredGroupId = normalizeGroupId(groupId);

    state.stage.activeGroupId = inferredGroupId;
    state.stage.activeGroupBounds = regionBounds;
    state.stage.selectedCountryCode = normalizedCountryCode;
    state.stage.selectedCountryTitle = String(titleHint || normalizedCountryCode);
    state.stage.hoveredCountryCode = '';
    state.stage.hoveredRegionGroupId = '';
    state.stage.current = STAGE_COUNTRY;
    mountHybridLayer(inferredGroupId);
    applyHybridStageStyle();
    applyPreviewForStage(STAGE_COUNTRY);
  }

  /**
   * Request transition controller to enter world stage.
   *
   * @param {{reason?:string}} [ctx={}] Transition metadata.
   * @returns {void}
   */
  function enterWorldStage(ctx = {}) {
    const controller = state.map.transitionController;
    if (!controller) return;
    preflightPreviewForTransition({ stage: STAGE_WORLD });
    controller.enterWorldStage(ctx);
  }

  /**
   * Request transition controller to enter region stage.
   *
   * @param {{groupId:string,bounds?:object|Array|null,reason?:string}} params Transition payload.
   * @returns {void}
   */
  function enterRegionStage(params) {
    const controller = state.map.transitionController;
    if (!controller) return;
    const targetGroupId = normalizeGroupId(params?.groupId || '');
    preflightPreviewForTransition({
      stage: STAGE_REGION,
      groupId: targetGroupId,
    });
    controller.enterRegionStage(params);
  }

  /**
   * Request transition controller to enter country stage.
   *
   * @param {{countryCode:string,groupId?:string,bounds?:object|Array|null,titleHint?:string,reason?:string}} params Transition payload.
   * @returns {void}
   */
  function enterCountryStage(params) {
    const controller = state.map.transitionController;
    if (!controller) return;
    const targetCountryCode = normalizeCountryCode(params?.countryCode || '');
    preflightPreviewForTransition({
      stage: STAGE_COUNTRY,
      countryCode: targetCountryCode,
      titleHint: String(params?.titleHint || targetCountryCode || ''),
    });
    controller.enterCountryStage(params);
  }

  /* INIT PIPELINE */

  /**
   * Validate strict init contract before touching runtime state.
   *
   * @param {HTMLElement} containerEl Target map container.
   * @param {object} mapData Prepared runtime bundle.
   * @param {object} adapterConfig Adapter configuration payload.
   * @returns {void}
   */
  function validateInitInput(containerEl, mapData, adapterConfig) {
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
  }

  /**
   * Hydrate adapter runtime state from init payloads.
   *
   * @param {object} runtimeLayers Prepared runtime bundle.
   * @param {object} adapterConfig Adapter configuration payload.
   * @returns {{datasetKey:string,pipelinePreprocessEnabled:boolean,whitelistEnabled:boolean,groupingEnabled:boolean,groupingMode:string,regionLayerEnabled:boolean}} Diagnostic summary.
   */
  function hydrateRuntimeContext(runtimeLayers, adapterConfig) {
    const runtimeFlags = isPlainObject(runtimeLayers?.flags) ? runtimeLayers.flags : {};

    state.data.countryGrouping = runtimeLayers.countryGrouping || null;
    state.data.countryRuntimeMap = runtimeLayers.countryRuntimeMap || null;
    state.data.regionRuntimeMap = runtimeLayers.regionRuntimeMap || null;

    state.data.regionLayerSource = String(
      adapterConfig?.map?.regionLayer?.source || REGION_LAYER_SOURCE_DERIVED_COUNTRY
    ).trim().toLowerCase();
    if (
      state.data.regionLayerSource !== REGION_LAYER_SOURCE_DERIVED_COUNTRY
      && state.data.regionLayerSource !== REGION_LAYER_SOURCE_EXTERNAL_REGION_MAP
    ) {
      state.data.regionLayerSource = REGION_LAYER_SOURCE_DERIVED_COUNTRY;
    }

    state.data.focusPadding = resolveFocusPaddingConfig(adapterConfig);
    state.data.regionFocusExcludeByGroup = resolveRegionFocusExclusions(adapterConfig);
    state.ui.previewConfig = resolvePreviewConfig(adapterConfig);

    const countryFeatureCount = Array.isArray(state.data.countryRuntimeMap?.features)
      ? state.data.countryRuntimeMap.features.length
      : 0;
    if (!countryFeatureCount) {
      // ATTENTION: intentional hard-stop for diagnosability; runtime could continue with empty fallback map.
      throw new Error('Leaflet adapter: runtime bundle has no countryRuntimeMap features.');
    }

    return {
      datasetKey: String(runtimeLayers?.datasetKey || adapterConfig?.map?.datasetKey || 'world-v1').trim() || 'world-v1',
      pipelinePreprocessEnabled: normalizeBool(runtimeFlags.preprocessEnabled, true),
      whitelistEnabled: normalizeBool(runtimeFlags.whitelistEnabled, true),
      groupingEnabled: normalizeBool(runtimeFlags.groupingEnabled, true),
      groupingMode: String(runtimeFlags.groupingMode || runtimeLayers?.countryGrouping?.mode || 'off'),
      regionLayerEnabled: normalizeBool(runtimeFlags.regionLayerEnabled, true),
    };
  }

  /**
   * Create preview overlay instance for this map container.
   *
   * @returns {void}
   */
  function setupPreview() {
    try {
      state.ui.preview = createPreviewOverlay({
        rootEl: state.el,
        config: {
          ...state.ui.previewConfig,
          mapId: state.ui.previewConfig.mapId || mapId || '',
        },
        onClose: ({ reason }) => {
          if (reason !== 'user-close') return;

          // UX rule: close means close the preview flow and return to world stage.
          enterWorldStage({ reason: 'preview-close' });
        },
      });
    } catch (err) {
      state.ui.preview = null;
      dwarn('Preview overlay creation failed; map continues without preview.', { err });
    }
  }

  /**
   * Create Leaflet map instance and store strict constructors.
   *
   * @param {object} adapterConfig Adapter configuration payload.
   * @returns {Promise<object>} Loaded Leaflet module namespace.
   */
  async function setupLeafletMap(adapterConfig) {
    const moduleNs = await loadLeafletModule(adapterConfig);
    const { MapCtor, GeoJSONCtor } = getStrictConstructors(moduleNs);
    state.layers.style = resolveStyle(adapterConfig.style);
    state.map.geoJsonCtor = GeoJSONCtor;
    state.map.instance = new MapCtor(state.el, resolveMapOptions(adapterConfig));
    return moduleNs;
  }

  /**
   * Create transition controller and wire commit handlers.
   *
   * @returns {void}
   */
  function setupTransitionController() {
    state.map.transitionController = createTransitionController({
      getMap: () => state.map.instance,
      resolveStageBoundsOptions,
      getWorldBounds: () => state.map.worldBounds,
      getActiveGroupId: () => state.stage.activeGroupId,
      getCountryGrouping: () => state.data.countryGrouping,
      resolveGroupFocusBounds,
      resolveCountryFocusBounds,
      commitWorld: (ctx) => commitWorldStage(ctx),
      commitRegion: (ctx) => commitRegionStage(ctx),
      commitCountry: (ctx) => commitCountryStage(ctx),
      onContractError: (message, meta) => derror(state.el, message, meta),
    });
  }

  /**
   * Build runtime layers and indexes from prepared map bundle.
   *
   * @param {object} runtimeLayers Prepared runtime bundle.
   * @param {object} moduleNs Leaflet module namespace.
   * @returns {void}
   */
  function setupLayersAndIndexes(runtimeLayers, moduleNs) {
    const GeoJSONCtor = state.map.geoJsonCtor;
    state.layers.country = new GeoJSONCtor(runtimeLayers.countryRuntimeMap, {
      style: state.layers.style,
      interactive: true,
    });

    state.layers.countryIndex = buildCountryLayerIndex(state.layers.country);

    if (!runtimeLayers.regionRuntimeMap) return;

    state.layers.region = new GeoJSONCtor(runtimeLayers.regionRuntimeMap, {
      style: state.layers.style,
      interactive: true,
    });

    state.layers.groupIndex = buildGroupLayerIndex(state.layers.region);

    // Bind hover/click per feature for grouped navigation.
    bindWorldLayerEvents({
      regionLayer: state.layers.region,
      moduleNs,
      getStage: () => state.stage.current,
      stageWorldValue: STAGE_WORLD,
      hasGroup: (groupId) => !!state.layers.groupIndex?.layersByGroup?.has(groupId),
      onHoverGroup: (groupId) => {
        applyWorldLayerStyle(groupId);
      },
      onHoverLeave: () => {
        applyWorldLayerStyle('');
      },
      onRegionClick: ({ groupId, layer }) => {
        const targetBounds = resolveGroupFocusBounds(groupId, layer);
        if (!groupId || !targetBounds) {
          derror(state.el, 'Leaflet adapter: clicked region is missing group bounds.', { groupId });
          return;
        }

        const autoGroupBounds = computeFocusBoundsFromLayers(state.layers.groupIndex?.layersByGroup?.get(groupId) || []);
        if (!autoGroupBounds) {
          dwarn('Region focus bounds fallback used (single-layer bounds).', { groupId });
        }

        enterRegionStage({ groupId, bounds: targetBounds, reason: 'world-region-click' });
      },
    });
  }

  /**
   * Mount initial stage and compute world bounds.
   *
   * @param {object} adapterConfig Adapter configuration payload.
   * @returns {void}
   */
  function mountInitialStage(adapterConfig) {
    const map = state.map.instance;
    if (!map) return;

    // Start in world stage when a region layer is available.
    if (state.layers.region) {
      state.layers.region.addTo(map);
      resetStageState();
      state.map.worldBounds = fitInitialView(
        map,
        state.layers.region,
        adapterConfig.view || null,
        resolveStageBoundsOptions('world')
      );
      applyWorldLayerStyle('');
      applyPreviewForStage(STAGE_WORLD);
    } else {
      // ATTENTION: intentional hard-stop for diagnosability; runtime could continue with country-only mode.
      dwarn('Region layer disabled or unavailable; falling back to country-only startup.');
      state.layers.country.addTo(map);
      state.stage.current = STAGE_COUNTRY;
      state.stage.activeGroupId = '';
      state.stage.activeGroupBounds = null;
      clearSelectionAndHover();
      state.map.worldBounds = fitInitialView(
        map,
        state.layers.country,
        adapterConfig.view || null,
        resolveStageBoundsOptions('world')
      );
    }

    // Refit once after first paint so initial bounds use final container size.
    window.requestAnimationFrame(() => {
      if (!state.map.instance || !state.map.worldBounds) return;
      try {
        state.map.instance.invalidateSize(false);
        const worldOptions = resolveStageBoundsOptions('world');
        state.map.instance.fitBounds(state.map.worldBounds, {
          paddingTopLeft: worldOptions.paddingTopLeft,
          paddingBottomRight: worldOptions.paddingBottomRight,
          animate: false,
        });
      } catch (err) {
        dwarn('Deferred initial fit failed.', { err });
      }
    });
  }

  /**
   * Bind map background click behavior (sea-click routing).
   *
   * @returns {void}
   */
  function bindBackgroundInteractions() {
    state.handlers.mapClick = () => {
      if (state.stage.current === STAGE_COUNTRY) {
        const regionKey = String(state.stage.activeGroupId || '').trim();
        const targetBounds = state.stage.activeGroupBounds || resolveGroupFocusBounds(regionKey);
        if (state.layers.region && targetBounds && regionKey) {
          enterRegionStage({ groupId: regionKey, bounds: targetBounds, reason: 'sea-click-country' });
          return;
        }
        enterWorldStage({ reason: 'sea-click-country-fallback' });
        return;
      }

      if (state.stage.current === STAGE_REGION) {
        enterWorldStage({ reason: 'sea-click-region' });
        return;
      }

      // World stage sea click is intentionally a no-op.
    };

    if (typeof state.map.instance?.on === 'function') {
      state.map.instance.on('click', state.handlers.mapClick);
    }
  }

  /**
   * Emit startup diagnostics for config, audit, and initial focus.
   *
   * @param {object} runtimeLayers Prepared runtime bundle.
   * @param {{datasetKey:string,pipelinePreprocessEnabled:boolean,whitelistEnabled:boolean,groupingEnabled:boolean,groupingMode:string,regionLayerEnabled:boolean,view?:object|null}} diagnostics Diagnostic values.
   * @returns {void}
   */
  function emitInitDiagnostics(runtimeLayers, diagnostics) {
    dlog('Leaflet runtime config.', {
      mapId: mapId || null,
      datasetKey: diagnostics.datasetKey,
      pipelinePreprocessEnabled: diagnostics.pipelinePreprocessEnabled,
      whitelistEnabled: diagnostics.whitelistEnabled,
      groupingEnabled: diagnostics.groupingEnabled,
      groupingMode: diagnostics.groupingMode,
      regionLayerEnabled: diagnostics.regionLayerEnabled,
      regionLayerSource: state.data.regionLayerSource,
      focusPadding: state.data.focusPadding,
      regionFocusExclusionGroups: state.data.regionFocusExcludeByGroup.size,
      previewConfig: state.ui.previewConfig,
    });

    if (!diagnostics.pipelinePreprocessEnabled) {
      dwarn(
        'Runtime preprocessor passthrough mode active (preprocess.enabled=0); grouping/whitelist/part-rules are ignored for this map instance.'
      );
    }

    dlog('Runtime preprocessor audit.', {
      mapId: mapId || null,
      datasetKey: diagnostics.datasetKey,
      groupedCountries: runtimeLayers.countryGrouping?.includedCountries?.length || 0,
      templateCountriesMissingInSource: Array.isArray(runtimeLayers?.countryGrouping?.diagnostics?.templateCountriesMissingInSource)
        ? runtimeLayers.countryGrouping.diagnostics.templateCountriesMissingInSource.length
        : 0,
      countryFeatures: runtimeLayers.countryRuntimeMap?.features?.length || 0,
      regionFeatures: runtimeLayers.regionRuntimeMap?.features?.length || 0,
      audit: runtimeLayers.countryAudit,
    });

    const initialBounds = summarizeBounds(state.map.worldBounds);
    const initialFit = estimateFitFill(state.map.instance, initialBounds);
    const mapSize = (state.map.instance && typeof state.map.instance.getSize === 'function')
      ? state.map.instance.getSize()
      : null;
    dlog('Leaflet map initialized.', {
      mapId: mapId || null,
      stage: state.stage.current,
      activeGroupId: state.stage.activeGroupId,
      selectedCountryCode: state.stage.selectedCountryCode,
      regionLayerActive: !!state.layers.region && state.stage.current === STAGE_WORLD,
      hybridLayerActive: !!state.layers.hybrid && (state.stage.current === STAGE_REGION || state.stage.current === STAGE_COUNTRY),
      containerW: Number(mapSize?.x || 0),
      containerH: Number(mapSize?.y || 0),
      initialFocus: {
        source: String(resolveViewBounds(state.layers.region || state.layers.country, diagnostics.view || null)?.source || 'unknown'),
        bounds: initialBounds,
        fit: initialFit,
      },
    });
  }

  /* INSTANCE API */

  return {
    /**
     * Initialize adapter instance for one map container.
     *
     * @param {{el: HTMLElement, mapData: object, mapMeta?: object, adapterConfig: object}} params Core init payload.
     * @returns {Promise<void>}
     */
    async init({ el: containerEl, mapData, mapMeta, adapterConfig }) {
      this.destroy();
      validateInitInput(containerEl, mapData, adapterConfig);
      state.el = containerEl;

      const runtimeLayers = mapData;
      const diagnostics = hydrateRuntimeContext(runtimeLayers, adapterConfig);
      diagnostics.view = adapterConfig?.view || null;
      setupPreview();
      const moduleNs = await setupLeafletMap(adapterConfig);
      setupTransitionController();
      setupLayersAndIndexes(runtimeLayers, moduleNs);
      mountInitialStage(adapterConfig);
      bindBackgroundInteractions();
      emitInitDiagnostics(runtimeLayers, diagnostics);
    },

    /**
     * Keep Leaflet and preview layout in sync after container resize.
     *
     * @param {string} _activeRegionId Unused, kept for adapter contract compatibility.
     * @returns {void}
     */
    onResize(_activeRegionId) {
      const map = state.map.instance;
      if (!map) return;

      if (typeof map.invalidateSize === 'function') {
        map.invalidateSize(false);
      }

      if (state.ui.preview && typeof state.ui.preview.reposition === 'function') {
        state.ui.preview.reposition();
      }
    },

    /**
     * Destroy adapter instance and release all runtime resources.
     *
     * @returns {void}
     */
    destroy() {
      removeMapClickHandlerIfNeeded();
      destroyTransitionControllerIfNeeded();
      removeLeafletMapIfNeeded();
      destroyPreviewIfNeeded();
      dlog('Leaflet adapter destroyed.', { mapId: mapId || null });
      resetAdapterState();
    },
  };
}

/* AUTO-RUN */

// No autorun registration; adapter factory imports this module on demand.
