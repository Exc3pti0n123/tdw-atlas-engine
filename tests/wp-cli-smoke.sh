#!/usr/bin/env bash
set -euo pipefail

WP_ROOT="${TDW_ATLAS_WP_ROOT:-/Users/justin/Local Sites/thedesertwhale/app/public}"
WP_BIN="${TDW_ATLAS_WP_BIN:-}"
LOCAL_ENV_SCRIPT="${TDW_ATLAS_LOCAL_ENV_SCRIPT:-}"

apply_local_env_script() {
  local script="$1"
  [[ -f "$script" ]] || return 0

  echo "[wp-cli] applying Local env from: $script"

  while IFS= read -r line || [[ -n "$line" ]]; do
    case "$line" in
      export\ MYSQL_HOME=*|\
      export\ PHPRC=*|\
      export\ WP_CLI_CONFIG_PATH=*|\
      export\ WP_CLI_DISABLE_AUTO_CHECK_UPDATE=*|\
      export\ MAGICK_CODER_MODULE_PATH=*|\
      export\ PATH=*)
        eval "$line"
        ;;
    esac
  done < "$script"
}

if [[ -n "$LOCAL_ENV_SCRIPT" ]]; then
  apply_local_env_script "$LOCAL_ENV_SCRIPT"
fi

if [[ -z "$WP_BIN" ]]; then
  for candidate in \
    "wp" \
    "/Applications/Local.app/Contents/Resources/extraResources/bin/wp-cli/posix/wp" \
    "/opt/homebrew/bin/wp" \
    "/usr/local/bin/wp"; do
    if command -v "$candidate" >/dev/null 2>&1; then
      WP_BIN="$candidate"
      break
    fi
  done
fi

if [[ -z "$WP_BIN" ]]; then
  echo "[wp-cli] FAIL: wp-cli not found."
  echo "[wp-cli] Hint: export TDW_ATLAS_WP_BIN=/absolute/path/to/wp"
  exit 1
fi

cd "$WP_ROOT"

echo "[wp-cli] running db_reset..."
"$WP_BIN" tdw-atlas db_reset >/dev/null

echo "[wp-cli] reading system option..."
"$WP_BIN" option get tdw_atlas_system --format=json >/dev/null

echo "[wp-cli] OK"
