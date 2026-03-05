# Merge Capsule: 2026-03-04 PR-0000 admin-gui-and-seed-split

## Scope

1. Hard-cut split of Atlas seed model into two files:
- `atlas.runtime.seed.json`
- `atlas.map-template.seed.json`
2. Remove legacy `atlas.seed.json` from active code paths.
3. Allow empty map runtime state (`maps: {}`) as valid.
4. Add isolated Atlas Admin subsystem (`includes/admin/*`, `assets/admin/*`).
5. Add admin write REST surface with transactional map CRUD/reset and strict validation.

## Changed Areas

1. Plugin bootstrap/constants:
- `tdw-atlas-engine.php`

2. Runtime + seed pipeline:
- `includes/runtime/normalize.php`
- `includes/runtime/payload.php`
- `includes/db/seed.php`
- `includes/db/schema.php`
- `includes/db/cli.php`
- `atlas.runtime.seed.json`
- `atlas.map-template.seed.json`
- removed: `atlas.seed.json`

3. Admin subsystem:
- `includes/admin/index.php`
- `includes/admin/menu.php`
- `includes/admin/assets.php`
- `includes/admin/api/routes.php`
- `includes/admin/api/handlers.php`
- `includes/admin/service/validation.php`
- `includes/admin/service/transactions.php`
- `includes/admin/service/repository.php`
- `assets/admin/atlas-admin.js`
- `assets/admin/atlas-admin.css`

4. REST helpers:
- `includes/rest/helpers.php`

5. Tests and docs:
- `tests/static-checks.sh`
- `tests/http-smoke.sh`
- `docs/contracts.md`
- `docs/system-architecture.md`
- `docs/architecture/config-lifecycle.md`
- `docs/architecture/database-model.md`
- `docs/diagrams/config-dataflow.md`
- `docs/README.md`
- `docs/onboarding/human.md`
- `docs/onboarding/machine.md`
- `docs/definitions.md`
- `docs/process/release-process.md`

## Decision Summary

1. Hard-cut incompatible seed transition; no migration layer for old `atlas.seed.json`.
2. No default map row is seeded; empty maps are first-class.
3. `vendor` and `views` remain runtime-global settings.
4. Map template defaults are persisted separately and only used for create-map defaults/fallbacks.
5. Admin write operations are isolated and transaction-wrapped.

## Contract Impact

1. Added runtime seed contracts:
- `TDW_ATLAS_RUNTIME_SEED_FILE`
- `TDW_ATLAS_MAP_TEMPLATE_SEED_FILE`
2. Added option contract:
- `tdw_atlas_map_template_settings`
3. Added admin REST contract under `/wp-json/tdw-atlas/v1/admin/...`.
4. Public runtime contract remains read-only (`/config`, `/preview`).

## Tests and Status

1. `npm run test:static`
2. `npm run test:non-ui`
3. Status: `done tested` (fill after final run in PR thread)

## Risks / Open Follow-ups

1. Existing dev DB must be reset for hard-cut consistency.
2. Admin UI currently focuses on map CRUD/reset; import/export and i18n remain out of scope.
3. Cross-project Admin placeholders in `tdw-core` and `tdw-design` continue in sibling repos.

## Links to issue/PR/ADR

1. Issue: `#35` seed split and defaults model
2. Issue: `#14` Atlas Admin GUI
3. PR: `PR-0000` (fill final PR number)
4. ADR: none (contract + architecture docs updated in same patch)
