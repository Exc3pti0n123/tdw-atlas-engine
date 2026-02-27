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

/* ============================================================
   1) MODULE INIT
   ============================================================ */

window.TDW = window.TDW || {};
window.TDW.Atlas = window.TDW.Atlas || {};
window.TDW.Atlas.UI = window.TDW.Atlas.UI || {};

const SCOPE = 'ATLAS PREVIEW';
const DEFAULT_SWITCH_RATIO = 0.85;
const DEFAULT_CONFIG = Object.freeze({
  mapId: '',
  showRegionPreview: true,
  showCountryPreview: true,
  desktopSide: 'right',
  switchToBottomMaxWHRatio: DEFAULT_SWITCH_RATIO,
});

const {
  log: _log = () => {},
  warn: _warn = () => {},
  error: _error = (scope, el, message, ...meta) => console.error('[TDW ATLAS FATAL]', message, ...meta),
} = window?.TDW?._logger || {};

const dlog = (...args) => _log(SCOPE, ...args);
const dwarn = (...args) => _warn(SCOPE, ...args);
const derror = (message, ...meta) => _error(SCOPE, null, message, ...meta);

/* ============================================================
   2) FUNCTIONS
   ============================================================ */

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @param {boolean} fallback
 * @returns {boolean}
 */
function normalizeBool(value, fallback) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  const raw = String(value || '').trim().toLowerCase();
  if (raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on') return true;
  if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'off') return false;
  return Boolean(fallback);
}

/**
 * @param {unknown} candidate
 * @returns {{mapId:string,showRegionPreview:boolean,showCountryPreview:boolean,desktopSide:'left'|'right',switchToBottomMaxWHRatio:number}}
 */
function normalizeConfig(candidate) {
  const config = isPlainObject(candidate) ? candidate : {};
  const sideRaw = String(config.desktopSide || DEFAULT_CONFIG.desktopSide).trim().toLowerCase();
  const desktopSide = sideRaw === 'left' ? 'left' : 'right';
  const ratioRaw = Number(config.switchToBottomMaxWHRatio ?? DEFAULT_SWITCH_RATIO);
  const switchToBottomMaxWHRatio = Number.isFinite(ratioRaw) && ratioRaw > 0 ? ratioRaw : DEFAULT_SWITCH_RATIO;

  return {
    mapId: String(config.mapId || DEFAULT_CONFIG.mapId).trim(),
    showRegionPreview: normalizeBool(config.showRegionPreview, DEFAULT_CONFIG.showRegionPreview),
    showCountryPreview: normalizeBool(config.showCountryPreview, DEFAULT_CONFIG.showCountryPreview),
    desktopSide,
    switchToBottomMaxWHRatio,
  };
}

/**
 * @param {{switchToBottomMaxWHRatio:number,desktopSide:'left'|'right'}} config
 * @returns {{mode:'side'|'bottom',side:'left'|'right',ratio:number}}
 */
function resolvePlacement(config) {
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
 * @param {HTMLElement} rootEl
 * @returns {{panel:HTMLElement,titleEl:HTMLElement,teaserEl:HTMLElement,readMoreEl:HTMLAnchorElement,closeBtn:HTMLButtonElement}}
 */
function createDom(rootEl) {
  const panel = document.createElement('aside');
  panel.className = 'tdw-atlas-preview';
  panel.setAttribute('aria-live', 'polite');

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'tdw-atlas-preview__close';
  closeBtn.setAttribute('aria-label', 'Close preview');
  closeBtn.textContent = '×';

  const titleEl = document.createElement('h3');
  titleEl.className = 'tdw-atlas-preview__title';

  const teaserEl = document.createElement('p');
  teaserEl.className = 'tdw-atlas-preview__teaser';

  const readMoreEl = document.createElement('a');
  readMoreEl.className = 'tdw-atlas-preview__readmore';
  readMoreEl.textContent = 'Read more';
  readMoreEl.href = '#';

  panel.appendChild(closeBtn);
  panel.appendChild(titleEl);
  panel.appendChild(teaserEl);
  panel.appendChild(readMoreEl);
  rootEl.appendChild(panel);

  return { panel, titleEl, teaserEl, readMoreEl, closeBtn };
}

/* ============================================================
   3) PUBLIC API
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

  const normalized = normalizeConfig(config);
  const state = {
    isOpen: false,
    scope: '',
    key: '',
    mode: 'side',
    side: normalized.desktopSide,
    requestId: 0,
  };

  const dom = createDom(rootEl);

  /**
   * @returns {void}
   */
  function applyPlacement() {
    const placement = resolvePlacement(normalized);
    state.mode = placement.mode;
    state.side = placement.side;

    dom.panel.classList.toggle('tdw-atlas-preview--open', state.isOpen);
    dom.panel.classList.toggle('tdw-atlas-preview--bottom', placement.mode === 'bottom');
    dom.panel.classList.toggle('tdw-atlas-preview--side-left', placement.mode === 'side' && placement.side === 'left');
    dom.panel.classList.toggle('tdw-atlas-preview--side-right', placement.mode === 'side' && placement.side === 'right');
  }

  /**
   * @param {string} title
   * @param {string} teaser
   * @param {string} readMoreUrl
   * @returns {void}
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
    if (!state.isOpen) {
      return { top: 0, right: 0, bottom: 0, left: 0 };
    }

    const rect = dom.panel.getBoundingClientRect();
    const width = Math.max(0, Math.ceil(Number(rect.width || 0)));
    const height = Math.max(0, Math.ceil(Number(rect.height || 0)));
    const gap = 12;

    if (state.mode === 'bottom') {
      return {
        top: 0,
        right: 0,
        bottom: height > 0 ? height + gap : 0,
        left: 0,
      };
    }

    if (state.side === 'left') {
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
   * @returns {void}
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
  function destroy() {
    close({ reason: 'destroy', notify: false });
    try {
      dom.closeBtn.removeEventListener('click', onCloseClick);
      dom.readMoreEl.removeEventListener('click', onReadMoreClick);
      dom.panel.removeEventListener('pointerdown', stopPanelPropagation);
      dom.panel.removeEventListener('click', stopPanelPropagation);
      dom.panel.removeEventListener('dblclick', stopPanelPropagation);
      dom.panel.removeEventListener('contextmenu', stopPanelPropagation);
      dom.panel.removeEventListener('touchstart', stopPanelPropagation);
      window.removeEventListener('resize', onWindowResize);
      dom.panel.remove();
    } catch (err) {
      derror('destroy() failed unexpectedly.', { err });
    }
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

  dom.closeBtn.addEventListener('click', onCloseClick);
  dom.readMoreEl.addEventListener('click', onReadMoreClick);
  dom.panel.addEventListener('pointerdown', stopPanelPropagation);
  dom.panel.addEventListener('click', stopPanelPropagation);
  dom.panel.addEventListener('dblclick', stopPanelPropagation);
  dom.panel.addEventListener('contextmenu', stopPanelPropagation);
  dom.panel.addEventListener('touchstart', stopPanelPropagation);
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
   4) AUTO-RUN
   ============================================================ */

// No autorun logic by design.
