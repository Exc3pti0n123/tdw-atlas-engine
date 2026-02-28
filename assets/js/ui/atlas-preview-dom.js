/* ============================================================
   Module: TDW Atlas Engine — Preview DOM
   ------------------------------------------------------------
   Purpose:
   - Build preview DOM elements.
   - Bind/unbind preview DOM events.

   Public surface (ESM export):
   - createPreviewDom(rootEl)
   - bindPreviewDomEvents(dom, handlers)
   - unbindPreviewDomEvents(dom, handlers)
   ============================================================ */

/* ============================================================
   1) MODULE INIT
   ============================================================ */

window.TDW = window.TDW || {};
window.TDW.Atlas = window.TDW.Atlas || {};

const SCOPE = 'ATLAS PREVIEW-DOM';
const { dlog = () => {}, dwarn = () => {},
  derror = (...args) => console.error('[TDW ATLAS FATAL]', `[${SCOPE}]`, ...args),
} = window.TDW?.Logger?.createScopedLogger?.(SCOPE) || {};

// No module state required; logger shorthand is kept for consistent module contracts.
void dlog;
void dwarn;
void derror;

/* ============================================================
   2) FUNCTIONS
   ============================================================ */

/**
 * @param {HTMLElement} rootEl
 * @returns {{panel:HTMLElement,titleEl:HTMLElement,teaserEl:HTMLElement,readMoreEl:HTMLAnchorElement,closeBtn:HTMLButtonElement}}
 */
export function createPreviewDom(rootEl) {
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

/**
 * @param {{panel:HTMLElement,readMoreEl:HTMLAnchorElement,closeBtn:HTMLButtonElement}} dom
 * @param {{onCloseClick: EventListener, onReadMoreClick: EventListener, stopPanelPropagation: EventListener}} handlers
 */
export function bindPreviewDomEvents(dom, handlers) {
  dom.closeBtn.addEventListener('click', handlers.onCloseClick);
  dom.readMoreEl.addEventListener('click', handlers.onReadMoreClick);
  dom.panel.addEventListener('pointerdown', handlers.stopPanelPropagation);
  dom.panel.addEventListener('click', handlers.stopPanelPropagation);
  dom.panel.addEventListener('dblclick', handlers.stopPanelPropagation);
  dom.panel.addEventListener('contextmenu', handlers.stopPanelPropagation);
  dom.panel.addEventListener('touchstart', handlers.stopPanelPropagation);
}

/**
 * @param {{panel:HTMLElement,readMoreEl:HTMLAnchorElement,closeBtn:HTMLButtonElement}} dom
 * @param {{onCloseClick: EventListener, onReadMoreClick: EventListener, stopPanelPropagation: EventListener}} handlers
 */
export function unbindPreviewDomEvents(dom, handlers) {
  dom.closeBtn.removeEventListener('click', handlers.onCloseClick);
  dom.readMoreEl.removeEventListener('click', handlers.onReadMoreClick);
  dom.panel.removeEventListener('pointerdown', handlers.stopPanelPropagation);
  dom.panel.removeEventListener('click', handlers.stopPanelPropagation);
  dom.panel.removeEventListener('dblclick', handlers.stopPanelPropagation);
  dom.panel.removeEventListener('contextmenu', handlers.stopPanelPropagation);
  dom.panel.removeEventListener('touchstart', handlers.stopPanelPropagation);
}

/* ============================================================
   3) PUBLIC API
   ============================================================ */

// Exported DOM helpers are declared inline above.

/* ============================================================
   4) AUTO-RUN
   ============================================================ */

// No autorun logic by design.
