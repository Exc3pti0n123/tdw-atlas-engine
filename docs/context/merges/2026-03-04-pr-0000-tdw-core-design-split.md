# Merge Capsule: 2026-03-04 PR-0000 tdw-core-design-split

## Scope

- Hard-cut split of former `tdw-site-core` into:
  - `tdw-core` (shared runtime library)
  - `tdw-design` (global CSS + theme toggle UI)
- Move shared JS runtime resources (`tdw-bridge`, `tdw-logger`, `js-cookie`) out of Atlas into `tdw-core`.
- Make Atlas declare and enforce dependency on `tdw-core`.
- Update Atlas docs/contracts/testing references to the new ownership model.

## Changed areas

1. Atlas runtime bootstrap and dependency guard:
- `tdw-atlas-engine.php`

2. Atlas static checks / contributor docs:
- `tests/static-checks.sh`
- `CONTRIBUTING.md`
- `AGENTS.md`

3. Atlas architecture/contracts/docs:
- `docs/contracts.md`
- `docs/system-architecture.md`
- `docs/architecture/module-graph.md`
- `docs/diagrams/module-dependencies.md`
- `docs/README.md`
- `docs/onboarding/human.md`
- `docs/onboarding/machine.md`
- `docs/definitions.md`
- `docs/templates/module-template.md`

4. New sibling plugins and moved files (outside Atlas repo):
- `../tdw-core/tdw-core.php`
- `../tdw-core/assets/shared/tdw-bridge.js`
- `../tdw-core/assets/shared/tdw-logger.js`
- `../tdw-core/assets/vendor/js-cookie/3.0.5/*`
- `../tdw-design/tdw-design.php`
- `../tdw-design/global.css`
- `../tdw-design/theme-toggle.js`

## Decision summary

1. Hard-cut slug migration:
- `tdw-site-core` -> `tdw-core`
- no legacy shim plugin

2. Dependency model:
- WordPress header dependency via `Requires Plugins: tdw-core`
- runtime guard in Atlas for missing/invalid Core shared contract

3. Ownership split:
- `tdw-core`: namespace/shared bridge/logger library
- `tdw-design`: design tokens/global CSS/theme toggle
- `tdw-atlas-engine`: consumer of `tdw-core` shared modules

4. Public design surface stability:
- `[tdw_theme_toggle]` retained in `tdw-design`
- `--tdw-*` token names retained

## Contract impact

1. Atlas now depends on sibling plugin `tdw-core` for shared modules (`tdw-bridge`, `tdw-logger`).
2. Atlas no longer owns/ships shared bridge/logger/js-cookie resources.
3. Atlas token-provider stakeholder moved from `tdw-site-core` to `tdw-design` (optional provider contract).
4. No change to Atlas REST routes (`/config`, `/preview`) and read-only security baseline.

## Tests and status

- Required static/non-ui tests executed in Atlas repo.
- Additional syntax checks executed for sibling plugins (`tdw-core`, `tdw-design`).
- Status: `done tested`.

## Risks / open follow-ups

1. Existing local sites that still reference old plugin folder slug `tdw-site-core` require plugin reactivation flow after rename.
2. Optional follow-up: central TDW admin menu registration in `tdw-core` with plugin-specific submenu pages.
3. Optional follow-up: token availability setting in Atlas Admin GUI (`useDesignTokensWhenAvailable`).

## Links to issue/PR/ADR

- Issue: `#22` outsource helpers into TDW Core
- PR: `PR-0000` (fill final PR number)
- ADR: no new ADR in this patch (structure split documented via contracts + architecture + merge capsule)
