<?php

if (!defined('ABSPATH')) exit;

function tdw_atlas_table_maps() {
  global $wpdb;
  return $wpdb->prefix . 'tdw_atlas_maps';
}

function tdw_atlas_table_country_catalog() {
  global $wpdb;
  return $wpdb->prefix . 'tdw_atlas_country_catalog';
}

function tdw_atlas_table_dataset_features() {
  global $wpdb;
  return $wpdb->prefix . 'tdw_atlas_dataset_features';
}

function tdw_atlas_table_grouping_sets() {
  global $wpdb;
  return $wpdb->prefix . 'tdw_atlas_grouping_sets';
}

function tdw_atlas_table_grouping_members() {
  global $wpdb;
  return $wpdb->prefix . 'tdw_atlas_grouping_members';
}

function tdw_atlas_table_whitelist_entries() {
  global $wpdb;
  return $wpdb->prefix . 'tdw_atlas_whitelist_entries';
}

function tdw_atlas_table_preprocess_part_rules() {
  global $wpdb;
  return $wpdb->prefix . 'tdw_atlas_preprocess_part_rules';
}

/**
 * Emit deterministic seed/install diagnostics to CLI and PHP error log.
 *
 * @param string $message
 * @param array<string,mixed> $context
 * @return void
 */
function tdw_atlas_seed_log($message, $context = array()) {
  $suffix = '';
  if (is_array($context) && $context) {
    $encoded = wp_json_encode($context);
    $suffix = is_string($encoded) ? ' ' . $encoded : '';
  }

  $line = '[TDW ATLAS SEED] ' . trim((string) $message) . $suffix;

  if (defined('WP_CLI') && WP_CLI && class_exists('WP_CLI')) {
    WP_CLI::log($line);
  }

  error_log($line);
}

/**
 * Snapshot current seed domain table row counts.
 *
 * @return array<string,int>
 */
function tdw_atlas_seed_count_snapshot() {
  global $wpdb;

  $targets = array(
    'maps' => tdw_atlas_table_maps(),
    'countryCatalog' => tdw_atlas_table_country_catalog(),
    'datasetFeatures' => tdw_atlas_table_dataset_features(),
    'groupingSets' => tdw_atlas_table_grouping_sets(),
    'groupingMembers' => tdw_atlas_table_grouping_members(),
    'whitelistEntries' => tdw_atlas_table_whitelist_entries(),
    'partRules' => tdw_atlas_table_preprocess_part_rules(),
  );

  $out = array();
  foreach ($targets as $label => $table) {
    $count = $wpdb->get_var("SELECT COUNT(*) FROM {$table}");
    $out[$label] = is_numeric($count) ? (int) $count : -1;
  }

  return $out;
}

function tdw_atlas_db_normalize_adapter_key($value, $fallback = 'leaflet') {
  $key = strtolower(trim((string) $value));
  if ($key === '') {
    $key = strtolower(trim((string) $fallback));
  }
  return $key !== '' ? $key : 'leaflet';
}

function tdw_atlas_db_normalize_bool($value, $fallback = false) {
  if (is_bool($value)) return $value;
  if (is_numeric($value)) return ((int) $value) === 1;

  $raw = strtolower(trim((string) $value));
  if ($raw === '1' || $raw === 'true' || $raw === 'yes' || $raw === 'on') return true;
  if ($raw === '0' || $raw === 'false' || $raw === 'no' || $raw === 'off') return false;

  return (bool) $fallback;
}

function tdw_atlas_db_normalize_map_key($value) {
  return sanitize_key((string) $value);
}

function tdw_atlas_db_normalize_dataset_key($value, $fallback = 'world-v1') {
  $key = sanitize_key((string) $value);
  if ($key === '') $key = sanitize_key((string) $fallback);
  return $key !== '' ? $key : 'world-v1';
}

function tdw_atlas_db_normalize_grouping_mode($value, $fallback = 'set') {
  $mode = strtolower(trim((string) $value));
  if (!in_array($mode, array('set', 'geojson', 'off'), true)) {
    $mode = strtolower(trim((string) $fallback));
  }
  return in_array($mode, array('set', 'geojson', 'off'), true) ? $mode : 'set';
}

function tdw_atlas_db_normalize_country_code($value) {
  return strtoupper(trim((string) $value));
}

function tdw_atlas_db_is_iso_a2($value) {
  return is_string($value) && preg_match('/^[A-Z]{2}$/', $value) === 1;
}

function tdw_atlas_db_resolve_country_code($props) {
  $primary = tdw_atlas_db_normalize_country_code($props['ISO_A2_EH'] ?? '');
  if (tdw_atlas_db_is_iso_a2($primary)) return $primary;

  $fallback = tdw_atlas_db_normalize_country_code($props['ISO_A2'] ?? '');
  if (tdw_atlas_db_is_iso_a2($fallback)) return $fallback;

  return '';
}

function tdw_atlas_db_ring_area($ring) {
  if (!is_array($ring) || count($ring) < 3) return 0.0;

  $area = 0.0;
  $count = count($ring);
  for ($i = 0; $i < $count; $i += 1) {
    $a = is_array($ring[$i]) ? $ring[$i] : array(0, 0);
    $b = is_array($ring[($i + 1) % $count]) ? $ring[($i + 1) % $count] : array(0, 0);

    $ax = (float) ($a[0] ?? 0);
    $ay = (float) ($a[1] ?? 0);
    $bx = (float) ($b[0] ?? 0);
    $by = (float) ($b[1] ?? 0);

    $area += ($ax * $by) - ($bx * $ay);
  }

  return abs($area / 2.0);
}

function tdw_atlas_db_part_area_score($polygon_coordinates) {
  if (!is_array($polygon_coordinates) || !isset($polygon_coordinates[0]) || !is_array($polygon_coordinates[0])) {
    return 0.0;
  }
  return tdw_atlas_db_ring_area($polygon_coordinates[0]);
}

function tdw_atlas_db_split_polygon_parts($geometry) {
  $type = trim((string) ($geometry['type'] ?? ''));
  $coordinates = $geometry['coordinates'] ?? null;
  if (!is_array($coordinates)) return array();

  if ($type === 'Polygon') {
    return array(
      array(
        'part_index' => 0,
        'coordinates' => $coordinates,
      ),
    );
  }

  if ($type === 'MultiPolygon') {
    $parts = array();
    foreach ($coordinates as $index => $polygon) {
      if (!is_array($polygon)) continue;
      $parts[] = array(
        'part_index' => (int) $index,
        'coordinates' => $polygon,
      );
    }
    return $parts;
  }

  return array();
}

function tdw_atlas_db_make_part_id($dataset_key, $country_code, $feature_index, $part_index) {
  return $dataset_key . ':' . $country_code . ':' . ((int) $feature_index) . ':' . ((int) $part_index);
}

function tdw_atlas_db_read_json_file($absolute_path) {
  if (!file_exists($absolute_path)) {
    throw new RuntimeException('Required JSON file not found: ' . $absolute_path);
  }

  $raw = file_get_contents($absolute_path);
  if ($raw === false) {
    throw new RuntimeException('Failed to read JSON file: ' . $absolute_path);
  }

  $decoded = json_decode($raw, true);
  if (!is_array($decoded)) {
    throw new RuntimeException('Invalid JSON content: ' . $absolute_path);
  }

  return $decoded;
}

function tdw_atlas_seed_settings_from_defaults($defaults) {
  $defaults = is_array($defaults) ? $defaults : array();

  update_option(
    TDW_ATLAS_OPTION_SETTINGS,
    array(
      'debug' => (bool) ($defaults['debug'] ?? false),
      'vendor' => tdw_atlas_normalize_vendor($defaults['vendor'] ?? array(), $defaults['vendor'] ?? array()),
      'views' => is_array($defaults['views'] ?? null) ? $defaults['views'] : array(),
    ),
    false
  );
}

function tdw_atlas_db_collect_seed_maps($defaults) {
  $maps = array();
  $raw_maps = is_array($defaults['maps'] ?? null) ? $defaults['maps'] : array();

  foreach ($raw_maps as $raw_key => $raw_map) {
    $map_key = tdw_atlas_db_normalize_map_key($raw_key);
    if ($map_key === '' || !is_array($raw_map)) continue;

    $geojson_path = trim((string) ($raw_map['geojson'] ?? ''));
    if ($geojson_path === '') {
      throw new RuntimeException('Map "' . $map_key . '" is missing geojson path in atlas.seed.json.');
    }

    $dataset_key = tdw_atlas_db_normalize_dataset_key($raw_map['datasetKey'] ?? $map_key, $map_key);

    $grouping = is_array($raw_map['grouping'] ?? null) ? $raw_map['grouping'] : array();
    $whitelist = is_array($raw_map['whitelist'] ?? null) ? $raw_map['whitelist'] : array();
    $preprocess = is_array($raw_map['preprocess'] ?? null) ? $raw_map['preprocess'] : array();
    $region_layer = is_array($raw_map['regionLayer'] ?? null) ? $raw_map['regionLayer'] : array();
    $focus = is_array($raw_map['focus'] ?? null) ? $raw_map['focus'] : array();
    $ui = is_array($raw_map['ui'] ?? null) ? $raw_map['ui'] : array();

    $part_rules = is_array($preprocess['partRules'] ?? null) ? $preprocess['partRules'] : array();
    unset($preprocess['partRules']);

    $preprocess_enabled = tdw_atlas_db_normalize_bool($preprocess['enabled'] ?? true, true);
    unset($preprocess['enabled']);

    $grouping_mode = tdw_atlas_db_normalize_grouping_mode($grouping['mode'] ?? 'set', 'set');
    if (!tdw_atlas_db_normalize_bool($grouping['enabled'] ?? true, true)) {
      $grouping_mode = 'off';
    }

    $grouping_set_key = sanitize_key((string) ($grouping['setKey'] ?? ''));
    $grouping_geojson_property = trim((string) ($grouping['geojsonProperty'] ?? ''));

    if ($grouping_mode === 'set' && $grouping_set_key === '') {
      throw new RuntimeException('Map "' . $map_key . '" requires grouping.setKey for grouping mode "set".');
    }

    if ($grouping_mode === 'geojson' && $grouping_geojson_property === '') {
      throw new RuntimeException('Map "' . $map_key . '" requires grouping.geojsonProperty for grouping mode "geojson".');
    }

    $template_path = trim((string) ($raw_map['groupingTemplate'] ?? ''));
    if ($grouping_mode === 'set' && $template_path === '') {
      throw new RuntimeException('Map "' . $map_key . '" requires groupingTemplate for grouping mode "set".');
    }

    $maps[$map_key] = array(
      'map_key' => $map_key,
      'label' => ucwords(str_replace(array('-', '_'), ' ', $map_key)),
      'dataset_key' => $dataset_key,
      'geojson_path' => $geojson_path,
      'view_key' => trim((string) ($raw_map['view'] ?? '')),
      'adapter_key' => tdw_atlas_db_normalize_adapter_key($raw_map['adapter'] ?? 'leaflet'),
      'sort_order' => 0,
      'preprocess_enabled' => $preprocess_enabled,
      'region_layer_enabled' => tdw_atlas_db_normalize_bool($region_layer['enabled'] ?? true, true),
      'grouping_mode' => $grouping_mode,
      'grouping_set_key' => $grouping_set_key,
      'grouping_geojson_property' => $grouping_geojson_property,
      'whitelist_enabled' => tdw_atlas_db_normalize_bool($whitelist['enabled'] ?? true, true),
      'whitelist_default_included' => tdw_atlas_db_normalize_bool($whitelist['defaultIncluded'] ?? false, false),
      'preprocess_config_json' => wp_json_encode($preprocess),
      'focus_config_json' => wp_json_encode($focus),
      'ui_config_json' => wp_json_encode($ui),
      'grouping_template' => $template_path,
      'part_rules' => $part_rules,
    );
  }

  if (!$maps) {
    throw new RuntimeException('atlas.seed.json does not define any valid maps.');
  }

  return $maps;
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
    tdw_atlas_table_maps(),
  );

  foreach ($tables as $table) {
    $wpdb->query("DELETE FROM {$table}");
    if (!empty($wpdb->last_error)) {
      throw new RuntimeException('Failed to reset table ' . $table . ': ' . $wpdb->last_error);
    }
  }
}

function tdw_atlas_db_seed_maps_table($maps) {
  global $wpdb;

  $table = tdw_atlas_table_maps();
  $now = current_time('mysql', true);

  foreach ($maps as $map) {
    $wpdb->insert(
      $table,
      array(
        'map_key' => $map['map_key'],
        'label' => $map['label'],
        'dataset_key' => $map['dataset_key'],
        'geojson_path' => $map['geojson_path'],
        'view_key' => $map['view_key'],
        'adapter_key' => $map['adapter_key'],
        'sort_order' => (int) ($map['sort_order'] ?? 0),
        'preprocess_enabled' => $map['preprocess_enabled'] ? 1 : 0,
        'region_layer_enabled' => $map['region_layer_enabled'] ? 1 : 0,
        'grouping_mode' => $map['grouping_mode'],
        'grouping_set_id' => null,
        'grouping_geojson_property' => $map['grouping_geojson_property'],
        'whitelist_enabled' => $map['whitelist_enabled'] ? 1 : 0,
        'whitelist_default_included' => $map['whitelist_default_included'] ? 1 : 0,
        'preprocess_config_json' => is_string($map['preprocess_config_json']) ? $map['preprocess_config_json'] : '{}',
        'focus_config_json' => is_string($map['focus_config_json']) ? $map['focus_config_json'] : '{}',
        'ui_config_json' => is_string($map['ui_config_json']) ? $map['ui_config_json'] : '{}',
        'created_at' => $now,
        'updated_at' => $now,
      ),
      array('%s', '%s', '%s', '%s', '%s', '%s', '%d', '%d', '%d', '%s', '%d', '%s', '%d', '%d', '%s', '%s', '%s', '%s', '%s')
    );

    if (!empty($wpdb->last_error)) {
      throw new RuntimeException('Failed to seed map row for ' . $map['map_key'] . ': ' . $wpdb->last_error);
    }
  }
}

function tdw_atlas_db_seed_dataset_from_geojson($dataset_key, $geojson_rel_path) {
  global $wpdb;

  $catalog_table = tdw_atlas_table_country_catalog();
  $feature_table = tdw_atlas_table_dataset_features();

  $geojson_abs = plugin_dir_path(TDW_ATLAS_PLUGIN_FILE) . ltrim($geojson_rel_path, '/');
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

function tdw_atlas_db_load_grouping_template($template_rel_path) {
  $abs_path = plugin_dir_path(TDW_ATLAS_PLUGIN_FILE) . ltrim($template_rel_path, '/');
  $template = tdw_atlas_db_read_json_file($abs_path);

  $set = is_array($template['set'] ?? null) ? $template['set'] : array();
  $members = is_array($template['members'] ?? null) ? $template['members'] : array();

  $dataset_key = tdw_atlas_db_normalize_dataset_key($set['datasetKey'] ?? '', 'world-v1');
  $set_key = sanitize_key((string) ($set['setKey'] ?? ''));
  $label = trim((string) ($set['label'] ?? ''));
  $source_type = strtolower(trim((string) ($set['sourceType'] ?? 'system')));
  $is_locked = tdw_atlas_db_normalize_bool($set['isLocked'] ?? true, true);

  if ($set_key === '') {
    throw new RuntimeException('Grouping template is missing set.setKey: ' . $template_rel_path);
  }

  if ($label === '') {
    $label = ucwords(str_replace(array('-', '_'), ' ', $set_key));
  }

  if (!in_array($source_type, array('system', 'custom', 'geojson'), true)) {
    $source_type = 'system';
  }

  $normalized_members = array();
  foreach ($members as $member) {
    if (!is_array($member)) continue;

    $country_code = tdw_atlas_db_normalize_country_code($member['countryCode'] ?? '');
    $region_key = sanitize_key((string) ($member['regionKey'] ?? ''));

    if (!tdw_atlas_db_is_iso_a2($country_code)) {
      throw new RuntimeException('Grouping template contains invalid countryCode: ' . $country_code);
    }

    if ($region_key === '') {
      throw new RuntimeException('Grouping template contains empty regionKey for country: ' . $country_code);
    }

    if (isset($normalized_members[$country_code])) {
      throw new RuntimeException('Grouping template contains duplicate countryCode: ' . $country_code);
    }

    $normalized_members[$country_code] = $region_key;
  }

  if (!$normalized_members) {
    throw new RuntimeException('Grouping template contains no valid members: ' . $template_rel_path);
  }

  return array(
    'dataset_key' => $dataset_key,
    'set_key' => $set_key,
    'label' => $label,
    'source_type' => $source_type,
    'is_locked' => $is_locked,
    'members' => $normalized_members,
  );
}

function tdw_atlas_db_seed_grouping_sets_from_maps($maps) {
  global $wpdb;

  $sets_table = tdw_atlas_table_grouping_sets();
  $members_table = tdw_atlas_table_grouping_members();
  $now = current_time('mysql', true);

  $seeded = array();

  foreach ($maps as $map) {
    if ($map['grouping_mode'] !== 'set') continue;

    $template = tdw_atlas_db_load_grouping_template($map['grouping_template']);
    if ($template['dataset_key'] !== $map['dataset_key']) {
      throw new RuntimeException('Grouping template datasetKey mismatch for map ' . $map['map_key'] . '.');
    }

    $seed_key = $template['dataset_key'] . ':' . $template['set_key'];
    if (isset($seeded[$seed_key])) continue;

    $wpdb->insert(
      $sets_table,
      array(
        'dataset_key' => $template['dataset_key'],
        'set_key' => $template['set_key'],
        'label' => $template['label'],
        'source_type' => $template['source_type'],
        'is_locked' => $template['is_locked'] ? 1 : 0,
        'created_at' => $now,
        'updated_at' => $now,
      ),
      array('%s', '%s', '%s', '%s', '%d', '%s', '%s')
    );

    if (!empty($wpdb->last_error)) {
      throw new RuntimeException('Failed to insert grouping set ' . $template['set_key'] . ': ' . $wpdb->last_error);
    }

    $set_id = (int) $wpdb->insert_id;
    if ($set_id <= 0) {
      throw new RuntimeException('Failed to resolve grouping set id for ' . $template['set_key'] . '.');
    }

    foreach ($template['members'] as $country_code => $region_key) {
      $wpdb->insert(
        $members_table,
        array(
          'set_id' => $set_id,
          'country_code' => $country_code,
          'region_key' => $region_key,
        ),
        array('%d', '%s', '%s')
      );

      if (!empty($wpdb->last_error)) {
        throw new RuntimeException('Failed to insert grouping member for set ' . $template['set_key'] . ': ' . $wpdb->last_error);
      }
    }

    $seeded[$seed_key] = $set_id;
  }

  return $seeded;
}

function tdw_atlas_db_link_maps_to_grouping_sets($maps, $set_index) {
  global $wpdb;

  $maps_table = tdw_atlas_table_maps();

  foreach ($maps as $map) {
    if ($map['grouping_mode'] === 'set') {
      $seed_key = $map['dataset_key'] . ':' . $map['grouping_set_key'];
      $set_id = isset($set_index[$seed_key]) ? (int) $set_index[$seed_key] : 0;
      if ($set_id <= 0) {
        throw new RuntimeException('Missing grouping set link for map ' . $map['map_key'] . ' (' . $seed_key . ').');
      }

      $wpdb->update(
        $maps_table,
        array('grouping_set_id' => $set_id),
        array('map_key' => $map['map_key']),
        array('%d'),
        array('%s')
      );

      if (!empty($wpdb->last_error)) {
        throw new RuntimeException('Failed to link map to grouping set for map ' . $map['map_key'] . ': ' . $wpdb->last_error);
      }
      continue;
    }

    if ($map['grouping_mode'] === 'geojson' && $map['grouping_geojson_property'] === '') {
      throw new RuntimeException('Map ' . $map['map_key'] . ' has geojson grouping mode but empty grouping_geojson_property.');
    }
  }
}

function tdw_atlas_db_seed_global_whitelist_from_maps($maps) {
  global $wpdb;

  $whitelist_table = tdw_atlas_table_whitelist_entries();
  $catalog_table = tdw_atlas_table_country_catalog();
  $members_table = tdw_atlas_table_grouping_members();
  $sets_table = tdw_atlas_table_grouping_sets();

  $dataset_keys = array();
  foreach ($maps as $map) {
    $dataset_keys[$map['dataset_key']] = true;
  }

  $now = current_time('mysql', true);

  foreach (array_keys($dataset_keys) as $dataset_key) {
    $countries = $wpdb->get_col(
      $wpdb->prepare("SELECT country_code FROM {$catalog_table} WHERE dataset_key = %s", $dataset_key)
    );

    if (!empty($wpdb->last_error)) {
      throw new RuntimeException('Failed to read country catalog for whitelist seed: ' . $wpdb->last_error);
    }

    if (!is_array($countries) || !$countries) {
      throw new RuntimeException('Country catalog is empty for dataset ' . $dataset_key . '.');
    }

    $mapped_countries = $wpdb->get_col(
      $wpdb->prepare(
        "SELECT DISTINCT gm.country_code
         FROM {$members_table} gm
         INNER JOIN {$sets_table} gs ON gs.id = gm.set_id
         WHERE gs.dataset_key = %s",
        $dataset_key
      )
    );

    if (!empty($wpdb->last_error)) {
      throw new RuntimeException('Failed to read grouping members for whitelist seed: ' . $wpdb->last_error);
    }

    $mapped = array();
    foreach ((array) $mapped_countries as $code) {
      $country_code = tdw_atlas_db_normalize_country_code($code);
      if (tdw_atlas_db_is_iso_a2($country_code)) {
        $mapped[$country_code] = true;
      }
    }

    foreach ($countries as $code) {
      $country_code = tdw_atlas_db_normalize_country_code($code);
      if (!tdw_atlas_db_is_iso_a2($country_code)) continue;

      $wpdb->insert(
        $whitelist_table,
        array(
          'dataset_key' => $dataset_key,
          'scope_type' => 'global',
          'scope_key' => '*',
          'country_code' => $country_code,
          'is_included' => isset($mapped[$country_code]) ? 1 : 0,
          'created_at' => $now,
          'updated_at' => $now,
        ),
        array('%s', '%s', '%s', '%s', '%d', '%s', '%s')
      );

      if (!empty($wpdb->last_error)) {
        throw new RuntimeException('Failed to insert global whitelist row for ' . $country_code . ': ' . $wpdb->last_error);
      }
    }
  }
}

function tdw_atlas_db_seed_part_rules_from_maps($maps) {
  global $wpdb;

  $table = tdw_atlas_table_preprocess_part_rules();
  $now = current_time('mysql', true);

  foreach ($maps as $map) {
    $map_key = $map['map_key'];
    $dataset_key = $map['dataset_key'];
    $rules = is_array($map['part_rules'] ?? null) ? $map['part_rules'] : array();

    foreach ($rules as $rule) {
      if (!is_array($rule)) {
        throw new RuntimeException('Invalid part rule format for map ' . $map_key . '.');
      }

      $country_code = tdw_atlas_db_normalize_country_code($rule['countryCode'] ?? '');
      $part_id = trim((string) ($rule['partId'] ?? ''));
      $action = strtolower(trim((string) ($rule['action'] ?? '')));

      if (!tdw_atlas_db_is_iso_a2($country_code)) {
        throw new RuntimeException('Invalid part rule countryCode for map ' . $map_key . '.');
      }

      if ($part_id === '') {
        throw new RuntimeException('Invalid part rule partId for map ' . $map_key . '.');
      }

      if (!in_array($action, array('keep', 'drop', 'promote'), true)) {
        throw new RuntimeException('Invalid part rule action for map ' . $map_key . '.');
      }

      $country_override = tdw_atlas_db_normalize_country_code($rule['countryCodeOverride'] ?? '');
      if (!tdw_atlas_db_is_iso_a2($country_override)) {
        $country_override = null;
      }

      $polygon_override = trim((string) ($rule['polygonIdOverride'] ?? ''));
      if ($polygon_override === '') {
        $polygon_override = null;
      }

      $wpdb->insert(
        $table,
        array(
          'dataset_key' => $dataset_key,
          'map_key' => $map_key,
          'country_code' => $country_code,
          'part_id' => $part_id,
          'action' => $action,
          'country_code_override' => $country_override,
          'polygon_id_override' => $polygon_override,
          'created_at' => $now,
          'updated_at' => $now,
        ),
        array('%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s')
      );

      if (!empty($wpdb->last_error)) {
        throw new RuntimeException('Failed to insert part rule for map ' . $map_key . ': ' . $wpdb->last_error);
      }
    }
  }
}

function tdw_atlas_reset_db_from_defaults() {
  tdw_atlas_seed_log('Reseed start.', array(
    'pluginVersion' => TDW_ATLAS_PLUGIN_VERSION,
  ));

  $defaults = tdw_atlas_load_seed_defaults();
  if (!is_array($defaults)) {
    throw new RuntimeException('Cannot reseed DB because atlas.seed.json is missing or invalid.');
  }

  $maps = tdw_atlas_db_collect_seed_maps($defaults);
  tdw_atlas_seed_log('Seed maps collected from atlas.seed.json.', array(
    'count' => count($maps),
    'mapKeys' => array_values(array_map(function ($m) {
      return (string) ($m['map_key'] ?? '');
    }, $maps)),
  ));

  tdw_atlas_db_reset_domain_tables();
  tdw_atlas_seed_log('Domain tables truncated.');
  tdw_atlas_seed_settings_from_defaults($defaults);
  tdw_atlas_seed_log('Settings seeded.');
  tdw_atlas_db_seed_maps_table($maps);
  tdw_atlas_seed_log('Maps table seeded.', array('rows' => count($maps)));

  $dataset_sources = array();
  foreach ($maps as $map) {
    $dataset_sources[$map['dataset_key']] = $map['geojson_path'];
  }

  foreach ($dataset_sources as $dataset_key => $geojson_path) {
    tdw_atlas_seed_log('Seeding dataset from GeoJSON.', array(
      'datasetKey' => $dataset_key,
      'geojsonPath' => $geojson_path,
    ));
    tdw_atlas_db_seed_dataset_from_geojson($dataset_key, $geojson_path);
  }

  $set_index = tdw_atlas_db_seed_grouping_sets_from_maps($maps);
  tdw_atlas_seed_log('Grouping sets seeded.', array('count' => count($set_index)));
  tdw_atlas_db_link_maps_to_grouping_sets($maps, $set_index);
  tdw_atlas_seed_log('Maps linked to grouping sets.');
  tdw_atlas_db_seed_global_whitelist_from_maps($maps);
  tdw_atlas_seed_log('Global whitelist seeded.');
  tdw_atlas_db_seed_part_rules_from_maps($maps);
  tdw_atlas_seed_log('Preprocess part rules seeded.');

  $system = get_option(TDW_ATLAS_OPTION_SYSTEM, array());
  if (!is_array($system)) $system = array();
  $system['seed_source_version'] = TDW_ATLAS_PLUGIN_VERSION;
  $system['last_seeded_at'] = current_time('mysql', true);
  update_option(TDW_ATLAS_OPTION_SYSTEM, $system, false);

  tdw_atlas_seed_log('Reseed complete.', array(
    'seedSourceVersion' => $system['seed_source_version'],
    'lastSeededAt' => $system['last_seeded_at'],
    'counts' => tdw_atlas_seed_count_snapshot(),
  ));
}

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
