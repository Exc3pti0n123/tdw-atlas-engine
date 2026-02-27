#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[non-ui] start"
bash tests/static-checks.sh
bash tests/http-smoke.sh
node tests/browser-console-smoke.mjs

if [[ "${TDW_ATLAS_RUN_WPCLI:-0}" == "1" ]]; then
  bash tests/wp-cli-smoke.sh
else
  echo "[non-ui] wp-cli smoke skipped (set TDW_ATLAS_RUN_WPCLI=1 to enable)"
fi

echo "[non-ui] all checks passed"
