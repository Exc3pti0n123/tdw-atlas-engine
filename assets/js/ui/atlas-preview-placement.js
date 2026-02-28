/* ============================================================
   Module: TDW Atlas Engine — Preview Placement
   ------------------------------------------------------------
   Purpose:
   - Normalize preview placement config.
   - Resolve side/bottom placement and compute overlay insets.

   Public surface (ESM export):
   - DEFAULT_PREVIEW_CONFIG
   - normalizePreviewConfig(candidate)
   - resolvePreviewPlacement(config)
   - applyPreviewPlacementClasses(panel, isOpen, placement)
   - computePreviewInsets(panel, isOpen, placement)
   ============================================================ */

import { isPlainObject, normalizeBool } from '../helpers/atlas-shared.js';

/* ============================================================
   1) MODULE INIT
   ============================================================ */

window.TDW = window.TDW || {};
window.TDW.Atlas = window.TDW.Atlas || {};

const SCOPE = 'ATLAS PREVIEW-PLACEMENT';
const { dlog = () => {}, dwarn = () => {},
  derror = (...args) => console.error('[TDW ATLAS FATAL]', `[${SCOPE}]`, ...args),
} = window.TDW?.Logger?.createScopedLogger?.(SCOPE) || {};

const DEFAULT_SWITCH_RATIO = 0.85;

export const DEFAULT_PREVIEW_CONFIG = Object.freeze({
  mapId: '',
  showRegionPreview: true,
  showCountryPreview: true,
  desktopSide: 'right',
  switchToBottomMaxWHRatio: DEFAULT_SWITCH_RATIO,
});

void dlog;
void dwarn;
void derror;

/* ============================================================
   2) FUNCTIONS
   ============================================================ */

/**
 * @param {unknown} candidate
 * @returns {{mapId:string,showRegionPreview:boolean,showCountryPreview:boolean,desktopSide:'left'|'right',switchToBottomMaxWHRatio:number}}
 */
export function normalizePreviewConfig(candidate) {
  const config = isPlainObject(candidate) ? candidate : {};
  const sideRaw = String(config.desktopSide || DEFAULT_PREVIEW_CONFIG.desktopSide).trim().toLowerCase();
  const desktopSide = sideRaw === 'left' ? 'left' : 'right';
  const ratioRaw = Number(config.switchToBottomMaxWHRatio ?? DEFAULT_SWITCH_RATIO);
  const switchToBottomMaxWHRatio = Number.isFinite(ratioRaw) && ratioRaw > 0 ? ratioRaw : DEFAULT_SWITCH_RATIO;

  return {
    mapId: String(config.mapId || DEFAULT_PREVIEW_CONFIG.mapId).trim(),
    showRegionPreview: normalizeBool(config.showRegionPreview, DEFAULT_PREVIEW_CONFIG.showRegionPreview),
    showCountryPreview: normalizeBool(config.showCountryPreview, DEFAULT_PREVIEW_CONFIG.showCountryPreview),
    desktopSide,
    switchToBottomMaxWHRatio,
  };
}

/**
 * @param {{switchToBottomMaxWHRatio:number,desktopSide:'left'|'right'}} config
 * @returns {{mode:'side'|'bottom',side:'left'|'right',ratio:number}}
 */
export function resolvePreviewPlacement(config) {
  const width = Number(window.innerWidth || document.documentElement?.clientWidth || 1);
  const height = Number(window.innerHeight || document.documentElement?.clientHeight || 1);
  const ratio = height > 0 ? (width / height) : 1;
  const mode = ratio < config.switchToBottomMaxWHRatio ? 'bottom' : 'side';
  return {
    mode,
    side: config.desktopSide,
    ratio,
  };
}

/**
 * @param {HTMLElement} panel
 * @param {boolean} isOpen
 * @param {{mode:'side'|'bottom',side:'left'|'right'}} placement
 */
export function applyPreviewPlacementClasses(panel, isOpen, placement) {
  panel.classList.toggle('tdw-atlas-preview--open', isOpen);
  panel.classList.toggle('tdw-atlas-preview--bottom', placement.mode === 'bottom');
  panel.classList.toggle('tdw-atlas-preview--side-left', placement.mode === 'side' && placement.side === 'left');
  panel.classList.toggle('tdw-atlas-preview--side-right', placement.mode === 'side' && placement.side === 'right');
}

/**
 * @param {HTMLElement} panel
 * @param {boolean} isOpen
 * @param {{mode:'side'|'bottom',side:'left'|'right'}} placement
 * @returns {{top:number,right:number,bottom:number,left:number}}
 */
export function computePreviewInsets(panel, isOpen, placement) {
  if (!isOpen) {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }

  const rect = panel.getBoundingClientRect();
  const width = Math.max(0, Math.ceil(Number(rect.width || 0)));
  const height = Math.max(0, Math.ceil(Number(rect.height || 0)));
  const gap = 12;

  if (placement.mode === 'bottom') {
    return {
      top: 0,
      right: 0,
      bottom: height > 0 ? height + gap : 0,
      left: 0,
    };
  }

  if (placement.side === 'left') {
    return {
      top: 0,
      right: 0,
      bottom: 0,
      left: width > 0 ? width + gap : 0,
    };
  }

  return {
    top: 0,
    right: width > 0 ? width + gap : 0,
    bottom: 0,
    left: 0,
  };
}

/* ============================================================
   3) PUBLIC API
   ============================================================ */

// Exported preview placement helpers are declared inline above.

/* ============================================================
   4) AUTO-RUN
   ============================================================ */

// No autorun logic by design.
