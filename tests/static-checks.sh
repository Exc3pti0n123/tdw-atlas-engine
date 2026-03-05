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

if [[ -e atlas.map-template.seed.json ]]; then
  echo "[static] FAIL: legacy atlas.map-template.seed.json must not exist (hard-cut map-seed model)."
  exit 1
fi

if [[ -d data/maps ]]; then
  echo "[static] FAIL: legacy data/maps directory must not exist (datasets now live in data/dataset)."
  exit 1
fi

if [[ ! -f data/seed/atlas.runtime.seed.json ]]; then
  echo "[static] FAIL: required seed file missing: data/seed/atlas.runtime.seed.json"
  exit 1
fi

if [[ ! -f data/seed/atlas.map.seed.json ]]; then
  echo "[static] FAIL: required seed file missing: data/seed/atlas.map.seed.json"
  exit 1
fi

if rg -q "Back to Maps" assets/admin/atlas-admin.js; then
  echo "[static] FAIL: legacy \"Back to Maps\" button text must not exist; navigation uses logo/title."
  exit 1
fi

new_close_count="$(rg -o 'data-action="close-new-modal"' assets/admin/atlas-admin.js | wc -l | tr -d ' ')"
if [[ "$new_close_count" -ne 1 ]]; then
  echo "[static] FAIL: close-new-modal action must exist exactly once (Cancel button only)."
  exit 1
fi

delete_close_count="$(rg -o 'data-action="close-delete-modal"' assets/admin/atlas-admin.js | wc -l | tr -d ' ')"
if [[ "$delete_close_count" -ne 1 ]]; then
  echo "[static] FAIL: close-delete-modal action must exist exactly once (Cancel button only)."
  exit 1
fi

if ! rg -q "tdw_core_render_admin_header" includes/admin/menu.php; then
  echo "[static] FAIL: Atlas admin page must use tdw-core shared admin header helper."
  exit 1
fi

if ! rg -q "'title' => 'Atlas'" includes/admin/menu.php; then
  echo "[static] FAIL: Atlas shared admin header title contract missing."
  exit 1
fi

if ! rg -q "'refreshMode' => 'soft'" includes/admin/menu.php; then
  echo "[static] FAIL: Atlas shared admin header refreshMode contract must be soft."
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
node --check assets/admin/atlas-admin.js

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
php -l includes/admin/index.php
php -l includes/admin/menu.php
php -l includes/admin/assets.php
php -l includes/admin/api/routes.php
php -l includes/admin/api/handlers.php
php -l includes/admin/service/validation.php
php -l includes/admin/service/transactions.php
php -l includes/admin/service/repository.php

echo "[static] OK"
