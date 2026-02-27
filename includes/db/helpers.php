<?php

if (!defined('ABSPATH')) exit;

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
