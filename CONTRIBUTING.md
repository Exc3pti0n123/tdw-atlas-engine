# Contributing to TDW Atlas Engine

This repository uses strict contracts and explicit documentation ownership.

## Working Model

- Code branches are prepared by human or AI contributors.
- Code merges are human-approved.
- Standard merge type is squash:
  - `1 PR = 1 commit` on `main`.

## Mandatory Context Pack (AI and Human Review Baseline)

Before planning/coding/docs work, read:

1. `docs/contracts.md`
2. `docs/system-architecture.md`
3. `docs/process/merge-strategy.md`
4. latest merge capsule under `docs/context/merges/`

## Documentation Update Duty

Every relevant change must update matching docs in the same PR:

- contracts
- architecture docs
- ADR (if architecture decision changed)
- version references (if affected)
- merge context capsule

## JS Module Standard

Atlas JS modules must keep this section layout:

1. `MODULE INIT`
2. `FUNCTIONS`
3. `PUBLIC API`
4. `AUTO-RUN`

Template:
- `docs/templates/module-template.md`
- `docs/templates/module-template-custom.md` (only if custom sections are required)

Non-trivial functions should include JSDoc.
Logger boilerplate is mandatory:
- `const { dlog = () => {}, dwarn = () => {}, derror = (...args) => console.error('[TDW ATLAS FATAL]', \`[\${SCOPE}]\`, ...args) } = window.TDW?.Logger?.createScopedLogger?.(SCOPE) || {};`

## Validation Before PR

One-command non-UI suite (preferred):

```bash
npm run test:non-ui
```

Individual commands:

PHP:

```bash
php -l tdw-atlas-engine.php
php -l includes/runtime/normalize.php
php -l includes/runtime/payload.php
php -l includes/runtime/index.php
php -l includes/db/tables.php
php -l includes/db/helpers.php
php -l includes/db/seed.php
php -l includes/db/schema.php
php -l includes/db/cli.php
php -l includes/db/index.php
php -l includes/rest/helpers.php
php -l includes/rest/preview.php
php -l includes/rest/handlers.php
php -l includes/rest/routes.php
php -l includes/rest/index.php
```

JS:

```bash
node --check assets/js/atlas-adapter.js
node --check assets/adapter/leaflet/atlas-leaflet.js
node --check assets/js/atlas-core.js
node --check assets/js/atlas-boot.js
node --check assets/js/helpers/atlas-cookie-ops.js
node --check assets/shared/tdw-bridge.js
node --check assets/shared/tdw-logger.js
```

Browser/HTTP smoke details:
- `docs/process/non-ui-testing.md`

## PR Requirements

- issue link in PR description
- clear test status: `implemented`, `partially tested`, or `done tested`
- docs checklist completed
- merge context capsule added for non-trivial changes

## References

- docs index: `docs/README.md`
- quick checklists: `docs/process/quick-checklists.md`
- merge policy: `docs/process/merge-strategy.md`
- release checklist: `docs/process/release-checklist.md`
- non-ui testing: `docs/process/non-ui-testing.md`
