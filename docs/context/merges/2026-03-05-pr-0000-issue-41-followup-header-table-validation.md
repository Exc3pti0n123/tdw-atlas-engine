# Merge Capsule: 2026-03-05 PR-0000 issue-41-followup-header-table-validation

## Scope

1. Unified Atlas header styling to the shared Core header source by removing Atlas-local header overrides.
2. Improved map-list responsive behavior: keep Actions stable, collapse Description first, then narrow Shortcode/Title.
3. Hardened general-form invalid marker mapping for `datasetKey` and other top fields using both error message and API error code.
4. Refined edit-header back-navigation cue (chevron) to match requested visual placement and style.

## Changed Areas

1. Atlas admin frontend:
- `assets/admin/atlas-admin.css`
- `assets/admin/atlas-admin.js`

## Decision Summary

1. Core remains single source of truth for admin header base styling.
2. Atlas table responsiveness now prioritizes action availability and progressive column collapse.
3. API errors now propagate `code` to the client marker logic for more reliable field highlighting.

## Tests and Status

1. Atlas: `node --check assets/admin/atlas-admin.js` (pass)
2. Atlas: `npm run test:static` (pass)
3. Atlas: `npm run test:non-ui` (pass)

## Links

1. Issue: `#41`
2. PR: `PR-0000`
