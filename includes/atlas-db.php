<?php

if (!defined('ABSPATH')) exit;

function tdw_atlas_table_maps() {
  global $wpdb;
  return $wpdb->prefix . 'tdw_atlas_maps';
}

function tdw_atlas_seed_db_from_defaults_if_needed() {
  global $wpdb;

  $defaults = tdw_atlas_load_json_defaults();
  if (!is_array($defaults)) return;

  if (get_option(TDW_ATLAS_OPTION_SETTINGS, null) === null) {
    add_option(TDW_ATLAS_OPTION_SETTINGS, array(
      'debug' => (bool) ($defaults['debug'] ?? false),
      'vendor' => tdw_atlas_normalize_vendor($defaults['vendor'] ?? array(), $defaults['vendor'] ?? array()),
      'views' => is_array($defaults['views'] ?? null) ? $defaults['views'] : array(),
    ), '', false);
  }

  $table = tdw_atlas_table_maps();
  $count = (int) $wpdb->get_var("SELECT COUNT(*) FROM {$table}");
  if ($count > 0) return;

  $maps = is_array($defaults['maps'] ?? null) ? $defaults['maps'] : array();
  foreach ($maps as $map_key => $map) {
    $key = trim((string) $map_key);
    $geojson = trim((string) ($map['geojson'] ?? ''));
    if ($key === '' || $geojson === '') continue;
    $view = trim((string) ($map['view'] ?? ''));
    $wpdb->insert(
      $table,
      array(
        'map_key' => $key,
        'label' => ucwords(str_replace(array('-', '_'), ' ', $key)),
        'geojson_path' => $geojson,
        'view_key' => $view,
        'is_active' => 1,
        'sort_order' => 0,
        'created_at' => current_time('mysql', true),
        'updated_at' => current_time('mysql', true),
      ),
      array('%s', '%s', '%s', '%s', '%d', '%d', '%s', '%s')
    );
  }
}

function tdw_atlas_db_install_or_upgrade() {
  global $wpdb;

  $table = tdw_atlas_table_maps();
  $charset_collate = $wpdb->get_charset_collate();
  $sql = "CREATE TABLE {$table} (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    map_key VARCHAR(64) NOT NULL,
    label VARCHAR(191) NOT NULL,
    geojson_path TEXT NOT NULL,
    view_key VARCHAR(64) NULL DEFAULT '',
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    sort_order INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    PRIMARY KEY  (id),
    UNIQUE KEY map_key (map_key),
    KEY is_active_sort (is_active, sort_order)
  ) {$charset_collate};";

  require_once ABSPATH . 'wp-admin/includes/upgrade.php';
  dbDelta($sql);

  $system = get_option(TDW_ATLAS_OPTION_SYSTEM, array());
  if (!is_array($system)) $system = array();
  $system['db_schema_version'] = TDW_ATLAS_DB_SCHEMA_VERSION;
  $system['seed_source_version'] = TDW_ATLAS_PLUGIN_VERSION;
  $system['last_migrated_at'] = current_time('mysql', true);
  update_option(TDW_ATLAS_OPTION_SYSTEM, $system, false);

  tdw_atlas_seed_db_from_defaults_if_needed();
}

function tdw_atlas_activate() {
  tdw_atlas_db_install_or_upgrade();
}

function tdw_atlas_maybe_upgrade() {
  $system = get_option(TDW_ATLAS_OPTION_SYSTEM, array());
  $schema = is_array($system) && isset($system['db_schema_version']) ? (int) $system['db_schema_version'] : 0;
  if ($schema < TDW_ATLAS_DB_SCHEMA_VERSION) {
    tdw_atlas_db_install_or_upgrade();
  } else {
    tdw_atlas_seed_db_from_defaults_if_needed();
  }
}
