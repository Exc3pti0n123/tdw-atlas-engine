<?php

if (!defined('ABSPATH')) exit;

function tdw_atlas_db_install_or_upgrade() {
  global $wpdb;

  $charset_collate = $wpdb->get_charset_collate();

  $maps_table = tdw_atlas_table_maps();
  $country_catalog_table = tdw_atlas_table_country_catalog();
  $dataset_features_table = tdw_atlas_table_dataset_features();
  $grouping_sets_table = tdw_atlas_table_grouping_sets();
  $grouping_members_table = tdw_atlas_table_grouping_members();
  $whitelist_table = tdw_atlas_table_whitelist_entries();
  $part_rules_table = tdw_atlas_table_preprocess_part_rules();

  $sql_maps = "CREATE TABLE {$maps_table} (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    map_key VARCHAR(64) NOT NULL,
    label VARCHAR(191) NOT NULL,
    dataset_key VARCHAR(64) NOT NULL,
    geojson_path TEXT NOT NULL,
    view_key VARCHAR(64) NULL DEFAULT '',
    adapter_key VARCHAR(64) NOT NULL DEFAULT 'leaflet',
    sort_order INT NOT NULL DEFAULT 0,
    preprocess_enabled TINYINT(1) NOT NULL DEFAULT 1,
    region_layer_enabled TINYINT(1) NOT NULL DEFAULT 1,
    grouping_mode VARCHAR(16) NOT NULL DEFAULT 'set',
    grouping_set_id BIGINT UNSIGNED NULL,
    grouping_geojson_property VARCHAR(64) NULL DEFAULT '',
    whitelist_enabled TINYINT(1) NOT NULL DEFAULT 1,
    whitelist_default_included TINYINT(1) NOT NULL DEFAULT 0,
    preprocess_config_json LONGTEXT NULL,
    focus_config_json LONGTEXT NULL,
    ui_config_json LONGTEXT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    PRIMARY KEY  (id),
    UNIQUE KEY map_key (map_key),
    KEY sort_order_idx (sort_order, id)
  ) {$charset_collate};";

  $sql_country_catalog = "CREATE TABLE {$country_catalog_table} (
    dataset_key VARCHAR(64) NOT NULL,
    country_code CHAR(2) NOT NULL,
    country_name VARCHAR(191) NOT NULL,
    adm0_a3 CHAR(3) NULL DEFAULT '',
    region_un VARCHAR(64) NULL DEFAULT '',
    subregion VARCHAR(64) NULL DEFAULT '',
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    PRIMARY KEY (dataset_key, country_code),
    KEY dataset_country (dataset_key, country_code)
  ) {$charset_collate};";

  $sql_dataset_features = "CREATE TABLE {$dataset_features_table} (
    dataset_key VARCHAR(64) NOT NULL,
    feature_uid VARCHAR(64) NOT NULL,
    country_code CHAR(2) NOT NULL,
    part_id VARCHAR(64) NOT NULL,
    part_index INT NOT NULL DEFAULT 0,
    area_rank INT NOT NULL DEFAULT 0,
    area_score DOUBLE NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    PRIMARY KEY (dataset_key, feature_uid),
    UNIQUE KEY dataset_part (dataset_key, part_id),
    KEY dataset_country (dataset_key, country_code)
  ) {$charset_collate};";

  $sql_grouping_sets = "CREATE TABLE {$grouping_sets_table} (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    dataset_key VARCHAR(64) NOT NULL,
    set_key VARCHAR(64) NOT NULL,
    label VARCHAR(191) NOT NULL,
    source_type VARCHAR(16) NOT NULL DEFAULT 'system',
    is_locked TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY dataset_set (dataset_key, set_key)
  ) {$charset_collate};";

  $sql_grouping_members = "CREATE TABLE {$grouping_members_table} (
    set_id BIGINT UNSIGNED NOT NULL,
    country_code CHAR(2) NOT NULL,
    region_key VARCHAR(64) NOT NULL,
    PRIMARY KEY (set_id, country_code),
    KEY set_region (set_id, region_key)
  ) {$charset_collate};";

  $sql_whitelist = "CREATE TABLE {$whitelist_table} (
    dataset_key VARCHAR(64) NOT NULL,
    scope_type VARCHAR(16) NOT NULL,
    scope_key VARCHAR(64) NOT NULL,
    country_code CHAR(2) NOT NULL,
    is_included TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    PRIMARY KEY (dataset_key, scope_type, scope_key, country_code),
    KEY dataset_scope (dataset_key, scope_type, scope_key)
  ) {$charset_collate};";

  $sql_part_rules = "CREATE TABLE {$part_rules_table} (
    dataset_key VARCHAR(64) NOT NULL,
    map_key VARCHAR(64) NOT NULL,
    country_code CHAR(2) NOT NULL,
    part_id VARCHAR(64) NOT NULL,
    action VARCHAR(16) NOT NULL,
    country_code_override CHAR(2) NULL DEFAULT NULL,
    polygon_id_override VARCHAR(128) NULL DEFAULT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    PRIMARY KEY (dataset_key, map_key, country_code, part_id),
    KEY map_country (map_key, country_code)
  ) {$charset_collate};";

  require_once ABSPATH . 'wp-admin/includes/upgrade.php';
  dbDelta($sql_maps);
  dbDelta($sql_country_catalog);
  dbDelta($sql_dataset_features);
  dbDelta($sql_grouping_sets);
  dbDelta($sql_grouping_members);
  dbDelta($sql_whitelist);
  dbDelta($sql_part_rules);

  if (!empty($wpdb->last_error)) {
    throw new RuntimeException('DB schema install/upgrade failed: ' . $wpdb->last_error);
  }
}

function tdw_atlas_db_is_seed_missing() {
  global $wpdb;

  $maps_table = tdw_atlas_table_maps();
  $catalog_table = tdw_atlas_table_country_catalog();

  $maps_count = (int) $wpdb->get_var("SELECT COUNT(*) FROM {$maps_table}");
  if (!empty($wpdb->last_error)) {
    throw new RuntimeException('Failed to read maps table for seed check: ' . $wpdb->last_error);
  }

  $catalog_count = (int) $wpdb->get_var("SELECT COUNT(*) FROM {$catalog_table}");
  if (!empty($wpdb->last_error)) {
    throw new RuntimeException('Failed to read country catalog table for seed check: ' . $wpdb->last_error);
  }

  return ($maps_count <= 0 || $catalog_count <= 0);
}

function tdw_atlas_activate() {
  tdw_atlas_db_install_or_upgrade();
  tdw_atlas_reset_db_from_defaults();
}

function tdw_atlas_maybe_upgrade() {
  // Keep schema in sync with current code before any runtime reads.
  tdw_atlas_db_install_or_upgrade();

  if (tdw_atlas_db_is_seed_missing()) {
    tdw_atlas_reset_db_from_defaults();
    return;
  }

  $system = get_option(TDW_ATLAS_OPTION_SYSTEM, array());
  $system = is_array($system) ? $system : array();
  $seed_source_version = (string) ($system['seed_source_version'] ?? '');
  if ($seed_source_version !== TDW_ATLAS_PLUGIN_VERSION) {
    tdw_atlas_reset_db_from_defaults();
  }
}
