# Machine Onboarding

This file defines mandatory behavior for AI contributors.

## Mandatory Context Pack (Read First)

1. `../contracts.md`
2. `../system-architecture.md`
3. `../process/merge-strategy.md`
4. latest merge capsule in `../context/merges/`

## Required Quick-Find Paths (Use Before Editing Modules)

1. `../templates/module-template.md`
2. `../templates/module-template-custom.md`
3. `../../assets/shared/tdw-logger.js`
4. `../../assets/js/helpers/atlas-shared.js`

## Mandatory Responsibilities

1. Preserve and enforce runtime contracts.
2. Keep JS module section standard:
- `MODULE INIT`
- `FUNCTIONS`
- `PUBLIC API`
- `AUTO-RUN`
3. Use logger boilerplate in every Atlas module:
- `const { dlog = () => {}, dwarn = () => {}, derror = (...args) => console.error('[TDW ATLAS FATAL]', \`[\${SCOPE}]\`, ...args) } = window.TDW?.Logger?.createScopedLogger?.(SCOPE) || {};`
4. Add JSDoc to every function:
- top-level functions
- module-internal helpers
- public API methods (`init`, `destroy`, ...)
5. Keep docs synchronized with relevant changes:
- contracts
- architecture docs
- ADR
- version references
- merge capsule
6. Declare test status clearly in outputs:
- `implemented`
- `partially tested`
- `done tested`
7. Run and report non-UI suite for implementation changes:
- `npm run test:non-ui`
- reference: `../process/non-ui-testing.md`

## Testing Ownership

1. AI/Codex owns non-UI reproducible tests (CLI, HTTP, browser-console smoke).
2. Human owns interface/visual/UX testing and final UI acceptance.

## Required Escalation in Output

When uncertain or when assumptions affect architecture/contracts, AI must explicitly call out assumptions and their impact before merge.
