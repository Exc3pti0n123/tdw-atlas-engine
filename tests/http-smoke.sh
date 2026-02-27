#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${TDW_ATLAS_BASE_URL:-https://thedesertwhale.local}"
PAGE_PATH="${TDW_ATLAS_PAGE_PATH:-/laenderinfo-startseite/}"
MAP_ID="${TDW_ATLAS_MAP_ID:-world}"

page_tmp="$(mktemp)"
config_tmp="$(mktemp)"
preview_tmp="$(mktemp)"
trap 'rm -f "$page_tmp" "$config_tmp" "$preview_tmp"' EXIT

echo "[http] GET ${BASE_URL}${PAGE_PATH}"
curl -kfsS "${BASE_URL}${PAGE_PATH}" >"$page_tmp"

if ! grep -q 'data-tdw-atlas="1"' "$page_tmp"; then
  echo "[http] FAIL: atlas container marker not found in page HTML."
  exit 1
fi

if ! grep -q 'data-config-url="' "$page_tmp"; then
  echo "[http] FAIL: data-config-url not found in page HTML."
  exit 1
fi

echo "[http] GET runtime config"
curl -kfsS "${BASE_URL}/wp-json/tdw-atlas/v1/config?map_ids=${MAP_ID}" >"$config_tmp"

node - "$config_tmp" "$MAP_ID" <<'NODE'
const fs = require('node:fs');
const file = process.argv[2];
const mapId = process.argv[3];
const raw = fs.readFileSync(file, 'utf8');
let json;
try {
  json = JSON.parse(raw);
} catch (err) {
  console.error('[http] FAIL: /config payload is not valid JSON.');
  process.exit(1);
}

if (!json || typeof json !== 'object') {
  console.error('[http] FAIL: /config payload missing object root.');
  process.exit(1);
}

if (!json.meta || !json.meta.version) {
  console.error('[http] FAIL: /config payload missing meta.version.');
  process.exit(1);
}

if (!json.maps || !json.maps[mapId]) {
  console.error(`[http] FAIL: /config payload missing maps.${mapId}.`);
  process.exit(1);
}

const m = json.maps[mapId];
if (!m.adapter || !m.geojson || !m.datasetKey) {
  console.error(`[http] FAIL: maps.${mapId} missing adapter/geojson/datasetKey.`);
  process.exit(1);
}

if (!m.grouping || !m.whitelist || !m.preprocess) {
  console.error(`[http] FAIL: maps.${mapId} missing grouping/whitelist/preprocess blocks.`);
  process.exit(1);
}

if (!m.ui || !m.ui.preview) {
  console.error(`[http] FAIL: maps.${mapId}.ui.preview missing.`);
  process.exit(1);
}

console.log('[http] /config payload OK');
NODE

echo "[http] GET preview placeholder"
curl -kfsS "${BASE_URL}/wp-json/tdw-atlas/v1/preview?map_id=${MAP_ID}&scope=country&key=DE" >"$preview_tmp"

node - "$preview_tmp" "$MAP_ID" <<'NODE'
const fs = require('node:fs');
const file = process.argv[2];
const mapId = process.argv[3];
const raw = fs.readFileSync(file, 'utf8');
let json;
try {
  json = JSON.parse(raw);
} catch (err) {
  console.error('[http] FAIL: /preview payload is not valid JSON.');
  process.exit(1);
}

const required = ['mapId', 'scope', 'key', 'title', 'teaser', 'readMoreUrl', 'placeholder'];
for (const key of required) {
  if (!(key in json)) {
    console.error(`[http] FAIL: /preview payload missing key "${key}".`);
    process.exit(1);
  }
}

if (json.mapId !== mapId) {
  console.error(`[http] FAIL: /preview mapId mismatch, expected "${mapId}", got "${json.mapId}".`);
  process.exit(1);
}

if (json.scope !== 'country' || json.key !== 'DE') {
  console.error('[http] FAIL: /preview returned unexpected scope/key.');
  process.exit(1);
}

console.log('[http] /preview payload OK');
NODE

echo "[http] OK"
