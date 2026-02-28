# TDW Atlas Engine — Agent Rules

This file is the local, binding rule set for AI coding agents in this repository.

## 1) Mandatory Context (read before planning/coding)

1. `docs/contracts.md`
2. `docs/system-architecture.md`
3. `docs/process/merge-strategy.md`
4. Latest file in `docs/context/merges/`

## 2) Required JS Module Structure (do not remove)

Every Atlas JS module must keep these sections:

1. `MODULE INIT`
2. `FUNCTIONS`
3. `PUBLIC API`
4. `AUTO-RUN`

Use templates:

1. `docs/templates/module-template.md`
2. `docs/templates/module-template-custom.md`

## 3) JSDoc Rule (strict)

Every function must have JSDoc directly above it.

Includes:

1. function declarations
2. exported functions
3. module-internal helpers
4. object methods in public API blocks (`init`, `destroy`, etc.)

Minimum:

1. short purpose line
2. `@param` for every parameter
3. `@returns` when value is returned

## 4) Logger Rule (strict shape, no hard-fail)

Use this compact boilerplate in Atlas modules:

```js
const { dlog = () => {}, dwarn = () => {},
  derror = (...args) => console.error('[TDW ATLAS FATAL]', `[${SCOPE}]`, ...args),
} = window.TDW?.Logger?.createScopedLogger?.(SCOPE) || {};
```

Reason:
1. no hard-fail when logger contract is temporarily unavailable
2. fatal errors still surface via `console.error`

Do not replace it with different custom logger wiring in module files.
Direct `_logger` usage is reserved for `assets/shared/tdw-logger.js`.

## 5) Fail-Fast Rule

Intentional hard-stops must keep the ATTENTION marker comment:

```js
// ATTENTION: intentional hard-stop for diagnosability; runtime could continue.
```

Do not silently swallow contract violations.

## 6) Dev-Only Policy

No legacy compatibility layers in dev-only refactors:

1. no shims/wrappers for old names
2. no dual codepaths for old/new contracts
3. no migration/legacy fallbacks unless explicitly requested

Hard-cut and update code/docs/tests in the same patch.

## 7) Documentation Duty

When behavior/contracts/structure change, update in the same change:

1. `docs/contracts.md`
2. relevant architecture docs
3. diagrams if flow/module edges changed
4. merge context capsule

## 8) Testing Duty

For implementation changes run and report:

1. `npm run test:static`
2. `npm run test:non-ui`

Human remains owner of UI/UX acceptance testing.
