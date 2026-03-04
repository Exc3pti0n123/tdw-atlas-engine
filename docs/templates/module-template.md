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
const { dlog = () => {}, dwarn = () => {},
  derror = (...args) => console.error('[TDW ATLAS FATAL]', `[${SCOPE}]`, ...args),
} = window.TDW?.Logger?.createScopedLogger?.(SCOPE) || {};

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
- JSDoc is mandatory for every function:
  - top-level function declarations
  - internal helper functions
  - public API methods
- Logger boilerplate is mandatory in this compact form:
  - `const { dlog = () => {}, dwarn = () => {}, derror = (...args) => console.error('[TDW ATLAS FATAL]', \`[\${SCOPE}]\`, ...args) } = window.TDW?.Logger?.createScopedLogger?.(SCOPE) || {};`
- Direct `window.TDW._logger.log/warn/error` usage is reserved for:
  - `../tdw-core/assets/shared/tdw-logger.js`
- If module-level `dlog`/`dwarn` calls exist, ensure PHP module dependencies guarantee logger availability.
- For a version with explicit custom sections, use:
  - `docs/templates/module-template-custom.md`
