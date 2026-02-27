#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

echo "[static] JS syntax checks..."
node --check assets/js/atlas-adapter.js
node --check assets/js/atlas-boot.js
node --check assets/js/atlas-core.js
node --check assets/js/runtime/atlas-map-pipeline.js
node --check assets/js/helpers/atlas-cookie-ops.js
node --check assets/js/ui/atlas-preview-content.js
node --check assets/js/ui/atlas-preview.js
node --check assets/adapter/leaflet/atlas-leaflet.js
node --check assets/shared/tdw-bridge.js
node --check assets/shared/tdw-logger.js

echo "[static] PHP syntax checks..."
php -l tdw-atlas-engine.php
php -l includes/atlas-db.php
php -l includes/atlas-runtime-config.php
php -l includes/atlas-rest.php
php -l includes/atlas-cli.php

echo "[static] OK"
