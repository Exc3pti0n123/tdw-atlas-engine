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

echo "[wp-cli] checking mismatch severity thresholds (yellow/red)..."
"$WP_BIN" eval '
require_once WP_PLUGIN_DIR . "/tdw-atlas-engine/includes/admin/index.php";

$map_key = "mismatch-qa";
$dataset_path = "data/dataset/ne_50m_admin_0_countries_lakes.json";

$create = tdw_atlas_admin_with_transaction(function () use ($map_key, $dataset_path) {
  return tdw_atlas_admin_repo_create_map_from_seed(array(
    "label" => "Mismatch QA",
    "map_key" => $map_key,
    "dataset_path" => $dataset_path,
  ));
});

if (is_wp_error($create)) {
  fwrite(STDERR, "[wp-cli] FAIL: create map for mismatch test failed: " . $create->get_error_message() . PHP_EOL);
  exit(1);
}

global $wpdb;
$maps_table = tdw_atlas_table_maps();
$members_table = tdw_atlas_table_grouping_members();
$review_table = tdw_atlas_table_country_review();
$whitelist_table = tdw_atlas_table_whitelist_entries();

$map_row = tdw_atlas_admin_repo_get_map($map_key);
if (is_wp_error($map_row) || !is_array($map_row)) {
  fwrite(STDERR, "[wp-cli] FAIL: unable to load created map for whitelist regression check." . PHP_EOL);
  exit(1);
}

$dataset_key = (string) ($map_row["datasetKey"] ?? "");
if ($dataset_key === "") {
  fwrite(STDERR, "[wp-cli] FAIL: dataset key missing for whitelist regression check." . PHP_EOL);
  exit(1);
}

$whitelist_before = (int) $wpdb->get_var(
  $wpdb->prepare(
    "SELECT COUNT(*) FROM {$whitelist_table} WHERE dataset_key = %s AND scope_type = 'map' AND scope_key = %s AND is_included = 1",
    $dataset_key,
    $map_key
  )
);
if (!empty($wpdb->last_error)) {
  fwrite(STDERR, "[wp-cli] FAIL: whitelist pre-count query failed: " . $wpdb->last_error . PHP_EOL);
  exit(1);
}

$map_row["label"] = "Mismatch QA (updated)";
$normalized_update = tdw_atlas_admin_validate_map_payload($map_row, false, $map_key);
if (is_wp_error($normalized_update)) {
  fwrite(STDERR, "[wp-cli] FAIL: map payload validation failed for whitelist regression check: " . $normalized_update->get_error_message() . PHP_EOL);
  exit(1);
}

$update_result = tdw_atlas_admin_with_transaction(function () use ($normalized_update) {
  return tdw_atlas_admin_repo_upsert_map($normalized_update, false);
});
if (is_wp_error($update_result)) {
  fwrite(STDERR, "[wp-cli] FAIL: map update failed for whitelist regression check: " . $update_result->get_error_message() . PHP_EOL);
  exit(1);
}

$whitelist_after = (int) $wpdb->get_var(
  $wpdb->prepare(
    "SELECT COUNT(*) FROM {$whitelist_table} WHERE dataset_key = %s AND scope_type = 'map' AND scope_key = %s AND is_included = 1",
    $dataset_key,
    $map_key
  )
);
if (!empty($wpdb->last_error)) {
  fwrite(STDERR, "[wp-cli] FAIL: whitelist post-count query failed: " . $wpdb->last_error . PHP_EOL);
  exit(1);
}

if ($whitelist_after !== $whitelist_before) {
  fwrite(STDERR, "[wp-cli] FAIL: whitelist entries changed after general map update (before={$whitelist_before}, after={$whitelist_after})." . PHP_EOL);
  exit(1);
}

$row = $wpdb->get_row(
  $wpdb->prepare(
    "SELECT grouping_set_id FROM {$maps_table} WHERE map_key = %s LIMIT 1",
    $map_key
  ),
  ARRAY_A
);
if (!is_array($row) || (int) ($row["grouping_set_id"] ?? 0) <= 0) {
  fwrite(STDERR, "[wp-cli] FAIL: grouping_set_id missing for mismatch test map." . PHP_EOL);
  exit(1);
}

$set_id = (int) $row["grouping_set_id"];
$codes = $wpdb->get_col(
  $wpdb->prepare(
    "SELECT country_code FROM {$members_table} WHERE set_id = %d ORDER BY country_code ASC LIMIT 10",
    $set_id
  )
);
if (!is_array($codes) || count($codes) < 10) {
  fwrite(STDERR, "[wp-cli] FAIL: expected at least 10 countries for mismatch test map." . PHP_EOL);
  exit(1);
}

$now = current_time("mysql", true);
$first_code = (string) $codes[0];

$wpdb->update(
  $members_table,
  array("region_key" => "unassigned"),
  array("set_id" => $set_id, "country_code" => $first_code),
  array("%s"),
  array("%d", "%s")
);
$wpdb->replace(
  $review_table,
  array(
    "map_key" => $map_key,
    "country_code" => $first_code,
    "is_confirmed" => 0,
    "updated_at" => $now,
  ),
  array("%s", "%s", "%d", "%s")
);

$yellow = tdw_atlas_admin_repo_list_map_countries($map_key);
if (is_wp_error($yellow)) {
  fwrite(STDERR, "[wp-cli] FAIL: yellow severity read failed: " . $yellow->get_error_message() . PHP_EOL);
  exit(1);
}
$yellow_summary = is_array($yellow["mismatchSummary"] ?? null) ? $yellow["mismatchSummary"] : array();
if ((string) ($yellow_summary["severity"] ?? "") !== "yellow") {
  fwrite(STDERR, "[wp-cli] FAIL: expected yellow severity for 1 mismatch." . PHP_EOL);
  exit(1);
}

foreach ($codes as $country_code) {
  $country_code = (string) $country_code;
  $wpdb->update(
    $members_table,
    array("region_key" => "unassigned"),
    array("set_id" => $set_id, "country_code" => $country_code),
    array("%s"),
    array("%d", "%s")
  );
  $wpdb->replace(
    $review_table,
    array(
      "map_key" => $map_key,
      "country_code" => $country_code,
      "is_confirmed" => 0,
      "updated_at" => $now,
    ),
    array("%s", "%s", "%d", "%s")
  );
}

$red = tdw_atlas_admin_repo_list_map_countries($map_key);
if (is_wp_error($red)) {
  fwrite(STDERR, "[wp-cli] FAIL: red severity read failed: " . $red->get_error_message() . PHP_EOL);
  exit(1);
}
$red_summary = is_array($red["mismatchSummary"] ?? null) ? $red["mismatchSummary"] : array();
if ((string) ($red_summary["severity"] ?? "") !== "red") {
  fwrite(STDERR, "[wp-cli] FAIL: expected red severity for >=10 mismatches." . PHP_EOL);
  exit(1);
}
if ((int) ($red_summary["openCount"] ?? 0) < 10) {
  fwrite(STDERR, "[wp-cli] FAIL: expected openCount >= 10 in red severity check." . PHP_EOL);
  exit(1);
}
' >/dev/null

echo "[wp-cli] OK"
