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
3. `../../../tdw-core/assets/shared/tdw-logger.js`
4. `../../assets/js/helpers/atlas-shared.js`
5. `../../../tdw-core/docs/contracts.md`
6. `../../../tdw-design/docs/contracts.md`

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
7. Keep Admin GUI isolation:
- PHP admin code under `includes/admin/*`
- admin UI assets under `assets/admin/*`
- no mixing with public runtime route handlers
8. Keep list-first admin flow contracts stable:
- `GET /admin/datasets`
- `POST /admin/maps/create`
- `POST /admin/maps/bulk-delete`
- `PUT /admin/maps/{map_key}/general`
- `GET /admin/maps/{map_key}/countries`
- `PUT /admin/maps/{map_key}/countries`
- edit route via `?id=<map_key>`
9. Keep create flow dataset-driven (`data/dataset/*`) with map-seed materialization (`data/seed/atlas.map.seed.json`).
10. Run and report non-UI suite for implementation changes:
- `npm run test:non-ui`
- reference: `../process/non-ui-testing.md`
11. After every implementation response, include a concise UI/UX test checklist.
12. After implementation completion, move related issues to `Implemented` (or explicitly request human move when tracker write access is unavailable).

## Testing Ownership

1. AI/Codex owns non-UI reproducible tests (CLI, HTTP, browser-console smoke).
2. Human owns interface/visual/UX testing and final UI acceptance.

## Required Escalation in Output

When uncertain or when assumptions affect architecture/contracts, AI must explicitly call out assumptions and their impact before merge.
