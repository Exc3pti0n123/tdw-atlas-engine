# Merge Capsule: 2026-03-05 PR-0000 issue-41-admin-list-ux-polish

## Scope

1. Completed Atlas admin list UX polish for issue #41.
2. Added row actions (`Edit`, `Duplicate`, `Delete`) and shortcode copy behavior.
3. Enforced create-flow limits (`label<=32`, `mapKey<=8`) in UI and backend validation.
4. Added invalid-field highlighting and unsaved-change guards for tab/header navigation.

## Changed Areas

1. Atlas admin frontend:
- `assets/admin/atlas-admin.js`
- `assets/admin/atlas-admin.css`

2. Atlas admin validation:
- `includes/admin/service/validation.php`

3. Contracts:
- `docs/contracts.md`

## Decision Summary

1. List columns are now `Title | Shortcode | Description | Actions`.
2. Long values are display-truncated in list only; copy uses full shortcode.
3. Duplicate action clones map general config and countries config.
4. Tab/header navigation flushes pending autosave first; on save error/dirty state user must confirm discard.

## Contract Impact

1. `POST /admin/maps/create` input limits are now explicit contract:
- `label`: max 32 chars
- `mapKey`: max 8 chars

2. Public runtime contracts are unchanged.

## Tests and Status

1. Atlas: `npm run test:static` (pass)
2. Atlas: `npm run test:non-ui` (pass)
3. Status: done tested

## Links

1. Issue: `#41`
2. PR: `PR-0000`
