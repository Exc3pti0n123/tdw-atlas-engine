# Merge Capsule: 2026-03-03 PR-0000 security-baseline-minimal5

## Scope

- Implement minimal 5-rule security baseline for v0.2.0.
- Harden REST input handling to strict fail-closed validation.
- Add runtime/seed path safety validation and vendor path checks.
- Update process/docs for mandatory security gates.

## Changed areas

1. REST validation:
- `includes/rest/helpers.php`
- `includes/rest/handlers.php`

2. Runtime and seed hardening:
- `includes/runtime/normalize.php`
- `includes/runtime/payload.php`
- `includes/db/helpers.php`
- `includes/db/seed.php`

3. Tests:
- `tests/http-smoke.sh` now includes negative `400` schema checks.

4. Documentation/process:
- `docs/contracts.md`
- `docs/system-architecture.md`
- `docs/definitions.md`
- `docs/architecture/php-runtime-boundary.md`
- `docs/process/non-ui-testing.md`
- `docs/process/quick-checklists.md`
- `docs/process/release-checklist.md`
- `docs/process/merge-strategy.md`
- `CONTRIBUTING.md`
- `AGENTS.md`

## Decision summary

1. Public REST stays read-only.
2. Invalid security-relevant request input returns `400` (no sanitize-and-continue).
3. Runtime and seed path contracts are strict plugin-local paths.
4. Vendor asset path validation is fail-closed.
5. SQL prepare requirement remains mandatory for variable input.

## Contract impact

1. `/wp-json/tdw-atlas/v1/config` now rejects malformed `map_ids` with `400`.
2. `/wp-json/tdw-atlas/v1/preview` keeps response shape but enforces strict key validation.
3. No new public endpoints.

## Tests and status

- Static checks: required
- Non-UI checks: required
- Added negative API checks in HTTP smoke

Status: `implemented`.

## Risks / open follow-ups

1. Admin write endpoint gate (capability + nonce + strict schema) remains tracked under `#14`.
2. Optional future follow-up: `SECURITY.md` and coordinated disclosure process.

## Links to issue/PR/ADR

- Discussion issue: #36
- PR: `PR-0000` (fill real number on merge)
- ADR: no ADR required (security baseline is process+contract hardening without architecture branch change)
