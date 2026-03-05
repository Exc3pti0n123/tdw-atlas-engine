# Merge Capsule: 2026-03-05 PR-0000 map-seed-dataset-create-and-admin-tabs

## Scope

1. Hard-cut from template-based create flow to unified map-seed + dataset create flow.
2. Replaced legacy `atlas.map-template.seed.json` contract with `data/seed/atlas.map.seed.json`.
3. Added dataset catalog contract `data/dataset/*` and removed `data/maps` as active source.
4. Added Atlas admin tabbed edit flow (`General`, `Countries`) with debounced autosave endpoints.
5. Added mismatch review workflow with fixed threshold policy (`>=10` create block).

## Changed Areas

1. Seed/data structure:
- `data/seed/atlas.runtime.seed.json`
- `data/seed/atlas.map.seed.json`
- `data/dataset/ne_50m_admin_0_countries_lakes.json`

2. Atlas admin backend:
- `includes/admin/api/routes.php`
- `includes/admin/api/handlers.php`
- `includes/admin/service/validation.php`
- `includes/admin/service/repository.php`

3. Atlas admin frontend:
- `assets/admin/atlas-admin.js`
- `assets/admin/atlas-admin.css`

4. DB/runtime layer:
- `includes/db/schema.php`
- `includes/db/seed.php`
- `includes/runtime/normalize.php`
- `includes/runtime/payload.php`
- `tdw-atlas-engine.php`

5. Documentation + tests:
- `docs/contracts.md`
- `docs/system-architecture.md`
- `docs/architecture/config-lifecycle.md`
- `docs/architecture/database-model.md`
- `docs/diagrams/config-dataflow.md`
- `docs/README.md`
- `docs/onboarding/human.md`
- `docs/onboarding/machine.md`
- `tests/static-checks.sh`

## Decision Summary

1. Runtime seed remains independent (`data/seed/atlas.runtime.seed.json`).
2. Create flow source is now only `atlas.map.seed` + selected dataset path.
3. `description` is map field in DB and admin (`ungeseeded`).
4. Country mapping is map-specific via map-owned grouping set (`source_type=map`).
5. Missing profile policy is fixed in code and not user-configurable.
6. Template endpoints and template persistence were removed from active contract.

## Contract Impact

1. Added/active admin endpoints:
- `GET /admin/datasets`
- `POST /admin/maps/create`
- `PUT /admin/maps/{map_key}/general`
- `GET /admin/maps/{map_key}/countries`
- `PUT /admin/maps/{map_key}/countries`

2. Removed admin endpoints from active contract:
- `GET /admin/templates`
- `POST /admin/maps/create-from-template`
- `PUT /admin/defaults/map-template`

3. Active seed files:
- `data/seed/atlas.runtime.seed.json`
- `data/seed/atlas.map.seed.json`

4. `maps` runtime remains DB-authoritative and empty-map state remains valid.

## Tests and Status

1. Atlas: `npm run test:static` (pass)
2. Atlas: `npm run test:non-ui` (pass)
3. Status: `done tested`

## Risks / Follow-ups

1. SVG dataset discovery is cataloged, but create remains limited to extractable country datasets.
2. Existing DB columns from prior dev snapshots may persist physically if not recreated by DB reset; runtime/admin no longer depend on template columns.
3. Export/import of country profiles remains future scope.

## Links

1. Issue: `#35` (seed/data contract)
2. Issue: `#14` (admin GUI)
3. PR: `PR-0000`
4. ADR: none
