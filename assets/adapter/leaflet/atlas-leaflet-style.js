/* ============================================================
   Module: TDW Atlas Engine — Leaflet Style Helpers
   ------------------------------------------------------------
   Purpose:
   - Keep interaction style policy separate from adapter orchestration.
   ============================================================ */

import {
  HYBRID_KIND_COUNTRY,
  HYBRID_KIND_REGION,
  getLayerCountryCode,
  getLayerGroupId,
  getLayerHybridKind,
  getLayerProps,
} from './atlas-leaflet-layers.js';
import { normalizeCountryCode, normalizeGroupId } from './atlas-leaflet-focus.js';
import { isPlainObject } from '../../js/helpers/atlas-shared.js';

/* ============================================================
   1) MODULE INIT
   ============================================================ */

const SCOPE = 'ATLAS LF-STYLE';

const { dlog, dwarn, derror } = window?.TDW?.Logger?.createScopedLogger?.(SCOPE) || {
  dlog: () => {},
  dwarn: () => {},
  derror: (...args) => console.error('[TDW ATLAS FATAL]', `[${SCOPE}]`, ...args),
};

export const INTERACTION_STYLE = Object.freeze({
  world: {
    base: {
      color: '#66737c',
      fillColor: '#98a2a9',
      opacity: 0.82,
      fillOpacity: 0.22,
      weight: 1.0,
    },
    highlighted: {
      color: '#2f4b59',
      fillColor: '#8eaab9',
      opacity: 1,
      fillOpacity: 0.42,
      weight: 1.8,
    },
  },
  hybrid: {
    country: {
      base: {
        color: '#60707a',
        fillColor: '#95a2ad',
        opacity: 0.86,
        fillOpacity: 0.24,
        weight: 1.0,
      },
      hover: {
        color: '#2f4b59',
        fillColor: '#86b4cc',
        opacity: 1,
        fillOpacity: 0.42,
        weight: 1.4,
      },
      selected: {
        color: '#1d2f3a',
        fillColor: '#5e91ae',
        opacity: 1,
        fillOpacity: 0.52,
        weight: 1.8,
      },
    },
    region: {
      base: {
        color: '#6e7880',
        fillColor: '#939ca4',
        opacity: 0.74,
        fillOpacity: 0.16,
        weight: 1.0,
      },
      hover: {
        color: '#385363',
        fillColor: '#89a6b6',
        opacity: 1,
        fillOpacity: 0.38,
        weight: 1.4,
      },
    },
  },
});

/* ============================================================
   2) FUNCTIONS
   ============================================================ */

/**
 * @returns {object}
 */
export function defaultStyle() {
  return {
    color: '#666',
    weight: 1,
    fillColor: '#999',
    fillOpacity: 0.2,
  };
}

/**
 * @param {unknown} styleConfig
 * @returns {Function|object}
 */
export function resolveStyle(styleConfig) {
  if (styleConfig === undefined || styleConfig === null) {
    return defaultStyle;
  }

  const isValid = typeof styleConfig === 'function' || isPlainObject(styleConfig);
  if (!isValid) {
    // ATTENTION: intentional hard-stop for diagnosability; runtime could continue with forced default style.
    throw new Error('Leaflet adapter: invalid adapterConfig.style (expected function or object).');
  }

  return styleConfig;
}

/**
 * @param {object|null} regionLayer
 * @param {string} [groupId]
 */
export function applyWorldLayerStyle(regionLayer, groupId = '') {
  if (!regionLayer || typeof regionLayer.eachLayer !== 'function') return;

  const highlightedGroupId = normalizeGroupId(groupId);
  regionLayer.eachLayer((layer) => {
    if (typeof layer.setStyle !== 'function') return;
    const layerGroupId = normalizeGroupId(getLayerGroupId(layer));
    const isHighlighted = highlightedGroupId && layerGroupId === highlightedGroupId;
    layer.setStyle(isHighlighted ? INTERACTION_STYLE.world.highlighted : INTERACTION_STYLE.world.base);
    if (isHighlighted && typeof layer.bringToFront === 'function') {
      layer.bringToFront();
    }
  });
}

/**
 * @param {{
 *   hybridLayer: object|null,
 *   selectedCountryCode: string,
 *   hoveredCountryCode: string,
 *   hoveredRegionGroupId: string,
 *   stage: string,
 *   countryStageValue: string,
 *   onContractError?: Function,
 * }} params
 */
export function applyHybridStageStyle({
  hybridLayer,
  selectedCountryCode,
  hoveredCountryCode,
  hoveredRegionGroupId,
  stage,
  countryStageValue,
  onContractError = null,
}) {
  if (!hybridLayer || typeof hybridLayer.eachLayer !== 'function') return;

  const normalizedSelectedCountry = normalizeCountryCode(selectedCountryCode);
  const normalizedHoveredCountry = normalizeCountryCode(hoveredCountryCode);
  const normalizedHoveredRegion = normalizeGroupId(hoveredRegionGroupId);

  hybridLayer.eachLayer((layer) => {
    if (typeof layer.setStyle !== 'function') return;

    const kind = getLayerHybridKind(layer);
    const layerGroupId = normalizeGroupId(getLayerGroupId(layer));
    if (!layerGroupId) {
      const meta = { kind, properties: getLayerProps(layer) };
      if (typeof onContractError === 'function') {
        onContractError('Leaflet adapter: hybrid feature is missing tdwGroupId.', meta);
      } else {
        derror('Leaflet adapter: hybrid feature is missing tdwGroupId.', meta);
      }
      return;
    }

    if (kind === HYBRID_KIND_COUNTRY) {
      const countryCode = normalizeCountryCode(getLayerCountryCode(layer));
      const isHovered = !!normalizedHoveredCountry && countryCode === normalizedHoveredCountry;
      const isSelected = stage === countryStageValue && !!normalizedSelectedCountry && countryCode === normalizedSelectedCountry;
      if (isSelected) {
        layer.setStyle(INTERACTION_STYLE.hybrid.country.selected);
        if (typeof layer.bringToFront === 'function') layer.bringToFront();
        return;
      }
      if (isHovered) {
        layer.setStyle(INTERACTION_STYLE.hybrid.country.hover);
        if (typeof layer.bringToFront === 'function') layer.bringToFront();
        return;
      }
      layer.setStyle(INTERACTION_STYLE.hybrid.country.base);
      return;
    }

    if (kind === HYBRID_KIND_REGION) {
      const isHoveredRegion = !!normalizedHoveredRegion && layerGroupId === normalizedHoveredRegion;
      layer.setStyle(isHoveredRegion ? INTERACTION_STYLE.hybrid.region.hover : INTERACTION_STYLE.hybrid.region.base);
      if (isHoveredRegion && typeof layer.bringToFront === 'function') {
        layer.bringToFront();
      }
      return;
    }

    const meta = { kind, properties: getLayerProps(layer) };
    if (typeof onContractError === 'function') {
      onContractError('Leaflet adapter: hybrid feature has unknown tdwHybridKind.', meta);
    } else {
      derror('Leaflet adapter: hybrid feature has unknown tdwHybridKind.', meta);
    }
  });
}

/* ============================================================
   3) PUBLIC API
   ============================================================ */

// Exported style helper surface is defined inline above.

/* ============================================================
   4) AUTO-RUN
   ============================================================ */

// No autorun side effects.
