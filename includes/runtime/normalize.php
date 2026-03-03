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
