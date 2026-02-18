<?php

if (!defined('ABSPATH')) exit;

function tdw_atlas_load_json_defaults() {
  $config_abs = plugin_dir_path(TDW_ATLAS_PLUGIN_FILE) . 'atlas.config.json';
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

function tdw_atlas_get_db_maps_or_default($defaults) {
  global $wpdb;

  $table = tdw_atlas_table_maps();
  $rows = $wpdb->get_results(
    "SELECT map_key, geojson_path, view_key FROM {$table} WHERE is_active = 1 ORDER BY sort_order ASC, id ASC",
    ARRAY_A
  );

  if (!empty($wpdb->last_error)) {
    return is_array($defaults) ? $defaults : array();
  }

  if (!is_array($rows) || !$rows) {
    return is_array($defaults) ? $defaults : array();
  }

  $maps = array();
  foreach ($rows as $row) {
    $key = trim((string) ($row['map_key'] ?? ''));
    $geojson = trim((string) ($row['geojson_path'] ?? ''));
    if ($key === '' || $geojson === '') continue;

    $item = array('geojson' => $geojson);
    $view_key = trim((string) ($row['view_key'] ?? ''));
    if ($view_key !== '') $item['view'] = $view_key;
    $maps[$key] = $item;
  }

  return $maps ?: (is_array($defaults) ? $defaults : array());
}

function tdw_atlas_get_effective_config() {
  $plugin_base_url = plugin_dir_url(TDW_ATLAS_PLUGIN_FILE);
  $defaults = tdw_atlas_load_json_defaults();
  if (!is_array($defaults)) {
    return array(
      'meta' => array(
        'engine' => 'tdw-atlas-engine',
        'version' => TDW_ATLAS_PLUGIN_VERSION,
        'baseUrl' => $plugin_base_url,
      ),
      'debug' => false,
      'vendor' => array('leafletJs' => '', 'leafletCss' => ''),
      'maps' => array(),
      'views' => array(),
    );
  }

  $settings = tdw_atlas_get_db_settings_or_default($defaults);
  $maps = tdw_atlas_get_db_maps_or_default($defaults['maps'] ?? array());

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
