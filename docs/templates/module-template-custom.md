# TDW Atlas Module Template (Custom Sections)

Use this template when a module needs explicit custom/internal sections beyond the default structure.

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
 * <Short description>
 * @param {<type>} <name>
 * @returns {<type>}
 */
function exampleFunction() {
  // Core module logic.
}

/* ============================================================
   2.1) CUSTOM INPUT CONTRACT
   ============================================================ */

// Define accepted input shape, required fields, and normalization rules.

/* ============================================================
   2.2) CUSTOM STATE MODEL
   ============================================================ */

// Define module-local state fields and ownership.

/* ============================================================
   2.3) CUSTOM ERROR POLICY
   ============================================================ */

// Define fail-fast and warn-only cases for this module.

/* ============================================================
   2.4) CUSTOM DIAGNOSTICS
   ============================================================ */

// Define runtime diagnostics and audit payload shape.

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

## Custom Section Rules

1. Keep section numbering stable (`2.1`, `2.2`, ...).
2. Do not add custom sections to `MODULE INIT` or `AUTO-RUN`.
3. Any new custom section must be listed in the module header comment.
4. If the module does not need custom sections, use `docs/templates/module-template.md`.
5. JSDoc is mandatory for every function (including public API methods).
