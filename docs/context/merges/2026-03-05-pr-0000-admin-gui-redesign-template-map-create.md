# Merge Capsule: 2026-03-05 PR-0000 admin-gui-redesign-template-map-create

## Scope

1. Replaced Atlas admin split-view with list-first flow.
2. Added modal-based one-click map creation from `data/maps/*.json` templates.
3. Added bulk-delete modal and transactional delete endpoint.
4. Added `template_source_path` persistence on map rows.
5. Standardized admin page header shell via `tdw-core` in Atlas/Core/Design.

## Changed Areas

1. Atlas admin UI/REST:
- `assets/admin/atlas-admin.js`
- `assets/admin/atlas-admin.css`
- `includes/admin/menu.php`
- `includes/admin/assets.php`
- `includes/admin/api/routes.php`
- `includes/admin/api/handlers.php`
- `includes/admin/service/validation.php`
- `includes/admin/service/repository.php`

2. Atlas data/schema:
- `includes/db/schema.php`
- `data/maps/world.default.v1.json`

3. Cross-project header standard:
- `../../tdw-core/tdw-core.php`
- `../../tdw-design/tdw-design.php`

4. Documentation:
- `docs/contracts.md`
- `docs/system-architecture.md`
- `docs/architecture/config-lifecycle.md`
- `docs/architecture/database-model.md`
- `docs/diagrams/config-dataflow.md`
- `docs/README.md`
- `docs/onboarding/human.md`
- `docs/onboarding/machine.md`

## Decision Summary

1. Atlas list page remains single-focus (maps list + `New | Delete`).
2. Edit mode is explicit route state (`?id=<map_key>`).
3. Reset API remains backend/dev route but is removed from main list UI.
4. Create-map source is template catalog under `data/maps/*.json`.
5. Shared admin header contract is owned by `tdw-core` and consumed by Atlas/Design/Core pages.

## Contract Impact

1. Added admin endpoints:
- `GET /admin/templates`
- `POST /admin/maps/create-from-template`
- `POST /admin/maps/bulk-delete`

2. `tdw_atlas_maps` now includes `template_source_path`.
3. List/get map read-model includes optional `templateSourcePath`.
4. Public runtime routes (`/config`, `/preview`) unchanged.

## Tests and Status

1. Atlas: `npm run test:static`
2. Atlas: `npm run test:non-ui`
3. Core: `php -l tdw-core.php`
4. Core: `node --check assets/shared/tdw-bridge.js`
5. Core: `node --check assets/shared/tdw-logger.js`
6. Design: `php -l tdw-design.php`
7. Design: `node --check theme-toggle.js`
8. Status: `done tested`

## Risks / Follow-ups

1. Existing non-template map-create route is intentionally replaced by template flow in UI contract.
2. Template catalog currently ships with one default template; additional templates are additive in `data/maps`.

## Links

1. Issue: `#14` (Admin GUI)
2. Issue: `#35` (seed/default behavior + admin runtime alignment)
3. PR: `PR-0000`
4. ADR: none
