/* ============================================================
   Module: TDW Atlas Engine — Preview Content Loader
   ------------------------------------------------------------
   Purpose:
   - Fetch placeholder preview content from REST endpoint.
   - Provide local fallback when network/request fails.

   Public surface:
   - fetchPreview({ mapId, scope, key, titleHint })
   ============================================================ */


/* ============================================================
   1) MODULE INIT
   ============================================================ */

window.TDW = window.TDW || {};
window.TDW.Atlas = window.TDW.Atlas || {};
window.TDW.Atlas.UI = window.TDW.Atlas.UI || {};

const SCOPE = 'ATLAS PREVIEW-CONTENT';

const { dlog, dwarn, derror } = window?.TDW?.Logger?.createScopedLogger?.(SCOPE) || {
  dlog: () => {},
  dwarn: () => {},
  derror: (...args) => console.error('[TDW ATLAS FATAL]', `[${SCOPE}]`, ...args),
};

/* ============================================================
   2) FUNCTIONS
   ============================================================ */

/**
 * @param {string} mapId
 * @param {'region'|'country'} scope
 * @param {string} key
 * @returns {string}
 */
function buildPreviewUrl(mapId, scope, key) {
  const base = new URL('/wp-json/tdw-atlas/v1/preview', window.location.origin);
  base.searchParams.set('map_id', mapId);
  base.searchParams.set('scope', scope);
  base.searchParams.set('key', key);
  return base.href;
}

/**
 * @param {{mapId:string,scope:'region'|'country',key:string,titleHint?:string}} params
 * @returns {{mapId:string,scope:string,key:string,title:string,teaser:string,readMoreUrl:string,placeholder:boolean}}
 */
function buildLocalFallback(params) {
  const title = String(params?.titleHint || params?.key || '').trim() || 'Unknown';
  return {
    mapId: String(params?.mapId || '').trim(),
    scope: String(params?.scope || 'country').trim(),
    key: String(params?.key || '').trim(),
    title,
    teaser: `Hello ${title}`,
    readMoreUrl: '#',
    placeholder: true,
  };
}

/* ============================================================
   3) PUBLIC API
   ============================================================ */

/**
 * @param {{mapId:string,scope:'region'|'country',key:string,titleHint?:string}} params
 * @returns {Promise<{mapId:string,scope:string,key:string,title:string,teaser:string,readMoreUrl:string,placeholder:boolean}>}
 */
export async function fetchPreview(params) {
  const mapId = String(params?.mapId || '').trim();
  const scope = String(params?.scope || '').trim().toLowerCase();
  const key = String(params?.key || '').trim();

  if (!mapId || (scope !== 'region' && scope !== 'country') || !key) {
    // ATTENTION: intentional hard-stop for diagnosability; runtime could continue with silent placeholder.
    throw new Error('Preview fetch requires mapId, scope(region|country), and key.');
  }

  const url = buildPreviewUrl(mapId, /** @type {'region'|'country'} */ (scope), key);
  dlog('fetchPreview()', { mapId, scope, key, url });

  try {
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) {
      dwarn('Preview endpoint returned non-OK; fallback placeholder used.', {
        mapId,
        scope,
        key,
        status: res.status,
      });
      return buildLocalFallback({ mapId, scope: /** @type {'region'|'country'} */ (scope), key, titleHint: params?.titleHint });
    }

    const json = await res.json();
    if (!json || typeof json !== 'object') {
      dwarn('Preview endpoint returned invalid JSON; fallback placeholder used.', { mapId, scope, key });
      return buildLocalFallback({ mapId, scope: /** @type {'region'|'country'} */ (scope), key, titleHint: params?.titleHint });
    }

    return {
      mapId: String(json.mapId || mapId),
      scope: String(json.scope || scope),
      key: String(json.key || key),
      title: String(json.title || params?.titleHint || key),
      teaser: String(json.teaser || `Hello ${String(json.title || params?.titleHint || key)}`),
      readMoreUrl: String(json.readMoreUrl || '#'),
      placeholder: Boolean(json.placeholder ?? true),
    };
  } catch (err) {
    derror('fetchPreview failed; fallback placeholder used.', { mapId, scope, key, err });
    return buildLocalFallback({ mapId, scope: /** @type {'region'|'country'} */ (scope), key, titleHint: params?.titleHint });
  }
}

/* ============================================================
   4) AUTO-RUN
   ============================================================ */

// No autorun logic by design.
