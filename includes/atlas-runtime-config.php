<?php

if (!defined('ABSPATH')) exit;

function tdw_atlas_load_seed_defaults() {
  $seed_file = defined('TDW_ATLAS_SEED_FILE') ? TDW_ATLAS_SEED_FILE : 'atlas.seed.json';
  $config_abs = plugin_dir_path(TDW_ATLAS_PLUGIN_FILE) . $seed_file;
  if (!file_exists($config_abs)) return null;

  $raw = file_get_contents($config_abs);
  if ($raw === false) return null;

  $json = json_decode($raw, true);
  return is_array($json) ? $json : null;
}

function tdw_atlas_normalize_vendor($candidate, $defaults) {
  $vendor = is_array($candidate) ? $candidate : array();

  $leaflet_js = isset($vendor['leafletJs']) && is_string($vendor['leafletJs']) && $vendor['leafletJs'] !== ''
    ? $vendor['leafletJs']
    : ($defaults['leafletJs'] ?? '');

  $leaflet_css = isset($vendor['leafletCss']) && is_string($vendor['leafletCss']) && $vendor['leafletCss'] !== ''
    ? $vendor['leafletCss']
    : ($defaults['leafletCss'] ?? '');

  return array(
    'leafletJs' => $leaflet_js,
    'leafletCss' => $leaflet_css,
  );
}

function tdw_atlas_normalize_adapter_key($candidate, $fallback = 'leaflet') {
  $adapter = strtolower(trim((string) $candidate));
  if ($adapter === '') {
    $adapter = strtolower(trim((string) $fallback));
  }
  return $adapter !== '' ? $adapter : 'leaflet';
}

function tdw_atlas_normalize_bool($candidate, $fallback = false) {
  if (is_bool($candidate)) return $candidate;
  if (is_numeric($candidate)) return ((int) $candidate) === 1;

  $raw = strtolower(trim((string) $candidate));
  if ($raw === '1' || $raw === 'true' || $raw === 'yes' || $raw === 'on') return true;
  if ($raw === '0' || $raw === 'false' || $raw === 'no' || $raw === 'off') return false;

  return (bool) $fallback;
}

function tdw_atlas_humanize_region_key($region_key) {
  $key = sanitize_key((string) $region_key);
  if ($key === '') return '';

  $fixed = array(
    'sea' => 'South East Asia',
    'near-east' => 'Near East',
    'south-asia' => 'South Asia',
    'central-asia' => 'Central Asia',
    'south-central-asia' => 'South Central Asia',
    'africa' => 'Africa',
    'americas' => 'Americas',
    'north-america' => 'North America',
    'south-america' => 'South America',
    'europe' => 'Europe',
    'oceania' => 'Oceania',
  );

  if (isset($fixed[$key])) {
    return $fixed[$key];
  }

  return ucwords(str_replace(array('-', '_'), ' ', $key));
}

function tdw_atlas_get_db_settings_or_default($defaults) {
  $stored = get_option(TDW_ATLAS_OPTION_SETTINGS, array());
  $candidate = is_array($stored) ? $stored : array();

  $debug = isset($candidate['debug']) ? (bool) $candidate['debug'] : (bool) ($defaults['debug'] ?? false);
  $vendor = tdw_atlas_normalize_vendor($candidate['vendor'] ?? array(), $defaults['vendor'] ?? array());
  $views = isset($candidate['views']) && is_array($candidate['views']) ? $candidate['views'] : ($defaults['views'] ?? array());

  return array(
    'debug' => $debug,
    'vendor' => $vendor,
    'views' => $views,
  );
}

function tdw_atlas_get_grouping_payload_for_map($dataset_key, $map_key, $row) {
  global $wpdb;

  $mode = strtolower(trim((string) ($row['grouping_mode'] ?? 'set')));
  if (!in_array($mode, array('set', 'geojson', 'off'), true)) {
    $mode = 'set';
  }
  $enabled = $mode !== 'off';

  $payload = array(
    'enabled' => $enabled,
    'mode' => $mode,
    'setKey' => '',
    'geojsonProperty' => '',
    'countryToRegion' => array(),
    'regionLabels' => array(),
  );

  if ($mode === 'off') {
    $payload['mode'] = 'off';
    return $payload;
  }

  if ($mode === 'geojson') {
    $property = trim((string) ($row['grouping_geojson_property'] ?? ''));
    if ($property === '') {
      return new WP_Error(
        'tdw_atlas_grouping_geojson_property_missing',
        'Grouping mode "geojson" requires grouping_geojson_property for map "' . $map_key . '".',
        array('status' => 500)
      );
    }

    $payload['geojsonProperty'] = $property;
    return $payload;
  }

  $set_id = (int) ($row['grouping_set_id'] ?? 0);
  if ($set_id <= 0) {
    return new WP_Error(
      'tdw_atlas_grouping_set_missing',
      'Grouping mode "set" requires grouping_set_id for map "' . $map_key . '".',
      array('status' => 500)
    );
  }

  $sets_table = tdw_atlas_table_grouping_sets();
  $members_table = tdw_atlas_table_grouping_members();

  $set = $wpdb->get_row(
    $wpdb->prepare("SELECT id, set_key FROM {$sets_table} WHERE id = %d AND dataset_key = %s", $set_id, $dataset_key),
    ARRAY_A
  );

  if (!empty($wpdb->last_error)) {
    return new WP_Error('tdw_atlas_grouping_set_read_failed', $wpdb->last_error, array('status' => 500));
  }

  if (!is_array($set) || empty($set['id'])) {
    return new WP_Error(
      'tdw_atlas_grouping_set_not_found',
      'Configured grouping set not found for map "' . $map_key . '".',
      array('status' => 500)
    );
  }

  $rows = $wpdb->get_results(
    $wpdb->prepare("SELECT country_code, region_key FROM {$members_table} WHERE set_id = %d", (int) $set['id']),
    ARRAY_A
  );

  if (!empty($wpdb->last_error)) {
    return new WP_Error('tdw_atlas_grouping_members_read_failed', $wpdb->last_error, array('status' => 500));
  }

  if (!is_array($rows) || !$rows) {
    return new WP_Error(
      'tdw_atlas_grouping_members_empty',
      'Grouping set has no members for map "' . $map_key . '".',
      array('status' => 500)
    );
  }

  $country_to_region = array();
  foreach ($rows as $member) {
    $country = strtoupper(trim((string) ($member['country_code'] ?? '')));
    $region = sanitize_key((string) ($member['region_key'] ?? ''));
    if ($country === '' || $region === '') continue;
    $country_to_region[$country] = $region;
  }

  if (!$country_to_region) {
    return new WP_Error(
      'tdw_atlas_grouping_members_invalid',
      'Grouping set members are invalid for map "' . $map_key . '".',
      array('status' => 500)
    );
  }

  $payload['setKey'] = (string) ($set['set_key'] ?? '');
  $payload['countryToRegion'] = $country_to_region;
  $region_labels = array();
  foreach ($country_to_region as $region_key) {
    $normalized_region = sanitize_key((string) $region_key);
    if ($normalized_region === '') continue;
    if (!isset($region_labels[$normalized_region])) {
      $region_labels[$normalized_region] = tdw_atlas_humanize_region_key($normalized_region);
    }
  }
  $payload['regionLabels'] = $region_labels;

  return $payload;
}

function tdw_atlas_get_whitelist_payload_for_map($dataset_key, $map_key, $row) {
  global $wpdb;

  $enabled = tdw_atlas_normalize_bool($row['whitelist_enabled'] ?? 1, true);
  $default_included = tdw_atlas_normalize_bool($row['whitelist_default_included'] ?? 0, false);

  $table = tdw_atlas_table_whitelist_entries();

  $global_rows = $wpdb->get_results(
    $wpdb->prepare(
      "SELECT country_code, is_included FROM {$table} WHERE dataset_key = %s AND scope_type = 'global' AND scope_key = '*'",
      $dataset_key
    ),
    ARRAY_A
  );

  if (!empty($wpdb->last_error)) {
    return new WP_Error('tdw_atlas_whitelist_global_read_failed', $wpdb->last_error, array('status' => 500));
  }

  $effective = array();
  foreach ((array) $global_rows as $entry) {
    $country = strtoupper(trim((string) ($entry['country_code'] ?? '')));
    if ($country === '') continue;
    $effective[$country] = ((int) ($entry['is_included'] ?? 0)) === 1;
  }

  $map_rows = $wpdb->get_results(
    $wpdb->prepare(
      "SELECT country_code, is_included FROM {$table} WHERE dataset_key = %s AND scope_type = 'map' AND scope_key = %s",
      $dataset_key,
      $map_key
    ),
    ARRAY_A
  );

  if (!empty($wpdb->last_error)) {
    return new WP_Error('tdw_atlas_whitelist_map_read_failed', $wpdb->last_error, array('status' => 500));
  }

  foreach ((array) $map_rows as $entry) {
    $country = strtoupper(trim((string) ($entry['country_code'] ?? '')));
    if ($country === '') continue;
    $effective[$country] = ((int) ($entry['is_included'] ?? 0)) === 1;
  }

  if ($enabled && !$effective) {
    return new WP_Error(
      'tdw_atlas_whitelist_empty',
      'Whitelist payload is empty for map "' . $map_key . '".',
      array('status' => 500)
    );
  }

  return array(
    'enabled' => $enabled,
    'defaultIncluded' => $default_included,
    'includeByCountry' => $effective,
  );
}

function tdw_atlas_get_part_rules_payload_for_map($dataset_key, $map_key) {
  global $wpdb;

  $table = tdw_atlas_table_preprocess_part_rules();
  $rows = $wpdb->get_results(
    $wpdb->prepare(
      "SELECT country_code, part_id, action, country_code_override, polygon_id_override FROM {$table} WHERE dataset_key = %s AND map_key = %s",
      $dataset_key,
      $map_key
    ),
    ARRAY_A
  );

  if (!empty($wpdb->last_error)) {
    return new WP_Error('tdw_atlas_part_rules_read_failed', $wpdb->last_error, array('status' => 500));
  }

  $payload = array();

  foreach ((array) $rows as $row) {
    $country = strtoupper(trim((string) ($row['country_code'] ?? '')));
    $part_id = trim((string) ($row['part_id'] ?? ''));
    $action = strtolower(trim((string) ($row['action'] ?? '')));

    if ($country === '' || $part_id === '' || !in_array($action, array('keep', 'drop', 'promote'), true)) {
      continue;
    }

    if (!isset($payload[$country])) {
      $payload[$country] = array();
    }

    $payload[$country][$part_id] = array(
      'action' => $action,
      'countryCodeOverride' => strtoupper(trim((string) ($row['country_code_override'] ?? ''))),
      'polygonIdOverride' => trim((string) ($row['polygon_id_override'] ?? '')),
    );
  }

  return $payload;
}

function tdw_atlas_get_preprocess_payload_for_map($dataset_key, $map_key, $row) {
  $enabled = tdw_atlas_normalize_bool($row['preprocess_enabled'] ?? 1, true);
  $raw_json = trim((string) ($row['preprocess_config_json'] ?? ''));

  $config = array();
  if ($raw_json !== '') {
    $decoded = json_decode($raw_json, true);
    if (!is_array($decoded)) {
      return new WP_Error(
        'tdw_atlas_preprocess_json_invalid',
        'Invalid preprocess_config_json for map "' . $map_key . '".',
        array('status' => 500)
      );
    }
    $config = $decoded;
  }

  $part_rules = tdw_atlas_get_part_rules_payload_for_map($dataset_key, $map_key);
  if (is_wp_error($part_rules)) return $part_rules;

  $config['enabled'] = $enabled;
  $config['partRules'] = $part_rules;

  return $config;
}

function tdw_atlas_get_focus_payload_for_map($map_key, $row, $default_map = array()) {
  $fallback = is_array($default_map['focus'] ?? null) ? $default_map['focus'] : array();
  $raw_json = trim((string) ($row['focus_config_json'] ?? ''));
  if ($raw_json === '') {
    return $fallback;
  }

  $decoded = json_decode($raw_json, true);
  if (!is_array($decoded)) {
    return new WP_Error(
      'tdw_atlas_focus_json_invalid',
      'Invalid focus_config_json for map "' . $map_key . '".',
      array('status' => 500)
    );
  }

  return $decoded;
}

function tdw_atlas_normalize_preview_config($candidate, $fallback = array()) {
  $default_preview = is_array($fallback['preview'] ?? null)
    ? $fallback['preview']
    : array();
  $preview = is_array($candidate['preview'] ?? null)
    ? $candidate['preview']
    : array();

  $show_region = tdw_atlas_normalize_bool(
    $preview['showRegionPreview'] ?? $default_preview['showRegionPreview'] ?? true,
    true
  );
  $show_country = tdw_atlas_normalize_bool(
    $preview['showCountryPreview'] ?? $default_preview['showCountryPreview'] ?? true,
    true
  );

  $desktop_side = strtolower(trim((string) ($preview['desktopSide'] ?? $default_preview['desktopSide'] ?? 'right')));
  if (!in_array($desktop_side, array('left', 'right'), true)) {
    $desktop_side = 'right';
  }

  $switch_ratio = (float) ($preview['switchToBottomMaxWHRatio'] ?? $default_preview['switchToBottomMaxWHRatio'] ?? 0.85);
  if (!is_finite($switch_ratio) || $switch_ratio <= 0) {
    $switch_ratio = 0.85;
  }

  return array(
    'preview' => array(
      'showRegionPreview' => $show_region,
      'showCountryPreview' => $show_country,
      'desktopSide' => $desktop_side,
      'switchToBottomMaxWHRatio' => $switch_ratio,
    ),
  );
}

function tdw_atlas_get_ui_payload_for_map($map_key, $row, $default_map = array()) {
  $fallback = is_array($default_map['ui'] ?? null) ? $default_map['ui'] : array();
  $raw_json = trim((string) ($row['ui_config_json'] ?? ''));

  if ($raw_json === '') {
    return tdw_atlas_normalize_preview_config(array(), $fallback);
  }

  $decoded = json_decode($raw_json, true);
  if (!is_array($decoded)) {
    return new WP_Error(
      'tdw_atlas_ui_json_invalid',
      'Invalid ui_config_json for map "' . $map_key . '".',
      array('status' => 500)
    );
  }

  return tdw_atlas_normalize_preview_config($decoded, $fallback);
}

function tdw_atlas_get_db_maps_or_error($defaults, $requested_map_keys = array()) {
  global $wpdb;

  $table = tdw_atlas_table_maps();
  $requested = array_values(array_filter(array_map('sanitize_key', (array) $requested_map_keys), function ($value) {
    return is_string($value) && $value !== '';
  }));

  $sql = "SELECT
      map_key,
      geojson_path,
      dataset_key,
      view_key,
      adapter_key,
      region_layer_enabled,
      grouping_mode,
      grouping_set_id,
      grouping_geojson_property,
      whitelist_enabled,
      whitelist_default_included,
      preprocess_enabled,
      preprocess_config_json,
      focus_config_json,
      ui_config_json
    FROM {$table}";

  $params = array();
  if ($requested) {
    $placeholders = implode(', ', array_fill(0, count($requested), '%s'));
    $sql .= " WHERE map_key IN ({$placeholders})";
    $params = $requested;
  }

  $sql .= " ORDER BY sort_order ASC, id ASC";

  $rows = $params
    ? $wpdb->get_results($wpdb->prepare($sql, ...$params), ARRAY_A)
    : $wpdb->get_results($sql, ARRAY_A);

  if (!empty($wpdb->last_error)) {
    return new WP_Error('tdw_atlas_maps_read_failed', $wpdb->last_error, array('status' => 500));
  }

  if (!is_array($rows) || !$rows) {
    if ($requested) {
      return array();
    }
    return new WP_Error('tdw_atlas_maps_empty', 'No map rows found in atlas maps table.', array('status' => 500));
  }

  $maps = array();

  foreach ($rows as $row) {
    $map_key = sanitize_key((string) ($row['map_key'] ?? ''));
    $geojson_path = trim((string) ($row['geojson_path'] ?? ''));
    $dataset_key = sanitize_key((string) ($row['dataset_key'] ?? ''));

    if ($map_key === '' || $geojson_path === '' || $dataset_key === '') {
      return new WP_Error('tdw_atlas_map_row_invalid', 'Invalid map row detected in atlas maps table.', array('status' => 500));
    }

    $default_map = is_array($defaults[$map_key] ?? null) ? $defaults[$map_key] : array();

    $grouping = tdw_atlas_get_grouping_payload_for_map($dataset_key, $map_key, $row);
    if (is_wp_error($grouping)) return $grouping;

    $whitelist = tdw_atlas_get_whitelist_payload_for_map($dataset_key, $map_key, $row);
    if (is_wp_error($whitelist)) return $whitelist;

    $preprocess = tdw_atlas_get_preprocess_payload_for_map($dataset_key, $map_key, $row);
    if (is_wp_error($preprocess)) return $preprocess;
    $focus = tdw_atlas_get_focus_payload_for_map($map_key, $row, $default_map);
    if (is_wp_error($focus)) return $focus;
    $ui = tdw_atlas_get_ui_payload_for_map($map_key, $row, $default_map);
    if (is_wp_error($ui)) return $ui;

    $item = array(
      'geojson' => $geojson_path,
      'adapter' => tdw_atlas_normalize_adapter_key($row['adapter_key'] ?? '', $default_map['adapter'] ?? 'leaflet'),
      'datasetKey' => $dataset_key,
      'regionLayer' => array(
        'enabled' => tdw_atlas_normalize_bool($row['region_layer_enabled'] ?? 1, true),
      ),
      'grouping' => $grouping,
      'whitelist' => $whitelist,
      'preprocess' => $preprocess,
      'focus' => $focus,
      'ui' => $ui,
    );

    $view_key = trim((string) ($row['view_key'] ?? ''));
    if ($view_key !== '') {
      $item['view'] = $view_key;
    } elseif (isset($default_map['view'])) {
      $item['view'] = (string) $default_map['view'];
    }

    // Optional defaults that are still JSON-owned until admin settings exist.
    if (array_key_exists('mapOptions', $default_map)) {
      $item['mapOptions'] = $default_map['mapOptions'];
    }

    if (array_key_exists('style', $default_map)) {
      $item['style'] = $default_map['style'];
    }

    $maps[$map_key] = $item;
  }

  return $maps;
}

function tdw_atlas_get_effective_config($requested_map_keys = array()) {
  $plugin_base_url = plugin_dir_url(TDW_ATLAS_PLUGIN_FILE);
  $defaults = tdw_atlas_load_seed_defaults();

  if (!is_array($defaults)) {
    return new WP_Error(
      'tdw_atlas_defaults_missing',
      'atlas.seed.json is missing or invalid.',
      array('status' => 500)
    );
  }

  $settings = tdw_atlas_get_db_settings_or_default($defaults);
  $maps = tdw_atlas_get_db_maps_or_error($defaults['maps'] ?? array(), $requested_map_keys);

  if (is_wp_error($maps)) {
    return $maps;
  }

  return array(
    'meta' => array(
      'engine' => (string) ($defaults['meta']['engine'] ?? 'tdw-atlas-engine'),
      'version' => TDW_ATLAS_PLUGIN_VERSION,
      'baseUrl' => $plugin_base_url,
    ),
    'debug' => (bool) ($settings['debug'] ?? false),
    'vendor' => $settings['vendor'] ?? array(),
    'maps' => $maps,
    'views' => $settings['views'] ?? array(),
  );
}
