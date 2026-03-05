# Human Onboarding

## 10-Minute Setup

1. Read:
- `../contracts.md`
- `../system-architecture.md`
- `../process/merge-strategy.md`

2. Run plugin locally and verify:
- `/wp-json/tdw-atlas/v1/config` returns valid JSON (empty `maps` is allowed after reset).
- Atlas admin loads under `TheDesertWhale -> Atlas` with list-first layout (`Maps` + `New | Delete`).
- New-map modal shows datasets from `data/dataset/*`.
- Edit opens via `admin.php?page=tdw-atlas-admin&id=<map_key>`.

3. Run non-UI checks:
- `npm run test:non-ui`
- details: `../process/non-ui-testing.md`
4. Run manual interface testing (visual + interaction feel).

## Quick-Find: Shared Helpers and Templates

1. Module templates:
- `../templates/module-template.md`
- `../templates/module-template-custom.md`
2. Logger helper:
- `../../../tdw-core/assets/shared/tdw-logger.js`
3. Shared normalizers:
- `../../assets/js/helpers/atlas-shared.js`
4. Sister project contracts:
- `../../../tdw-core/docs/contracts.md`
- `../../../tdw-design/docs/contracts.md`

## How to Start a Task

1. Pick/confirm issue.
2. Create branch.
3. Read latest merge capsule (`../context/merges/`).
4. Implement with contract-first approach.
5. Update docs in same PR when behavior/contracts/process changed.

## Done Criteria

- test status declared (`implemented`, `partially tested`, `done tested`)
- non-ui checks passed
- interface testing completed (human-owned)
- contracts/architecture updated if needed
- ADR included when architecture decision changed
- merge capsule added for non-trivial PR
