/* ============================================================
   1) MODULE INIT
   ============================================================ */

const SCOPE = 'ATLAS ADMIN';
const { dlog = () => {}, dwarn = () => {},
  derror = (...args) => console.error('[TDW ATLAS FATAL]', `[${SCOPE}]`, ...args),
} = window.TDW?.Logger?.createScopedLogger?.(SCOPE) || {};

const cfg = window.TDW_ATLAS_ADMIN_CONFIG || {};
const MAP_KEY_RE = /^[a-z0-9_-]{1,64}$/;
const AUTO_SAVE_MS = Number.isFinite(Number(cfg.autosaveDebounceMs)) ? Number(cfg.autosaveDebounceMs) : 800;
const MAP_KEY_PREVIEW_MAX = 8;
const TITLE_PREVIEW_MAX = 32;
const CREATE_LABEL_MAX = 32;
const CREATE_MAP_KEY_MAX = 8;
const EDIT_LABEL_MAX = 32;
const GENERAL_FIELD_ID_BY_NAME = {
  mapKey: 'tdw-map-key',
  label: 'tdw-label',
  description: 'tdw-description',
  datasetKey: 'tdw-dataset',
  geojson: 'tdw-geojson',
  adapter: 'tdw-adapter',
  view: 'tdw-view',
  groupingSetKey: 'tdw-grouping-set',
  groupingGeojsonProperty: 'tdw-grouping-prop',
  preprocessDataJson: 'tdw-preprocess-data-json',
  partRulesJson: 'tdw-part-rules-json',
  focusJson: 'tdw-focus-json',
  uiJson: 'tdw-ui-json',
  mapOptionsJson: 'tdw-map-options-json',
  styleJson: 'tdw-style-json',
};

const state = {
  loading: true,
  busy: false,
  error: '',
  success: '',
  maps: [],
  datasets: [],
  mapDefaults: {},
  selectedMapKey: String(cfg.selectedMapKey || ''),
  mode: String(cfg.viewMode || 'list') === 'edit' ? 'edit' : 'list',
  editTab: 'general',
  editMap: null,
  countriesPayload: null,
  timers: {
    general: null,
    countries: null,
  },
  dirty: {
    general: false,
    countries: false,
  },
  saveState: {
    general: { status: 'saved', message: '' },
    countries: { status: 'saved', message: '' },
  },
  countryUpdates: {},
  ui: {
    newModalOpen: false,
    deleteModalOpen: false,
    newForm: null,
    newFormManualId: false,
    deleteSelection: {},
  },
};

/* ============================================================
   2) FUNCTIONS
   ============================================================ */

/**
 * Escape HTML text for safe interpolation.
 *
 * @param {unknown} value
 * @returns {string}
 */
function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

/**
 * Clone plain JSON data.
 *
 * @template T
 * @param {T} value
 * @returns {T}
 */
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * Serialize data for textarea JSON inputs.
 *
 * @param {unknown} value
 * @returns {string}
 */
function toPrettyJson(value) {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return '{}';
  }
}

/**
 * Decode JSON-like string values to plain JS values.
 *
 * @param {unknown} value
 * @returns {unknown}
 */
function decodeJsonCandidate(value) {
  if (typeof value !== 'string') {
    return value;
  }
  const text = value.trim();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    return value;
  }
}

/**
 * Normalize a value to object-like JSON (or array when allowed).
 *
 * @param {unknown} value
 * @param {boolean} [allowArray]
 * @returns {Record<string, any> | any[]}
 */
function normalizeObjectLike(value, allowArray = false) {
  const decoded = decodeJsonCandidate(value);
  if (decoded === null || decoded === undefined) {
    return {};
  }
  if (Array.isArray(decoded)) {
    return allowArray ? decoded : {};
  }
  if (typeof decoded === 'object') {
    return decoded;
  }
  return {};
}

/**
 * Normalize a value to JSON array.
 *
 * @param {unknown} value
 * @returns {any[]}
 */
function normalizeArrayLike(value) {
  const decoded = decodeJsonCandidate(value);
  if (Array.isArray(decoded)) {
    return decoded;
  }
  return [];
}

/**
 * Parse JSON object text field.
 *
 * @param {string} raw
 * @param {string} field
 * @param {{allowArray?: boolean}} [options]
 * @returns {{ok: true, value: Record<string, any> | any[]} | {ok: false, message: string}}
 */
function parseJsonObject(raw, field, options = {}) {
  const text = String(raw || '').trim();
  if (!text) {
    return { ok: true, value: {} };
  }

  const allowArray = options && options.allowArray === true;

  try {
    const parsed = JSON.parse(text);
    const isObjectLike = parsed && typeof parsed === 'object';
    const isArray = Array.isArray(parsed);
    if (!isObjectLike || (isArray && !allowArray)) {
      return { ok: false, message: `${field} must be a JSON object.` };
    }
    return { ok: true, value: parsed };
  } catch {
    return { ok: false, message: `${field} contains invalid JSON.` };
  }
}

/**
 * Parse JSON array text field.
 *
 * @param {string} raw
 * @param {string} field
 * @returns {{ok: true, value: any[]} | {ok: false, message: string}}
 */
function parseJsonArray(raw, field) {
  const text = String(raw || '').trim();
  if (!text) {
    return { ok: true, value: [] };
  }

  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) {
      return { ok: false, message: `${field} must be a JSON array.` };
    }
    return { ok: true, value: parsed };
  } catch {
    return { ok: false, message: `${field} contains invalid JSON.` };
  }
}

/**
 * Build relative admin endpoint URL.
 *
 * @param {string} path
 * @returns {string}
 */
function adminUrl(path) {
  const base = String(cfg.restBase || '').replace(/\/$/, '');
  const suffix = String(path || '').replace(/^\//, '');
  return `${base}/${suffix}`;
}

/**
 * Build edit URL for one map key.
 *
 * @param {string} mapKey
 * @returns {string}
 */
function editUrl(mapKey) {
  const listUrl = String(cfg.adminListUrl || '').trim();
  if (!listUrl) {
    return `?page=${encodeURIComponent(String(cfg.pageSlug || 'tdw-atlas-admin'))}&id=${encodeURIComponent(mapKey)}`;
  }
  const glue = listUrl.includes('?') ? '&' : '?';
  return `${listUrl}${glue}id=${encodeURIComponent(mapKey)}`;
}

/**
 * Build slug-like map key suggestion from title.
 *
 * @param {string} title
 * @returns {string}
 */
function slugifyMapKey(title) {
  const base = String(title || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s_-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 64);
  return base || 'map';
}

/**
 * Clamp create-title value to configured limit.
 *
 * @param {string} label
 * @returns {string}
 */
function normalizeCreateLabel(label) {
  return String(label || '').slice(0, CREATE_LABEL_MAX);
}

/**
 * Clamp create-map key value to configured limit.
 *
 * @param {string} mapKey
 * @returns {string}
 */
function normalizeCreateMapKey(mapKey) {
  const text = String(mapKey || '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, CREATE_MAP_KEY_MAX);
  return text || 'map';
}

/**
 * Build create-map key suggestion from title.
 *
 * @param {string} title
 * @returns {string}
 */
function suggestCreateMapKey(title) {
  return normalizeCreateMapKey(slugifyMapKey(title));
}

/**
 * Build unique create-map key against current map list.
 *
 * @param {string} baseKey
 * @returns {string}
 */
function nextUniqueCreateMapKey(baseKey) {
  const used = new Set(
    state.maps
      .map((item) => String(item?.mapKey || '').trim())
      .filter((key) => key !== '')
  );

  const base = normalizeCreateMapKey(baseKey);
  if (!used.has(base)) {
    return base;
  }

  for (let i = 2; i < 1000; i += 1) {
    const suffix = `-${i}`;
    const prefix = base.slice(0, Math.max(1, CREATE_MAP_KEY_MAX - suffix.length));
    const candidate = normalizeCreateMapKey(`${prefix}${suffix}`);
    if (!used.has(candidate)) {
      return candidate;
    }
  }

  return normalizeCreateMapKey(`${base.slice(0, CREATE_MAP_KEY_MAX - 1)}9`);
}

/**
 * Truncate text to maximum length with ellipsis.
 *
 * @param {string} value
 * @param {number} maxLength
 * @returns {string}
 */
function truncateText(value, maxLength) {
  const text = String(value || '');
  const max = Number.isFinite(maxLength) ? Math.max(1, Math.floor(maxLength)) : text.length;
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max)}…`;
}

/**
 * Build full shortcode for one map key.
 *
 * @param {string} mapKey
 * @returns {string}
 */
function buildShortcode(mapKey) {
  return `[tdw_atlas id="${String(mapKey || '')}"]`;
}

/**
 * Execute REST request against Atlas admin API.
 *
 * @param {string} path
 * @param {{method?: string, body?: unknown}} options
 * @returns {Promise<any>}
 */
async function api(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const headers = { Accept: 'application/json' };

  if (String(cfg.restNonce || '') !== '') {
    headers['X-WP-Nonce'] = String(cfg.restNonce);
  }

  if (method !== 'GET') {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(adminUrl(path), {
    method,
    headers,
    body: method === 'GET' ? undefined : JSON.stringify(options.body ?? {}),
    credentials: 'same-origin',
  });

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const message = String(payload?.message || `Request failed (${response.status})`);
    const err = new Error(message);
    err.code = String(payload?.code || '');
    throw err;
  }

  return payload;
}

/**
 * Return first supported dataset path or empty string.
 *
 * @returns {string}
 */
function firstSupportedDatasetPath() {
  const first = state.datasets.find((item) => Boolean(item?.supported));
  return first ? String(first.datasetPath || '') : '';
}

/**
 * Build initial new-map form.
 *
 * @returns {{label: string, mapKey: string, datasetPath: string}}
 */
function createEmptyNewForm() {
  const label = normalizeCreateLabel('New Map');
  return {
    label,
    mapKey: suggestCreateMapKey(label),
    datasetPath: firstSupportedDatasetPath(),
  };
}

/**
 * Ensure new-map form exists and dataset remains valid.
 *
 * @returns {void}
 */
function ensureNewForm() {
  if (!state.ui.newForm) {
    state.ui.newForm = createEmptyNewForm();
    state.ui.newFormManualId = false;
    return;
  }

  state.ui.newForm.label = normalizeCreateLabel(state.ui.newForm.label || '');
  state.ui.newForm.mapKey = normalizeCreateMapKey(state.ui.newForm.mapKey || '');

  const selected = String(state.ui.newForm.datasetPath || '');
  const exists = state.datasets.some((item) => String(item.datasetPath || '') === selected && item.supported);
  if (!exists) {
    state.ui.newForm.datasetPath = firstSupportedDatasetPath();
  }

  if (!state.ui.newFormManualId) {
    state.ui.newForm.mapKey = suggestCreateMapKey(state.ui.newForm.label || '');
  }
}

/**
 * Validate new-map form values.
 *
 * @returns {{valid: boolean, errors: string[], invalidFields: string[], payload: {label: string, mapKey: string, datasetPath: string}|null}}
 */
function validateNewForm() {
  const form = state.ui.newForm || createEmptyNewForm();
  const errors = [];
  const invalidFields = [];

  const label = String(form.label || '').trim();
  if (!label || label.length > CREATE_LABEL_MAX) {
    errors.push(`Map title is required (max ${CREATE_LABEL_MAX} chars).`);
    invalidFields.push('newLabel');
  }

  const mapKey = String(form.mapKey || '').trim();
  if (mapKey.length > CREATE_MAP_KEY_MAX) {
    errors.push(`Map ID supports max ${CREATE_MAP_KEY_MAX} chars.`);
    invalidFields.push('newMapKey');
  }
  if (!MAP_KEY_RE.test(mapKey)) {
    errors.push(`Map ID must match [a-z0-9_-]{1,${CREATE_MAP_KEY_MAX}}.`);
    invalidFields.push('newMapKey');
  }

  const datasetPath = String(form.datasetPath || '').trim();
  const supported = state.datasets.some((item) => String(item.datasetPath || '') === datasetPath && item.supported);
  if (!supported) {
    errors.push('Please select a valid dataset.');
    invalidFields.push('newDatasetPath');
  }

  if (errors.length > 0) {
    return { valid: false, errors, invalidFields, payload: null };
  }

  return {
    valid: true,
    errors: [],
    invalidFields: [],
    payload: {
      label,
      mapKey,
      datasetPath,
    },
  };
}

/**
 * Build small notice html block.
 *
 * @returns {string}
 */
function renderNoticeHtml() {
  const chunks = [];
  if (state.error) {
    chunks.push(`<div class="tdw-atlas-error-box">${esc(state.error)}</div>`);
  }
  if (state.success) {
    chunks.push(`<div class="tdw-atlas-ok-box">${esc(state.success)}</div>`);
  }
  return chunks.join('');
}

/**
 * Render list table for maps.
 *
 * @returns {string}
 */
function renderMapTableHtml() {
  if (!state.maps.length) {
    return `
      <div class="tdw-atlas-empty">
        <p><strong>No maps yet.</strong></p>
        <p>Create your first map to start rendering Atlas instances.</p>
      </div>
    `;
  }

  const rows = state.maps.map((item) => {
    const mapKey = String(item.mapKey || '');
    const label = String(item.label || '');
    const description = String(item.description || '');
    const shortKey = truncateText(mapKey, MAP_KEY_PREVIEW_MAX);
    const shortTitle = truncateText(label, TITLE_PREVIEW_MAX);
    const shortcode = buildShortcode(mapKey);
    const shortcodePreview = buildShortcode(shortKey);
    return `
      <tr>
        <td class="tdw-atlas-col-title tdw-atlas-cell-ellipsis" title="${esc(label)}">${esc(shortTitle)}</td>
        <td class="tdw-atlas-col-shortcode">
          <button
            type="button"
            class="tdw-atlas-shortcode-copy"
            data-action="copy-shortcode"
            data-shortcode="${esc(shortcode)}"
            title="Click to copy full shortcode"
          ><code>${esc(shortcodePreview)}</code></button>
        </td>
        <td class="tdw-atlas-col-description tdw-atlas-cell-ellipsis" title="${esc(description)}">${esc(description || '-')}</td>
        <td class="tdw-atlas-actions-cell">
          <div class="tdw-atlas-row-actions">
            <a class="button button-small" href="${esc(editUrl(mapKey))}">Edit</a>
            <button type="button" class="button button-small" data-action="duplicate-map" data-map-key="${esc(mapKey)}">Duplicate</button>
            <button type="button" class="button button-small tdw-atlas-button-danger" data-action="delete-map" data-map-key="${esc(mapKey)}">Delete</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  return `
    <div class="tdw-atlas-list-table-wrap">
      <table class="tdw-atlas-map-list">
        <thead>
          <tr>
            <th class="tdw-atlas-col-title">Title</th>
            <th class="tdw-atlas-col-shortcode">Shortcode</th>
            <th class="tdw-atlas-col-description">Description</th>
            <th class="tdw-atlas-actions-cell">Actions</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

/**
 * Render new-map modal.
 *
 * @returns {string}
 */
function renderNewModalHtml() {
  if (!state.ui.newModalOpen) {
    return '';
  }

  ensureNewForm();
  const form = state.ui.newForm || createEmptyNewForm();
  const validation = validateNewForm();
  const disabled = !validation.valid || state.busy ? ' disabled' : '';

  const options = state.datasets
    .filter((item) => Boolean(item?.supported))
    .map((item) => {
      const path = String(item.datasetPath || '');
      const title = String(item.title || path);
      const type = String(item.type || 'dataset');
      const count = Number(item.countryCount || 0);
      const selected = path === String(form.datasetPath || '') ? ' selected' : '';
      return `<option value="${esc(path)}"${selected}>${esc(`${title} (${type}, ${count} countries)`)}</option>`;
    })
    .join('');

  const errors = validation.errors.length
    ? `<div class="tdw-atlas-error-box">${validation.errors.map((x) => `<div>${esc(x)}</div>`).join('')}</div>`
    : '';
  const invalid = new Set(validation.invalidFields || []);

  return `
    <div class="tdw-atlas-modal-backdrop">
      <div class="tdw-atlas-modal" role="dialog" aria-modal="true" aria-labelledby="tdw-new-map-title">
        <h3 id="tdw-new-map-title">New Map</h3>
        ${errors}
        <form id="tdw-atlas-new-map-form">
          <label for="tdw-new-map-label">Map title</label>
          <input id="tdw-new-map-label" type="text" name="newLabel" value="${esc(form.label)}" maxlength="${CREATE_LABEL_MAX}" class="${invalid.has('newLabel') ? 'tdw-atlas-field-invalid' : ''}" required>

          <label for="tdw-new-dataset">Dataset</label>
          <select id="tdw-new-dataset" name="newDatasetPath" class="${invalid.has('newDatasetPath') ? 'tdw-atlas-field-invalid' : ''}">${options}</select>

          <label for="tdw-new-map-key">Map ID</label>
          <input id="tdw-new-map-key" type="text" name="newMapKey" value="${esc(form.mapKey)}" maxlength="${CREATE_MAP_KEY_MAX}" class="${invalid.has('newMapKey') ? 'tdw-atlas-field-invalid' : ''}" required>

          <div class="tdw-atlas-modal-actions">
            <button type="button" class="button" data-action="close-new-modal">Cancel</button>
            <button type="submit" class="button button-primary"${disabled}>Confirm</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

/**
 * Render bulk-delete modal.
 *
 * @returns {string}
 */
function renderDeleteModalHtml() {
  if (!state.ui.deleteModalOpen) {
    return '';
  }

  const options = state.maps.map((item) => {
    const mapKey = String(item.mapKey || '');
    const checked = state.ui.deleteSelection[mapKey] ? ' checked' : '';
    const label = String(item.label || mapKey);
    return `
      <label class="tdw-atlas-delete-option">
        <input type="checkbox" name="deleteMapKey" value="${esc(mapKey)}"${checked}>
        <span><code>${esc(mapKey)}</code> · ${esc(label)}</span>
      </label>
    `;
  }).join('');

  const selected = Object.keys(state.ui.deleteSelection).filter((k) => state.ui.deleteSelection[k]);
  const canDelete = selected.length > 0 && !state.busy;

  return `
    <div class="tdw-atlas-modal-backdrop">
      <div class="tdw-atlas-modal" role="dialog" aria-modal="true" aria-labelledby="tdw-delete-title">
        <h3 id="tdw-delete-title">Delete Maps</h3>
        <p>Select one or more maps to delete. This action cannot be undone.</p>
        <form id="tdw-atlas-delete-maps-form">
          <div class="tdw-atlas-delete-list">${options}</div>
          <div class="tdw-atlas-modal-actions">
            <button type="button" class="button" data-action="close-delete-modal">Cancel</button>
            <button type="submit" class="button button-link-delete"${canDelete ? '' : ' disabled'}>Confirm Delete</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

/**
 * Render list mode shell.
 *
 * @returns {string}
 */
function renderListViewHtml() {
  const deleteDisabled = state.maps.length === 0 ? ' disabled' : '';

  return `
    ${renderNoticeHtml()}
    <section class="tdw-atlas-card">
      <div class="tdw-atlas-list-head">
        <h2>Maps</h2>
        <div class="tdw-atlas-inline-actions">
          <button type="button" class="tdw-atlas-link-action" data-action="open-new-modal">New</button>
          <span>|</span>
          <button type="button" class="tdw-atlas-link-action tdw-atlas-link-danger" data-action="open-delete-modal"${deleteDisabled}>Delete</button>
        </div>
      </div>
      ${renderMapTableHtml()}
    </section>
    ${renderNewModalHtml()}
    ${renderDeleteModalHtml()}
  `;
}

/**
 * Build general form draft from current edit map payload.
 *
 * @returns {Record<string, any>}
 */
function generalDraftFromMap() {
  const m = state.editMap || {};
  const grouping = normalizeObjectLike(m.grouping);
  const whitelist = normalizeObjectLike(m.whitelist);
  const preprocess = normalizeObjectLike(m.preprocess);
  const regionLayer = normalizeObjectLike(m.regionLayer);
  const preprocessData = { ...preprocess };
  delete preprocessData.enabled;
  delete preprocessData.partRules;

  return {
    mapKey: String(m.mapKey || ''),
    label: String(m.label || ''),
    description: String(m.description || ''),
    datasetKey: String(m.datasetKey || ''),
    geojson: String(m.geojson || ''),
    adapter: String(m.adapter || 'leaflet'),
    view: String(m.view || ''),
    sortOrder: Number.isFinite(Number(m.sortOrder)) ? Number(m.sortOrder) : 0,
    grouping: {
      enabled: Boolean(grouping.enabled),
      mode: String(grouping.mode || 'off'),
      setKey: String(grouping.setKey || ''),
      geojsonProperty: String(grouping.geojsonProperty || ''),
    },
    whitelist: {
      enabled: Boolean(whitelist.enabled),
      defaultIncluded: Boolean(whitelist.defaultIncluded),
    },
    preprocess: {
      enabled: preprocess.enabled !== false,
      dataJson: toPrettyJson(preprocessData),
      partRulesJson: toPrettyJson(normalizeArrayLike(preprocess.partRules)),
    },
    regionLayer: {
      enabled: regionLayer.enabled !== false,
    },
    focusJson: toPrettyJson(normalizeObjectLike(m.focus, true)),
    uiJson: toPrettyJson(normalizeObjectLike(m.ui, true)),
    mapOptionsJson: toPrettyJson(normalizeObjectLike(m.mapOptions, true)),
    styleJson: toPrettyJson(normalizeObjectLike(m.style, true)),
  };
}

/**
 * Set invalid state for one named form field.
 *
 * @param {HTMLFormElement} form
 * @param {string} name
 * @param {boolean} invalid
 * @returns {void}
 */
function setFormFieldInvalid(form, name, invalid) {
  let input = form.querySelector(`[name="${name}"]`);
  if (!(input instanceof HTMLElement)) {
    const fieldId = String(GENERAL_FIELD_ID_BY_NAME[name] || '');
    if (fieldId !== '') {
      const byId = form.querySelector(`#${fieldId}`);
      if (byId instanceof HTMLElement) {
        input = byId;
      }
    }
  }
  if (!(input instanceof HTMLElement)) {
    return;
  }
  input.classList.toggle('tdw-atlas-field-invalid', invalid);
  if (invalid) {
    input.setAttribute('aria-invalid', 'true');
  } else {
    input.removeAttribute('aria-invalid');
  }
}

/**
 * Apply invalid markers for general-form fields.
 *
 * @param {HTMLFormElement} form
 * @param {Set<string>} invalidFields
 * @returns {void}
 */
function applyGeneralFormInvalidMarkers(form, invalidFields) {
  const names = [
    'mapKey',
    'label',
    'description',
    'datasetKey',
    'geojson',
    'adapter',
    'view',
    'groupingSetKey',
    'groupingGeojsonProperty',
    'preprocessDataJson',
    'partRulesJson',
    'focusJson',
    'uiJson',
    'mapOptionsJson',
    'styleJson',
  ];
  names.forEach((name) => {
    setFormFieldInvalid(form, name, invalidFields.has(name));
  });
}

/**
 * Infer invalid general-form fields from API error text.
 *
 * @param {string} message
 * @param {string} [errorCode]
 * @returns {Set<string>}
 */
function inferInvalidGeneralFieldsFromError(message, errorCode = '') {
  const text = String(message || '').toLowerCase();
  const code = String(errorCode || '').toLowerCase();
  const invalid = new Set();

  if (!text && !code) {
    return invalid;
  }

  if (text.includes('map id') || text.includes('mapkey') || code.includes('map_key')) invalid.add('mapKey');
  if (text.includes('label') || text.includes('title') || code.includes('label')) invalid.add('label');
  if (text.includes('description') || code.includes('description')) invalid.add('description');
  if (
    text.includes('datasetkey') ||
    text.includes('dataset key') ||
    text.includes('dataset_key') ||
    (text.includes('dataset') && !text.includes('dataset path') && !text.includes('geojson')) ||
    code.includes('dataset_key') ||
    code.includes('dataset')
  ) invalid.add('datasetKey');
  if (text.includes('geojson') || text.includes('dataset path') || code.includes('geojson')) invalid.add('geojson');
  if (text.includes('adapter') || code.includes('adapter')) invalid.add('adapter');
  if (text.includes('view') || code.includes('view')) invalid.add('view');
  if (text.includes('grouping.setkey') || code.includes('grouping_set')) invalid.add('groupingSetKey');
  if (text.includes('grouping.geojsonproperty') || code.includes('grouping_property')) invalid.add('groupingGeojsonProperty');
  if (text.includes('preprocess json') || code.includes('preprocess')) invalid.add('preprocessDataJson');
  if (text.includes('part rules json') || code.includes('part_rule')) invalid.add('partRulesJson');
  if (text.includes('focus json') || code.includes('focus')) invalid.add('focusJson');
  if (text.includes('ui json') || code.includes('ui')) invalid.add('uiJson');
  if (text.includes('map options json') || code.includes('map_options')) invalid.add('mapOptionsJson');
  if (text.includes('style json') || code.includes('style')) invalid.add('styleJson');

  return invalid;
}

/**
 * Validate and build general save payload from form values.
 *
 * @returns {{valid: boolean, errors: string[], payload: Record<string, any>|null}}
 */
function readAndValidateGeneralForm() {
  const form = document.getElementById('tdw-atlas-general-form');
  if (!(form instanceof HTMLFormElement)) {
    return { valid: false, errors: ['General form not available.'], payload: null };
  }

  const get = (name) => {
    const el = form.querySelector(`[name="${name}"]`);
    return el ? String(el.value ?? '') : '';
  };
  const checked = (name) => {
    const el = form.querySelector(`[name="${name}"]`);
    return Boolean(el && el.checked);
  };

  const errors = [];
  const invalidFields = new Set();
  const mapKey = String(get('mapKey')).trim();
  if (!MAP_KEY_RE.test(mapKey)) {
    errors.push('Map ID is invalid.');
    invalidFields.add('mapKey');
  }

  const label = String(get('label')).trim();
  if (!label || label.length > EDIT_LABEL_MAX) {
    errors.push(`Title is required (max ${EDIT_LABEL_MAX} chars).`);
    invalidFields.add('label');
  }

  const description = String(get('description')).trim();
  if (description.length > 191) {
    errors.push('Description supports max 191 chars.');
    invalidFields.add('description');
  }

  const datasetKey = String(get('datasetKey')).trim();
  if (!MAP_KEY_RE.test(datasetKey)) {
    errors.push('datasetKey must match [a-z0-9_-]{1,64}.');
    invalidFields.add('datasetKey');
  }

  const geojson = String(get('geojson')).trim();
  if (!geojson || geojson.includes('..') || geojson.startsWith('/') || geojson.startsWith('.')) {
    errors.push('geojson must be a safe plugin-relative path.');
    invalidFields.add('geojson');
  }

  const adapter = String(get('adapter')).trim();
  if (!MAP_KEY_RE.test(adapter)) {
    errors.push('adapter must match [a-z0-9_-]{1,64}.');
    invalidFields.add('adapter');
  }

  const view = String(get('view')).trim();
  if (view && !MAP_KEY_RE.test(view)) {
    errors.push('view must match [a-z0-9_-]{1,64} when set.');
    invalidFields.add('view');
  }

  const groupingMode = String(get('groupingMode')).trim();
  const groupingEnabled = checked('groupingEnabled');
  const setKey = String(get('groupingSetKey')).trim();
  const geojsonProperty = String(get('groupingGeojsonProperty')).trim();

  if (groupingEnabled && groupingMode === 'set' && !MAP_KEY_RE.test(setKey)) {
    errors.push('grouping.setKey is required for mode=set.');
    invalidFields.add('groupingSetKey');
  }
  if (groupingEnabled && groupingMode === 'geojson' && !geojsonProperty) {
    errors.push('grouping.geojsonProperty is required for mode=geojson.');
    invalidFields.add('groupingGeojsonProperty');
  }

  const preprocessData = parseJsonObject(get('preprocessDataJson'), 'Preprocess JSON');
  if (!preprocessData.ok) {
    errors.push(preprocessData.message);
    invalidFields.add('preprocessDataJson');
  }
  const partRules = parseJsonArray(get('partRulesJson'), 'Part Rules JSON');
  if (!partRules.ok) {
    errors.push(partRules.message);
    invalidFields.add('partRulesJson');
  }
  const focus = parseJsonObject(get('focusJson'), 'Focus JSON', { allowArray: true });
  if (!focus.ok) {
    errors.push(focus.message);
    invalidFields.add('focusJson');
  }
  const ui = parseJsonObject(get('uiJson'), 'UI JSON', { allowArray: true });
  if (!ui.ok) {
    errors.push(ui.message);
    invalidFields.add('uiJson');
  }
  const mapOptions = parseJsonObject(get('mapOptionsJson'), 'Map Options JSON', { allowArray: true });
  if (!mapOptions.ok) {
    errors.push(mapOptions.message);
    invalidFields.add('mapOptionsJson');
  }
  const style = parseJsonObject(get('styleJson'), 'Style JSON', { allowArray: true });
  if (!style.ok) {
    errors.push(style.message);
    invalidFields.add('styleJson');
  }

  applyGeneralFormInvalidMarkers(form, invalidFields);

  if (errors.length > 0) {
    return { valid: false, errors, payload: null };
  }

  const payload = {
    mapKey,
    label,
    description,
    datasetKey,
    geojson,
    adapter,
    view,
    sortOrder: Number.parseInt(get('sortOrder'), 10) || 0,
    grouping: {
      enabled: groupingEnabled,
      mode: groupingMode,
      setKey,
      geojsonProperty,
    },
    whitelist: {
      enabled: checked('whitelistEnabled'),
      defaultIncluded: checked('whitelistDefaultIncluded'),
    },
    preprocess: {
      ...(preprocessData.ok ? preprocessData.value : {}),
      enabled: checked('preprocessEnabled'),
      partRules: partRules.ok ? partRules.value : [],
    },
    regionLayer: {
      enabled: checked('regionLayerEnabled'),
    },
    focus: focus.ok ? focus.value : {},
    ui: ui.ok ? ui.value : {},
    mapOptions: mapOptions.ok ? mapOptions.value : {},
    style: style.ok ? style.value : {},
  };

  return { valid: true, errors: [], payload };
}

/**
 * Render mismatch panel for countries tab.
 *
 * @returns {string}
 */
function renderMismatchPanelHtml() {
  const summary = state.countriesPayload?.mismatchSummary || {};
  const openCount = Number(summary.openCount || 0);
  const severity = String(summary.severity || 'none');

  if (openCount <= 0) {
    return `
      <div class="tdw-atlas-mismatch-panel tdw-atlas-mismatch-none">
        <strong>No open mismatches.</strong>
      </div>
    `;
  }

  const klass = severity === 'red' ? 'tdw-atlas-mismatch-red' : 'tdw-atlas-mismatch-yellow';
  return `
    <div class="tdw-atlas-mismatch-panel ${klass}">
      <strong>${esc(String(openCount))} countries need review.</strong>
      <span>Set region or confirm to resolve.</span>
    </div>
  `;
}

/**
 * Render countries table body.
 *
 * @returns {string}
 */
function renderCountriesTableHtml() {
  const countries = Array.isArray(state.countriesPayload?.countries) ? state.countriesPayload.countries : [];
  if (!countries.length) {
    return '<p>No countries available for this dataset.</p>';
  }

  const rows = countries.map((item) => {
    const code = String(item.countryCode || '');
    const name = String(item.countryName || code);
    const region = String(item.regionKey || 'unassigned');
    const whitelist = Boolean(item.whitelist);
    const confirmed = Boolean(item.confirmed);
    const status = String(item.status || 'ok');
    const rowClass = status === 'mismatch' ? ' tdw-atlas-country-row-mismatch' : '';

    const statusLabel = status === 'mismatch'
      ? 'Mismatch'
      : (status === 'confirmed' ? 'Confirmed' : 'OK');

    return `
      <tr data-country-code="${esc(code)}" class="${rowClass}">
        <td><code>${esc(code)}</code></td>
        <td>${esc(name)}</td>
        <td>
          <input type="text" name="regionKey" value="${esc(region)}" maxlength="64">
        </td>
        <td>
          <label><input type="checkbox" name="whitelist" ${whitelist ? 'checked' : ''}> allow</label>
        </td>
        <td>
          <label><input type="checkbox" name="confirmed" ${confirmed ? 'checked' : ''}> confirmed</label>
        </td>
        <td><span class="tdw-atlas-country-status tdw-atlas-country-status-${esc(status)}">${esc(statusLabel)}</span></td>
      </tr>
    `;
  }).join('');

  return `
    <div class="tdw-atlas-countries-table-wrap">
      <table class="tdw-atlas-map-list tdw-atlas-countries-table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Country</th>
            <th>Region</th>
            <th>Whitelist</th>
            <th>Confirmed</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

/**
 * Normalize section save-status to supported values.
 *
 * @param {'idle'|'saving'|'saved'|'error'} status
 * @returns {'saving'|'saved'|'error'}
 */
function normalizeSaveStatus(status) {
  if (status === 'saving') return 'saving';
  if (status === 'error') return 'error';
  return 'saved';
}

/**
 * Build user-facing save-status text.
 *
 * @param {'saving'|'saved'|'error'} status
 * @param {string} message
 * @returns {string}
 */
function saveStatusText(status, message) {
  if (status === 'saving') return 'Saving...';
  if (status === 'error') return `Error: ${message}`;
  return 'Saved';
}

/**
 * Return active save-state section key.
 *
 * @returns {'general'|'countries'}
 */
function activeSaveSection() {
  return state.editTab === 'countries' ? 'countries' : 'general';
}

/**
 * Render title-adjacent save chip.
 *
 * @returns {string}
 */
function renderSaveChipHtml() {
  const section = activeSaveSection();
  const entry = state.saveState[section] || { status: 'saved', message: '' };
  const status = normalizeSaveStatus(entry.status);
  const text = saveStatusText(status, String(entry.message || ''));

  return `
    <span class="tdw-atlas-save-chip is-${status}" id="tdw-atlas-save-chip" title="${esc(`Autosave (${section}): ${text}`)}">
      <span class="tdw-atlas-save-chip__icon" aria-hidden="true">&#128190;</span>
      <span class="tdw-atlas-save-chip__text">${esc(text)}</span>
    </span>
  `;
}

/**
 * Sync rendered save chip with in-memory state.
 *
 * @returns {void}
 */
function syncSaveChipDom() {
  const chip = document.getElementById('tdw-atlas-save-chip');
  if (!(chip instanceof HTMLElement)) {
    return;
  }

  const section = activeSaveSection();
  const entry = state.saveState[section] || { status: 'saved', message: '' };
  const status = normalizeSaveStatus(entry.status);
  const text = saveStatusText(status, String(entry.message || ''));

  chip.className = `tdw-atlas-save-chip is-${status}`;
  chip.title = `Autosave (${section}): ${text}`;

  const textEl = chip.querySelector('.tdw-atlas-save-chip__text');
  if (textEl instanceof HTMLElement) {
    textEl.textContent = text;
  }
}

/**
 * Render edit view shell with tabs.
 *
 * @returns {string}
 */
function renderEditViewHtml() {
  if (!state.editMap) {
    return `
      ${renderNoticeHtml()}
      <section class="tdw-atlas-card">
        <p>Map could not be loaded. Click the Atlas logo to return to the map list.</p>
      </section>
    `;
  }

  const draft = generalDraftFromMap();

  return `
    ${renderNoticeHtml()}
    <section class="tdw-atlas-card tdw-atlas-card-edit">
      <div class="tdw-atlas-tabs">
        <button type="button" class="tdw-atlas-tab ${state.editTab === 'general' ? 'is-active' : ''}" data-tab="general">General</button>
        <button type="button" class="tdw-atlas-tab ${state.editTab === 'countries' ? 'is-active' : ''}" data-tab="countries">Countries</button>
      </div>

      <div class="tdw-atlas-edit-head">
        <h2>
          <span class="tdw-atlas-title-stack">
            <span>${esc(draft.label)}</span>
            <small class="tdw-atlas-map-key"><code>${esc(draft.mapKey)}</code></small>
            ${renderSaveChipHtml()}
          </span>
        </h2>
      </div>

      <div id="tdw-atlas-tab-general" class="tdw-atlas-tab-panel ${state.editTab === 'general' ? 'is-active' : ''}">
        <form id="tdw-atlas-general-form">
          <div class="tdw-atlas-form-grid">
            <div>
              <label for="tdw-map-key">Map ID</label>
              <input id="tdw-map-key" name="mapKey" type="text" value="${esc(draft.mapKey)}" readonly>
            </div>
            <div>
              <label for="tdw-label">Title</label>
              <input id="tdw-label" name="label" type="text" value="${esc(draft.label)}" maxlength="${EDIT_LABEL_MAX}">
            </div>

            <div class="tdw-atlas-form-wide">
              <label for="tdw-description">Description</label>
              <input id="tdw-description" name="description" type="text" value="${esc(draft.description)}" maxlength="191">
            </div>

            <div>
              <label for="tdw-dataset">Dataset Key</label>
              <input id="tdw-dataset" name="datasetKey" type="text" value="${esc(draft.datasetKey)}">
            </div>
            <div>
              <label for="tdw-geojson">Dataset Path</label>
              <input id="tdw-geojson" name="geojson" type="text" value="${esc(draft.geojson)}">
            </div>

            <div>
              <label for="tdw-adapter">Adapter</label>
              <input id="tdw-adapter" name="adapter" type="text" value="${esc(draft.adapter)}">
            </div>
            <div>
              <label for="tdw-view">View</label>
              <input id="tdw-view" name="view" type="text" value="${esc(draft.view)}">
            </div>

            <div>
              <label for="tdw-sort">Sort Order</label>
              <input id="tdw-sort" name="sortOrder" type="text" value="${esc(draft.sortOrder)}">
            </div>
            <div>
              <label for="tdw-grouping-mode">Grouping Mode</label>
              <select id="tdw-grouping-mode" name="groupingMode">
                <option value="off" ${draft.grouping.mode === 'off' ? 'selected' : ''}>off</option>
                <option value="set" ${draft.grouping.mode === 'set' ? 'selected' : ''}>set</option>
                <option value="geojson" ${draft.grouping.mode === 'geojson' ? 'selected' : ''}>geojson</option>
              </select>
            </div>

            <div>
              <label for="tdw-grouping-set">Grouping Set Key</label>
              <input id="tdw-grouping-set" name="groupingSetKey" type="text" value="${esc(draft.grouping.setKey)}">
            </div>
            <div>
              <label for="tdw-grouping-prop">Grouping GeoJSON Property</label>
              <input id="tdw-grouping-prop" name="groupingGeojsonProperty" type="text" value="${esc(draft.grouping.geojsonProperty)}">
            </div>

            <div>
              <label><input name="groupingEnabled" type="checkbox" ${draft.grouping.enabled ? 'checked' : ''}> Grouping enabled</label>
              <label><input name="whitelistEnabled" type="checkbox" ${draft.whitelist.enabled ? 'checked' : ''}> Whitelist enabled</label>
              <label><input name="whitelistDefaultIncluded" type="checkbox" ${draft.whitelist.defaultIncluded ? 'checked' : ''}> Whitelist default included</label>
            </div>
            <div>
              <label><input name="preprocessEnabled" type="checkbox" ${draft.preprocess.enabled ? 'checked' : ''}> Preprocess enabled</label>
              <label><input name="regionLayerEnabled" type="checkbox" ${draft.regionLayer.enabled ? 'checked' : ''}> Region layer enabled</label>
            </div>

            <div class="tdw-atlas-form-wide">
              <label for="tdw-preprocess-json">Preprocess JSON (without enabled/partRules)</label>
              <textarea id="tdw-preprocess-json" name="preprocessDataJson" rows="6">${esc(draft.preprocess.dataJson)}</textarea>
            </div>

            <div class="tdw-atlas-form-wide">
              <label for="tdw-part-rules-json">Part Rules JSON (array)</label>
              <textarea id="tdw-part-rules-json" name="partRulesJson" rows="5">${esc(draft.preprocess.partRulesJson)}</textarea>
            </div>

            <div class="tdw-atlas-form-wide">
              <label for="tdw-focus-json">Focus JSON</label>
              <textarea id="tdw-focus-json" name="focusJson" rows="5">${esc(draft.focusJson)}</textarea>
            </div>

            <div class="tdw-atlas-form-wide">
              <label for="tdw-ui-json">UI JSON</label>
              <textarea id="tdw-ui-json" name="uiJson" rows="5">${esc(draft.uiJson)}</textarea>
            </div>

            <div class="tdw-atlas-form-wide">
              <label for="tdw-map-options-json">Map Options JSON</label>
              <textarea id="tdw-map-options-json" name="mapOptionsJson" rows="4">${esc(draft.mapOptionsJson)}</textarea>
            </div>

            <div class="tdw-atlas-form-wide">
              <label for="tdw-style-json">Style JSON</label>
              <textarea id="tdw-style-json" name="styleJson" rows="4">${esc(draft.styleJson)}</textarea>
            </div>
          </div>
        </form>
      </div>

      <div id="tdw-atlas-tab-countries" class="tdw-atlas-tab-panel ${state.editTab === 'countries' ? 'is-active' : ''}">
        ${renderMismatchPanelHtml()}
        ${renderCountriesTableHtml()}
      </div>
    </section>
  `;
}

/**
 * Render app content for current mode.
 *
 * @returns {void}
 */
function render() {
  const root = document.getElementById('tdw-atlas-admin-app');
  if (!root) {
    return;
  }

  if (state.loading) {
    root.innerHTML = '<p>Loading Atlas admin...</p>';
    return;
  }

  root.innerHTML = state.mode === 'edit'
    ? renderEditViewHtml()
    : renderListViewHtml();

  const header = document.querySelector('.tdw-admin-header');
  if (header instanceof HTMLElement) {
    header.classList.toggle('tdw-admin-header--backnav', state.mode === 'edit');
  }

  if (state.mode === 'edit') {
    bindEditHandlers();
  }
}

/**
 * Set status text for one autosave section.
 *
 * @param {'general'|'countries'} section
 * @param {'idle'|'saving'|'saved'|'error'} status
 * @param {string} [message]
 * @returns {void}
 */
function setSaveStatus(section, status, message = '') {
  const key = section === 'countries' ? 'countries' : 'general';
  state.saveState[key] = {
    status: normalizeSaveStatus(status),
    message: String(message || ''),
  };
  syncSaveChipDom();
}

/**
 * Collect one country row update from table element.
 *
 * @param {HTMLTableRowElement} row
 * @returns {{countryCode: string, regionKey: string, whitelist: boolean, confirmed: boolean}|null}
 */
function collectCountryRowUpdate(row) {
  const countryCode = String(row.dataset.countryCode || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    return null;
  }

  const regionInput = row.querySelector('input[name="regionKey"]');
  const whitelistInput = row.querySelector('input[name="whitelist"]');
  const confirmedInput = row.querySelector('input[name="confirmed"]');

  const regionKey = String(regionInput instanceof HTMLInputElement ? regionInput.value : '').trim() || 'unassigned';
  return {
    countryCode,
    regionKey,
    whitelist: Boolean(whitelistInput instanceof HTMLInputElement ? whitelistInput.checked : false),
    confirmed: Boolean(confirmedInput instanceof HTMLInputElement ? confirmedInput.checked : false),
  };
}

/**
 * Send debounced general-form autosave.
 *
 * @returns {Promise<void>}
 */
async function flushGeneralSave() {
  const validation = readAndValidateGeneralForm();
  if (!validation.valid || !validation.payload) {
    state.dirty.general = true;
    setSaveStatus('general', 'error', validation.errors.join(' '));
    return;
  }

  setSaveStatus('general', 'saving');
  try {
    const mapKey = String(validation.payload.mapKey || '').trim();
    const payload = await api(`maps/${encodeURIComponent(mapKey)}/general`, {
      method: 'PUT',
      body: validation.payload,
    });

    state.editMap = payload;
    state.dirty.general = false;
    setSaveStatus('general', 'saved');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = error instanceof Error ? String(error.code || '') : '';
    const form = document.getElementById('tdw-atlas-general-form');
    if (form instanceof HTMLFormElement) {
      applyGeneralFormInvalidMarkers(form, inferInvalidGeneralFieldsFromError(message, code));
    }
    state.dirty.general = true;
    setSaveStatus('general', 'error', message);
  }
}

/**
 * Schedule general autosave after debounce window.
 *
 * @returns {void}
 */
function scheduleGeneralSave() {
  if (state.timers.general) {
    clearTimeout(state.timers.general);
  }
  state.dirty.general = true;
  setSaveStatus('general', 'saving');
  state.timers.general = setTimeout(() => {
    state.timers.general = null;
    void flushGeneralSave();
  }, AUTO_SAVE_MS);
}

/**
 * Persist pending countries updates.
 *
 * @returns {Promise<void>}
 */
async function flushCountriesSave() {
  const updates = Object.values(state.countryUpdates);
  if (!updates.length) {
    state.dirty.countries = false;
    setSaveStatus('countries', 'saved');
    return;
  }

  setSaveStatus('countries', 'saving');
  try {
    const mapKey = String(state.selectedMapKey || '');
    const payload = await api(`maps/${encodeURIComponent(mapKey)}/countries`, {
      method: 'PUT',
      body: { updates },
    });

    state.countriesPayload = payload;
    state.countryUpdates = {};
    state.dirty.countries = false;
    setSaveStatus('countries', 'saved');
  } catch (error) {
    state.dirty.countries = true;
    setSaveStatus('countries', 'error', error instanceof Error ? error.message : String(error));
  }
}

/**
 * Schedule countries autosave after debounce window.
 *
 * @returns {void}
 */
function scheduleCountriesSave() {
  if (state.timers.countries) {
    clearTimeout(state.timers.countries);
  }
  state.dirty.countries = true;
  setSaveStatus('countries', 'saving');
  state.timers.countries = setTimeout(() => {
    state.timers.countries = null;
    void flushCountriesSave();
  }, AUTO_SAVE_MS);
}

/**
 * Activate one edit tab and toggle panel visibility.
 *
 * @param {'general'|'countries'} tab
 * @returns {void}
 */
function activateTab(tab) {
  state.editTab = tab === 'countries' ? 'countries' : 'general';

  const tabs = document.querySelectorAll('.tdw-atlas-tab');
  tabs.forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    el.classList.toggle('is-active', String(el.dataset.tab || '') === state.editTab);
  });

  const general = document.getElementById('tdw-atlas-tab-general');
  const countries = document.getElementById('tdw-atlas-tab-countries');
  if (general instanceof HTMLElement) {
    general.classList.toggle('is-active', state.editTab === 'general');
  }
  if (countries instanceof HTMLElement) {
    countries.classList.toggle('is-active', state.editTab === 'countries');
  }

  syncSaveChipDom();
}

/**
 * Flush pending autosave work for one section immediately.
 *
 * @param {'general'|'countries'} section
 * @returns {Promise<void>}
 */
async function flushSectionPendingSave(section) {
  if (section === 'general') {
    if (state.timers.general) {
      clearTimeout(state.timers.general);
      state.timers.general = null;
    }
    if (state.dirty.general || normalizeSaveStatus(state.saveState.general?.status) === 'saving') {
      await flushGeneralSave();
    }
    return;
  }

  if (state.timers.countries) {
    clearTimeout(state.timers.countries);
    state.timers.countries = null;
  }
  if (state.dirty.countries || normalizeSaveStatus(state.saveState.countries?.status) === 'saving') {
    await flushCountriesSave();
  }
}

/**
 * Confirm discard/reset when section has unsaved changes.
 *
 * @param {'general'|'countries'} section
 * @param {boolean} resetAfterConfirm
 * @returns {Promise<boolean>}
 */
async function guardUnsavedSection(section, resetAfterConfirm) {
  await flushSectionPendingSave(section);

  const dirty = section === 'general' ? state.dirty.general : state.dirty.countries;
  const status = normalizeSaveStatus(state.saveState[section]?.status);
  if (!dirty && status !== 'error') {
    return true;
  }

  const message = status === 'error'
    ? 'Autosave failed. Discard unsaved changes and continue?'
    : 'You have unsaved changes. Discard changes and continue?';
  if (!window.confirm(message)) {
    return false;
  }

  if (!resetAfterConfirm) {
    return true;
  }

  try {
    await loadEditData(state.selectedMapKey);
    return true;
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
    render();
    return false;
  }
}

/**
 * Handle edit tab switch with save/discard safeguards.
 *
 * @param {'general'|'countries'} tab
 * @returns {Promise<void>}
 */
async function requestTabSwitch(tab) {
  const nextTab = tab === 'countries' ? 'countries' : 'general';
  const currentTab = state.editTab === 'countries' ? 'countries' : 'general';
  if (nextTab === currentTab) {
    return;
  }

  const allowed = await guardUnsavedSection(currentTab, true);
  if (!allowed) {
    return;
  }

  state.editTab = nextTab;
  render();
}

/**
 * Bind edit-mode handlers after rendering edit html.
 *
 * @returns {void}
 */
function bindEditHandlers() {
  const root = document.getElementById('tdw-atlas-admin-app');
  if (!root || root.dataset.editHandlersBound === '1') {
    return;
  }

  root.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const tab = target.closest('[data-tab]');
    if (tab instanceof HTMLElement) {
      const value = String(tab.dataset.tab || 'general');
      event.preventDefault();
      void requestTabSwitch(value === 'countries' ? 'countries' : 'general');
    }
  });

  root.dataset.editHandlersBound = '1';
  activateTab(state.editTab);
  setSaveStatus('general', 'saved');
  setSaveStatus('countries', 'saved');
}

/**
 * Render and restore focus for the currently edited field.
 *
 * @param {HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null} target
 * @returns {void}
 */
function renderWithFocus(target) {
  let focusId = '';
  let focusName = '';
  let selectionStart = null;
  let selectionEnd = null;

  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
    focusId = String(target.id || '');
    focusName = String(target.name || '');
    if (typeof target.selectionStart === 'number' && typeof target.selectionEnd === 'number') {
      selectionStart = target.selectionStart;
      selectionEnd = target.selectionEnd;
    }
  }

  render();

  let next = null;
  if (focusId) {
    next = document.getElementById(focusId);
  }
  if (!next && focusName) {
    next = document.querySelector(`[name="${focusName}"]`);
  }

  if (next instanceof HTMLInputElement || next instanceof HTMLTextAreaElement || next instanceof HTMLSelectElement) {
    next.focus();
    if ((next instanceof HTMLInputElement || next instanceof HTMLTextAreaElement) && selectionStart !== null && selectionEnd !== null) {
      try {
        next.setSelectionRange(selectionStart, selectionEnd);
      } catch {
        // noop
      }
    }
  }
}

/**
 * Load map + countries payload for edit mode.
 *
 * @param {string} mapKey
 * @returns {Promise<void>}
 */
async function loadEditData(mapKey) {
  const key = String(mapKey || '').trim();
  if (!MAP_KEY_RE.test(key)) {
    state.error = 'Invalid map id in URL.';
    state.editMap = null;
    state.countriesPayload = null;
    return;
  }

  const mapPayload = await api(`maps/${encodeURIComponent(key)}`);
  const countriesPayload = await api(`maps/${encodeURIComponent(key)}/countries`);

  state.selectedMapKey = key;
  state.editMap = mapPayload;
  state.countriesPayload = countriesPayload;
  state.countryUpdates = {};
  state.dirty.general = false;
  state.dirty.countries = false;
  state.saveState.general = { status: 'saved', message: '' };
  state.saveState.countries = { status: 'saved', message: '' };
}

/**
 * Refresh bootstrap payload and optional edit details.
 *
 * @returns {Promise<void>}
 */
async function loadBootstrap() {
  state.loading = true;
  render();

  try {
    const payload = await api('bootstrap');
    state.maps = Array.isArray(payload?.maps) ? payload.maps : [];
    state.datasets = Array.isArray(payload?.datasets) ? payload.datasets : [];
    state.mapDefaults = payload?.mapDefaults && typeof payload.mapDefaults === 'object' ? payload.mapDefaults : {};

    ensureNewForm();

    if (state.mode === 'edit') {
      await loadEditData(state.selectedMapKey);
    } else {
      state.editMap = null;
      state.countriesPayload = null;
    }

    state.loading = false;
    render();
  } catch (error) {
    state.loading = false;
    state.error = error instanceof Error ? error.message : String(error);
    state.maps = [];
    state.datasets = [];
    state.editMap = null;
    state.countriesPayload = null;
    render();
  }
}

/**
 * Create map from modal values and redirect to edit route.
 *
 * @returns {Promise<void>}
 */
async function createMap() {
  ensureNewForm();
  const validation = validateNewForm();
  if (!validation.valid || !validation.payload) {
    state.error = validation.errors.join(' ');
    state.success = '';
    render();
    return;
  }

  state.busy = true;
  state.error = '';
  state.success = '';
  render();

  try {
    const created = await api('maps/create', {
      method: 'POST',
      body: validation.payload,
    });
    const mapKey = String(created?.mapKey || validation.payload.mapKey);
    window.location.assign(editUrl(mapKey));
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
    state.success = '';
    state.busy = false;
    render();
  }
}

/**
 * Delete selected maps from modal.
 *
 * @returns {Promise<void>}
 */
async function bulkDeleteMaps() {
  const selected = Object.keys(state.ui.deleteSelection).filter((k) => state.ui.deleteSelection[k]);
  if (!selected.length) {
    state.error = 'Select at least one map to delete.';
    state.success = '';
    render();
    return;
  }

  await deleteMapKeys(selected, `${selected.length} map(s) deleted.`);
}

/**
 * Delete one or many map keys and reload list data.
 *
 * @param {string[]} mapKeys
 * @param {string} successMessage
 * @returns {Promise<void>}
 */
async function deleteMapKeys(mapKeys, successMessage) {
  const keys = Array.isArray(mapKeys)
    ? mapKeys.map((x) => String(x || '').trim()).filter((x) => MAP_KEY_RE.test(x))
    : [];
  if (!keys.length) {
    state.error = 'No valid map key was provided.';
    state.success = '';
    render();
    return;
  }

  state.busy = true;
  state.error = '';
  state.success = '';
  render();

  try {
    const result = await api('maps/bulk-delete', {
      method: 'POST',
      body: { mapKeys: keys },
    });

    state.ui.deleteModalOpen = false;
    state.ui.deleteSelection = {};
    state.success = successMessage || `${Number(result?.count || keys.length)} map(s) deleted.`;
    state.busy = false;
    await loadBootstrap();
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
    state.success = '';
    state.busy = false;
    render();
  }
}

/**
 * Build general-save payload from map response object.
 *
 * @param {Record<string, any>} map
 * @param {{mapKey?: string, label?: string}} [overrides]
 * @returns {Record<string, any>}
 */
function buildGeneralPayloadFromMap(map, overrides = {}) {
  const source = map && typeof map === 'object' ? map : {};
  const grouping = normalizeObjectLike(source.grouping);
  const whitelist = normalizeObjectLike(source.whitelist);
  const preprocess = normalizeObjectLike(source.preprocess);
  const regionLayer = normalizeObjectLike(source.regionLayer);

  return {
    mapKey: String(overrides.mapKey || source.mapKey || ''),
    label: String(overrides.label || source.label || ''),
    description: String(source.description || ''),
    datasetKey: String(source.datasetKey || ''),
    geojson: String(source.geojson || ''),
    adapter: String(source.adapter || 'leaflet'),
    view: String(source.view || ''),
    sortOrder: Number.isFinite(Number(source.sortOrder)) ? Number(source.sortOrder) : 0,
    grouping: {
      enabled: Boolean(grouping.enabled),
      mode: String(grouping.mode || 'off'),
      setKey: String(grouping.setKey || ''),
      geojsonProperty: String(grouping.geojsonProperty || ''),
    },
    whitelist: {
      enabled: Boolean(whitelist.enabled),
      defaultIncluded: Boolean(whitelist.defaultIncluded),
    },
    preprocess: {
      ...preprocess,
      enabled: preprocess.enabled !== false,
      partRules: Array.isArray(preprocess.partRules) ? preprocess.partRules : [],
    },
    regionLayer: {
      enabled: regionLayer.enabled !== false,
    },
    focus: normalizeObjectLike(source.focus, true),
    ui: normalizeObjectLike(source.ui, true),
    mapOptions: normalizeObjectLike(source.mapOptions, true),
    style: normalizeObjectLike(source.style, true),
  };
}

/**
 * Duplicate one map including general + countries configuration.
 *
 * @param {string} sourceMapKey
 * @returns {Promise<void>}
 */
async function duplicateMap(sourceMapKey) {
  const sourceKey = String(sourceMapKey || '').trim();
  if (!MAP_KEY_RE.test(sourceKey)) {
    state.error = 'Invalid source map key for duplicate.';
    state.success = '';
    render();
    return;
  }

  state.busy = true;
  state.error = '';
  state.success = '';
  render();

  try {
    const sourceMap = await api(`maps/${encodeURIComponent(sourceKey)}`);
    const sourceCountries = await api(`maps/${encodeURIComponent(sourceKey)}/countries`);

    const sourceLabel = normalizeCreateLabel(String(sourceMap?.label || sourceKey));
    const duplicateLabel = normalizeCreateLabel(`${sourceLabel} copy`);
    const duplicateMapKey = nextUniqueCreateMapKey(suggestCreateMapKey(duplicateLabel));
    const datasetPath = String(sourceMap?.geojson || '').trim();

    const created = await api('maps/create', {
      method: 'POST',
      body: {
        label: duplicateLabel,
        mapKey: duplicateMapKey,
        datasetPath,
      },
    });
    const newMapKey = String(created?.mapKey || duplicateMapKey);

    const generalPayload = buildGeneralPayloadFromMap(sourceMap, {
      mapKey: newMapKey,
      label: duplicateLabel,
    });
    await api(`maps/${encodeURIComponent(newMapKey)}/general`, {
      method: 'PUT',
      body: generalPayload,
    });

    const sourceRows = Array.isArray(sourceCountries?.countries) ? sourceCountries.countries : [];
    const updates = sourceRows.map((row) => ({
      countryCode: String(row?.countryCode || ''),
      regionKey: String(row?.regionKey || 'unassigned'),
      whitelist: Boolean(row?.whitelist),
      confirmed: Boolean(row?.confirmed),
    })).filter((row) => /^[A-Z]{2}$/.test(row.countryCode));

    if (updates.length > 0) {
      await api(`maps/${encodeURIComponent(newMapKey)}/countries`, {
        method: 'PUT',
        body: { updates },
      });
    }

    state.success = `Map duplicated: ${newMapKey}.`;
    state.busy = false;
    await loadBootstrap();
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
    state.success = '';
    state.busy = false;
    render();
  }
}

/**
 * Handle refresh icon soft-reload click.
 *
 * @param {MouseEvent} event
 * @returns {void}
 */
function onRefreshClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const trigger = target.closest('[data-tdw-refresh="soft"]');
  if (!(trigger instanceof HTMLElement)) {
    return;
  }

  event.preventDefault();
  void loadBootstrap();
}

/**
 * Handle click events for list-mode actions.
 *
 * @param {MouseEvent} event
 * @returns {void}
 */
function onClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const actionEl = target.closest('[data-action]');
  if (!(actionEl instanceof HTMLElement)) {
    return;
  }

  const action = String(actionEl.dataset.action || '');
  if (!action) {
    return;
  }

  if (action === 'open-new-modal') {
    state.ui.newModalOpen = true;
    state.ui.newForm = createEmptyNewForm();
    state.ui.newFormManualId = false;
    state.error = '';
    state.success = '';
    render();
    return;
  }

  if (action === 'close-new-modal') {
    state.ui.newModalOpen = false;
    state.ui.newForm = null;
    state.ui.newFormManualId = false;
    render();
    return;
  }

  if (action === 'open-delete-modal') {
    if (!state.maps.length) {
      return;
    }

    state.ui.deleteModalOpen = true;
    state.ui.deleteSelection = {};
    state.maps.forEach((item) => {
      const key = String(item.mapKey || '');
      if (key) {
        state.ui.deleteSelection[key] = false;
      }
    });
    state.error = '';
    state.success = '';
    render();
    return;
  }

  if (action === 'close-delete-modal') {
    state.ui.deleteModalOpen = false;
    state.ui.deleteSelection = {};
    render();
  }
}

/**
 * Handle click events on shared admin header icon/title.
 *
 * @param {MouseEvent} event
 * @returns {void}
 */
function onHeaderNavClick(event) {
  if (state.mode !== 'edit') {
    return;
  }

  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const trigger = target.closest('.tdw-admin-header__left, .tdw-admin-header__icon, .tdw-admin-header__title');
  if (!(trigger instanceof HTMLElement)) {
    return;
  }

  event.preventDefault();
  void (async () => {
    const currentTab = activeSaveSection();
    const allowed = await guardUnsavedSection(currentTab, false);
    if (!allowed) {
      return;
    }
    window.location.assign(String(cfg.adminListUrl || '?'));
  })();
}

/**
 * Copy one shortcode string to clipboard.
 *
 * @param {string} shortcode
 * @returns {Promise<void>}
 */
async function copyShortcode(shortcode) {
  const value = String(shortcode || '').trim();
  if (!value) {
    throw new Error('Shortcode is empty.');
  }

  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const temp = document.createElement('textarea');
  temp.value = value;
  temp.setAttribute('readonly', 'readonly');
  temp.style.position = 'absolute';
  temp.style.left = '-9999px';
  document.body.appendChild(temp);
  temp.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(temp);
  if (!ok) {
    throw new Error('Copy to clipboard failed.');
  }
}

/**
 * Handle form submit events.
 *
 * @param {SubmitEvent} event
 * @returns {void}
 */
function onSubmit(event) {
  const target = event.target;
  if (!(target instanceof HTMLFormElement)) {
    return;
  }

  if (target.id === 'tdw-atlas-new-map-form') {
    event.preventDefault();
    void createMap();
    return;
  }

  if (target.id === 'tdw-atlas-delete-maps-form') {
    event.preventDefault();
    void bulkDeleteMaps();
  }
}

/**
 * Handle list-mode input updates.
 *
 * @param {Event} event
 * @returns {void}
 */
function onInput(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  if (target instanceof HTMLInputElement && target.name === 'newLabel') {
    ensureNewForm();
    state.ui.newForm.label = normalizeCreateLabel(String(target.value || ''));
    if (!state.ui.newFormManualId) {
      state.ui.newForm.mapKey = suggestCreateMapKey(state.ui.newForm.label);
    }
    state.error = '';
    state.success = '';
    renderWithFocus(target);
    return;
  }

  if (target instanceof HTMLSelectElement && target.name === 'newDatasetPath') {
    ensureNewForm();
    state.ui.newForm.datasetPath = String(target.value || '');
    state.error = '';
    state.success = '';
    renderWithFocus(target);
    return;
  }

  if (target instanceof HTMLInputElement && target.name === 'newMapKey') {
    ensureNewForm();
    state.ui.newForm.mapKey = normalizeCreateMapKey(String(target.value || '').trim());
    state.ui.newFormManualId = true;
    state.error = '';
    state.success = '';
    renderWithFocus(target);
    return;
  }

  if (target instanceof HTMLInputElement && target.name === 'deleteMapKey') {
    const mapKey = String(target.value || '');
    if (mapKey) {
      state.ui.deleteSelection[mapKey] = target.checked;
      state.error = '';
      state.success = '';
      render();
    }
    return;
  }

  if (state.mode === 'edit') {
    if (target.closest('#tdw-atlas-general-form')) {
      scheduleGeneralSave();
      return;
    }

    const row = target.closest('tr[data-country-code]');
    if (row instanceof HTMLTableRowElement && row.closest('.tdw-atlas-countries-table-wrap')) {
      const update = collectCountryRowUpdate(row);
      if (!update) {
        return;
      }
      state.countryUpdates[update.countryCode] = update;
      scheduleCountriesSave();
      return;
    }
  }
}

/**
 * Handle action click events that need async work.
 *
 * @param {MouseEvent} event
 * @returns {Promise<void>}
 */
async function onActionClickAsync(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const actionEl = target.closest('[data-action]');
  if (!(actionEl instanceof HTMLElement)) {
    return;
  }

  const action = String(actionEl.dataset.action || '');
  if (!action) {
    return;
  }

  if (action === 'copy-shortcode') {
    event.preventDefault();
    const shortcode = String(actionEl.dataset.shortcode || '').trim();
    try {
      await copyShortcode(shortcode);
      state.success = 'Shortcode copied.';
      state.error = '';
      render();
    } catch (error) {
      state.success = '';
      state.error = error instanceof Error ? error.message : String(error);
      render();
    }
    return;
  }

  if (action === 'delete-map') {
    event.preventDefault();
    const mapKey = String(actionEl.dataset.mapKey || '').trim();
    if (!MAP_KEY_RE.test(mapKey)) {
      state.error = 'Invalid map key for delete.';
      state.success = '';
      render();
      return;
    }
    const confirmed = window.confirm(`Delete map "${mapKey}"? This action cannot be undone.`);
    if (!confirmed) {
      return;
    }
    await deleteMapKeys([mapKey], `Map deleted: ${mapKey}.`);
    return;
  }

  if (action === 'duplicate-map') {
    event.preventDefault();
    const mapKey = String(actionEl.dataset.mapKey || '').trim();
    await duplicateMap(mapKey);
  }
}

/**
 * Proxy click handler to run async action handlers.
 *
 * @param {MouseEvent} event
 * @returns {void}
 */
function onClickAsyncProxy(event) {
  void onActionClickAsync(event);
}

/**
 * Bind root handlers once.
 *
 * @returns {void}
 */
function bindHandlers() {
  const root = document.getElementById('tdw-atlas-admin-app');
  if (!root || root.dataset.handlersBound === '1') {
    return;
  }

  root.addEventListener('click', onClick);
  root.addEventListener('click', onClickAsyncProxy);
  root.addEventListener('submit', onSubmit);
  root.addEventListener('input', onInput);
  root.addEventListener('change', onInput);
  document.addEventListener('click', onHeaderNavClick);
  document.addEventListener('click', onRefreshClick);
  root.dataset.handlersBound = '1';
}

/**
 * Initialize module.
 *
 * @returns {void}
 */
function init() {
  const root = document.getElementById('tdw-atlas-admin-app');
  if (!root) {
    return;
  }

  if (state.mode === 'edit' && !MAP_KEY_RE.test(state.selectedMapKey)) {
    state.error = 'Invalid map id in URL.';
    state.mode = 'list';
    state.selectedMapKey = '';
  }

  bindHandlers();
  void dlog('boot');
  void loadBootstrap();
}

/**
 * Destroy module handlers.
 *
 * @returns {void}
 */
function destroy() {
  const root = document.getElementById('tdw-atlas-admin-app');
  if (!root) {
    return;
  }

  if (state.timers.general) {
    clearTimeout(state.timers.general);
    state.timers.general = null;
  }
  if (state.timers.countries) {
    clearTimeout(state.timers.countries);
    state.timers.countries = null;
  }

  root.removeEventListener('click', onClick);
  root.removeEventListener('click', onClickAsyncProxy);
  root.removeEventListener('submit', onSubmit);
  root.removeEventListener('input', onInput);
  root.removeEventListener('change', onInput);
  document.removeEventListener('click', onHeaderNavClick);
  document.removeEventListener('click', onRefreshClick);
  delete root.dataset.handlersBound;
  delete root.dataset.editHandlersBound;
  root.replaceChildren();
}

/* ============================================================
   3) PUBLIC API
   ============================================================ */

window.TDW = window.TDW || {};
window.TDW.Atlas = window.TDW.Atlas || {};
window.TDW.Atlas.Admin = {
  init,
  destroy,
};

/* ============================================================
   4) AUTO-RUN
   ============================================================ */

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}

void dwarn;
void derror;
