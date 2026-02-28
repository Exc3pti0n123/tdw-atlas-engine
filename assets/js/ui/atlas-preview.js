/* ============================================================
   Module: TDW Atlas Engine — Preview Overlay
   ------------------------------------------------------------
   Purpose:
   - Provide adapter-agnostic preview overlay lifecycle.
   - Handle responsive side/bottom placement.
   - Render fetched placeholder content.

   Public surface:
   - create({ rootEl, config, onClose })
   ============================================================ */

import { fetchPreview } from './atlas-preview-content.js';
import { createPreviewDom, bindPreviewDomEvents, unbindPreviewDomEvents } from './atlas-preview-dom.js';
import {
  DEFAULT_PREVIEW_CONFIG,
  normalizePreviewConfig,
  resolvePreviewPlacement,
  applyPreviewPlacementClasses,
  computePreviewInsets,
} from './atlas-preview-placement.js';

/* ============================================================
   1) MODULE INIT
   ============================================================ */

window.TDW = window.TDW || {};
window.TDW.Atlas = window.TDW.Atlas || {};
window.TDW.Atlas.UI = window.TDW.Atlas.UI || {};

const SCOPE = 'ATLAS PREVIEW';

const { dlog = () => {}, dwarn = () => {},
  derror = (...args) => console.error('[TDW ATLAS FATAL]', `[${SCOPE}]`, ...args),
} = window.TDW?.Logger?.createScopedLogger?.(SCOPE) || {};

/* ============================================================
   2) FUNCTIONS
   ============================================================ */

/**
 * @param {{rootEl:HTMLElement,config?:object,onClose?:(ctx:{reason:string,scope:string,key:string})=>void}} params
 * @returns {{open: Function, close: Function, reposition: Function, getInsets: Function, destroy: Function}}
 */
export function create({ rootEl, config = {}, onClose = null } = {}) {
  if (!(rootEl instanceof HTMLElement)) {
    // ATTENTION: intentional hard-stop for diagnosability; runtime could continue by skipping preview overlay.
    throw new Error('Preview create() requires rootEl HTMLElement.');
  }

  const normalized = normalizePreviewConfig(config);
  const state = {
    isOpen: false,
    scope: '',
    key: '',
    mode: 'side',
    side: normalized.desktopSide,
    requestId: 0,
  };

  const dom = createPreviewDom(rootEl);

  /**
   * @returns {{mode:'side'|'bottom',side:'left'|'right',ratio:number}}
   */
  function applyPlacement() {
    const placement = resolvePreviewPlacement(normalized);
    state.mode = placement.mode;
    state.side = placement.side;
    applyPreviewPlacementClasses(dom.panel, state.isOpen, placement);
    return placement;
  }

  /**
   * @param {string} title
   * @param {string} teaser
   * @param {string} readMoreUrl
   */
  function renderContent(title, teaser, readMoreUrl) {
    dom.titleEl.textContent = title;
    dom.teaserEl.textContent = teaser;
    dom.readMoreEl.href = readMoreUrl || '#';
  }

  /**
   * Compute overlay occlusion in pixels.
   * Consumers can use this to offset map fit/fly bounds.
   *
   * @returns {{top:number,right:number,bottom:number,left:number}}
   */
  function getInsets() {
    const placement = {
      mode: state.mode === 'bottom' ? 'bottom' : 'side',
      side: state.side === 'left' ? 'left' : 'right',
    };

    return computePreviewInsets(dom.panel, state.isOpen, placement);
  }

  /**
   * @param {{scope:'region'|'country',key:string,titleHint?:string}} params
   * @returns {Promise<void>}
   */
  async function open({ scope, key, titleHint = '' } = {}) {
    const normalizedScope = String(scope || '').trim().toLowerCase();
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey || (normalizedScope !== 'region' && normalizedScope !== 'country')) {
      // ATTENTION: intentional hard-stop for diagnosability; runtime could continue by ignoring invalid preview request.
      throw new Error('Preview open() requires scope(region|country) and key.');
    }

    if (normalizedScope === 'region' && !normalized.showRegionPreview) {
      state.isOpen = false;
      applyPlacement();
      return;
    }

    if (normalizedScope === 'country' && !normalized.showCountryPreview) {
      state.isOpen = false;
      applyPlacement();
      return;
    }

    state.requestId += 1;
    const requestId = state.requestId;
    state.scope = normalizedScope;
    state.key = normalizedKey;
    state.isOpen = true;
    renderContent(String(titleHint || normalizedKey), 'Loading preview…', '#');
    applyPlacement();

    dlog('open()', { scope: normalizedScope, key: normalizedKey, mapId: normalized.mapId || null });

    const payload = await fetchPreview({
      mapId: normalized.mapId,
      scope: /** @type {'region'|'country'} */ (normalizedScope),
      key: normalizedKey,
      titleHint,
    });

    if (requestId !== state.requestId) {
      // Newer request already replaced this one.
      return;
    }

    renderContent(
      String(payload?.title || titleHint || normalizedKey),
      String(payload?.teaser || `Hello ${String(payload?.title || titleHint || normalizedKey)}`),
      String(payload?.readMoreUrl || '#')
    );
    applyPlacement();
  }

  /**
   * @param {{reason?:string, notify?:boolean}} params
   */
  function close({ reason = 'programmatic', notify = true } = {}) {
    if (!state.isOpen && reason !== 'destroy') return;

    const prevScope = state.scope;
    const prevKey = state.key;
    state.isOpen = false;
    state.scope = '';
    state.key = '';
    applyPlacement();
    renderContent('', '', '#');

    dlog('close()', { reason });

    if (notify && typeof onClose === 'function') {
      try {
        onClose({ reason, scope: prevScope, key: prevKey });
      } catch (err) {
        dwarn('Preview onClose callback threw unexpectedly.', { err });
      }
    }
  }

  /**
   * @returns {void}
   */
  function reposition() {
    applyPlacement();
    if (!state.isOpen) return;
    dlog('reposition()', { mode: state.mode, side: state.side });
  }

  /**
   * @returns {void}
   */
  function onCloseClick(event) {
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
    close({ reason: 'user-close', notify: true });
  }

  /**
   * @param {MouseEvent} event
   */
  function onReadMoreClick(event) {
    if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
  }

  /**
   * Prevent click-through into the map beneath the preview overlay.
   *
   * @param {Event} event
   */
  function stopPanelPropagation(event) {
    if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
  }

  /**
   * @returns {void}
   */
  function onWindowResize() {
    reposition();
  }

  /**
   * @returns {void}
   */
  function destroy() {
    close({ reason: 'destroy', notify: false });

    try {
      unbindPreviewDomEvents(dom, {
        onCloseClick,
        onReadMoreClick,
        stopPanelPropagation,
      });
      window.removeEventListener('resize', onWindowResize);
      dom.panel.remove();
    } catch (err) {
      derror('destroy() failed unexpectedly.', { err });
    }
  }

  bindPreviewDomEvents(dom, {
    onCloseClick,
    onReadMoreClick,
    stopPanelPropagation,
  });
  window.addEventListener('resize', onWindowResize);
  applyPlacement();

  return {
    open,
    close,
    reposition,
    getInsets,
    destroy,
  };
}

/* ============================================================
   3) PUBLIC API
   ============================================================ */

// Exported preview API is declared inline above.

/* ============================================================
   4) AUTO-RUN
   ============================================================ */

// No autorun logic by design.
