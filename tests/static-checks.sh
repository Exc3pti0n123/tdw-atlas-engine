#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -e assets/shared/tdw-bridge.js || -e assets/shared/tdw-logger.js ]]; then
  echo "[static] FAIL: local shared TDW modules must not exist in Atlas (owned by tdw-core)."
  exit 1
fi

if [[ -d assets/vendor/js-cookie ]]; then
  echo "[static] FAIL: local js-cookie vendor copy must not exist in Atlas (owned by tdw-core)."
  exit 1
fi

echo "[static] JS syntax checks..."
node --check assets/js/atlas-adapter.js
node --check assets/js/atlas-boot.js
node --check assets/js/atlas-core.js
node --check assets/js/runtime/atlas-preprocessor.js
node --check assets/js/runtime/atlas-preprocessor-whitelist.js
node --check assets/js/runtime/atlas-preprocessor-grouping.js
node --check assets/js/runtime/atlas-preprocessor-transform.js
node --check assets/js/helpers/atlas-cookie-ops.js
node --check assets/js/ui/atlas-preview-content.js
node --check assets/js/ui/atlas-preview.js
node --check assets/js/ui/atlas-preview-dom.js
node --check assets/js/ui/atlas-preview-placement.js
node --check assets/adapter/leaflet/atlas-leaflet.js
node --check assets/adapter/leaflet/atlas-leaflet-transition.js

echo "[static] PHP syntax checks..."
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

echo "[static] OK"
