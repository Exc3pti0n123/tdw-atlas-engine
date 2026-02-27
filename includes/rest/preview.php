<?php

if (!defined('ABSPATH')) exit;

function tdw_atlas_rest_preview_payload($map_id, $scope, $key) {
  $config = tdw_atlas_get_effective_config(array($map_id));
  if (is_wp_error($config)) return $config;

  $map = is_array($config['maps'][$map_id] ?? null) ? $config['maps'][$map_id] : null;
  if (!$map) {
    return new WP_Error(
      'tdw_atlas_preview_unknown_map',
      'Unknown map id for preview endpoint.',
      array('status' => 404)
    );
  }

  $title = '';
  if ($scope === 'country') {
    if (preg_match('/^[A-Z]{2}$/', $key) !== 1) {
      return new WP_Error(
        'tdw_atlas_preview_invalid_country_key',
        'Country preview key must be ISO-A2.',
        array('status' => 400)
      );
    }
    $dataset_key = sanitize_key((string) ($map['datasetKey'] ?? ''));
    $title = tdw_atlas_rest_country_title($dataset_key, $key);
  } else {
    $title = tdw_atlas_rest_region_title($map, $key);
  }

  if ($title === '') $title = $key;

  return array(
    'mapId' => $map_id,
    'scope' => $scope,
    'key' => $key,
    'title' => $title,
    'teaser' => 'Hello ' . $title,
    'readMoreUrl' => '#',
    'placeholder' => true,
  );
}
