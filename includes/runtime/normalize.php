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
