<?php

if (!defined('ABSPATH')) exit;

function tdw_atlas_seed_settings_from_defaults($defaults) {
  $defaults = is_array($defaults) ? $defaults : array();
  $vendor = tdw_atlas_normalize_vendor($defaults['vendor'] ?? array(), $defaults['vendor'] ?? array());
  if (is_wp_error($vendor)) {
    throw new RuntimeException('Invalid vendor defaults in data/seed/atlas.runtime.seed.json: ' . $vendor->get_error_message());
  }

  update_option(
    TDW_ATLAS_OPTION_SETTINGS,
    array(
      'debug' => (bool) ($defaults['debug'] ?? false),
      'vendor' => $vendor,
      'views' => is_array($defaults['views'] ?? null) ? $defaults['views'] : array(),
    ),
    false
  );
}

function tdw_atlas_db_reset_domain_tables() {
  global $wpdb;

  $tables = array(
    tdw_atlas_table_preprocess_part_rules(),
    tdw_atlas_table_whitelist_entries(),
    tdw_atlas_table_grouping_members(),
    tdw_atlas_table_grouping_sets(),
    tdw_atlas_table_dataset_features(),
    tdw_atlas_table_country_catalog(),
    tdw_atlas_table_country_review(),
    tdw_atlas_table_maps(),
  );

  foreach ($tables as $table) {
    $wpdb->query("DELETE FROM {$table}");
    if (!empty($wpdb->last_error)) {
      throw new RuntimeException('Failed to reset table ' . $table . ': ' . $wpdb->last_error);
    }
  }
}

function tdw_atlas_db_seed_dataset_from_geojson($dataset_key, $geojson_rel_path) {
  global $wpdb;

  $catalog_table = tdw_atlas_table_country_catalog();
  $feature_table = tdw_atlas_table_dataset_features();

  $geojson_abs = tdw_atlas_db_resolve_plugin_data_path($geojson_rel_path, array('json'));
  $geojson = tdw_atlas_db_read_json_file($geojson_abs);
  $features = is_array($geojson['features'] ?? null) ? $geojson['features'] : null;
  if (!is_array($features)) {
    throw new RuntimeException('GeoJSON features array missing for dataset ' . $dataset_key . '.');
  }

  $catalog_rows = array();
  $parts_by_country = array();

  foreach ($features as $feature_index => $feature) {
    if (!is_array($feature)) continue;

    $props = is_array($feature['properties'] ?? null) ? $feature['properties'] : array();
    $country_code = tdw_atlas_db_resolve_country_code($props);
    if (!tdw_atlas_db_is_iso_a2($country_code)) continue;

    if (!isset($catalog_rows[$country_code])) {
      $catalog_rows[$country_code] = array(
        'country_code' => $country_code,
        'country_name' => trim((string) ($props['NAME_EN'] ?? $props['NAME'] ?? $props['ADMIN'] ?? $country_code)),
        'adm0_a3' => strtoupper(trim((string) ($props['ADM0_A3'] ?? ''))),
        'region_un' => trim((string) ($props['REGION_UN'] ?? '')),
        'subregion' => trim((string) ($props['SUBREGION'] ?? '')),
      );
    }

    $geometry = is_array($feature['geometry'] ?? null) ? $feature['geometry'] : array();
    $parts = tdw_atlas_db_split_polygon_parts($geometry);
    foreach ($parts as $part) {
      $part_index = (int) ($part['part_index'] ?? 0);
      $coordinates = $part['coordinates'] ?? array();
      $part_id = tdw_atlas_db_make_part_id($dataset_key, $country_code, $feature_index, $part_index);
      $area_score = tdw_atlas_db_part_area_score($coordinates);
      $feature_uid = sha1($dataset_key . '|' . $country_code . '|' . $part_id . '|' . $feature_index . '|' . $part_index);

      if (!isset($parts_by_country[$country_code])) {
        $parts_by_country[$country_code] = array();
      }

      $parts_by_country[$country_code][] = array(
        'feature_uid' => $feature_uid,
        'country_code' => $country_code,
        'part_id' => $part_id,
        'part_index' => $part_index,
        'area_score' => $area_score,
      );
    }
  }

  if (!$catalog_rows) {
    throw new RuntimeException('GeoJSON seed produced no country rows for dataset ' . $dataset_key . '.');
  }

  $wpdb->delete($catalog_table, array('dataset_key' => $dataset_key), array('%s'));
  $wpdb->delete($feature_table, array('dataset_key' => $dataset_key), array('%s'));

  $now = current_time('mysql', true);

  foreach ($catalog_rows as $row) {
    $wpdb->insert(
      $catalog_table,
      array(
        'dataset_key' => $dataset_key,
        'country_code' => $row['country_code'],
        'country_name' => $row['country_name'],
        'adm0_a3' => $row['adm0_a3'],
        'region_un' => $row['region_un'],
        'subregion' => $row['subregion'],
        'created_at' => $now,
        'updated_at' => $now,
      ),
      array('%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s')
    );

    if (!empty($wpdb->last_error)) {
      throw new RuntimeException('Failed to insert country catalog row for ' . $row['country_code'] . ': ' . $wpdb->last_error);
    }
  }

  foreach ($parts_by_country as $country_code => $parts) {
    usort($parts, static function ($a, $b) {
      $cmp = ($b['area_score'] <=> $a['area_score']);
      if ($cmp !== 0) return $cmp;
      return strcmp((string) $a['part_id'], (string) $b['part_id']);
    });

    foreach ($parts as $rank_index => $part) {
      $wpdb->insert(
        $feature_table,
        array(
          'dataset_key' => $dataset_key,
          'feature_uid' => $part['feature_uid'],
          'country_code' => $country_code,
          'part_id' => $part['part_id'],
          'part_index' => (int) $part['part_index'],
          'area_rank' => $rank_index + 1,
          'area_score' => (float) $part['area_score'],
          'created_at' => $now,
          'updated_at' => $now,
        ),
        array('%s', '%s', '%s', '%s', '%d', '%d', '%f', '%s', '%s')
      );

      if (!empty($wpdb->last_error)) {
        throw new RuntimeException('Failed to insert dataset feature row for part ' . $part['part_id'] . ': ' . $wpdb->last_error);
      }
    }
  }
}

function tdw_atlas_reset_db_from_defaults() {
  try {
    $runtime_defaults = tdw_atlas_load_runtime_seed_defaults();
    if (!is_array($runtime_defaults)) {
      throw new RuntimeException('Cannot reseed DB because data/seed/atlas.runtime.seed.json is missing or invalid.');
    }

    $map_seed_defaults = tdw_atlas_load_map_seed_defaults();
    if (!is_array($map_seed_defaults)) {
      throw new RuntimeException('Cannot reseed DB because data/seed/atlas.map.seed.json is missing or invalid.');
    }

    tdw_atlas_db_reset_domain_tables();
    tdw_atlas_seed_settings_from_defaults($runtime_defaults);

    $system = get_option(TDW_ATLAS_OPTION_SYSTEM, array());
    if (!is_array($system)) $system = array();
    $system['seed_source_version'] = TDW_ATLAS_PLUGIN_VERSION;
    $system['last_seeded_at'] = current_time('mysql', true);
    update_option(TDW_ATLAS_OPTION_SYSTEM, $system, false);

    tdw_atlas_seed_log('success', array(
      'seedSourceVersion' => $system['seed_source_version'],
      'maps' => 0,
      'datasets' => 0,
      'runtimeSeedFile' => TDW_ATLAS_RUNTIME_SEED_FILE,
      'mapSeedFile' => TDW_ATLAS_MAP_SEED_FILE,
    ));
  } catch (Throwable $err) {
    tdw_atlas_seed_log('error', array(
      'message' => $err->getMessage(),
    ));
    throw $err;
  }
}
