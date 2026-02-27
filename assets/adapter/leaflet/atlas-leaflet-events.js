/* ============================================================
   Module: TDW Atlas Engine — Leaflet Event Routing Helpers
   ------------------------------------------------------------
   Purpose:
   - Centralize world/hybrid hover + click binding.
   - Keep adapter orchestration focused on state/lifecycle.
   ============================================================ */

import {
  HYBRID_KIND_COUNTRY,
  HYBRID_KIND_REGION,
  getLayerCountryCode,
  getLayerCountryName,
  getLayerGroupId,
  getLayerGroupLabel,
  getLayerHybridKind,
  getLayerProps,
} from './atlas-leaflet-layers.js';
import { normalizeCountryCode, normalizeGroupId } from './atlas-leaflet-focus.js';

/* ============================================================
   1) MODULE INIT
   ============================================================ */

const SCOPE = 'ATLAS LF-EVENTS';

const { dlog, dwarn, derror } = window?.TDW?.Logger?.createScopedLogger?.(SCOPE) || {
  dlog: () => {},
  dwarn: () => {},
  derror: (...args) => console.error('[TDW ATLAS FATAL]', `[${SCOPE}]`, ...args),
};

/* ============================================================
   2) FUNCTIONS
   ============================================================ */

/**
 * Leaflet 2 uses pointerover/pointerout for interactive vector hover.
 *
 * @param {object} layer
 * @param {Function} onEnter
 * @param {Function} onLeave
 */
export function bindHoverHandlers(layer, onEnter, onLeave) {
  if (!layer || typeof layer.on !== 'function') return;
  layer.on('pointerover', onEnter);
  layer.on('pointerout', onLeave);
}

/**
 * @param {{
 *   regionLayer: object,
 *   moduleNs: object,
 *   getStage: Function,
 *   stageWorldValue: string,
 *   hasGroup: Function,
 *   onHoverGroup: Function,
 *   onHoverLeave: Function,
 *   onRegionClick: Function,
 * }} params
 */
export function bindWorldLayerEvents({
  regionLayer,
  moduleNs,
  getStage,
  stageWorldValue,
  hasGroup,
  onHoverGroup,
  onHoverLeave,
  onRegionClick,
}) {
  if (!regionLayer || typeof regionLayer.eachLayer !== 'function') return;

  regionLayer.eachLayer((layer) => {
    const label = getLayerGroupLabel(layer);
    if (label && typeof layer.bindTooltip === 'function') {
      layer.bindTooltip(label, {
        sticky: true,
        direction: 'top',
        opacity: 0.92,
      });
    }

    bindHoverHandlers(layer, () => {
      if (getStage() !== stageWorldValue) return;
      const groupId = getLayerGroupId(layer);
      if (!groupId || !hasGroup(groupId)) return;
      onHoverGroup(groupId);
    }, () => {
      if (getStage() !== stageWorldValue) return;
      onHoverLeave();
    });

    layer.on('click', (event) => {
      if (moduleNs?.DomEvent?.stopPropagation) {
        moduleNs.DomEvent.stopPropagation(event);
        if (event?.originalEvent) moduleNs.DomEvent.stopPropagation(event.originalEvent);
      }

      if (getStage() !== stageWorldValue) return;
      const groupId = getLayerGroupId(layer);
      onRegionClick({ groupId, layer });
    });
  });
}

/**
 * @param {{
 *   layer: object,
 *   map: object|null,
 *   moduleNs: object,
 *   getStage: Function,
 *   stageRegionValue: string,
 *   stageCountryValue: string,
 *   getActiveGroupId: Function,
 *   onHoverCountry: Function,
 *   onHoverRegion: Function,
 *   onHoverLeave: Function,
 *   onRegionKindClick: Function,
 *   onCountryKindClick: Function,
 *   onContractError: Function,
 * }} params
 */
export function bindHybridLayerFeatureEvents({
  layer,
  map,
  moduleNs,
  getStage,
  stageRegionValue,
  stageCountryValue,
  getActiveGroupId,
  onHoverCountry,
  onHoverRegion,
  onHoverLeave,
  onRegionKindClick,
  onCountryKindClick,
  onContractError,
}) {
  if (!layer || typeof layer.on !== 'function') return;

  const hybridKind = getLayerHybridKind(layer);
  const regionLabel = getLayerGroupLabel(layer);
  const countryName = getLayerCountryName(layer);

  const tooltipLabel = hybridKind === HYBRID_KIND_COUNTRY
    ? countryName
    : `switch to: ${String(regionLabel || getLayerGroupId(layer) || '').trim()}`;

  if (tooltipLabel && typeof layer.bindTooltip === 'function') {
    layer.bindTooltip(tooltipLabel, {
      sticky: true,
      direction: 'top',
      opacity: 0.92,
    });
  }

  bindHoverHandlers(layer, () => {
    const stage = getStage();
    if (stage !== stageRegionValue && stage !== stageCountryValue) return;

    if (hybridKind === HYBRID_KIND_COUNTRY) {
      onHoverCountry(normalizeCountryCode(getLayerCountryCode(layer)));
      return;
    }
    if (hybridKind === HYBRID_KIND_REGION) {
      onHoverRegion(normalizeGroupId(getLayerGroupId(layer)));
      return;
    }
    onContractError('Leaflet adapter: hybrid feature has unknown tdwHybridKind.', {
      kind: hybridKind,
      properties: getLayerProps(layer),
    });
  }, () => {
    const stage = getStage();
    if (stage !== stageRegionValue && stage !== stageCountryValue) return;
    onHoverLeave();
  });

  layer.on('click', (event) => {
    if (map?.stop) map.stop();

    if (event?.originalEvent && moduleNs?.DomEvent?.stopPropagation) {
      moduleNs.DomEvent.stopPropagation(event.originalEvent);
    }
    if (moduleNs?.DomEvent?.stopPropagation) {
      moduleNs.DomEvent.stopPropagation(event);
    }

    const stage = getStage();
    if (stage !== stageRegionValue && stage !== stageCountryValue) return;

    if (hybridKind === HYBRID_KIND_REGION) {
      onRegionKindClick({
        groupId: normalizeGroupId(getLayerGroupId(layer)),
        layer,
      });
      return;
    }

    if (hybridKind === HYBRID_KIND_COUNTRY) {
      const countryCode = normalizeCountryCode(getLayerCountryCode(layer));
      const groupIdForCountry = normalizeGroupId(getLayerGroupId(layer));
      const activeGroupId = normalizeGroupId(getActiveGroupId());
      if (groupIdForCountry && activeGroupId && groupIdForCountry !== activeGroupId) {
        // ATTENTION: intentional hard-stop for diagnosability; runtime could continue by interpreting this as region switch.
        onContractError('Leaflet adapter: country-kind click outside active region detected.', {
          countryCode,
          groupIdForCountry,
          activeGroupId,
        });
        return;
      }

      onCountryKindClick({
        countryCode,
        groupId: groupIdForCountry,
        countryName,
        layer,
      });
      return;
    }

    onContractError('Leaflet adapter: hybrid click has unknown kind.', {
      hybridKind,
      properties: getLayerProps(layer),
    });
  });
}

/* ============================================================
   3) PUBLIC API
   ============================================================ */

// Exported event helper surface is defined inline above.

/* ============================================================
   4) AUTO-RUN
   ============================================================ */

// No autorun side effects.
