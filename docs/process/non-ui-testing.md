# Non-UI Testing (Codex-Owned)

This project uses a split testing ownership model:

1. Codex owns all reproducible **non-UI tests** (CLI/HTTP/browser-console).
2. Human owns **interface testing** (visual UX, layout, interaction feel).

## Scope

### Codex scope

1. JS syntax checks (`node --check`).
2. PHP syntax checks (`php -l`).
3. HTTP smoke checks:
   - page is reachable
   - atlas container + config URL markers exist
   - `/wp-json/tdw-atlas/v1/config` payload contract basics
   - `/wp-json/tdw-atlas/v1/preview` placeholder contract basics
4. Browser console smoke (headless):
   - page loads
   - no JS `pageerror`
   - no failed Atlas asset/API requests
   - no unexpected TDW console errors (known expected errors can be whitelisted by regex)
5. Optional WP-CLI smoke (`db_reset` + option read) when CLI is available.

### Human scope

1. Visual layout and styling quality.
2. Interaction feel and UX quality.
3. Cross-device interface behavior.
4. Final acceptance for release.

## Setup (one-time)

From plugin root:

```bash
npm install
npm run test:setup
```

`test:setup` installs Chromium for Playwright.

Test runners live in `/tests`.

## Run commands

```bash
npm run test:static
npm run test:http
npm run test:browser
npm run test:non-ui
```

`test:non-ui` runs `static + http + browser`, then optional wp-cli smoke.

## Environment variables

```bash
TDW_ATLAS_BASE_URL=https://thedesertwhale.local
TDW_ATLAS_PAGE_PATH=/laenderinfo-startseite/
TDW_ATLAS_MAP_ID=world
TDW_ATLAS_EXPECTED_ERROR_REGEX='Unknown map id:|Missing map id \(data-map-id\)'
```

Optional wp-cli execution:

```bash
TDW_ATLAS_RUN_WPCLI=1
TDW_ATLAS_WP_ROOT="/Users/justin/Local Sites/thedesertwhale/app/public"
TDW_ATLAS_WP_BIN=/opt/homebrew/bin/wp
```

Local (by Flywheel) environment bootstrap (recommended when DB socket/env is managed by Local):

```bash
TDW_ATLAS_RUN_WPCLI=1
TDW_ATLAS_LOCAL_ENV_SCRIPT="/Users/justin/Library/Application Support/Local/ssh-entry/<site-shell>.sh"
```

When `TDW_ATLAS_LOCAL_ENV_SCRIPT` is set, `wp-cli-smoke.sh` imports required Local vars (`MYSQL_HOME`, `PHPRC`, `WP_CLI_CONFIG_PATH`, `PATH`, ... ) before running wp-cli.

## Notes

1. If `wp` is not in the Codex PATH, wp-cli smoke is skipped unless configured.
2. Browser-console smoke is intentionally non-visual; it is not a substitute for interface testing.
