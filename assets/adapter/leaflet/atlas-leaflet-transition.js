/* ============================================================
   Module: TDW Atlas Engine — Leaflet Transition Controller
   ------------------------------------------------------------
   Purpose:
   - Provide atomic/tokenezed stage transitions for Leaflet runtime.
   - Ensure only the latest transition may commit state/layer/preview.
   ============================================================ */

import { normalizeCountryCode, normalizeGroupId } from './atlas-leaflet-focus.js';

/* ============================================================
   1) MODULE INIT
   ============================================================ */

const SCOPE = 'ATLAS LF-TRANSITION';

const { dlog = () => {}, dwarn = () => {},
  derror = (...args) => console.error('[TDW ATLAS FATAL]', `[${SCOPE}]`, ...args),
} = window.TDW?.Logger?.createScopedLogger?.(SCOPE) || {};

/* ============================================================
   2) FUNCTIONS
   ============================================================ */

/**
 * @typedef {object} TransitionContext
 * @property {Function} getMap
 * @property {Function} resolveStageBoundsOptions
 * @property {Function} getWorldBounds
 * @property {Function} getActiveGroupId
 * @property {Function} getCountryGrouping
 * @property {Function} resolveGroupFocusBounds
 * @property {Function} resolveCountryFocusBounds
 * @property {Function} commitWorld
 * @property {Function} commitRegion
 * @property {Function} commitCountry
 * @property {Function} onContractError
 */

/**
 * @param {TransitionContext} ctx
 * @returns {{
 *   enterWorldStage: Function,
 *   enterRegionStage: Function,
 *   enterCountryStage: Function,
 *   cancelPendingTransition: Function,
 *   destroy: Function
 * }}
 */
export function createTransitionController(ctx) {
  let pendingMoveHandler = null;
  let pendingMoveFallbackTimer = null;
  let activeTransitionToken = 0;

  /**
   * @returns {object|null}
   */
  function getMap() {
    return typeof ctx?.getMap === 'function' ? (ctx.getMap() || null) : null;
  }

  /**
   * @param {number|null} [token]
   */
  function clearPendingHandlers(token = null) {
    const map = getMap();
    if (map && typeof map.off === 'function' && typeof pendingMoveHandler === 'function') {
      map.off('moveend', pendingMoveHandler);
    }
    pendingMoveHandler = null;
    if (pendingMoveFallbackTimer) {
      window.clearTimeout(pendingMoveFallbackTimer);
      pendingMoveFallbackTimer = null;
    }
    if (Number.isFinite(token)) {
      dlog('Transition handlers cleared.', { token });
    }
  }

  /**
   * @returns {number}
   */
  function beginTransitionToken() {
    activeTransitionToken += 1;
    clearPendingHandlers(activeTransitionToken);
    return activeTransitionToken;
  }

  /**
   * @param {{targetBounds?:object|Array|null,boundsOptions?:object,reason?:string,onCommit:Function}} params
   */
  function runTransition({
    targetBounds = null,
    boundsOptions = null,
    reason = 'transition',
    onCommit,
  }) {
    const map = getMap();
    if (!map) return;

    const token = beginTransitionToken();
    const commit = () => {
      if (token !== activeTransitionToken) {
        dlog('Ignoring stale transition commit.', { token, reason });
        return;
      }
      clearPendingHandlers(token);
      onCommit();
    };

    if (!targetBounds) {
      commit();
      return;
    }

    pendingMoveHandler = () => {
      commit();
    };

    if (typeof map.on === 'function') {
      map.on('moveend', pendingMoveHandler);
    }

    if (typeof map.flyToBounds === 'function') {
      map.flyToBounds(targetBounds, {
        paddingTopLeft: boundsOptions?.paddingTopLeft || [0, 0],
        paddingBottomRight: boundsOptions?.paddingBottomRight || [0, 0],
        duration: 0.42,
      });
      pendingMoveFallbackTimer = window.setTimeout(() => {
        commit();
      }, 900);
      return;
    }

    map.fitBounds(targetBounds, {
      paddingTopLeft: boundsOptions?.paddingTopLeft || [0, 0],
      paddingBottomRight: boundsOptions?.paddingBottomRight || [0, 0],
      animate: true,
    });
    pendingMoveFallbackTimer = window.setTimeout(() => {
      commit();
    }, 700);
  }

  /**
   * @param {{reason?:string}} [params]
   */
  function enterWorldStage(params = {}) {
    const reason = String(params.reason || 'world-transition');
    const worldBounds = typeof ctx?.getWorldBounds === 'function' ? (ctx.getWorldBounds() || null) : null;
    const boundsOptions = typeof ctx?.resolveStageBoundsOptions === 'function'
      ? ctx.resolveStageBoundsOptions('world')
      : null;

    runTransition({
      targetBounds: worldBounds,
      boundsOptions,
      reason,
      onCommit: () => {
        if (typeof ctx?.commitWorld === 'function') {
          ctx.commitWorld({ reason });
        }
      },
    });
  }

  /**
   * @param {{groupId:string,bounds?:object|Array|null,reason?:string}} params
   */
  function enterRegionStage({ groupId, bounds = null, reason = 'region-transition' }) {
    const normalizedGroupId = normalizeGroupId(groupId);
    const targetBounds = bounds || (
      typeof ctx?.resolveGroupFocusBounds === 'function'
        ? (ctx.resolveGroupFocusBounds(normalizedGroupId) || null)
        : null
    );

    if (!normalizedGroupId || !targetBounds) {
      const message = 'Leaflet adapter: enterRegionStage missing group/bounds.';
      const meta = { groupId: normalizedGroupId, reason };
      if (typeof ctx?.onContractError === 'function') {
        ctx.onContractError(message, meta);
      } else {
        derror(message, meta);
      }
      return;
    }

    const boundsOptions = typeof ctx?.resolveStageBoundsOptions === 'function'
      ? ctx.resolveStageBoundsOptions('region')
      : null;

    runTransition({
      targetBounds,
      boundsOptions,
      reason,
      onCommit: () => {
        if (typeof ctx?.commitRegion === 'function') {
          ctx.commitRegion({
            groupId: normalizedGroupId,
            targetBounds,
            reason,
          });
        }
      },
    });
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
  function enterCountryStage({
    countryCode,
    groupId = '',
    bounds = null,
    titleHint = '',
    reason = 'country-transition',
  }) {
    const normalizedCountryCode = normalizeCountryCode(countryCode);
    const inferredGroupId = normalizeGroupId(
      groupId
      || ctx?.getCountryGrouping?.()?.countryToRegion?.[normalizedCountryCode]
      || ctx?.getActiveGroupId?.()
      || ''
    );
    const countryBounds = bounds || (
      typeof ctx?.resolveCountryFocusBounds === 'function'
        ? (ctx.resolveCountryFocusBounds(normalizedCountryCode) || null)
        : null
    );
    const regionBounds = typeof ctx?.resolveGroupFocusBounds === 'function'
      ? (ctx.resolveGroupFocusBounds(inferredGroupId) || null)
      : null;

    if (!normalizedCountryCode || !inferredGroupId || !countryBounds || !regionBounds) {
      const message = 'Leaflet adapter: enterCountryStage missing contract fields.';
      const meta = {
        countryCode: normalizedCountryCode,
        groupId: inferredGroupId,
        reason,
      };
      if (typeof ctx?.onContractError === 'function') {
        ctx.onContractError(message, meta);
      } else {
        derror(message, meta);
      }
      return;
    }

    const boundsOptions = typeof ctx?.resolveStageBoundsOptions === 'function'
      ? ctx.resolveStageBoundsOptions('country')
      : null;

    runTransition({
      targetBounds: countryBounds,
      boundsOptions,
      reason,
      onCommit: () => {
        if (typeof ctx?.commitCountry === 'function') {
          ctx.commitCountry({
            countryCode: normalizedCountryCode,
            groupId: inferredGroupId,
            regionBounds,
            titleHint,
            reason,
          });
        }
      },
    });
  }

  /**
   * Cancel any pending moveend-driven commit.
   */
  function cancelPendingTransition() {
    activeTransitionToken += 1;
    clearPendingHandlers(activeTransitionToken);
  }

  return {
    enterWorldStage,
    enterRegionStage,
    enterCountryStage,
    cancelPendingTransition,
    destroy: cancelPendingTransition,
  };
}

/* ============================================================
   3) PUBLIC API
   ============================================================ */

// Exported transition helper surface is defined inline above.

/* ============================================================
   4) AUTO-RUN
   ============================================================ */

// No autorun side effects.
