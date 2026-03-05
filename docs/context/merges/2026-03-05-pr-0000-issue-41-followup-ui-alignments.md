# Merge Capsule: 2026-03-05 PR-0000 issue-41-followup-ui-alignments

## Scope

1. Aligned shared admin header sizing so Core/Design match Atlas title presentation.
2. Removed unnecessary Atlas list horizontal scroll by rebalancing table column sizing.
3. Enforced edit-title limit (`max 32`) in Atlas general form UI and backend validation.
4. Hardened invalid-field marking for general form by mapping API error text back to field highlights.
5. Added Atlas edit-mode Orca hover back-navigation cue.

## Changed Areas

1. Atlas admin frontend:
- `assets/admin/atlas-admin.js`
- `assets/admin/atlas-admin.css`

2. Atlas admin validation/contracts:
- `includes/admin/service/validation.php`
- `docs/contracts.md`

3. Core shared admin shell:
- `../tdw-core/tdw-core.php`

## Decision Summary

1. Shared header style is centralized in `tdw-core`; sibling plugins inherit the same visual baseline.
2. Atlas list keeps truncation (`title<=32 preview`, `shortcode id<=8 preview`) but uses natural table sizing to avoid avoidable scrolling.
3. `PUT /admin/maps/{map_key}/general` now enforces `label <= 32` as a strict write rule.
4. In edit mode only, the Orca/title area exposes a hover chevron cue and remains back-to-list navigation.

## Tests and Status

1. Atlas: `npm run test:static` (pass)
2. Atlas: `npm run test:non-ui` (fails in local env: `/config` returns existing runtime error `tdw_atlas_grouping_set_not_found` for map `hallo--2`)
3. Atlas: `node --check assets/admin/atlas-admin.js` (pass)
4. Atlas: `php -l includes/admin/service/validation.php` (pass)
5. Core: `php -l ../tdw-core/tdw-core.php` (pass)

## Links

1. Issue: `#41`
2. PR: `PR-0000`
3. ADR: No ADR required (header/table/UI alignment follow-up)
