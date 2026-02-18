# TDW Atlas Module Template

Use this as the default scaffold for new Atlas JS modules.

```js
/* ============================================================
   Module: TDW Atlas Engine — <Module Name>
   ------------------------------------------------------------
   Purpose:
   - <1-3 bullets>

   Responsibilities:
   - <bullet list>

   Non-responsibilities:
   - <bullet list>

   Public surface:
   - <window.TDW.Atlas.* key(s) or "none">

   Contracts:
   - Contract 3 (File structure convention)
   - <other relevant contracts>
   ============================================================ */

/* ============================================================
   1) MODULE INIT
   ============================================================ */

window.TDW = window.TDW || {};
window.TDW.Atlas = window.TDW.Atlas || {};
window.TDW.Atlas.<ModuleKey> = window.TDW.Atlas.<ModuleKey> || {};

const SCOPE = '<MODULE SCOPE>';

const {
  log: _log = () => {},
  warn: _warn = () => {},
  error: _error = (scope, el, message, ...meta) => console.error('[TDW ATLAS FATAL]', message, ...meta),
} = window?.TDW?._logger || {};

const dlog = (...args) => _log(SCOPE, ...args);
const dwarn = (...args) => _warn(SCOPE, ...args);
const derror = (el, message, ...meta) => _error(SCOPE, el || null, message, ...meta);

/* ============================================================
   2) FUNCTIONS
   ============================================================ */

/**
 * <Short description of what this function does.>
 *
 * @param {<type>} <name> - <param description>
 * @returns {<type>} <return description>
 */
function exampleFunction() {
  // Implement module logic.
}

/* ============================================================
   3) PUBLIC API
   ============================================================ */

const api = window.TDW.Atlas.<ModuleKey>;
if (typeof api.exampleFunction !== 'function') api.exampleFunction = exampleFunction;

/* ============================================================
   4) AUTO-RUN
   ============================================================ */

// Optional: only when this module must self-start.
// exampleFunction();
```

## Notes

- Keep `MODULE INIT` minimal: no network, no DOM scanning, no heavy logic.
- Put all behavior in `FUNCTIONS`; only expose what is needed in `PUBLIC API`.
- `AUTO-RUN` is optional and should be used only for required startup wiring.
- If module-level `dlog`/`dwarn` calls exist, ensure PHP module dependencies guarantee logger availability.
