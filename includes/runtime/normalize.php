<?php

if (!defined('ABSPATH')) exit;

function tdw_atlas_is_safe_plugin_relative_path($candidate, $allowed_exts = array()) {
  $path = trim((string) $candidate);
  if ($path === '') return false;

  if (strpos($path, '\\') !== false) return false;
  if (strpos($path, '..') !== false) return false;
  if (strpos($path, '://') !== false) return false;
  if (strncmp($path, '//', 2) === 0) return false;
  if ($path[0] === '/' || $path[0] === '.') return false;
  if (preg_match('/[\x00-\x1F\x7F]/', $path) === 1) return false;
  if (preg_match('/^[A-Za-z0-9._\\/-]+$/', $path) !== 1) return false;

  if (is_array($allowed_exts) && $allowed_exts) {
    $ext = strtolower((string) pathinfo($path, PATHINFO_EXTENSION));
    $allowed = array_map(static function ($item) {
      return strtolower(trim((string) $item));
    }, $allowed_exts);
    if ($ext === '' || !in_array($ext, $allowed, true)) {
      return false;
    }
  }

  return true;
}

function tdw_atlas_validate_plugin_relative_path_or_error($candidate, $field_name, $allowed_exts = array()) {
  if (!tdw_atlas_is_safe_plugin_relative_path($candidate, $allowed_exts)) {
    return new WP_Error(
      'tdw_atlas_path_invalid',
      'Invalid path for "' . (string) $field_name . '". Expected safe plugin-relative path.',
      array('status' => 500)
    );
  }
  return trim((string) $candidate);
}

function tdw_atlas_is_safe_plugin_asset_url_path($candidate, $allowed_exts = array()) {
  $url_path = trim((string) $candidate);
  if ($url_path === '') return false;

  if (strpos($url_path, '\\') !== false) return false;
  if (strpos($url_path, '..') !== false) return false;
  if (strpos($url_path, '://') !== false) return false;
  if ($url_path[0] !== '/') return false;
  if (preg_match('/[\x00-\x1F\x7F]/', $url_path) === 1) return false;

  $base_url_path = (string) wp_parse_url(plugin_dir_url(TDW_ATLAS_PLUGIN_FILE), PHP_URL_PATH);
  $base_url_path = rtrim($base_url_path, '/') . '/';
  if ($base_url_path === '/' || strpos($url_path, $base_url_path) !== 0) return false;

  $path_only = (string) wp_parse_url($url_path, PHP_URL_PATH);
  if ($path_only === '' || preg_match('/^\/[A-Za-z0-9._\\/-]+$/', $path_only) !== 1) return false;

  if (is_array($allowed_exts) && $allowed_exts) {
    $ext = strtolower((string) pathinfo($path_only, PATHINFO_EXTENSION));
    $allowed = array_map(static function ($item) {
      return strtolower(trim((string) $item));
    }, $allowed_exts);
    if ($ext === '' || !in_array($ext, $allowed, true)) {
      return false;
    }
  }

  return true;
}

function tdw_atlas_validate_vendor_asset_path_or_error($candidate, $field_name, $allowed_exts = array()) {
  if (!tdw_atlas_is_safe_plugin_asset_url_path($candidate, $allowed_exts)) {
    return new WP_Error(
      'tdw_atlas_vendor_path_invalid',
      'Invalid vendor asset path for "' . (string) $field_name . '".',
      array('status' => 500)
    );
  }
  return trim((string) $candidate);
}

function tdw_atlas_load_seed_json_file($seed_file) {
  $file = trim((string) $seed_file);
  if ($file === '') {
    return null;
  }

  $config_abs = plugin_dir_path(TDW_ATLAS_PLUGIN_FILE) . $file;
  if (!file_exists($config_abs)) return null;

  $raw = file_get_contents($config_abs);
  if ($raw === false) return null;

  $json = json_decode($raw, true);
  return is_array($json) ? $json : null;
}

function tdw_atlas_load_runtime_seed_defaults() {
  $seed_file = defined('TDW_ATLAS_RUNTIME_SEED_FILE')
    ? TDW_ATLAS_RUNTIME_SEED_FILE
    : 'data/seed/atlas.runtime.seed.json';
  return tdw_atlas_load_seed_json_file($seed_file);
}

function tdw_atlas_default_map_defaults() {
  return array(
    'adapter' => 'leaflet',
    'grouping' => array(
      'enabled' => true,
      'mode' => 'set',
      'geojsonProperty' => 'REGION_UN',
    ),
    'whitelist' => array(
      'enabled' => true,
      'defaultIncluded' => false,
    ),
    'preprocess' => array(
      'enabled' => true,
      'partRules' => array(),
    ),
    'regionLayer' => array(
      'enabled' => true,
    ),
    'focus' => array(),
    'ui' => array(),
    'view' => 'world',
    'mapOptions' => array(),
    'style' => array(),
  );
}

function tdw_atlas_normalize_map_defaults_seed($candidate) {
  $raw = is_array($candidate) ? $candidate : array();
  $default = tdw_atlas_default_map_defaults();

  $grouping = is_array($raw['grouping'] ?? null)
    ? $raw['grouping']
    : $default['grouping'];
  $whitelist = is_array($raw['whitelist'] ?? null)
    ? $raw['whitelist']
    : $default['whitelist'];
  $preprocess = is_array($raw['preprocess'] ?? null)
    ? $raw['preprocess']
    : $default['preprocess'];
  $region_layer = is_array($raw['regionLayer'] ?? null)
    ? $raw['regionLayer']
    : $default['regionLayer'];

  $grouping_mode = tdw_atlas_db_normalize_grouping_mode(
    $grouping['mode'] ?? $default['grouping']['mode'],
    $default['grouping']['mode']
  );
  if (!tdw_atlas_normalize_bool($grouping['enabled'] ?? false, false)) {
    $grouping_mode = 'off';
  }

  $grouping_set_key = sanitize_key((string) ($grouping['setKey'] ?? ''));
  $grouping_geojson_property = trim((string) ($grouping['geojsonProperty'] ?? ''));

  if ($grouping_mode === 'geojson' && $grouping_geojson_property === '') {
    return new WP_Error(
      'tdw_atlas_map_defaults_grouping_geojson_property_missing',
      'Map defaults grouping mode "geojson" requires grouping.geojsonProperty.',
      array('status' => 500)
    );
  }

  $preprocess_enabled = tdw_atlas_normalize_bool(
    $preprocess['enabled'] ?? $default['preprocess']['enabled'],
    true
  );
  $preprocess_payload = $preprocess;
  $preprocess_payload['enabled'] = $preprocess_enabled;
  if (!isset($preprocess_payload['partRules']) || !is_array($preprocess_payload['partRules'])) {
    $preprocess_payload['partRules'] = array();
  }

  $focus = is_array($raw['focus'] ?? null) ? $raw['focus'] : $default['focus'];
  $ui = is_array($raw['ui'] ?? null) ? $raw['ui'] : $default['ui'];
  $map_options = is_array($raw['mapOptions'] ?? null) ? $raw['mapOptions'] : $default['mapOptions'];
  $style = is_array($raw['style'] ?? null) ? $raw['style'] : $default['style'];
  $view = trim((string) ($raw['view'] ?? $default['view']));
  $adapter = tdw_atlas_normalize_adapter_key($raw['adapter'] ?? $default['adapter'], $default['adapter']);

  return array(
    'adapter' => $adapter,
    'grouping' => array(
      'enabled' => $grouping_mode !== 'off',
      'mode' => $grouping_mode,
      'setKey' => $grouping_set_key,
      'geojsonProperty' => $grouping_geojson_property,
    ),
    'whitelist' => array(
      'enabled' => tdw_atlas_normalize_bool($whitelist['enabled'] ?? false, false),
      'defaultIncluded' => tdw_atlas_normalize_bool($whitelist['defaultIncluded'] ?? false, false),
    ),
    'preprocess' => $preprocess_payload,
    'regionLayer' => array(
      'enabled' => tdw_atlas_normalize_bool($region_layer['enabled'] ?? true, true),
    ),
    'focus' => $focus,
    'ui' => tdw_atlas_normalize_preview_config($ui, array()),
    'view' => $view,
    'mapOptions' => $map_options,
    'style' => $style,
  );
}

function tdw_atlas_normalize_country_profile_member($candidate) {
  $raw = is_array($candidate) ? $candidate : array();
  $country_code = strtoupper(trim((string) ($raw['countryCode'] ?? '')));
  if (!tdw_atlas_db_is_iso_a2($country_code)) {
    return new WP_Error(
      'tdw_atlas_map_seed_country_code_invalid',
      'countryProfile.members requires ISO-A2 countryCode.',
      array('status' => 500)
    );
  }

  $iso3 = strtoupper(trim((string) ($raw['iso3'] ?? '')));
  if ($iso3 !== '' && preg_match('/^[A-Z]{3}$/', $iso3) !== 1) {
    return new WP_Error(
      'tdw_atlas_map_seed_iso3_invalid',
      'countryProfile.members.iso3 must be a valid ISO-A3 code when present.',
      array('status' => 500)
    );
  }

  $region_key = sanitize_key((string) ($raw['regionKey'] ?? ''));
  if ($region_key === '') {
    $region_key = 'unassigned';
  }

  return array(
    'countryCode' => $country_code,
    'iso3' => $iso3,
    'regionKey' => $region_key,
    'whitelist' => tdw_atlas_normalize_bool($raw['whitelist'] ?? false, false),
  );
}

function tdw_atlas_load_map_seed_defaults() {
  $seed_file = defined('TDW_ATLAS_MAP_SEED_FILE')
    ? TDW_ATLAS_MAP_SEED_FILE
    : 'data/seed/atlas.map.seed.json';
  $seed = tdw_atlas_load_seed_json_file($seed_file);
  if (!is_array($seed)) {
    return null;
  }

  $map_defaults = tdw_atlas_normalize_map_defaults_seed($seed['mapDefaults'] ?? array());
  if (is_wp_error($map_defaults)) {
    return null;
  }

  $members = array();
  $raw_members = is_array($seed['countryProfile']['members'] ?? null)
    ? $seed['countryProfile']['members']
    : array();
  foreach ($raw_members as $item) {
    $normalized_item = tdw_atlas_normalize_country_profile_member($item);
    if (is_wp_error($normalized_item)) {
      return null;
    }
    $members[$normalized_item['countryCode']] = $normalized_item;
  }

  return array(
    'mapDefaults' => $map_defaults,
    'countryProfile' => array(
      'members' => array_values($members),
    ),
  );
}

function tdw_atlas_load_map_defaults_seed() {
  $seed = tdw_atlas_load_map_seed_defaults();
  if (!is_array($seed)) {
    return null;
  }

  $map_defaults = $seed['mapDefaults'] ?? null;
  return is_array($map_defaults) ? $map_defaults : null;
}

function tdw_atlas_load_country_profile_seed() {
  $seed = tdw_atlas_load_map_seed_defaults();
  if (!is_array($seed)) {
    return null;
  }

  $members = $seed['countryProfile']['members'] ?? null;
  return is_array($members) ? $members : null;
}

function tdw_atlas_normalize_vendor($candidate, $defaults) {
  $vendor = is_array($candidate) ? $candidate : array();
  $default_vendor = is_array($defaults) ? $defaults : array();

  $has_leaflet_js = array_key_exists('leafletJs', $vendor);
  $has_leaflet_css = array_key_exists('leafletCss', $vendor);

  $leaflet_js = $has_leaflet_js
    ? trim((string) ($vendor['leafletJs'] ?? ''))
    : trim((string) ($default_vendor['leafletJs'] ?? ''));
  $leaflet_css = $has_leaflet_css
    ? trim((string) ($vendor['leafletCss'] ?? ''))
    : trim((string) ($default_vendor['leafletCss'] ?? ''));

  $validated_leaflet_js = tdw_atlas_validate_vendor_asset_path_or_error($leaflet_js, 'vendor.leafletJs', array('js'));
  if (is_wp_error($validated_leaflet_js)) {
    return $validated_leaflet_js;
  }
  $validated_leaflet_css = tdw_atlas_validate_vendor_asset_path_or_error($leaflet_css, 'vendor.leafletCss', array('css'));
  if (is_wp_error($validated_leaflet_css)) {
    return $validated_leaflet_css;
  }

  return array(
    'leafletJs' => $validated_leaflet_js,
    'leafletCss' => $validated_leaflet_css,
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
