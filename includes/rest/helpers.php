<?php

if (!defined('ABSPATH')) exit;

function tdw_atlas_rest_error_response($error, $fallback_status = 500) {
  if (!is_wp_error($error)) {
    return new WP_REST_Response(array(
      'code' => 'tdw_atlas_unknown_error',
      'message' => 'Unexpected runtime error.',
    ), (int) $fallback_status);
  }

  $data = $error->get_error_data();
  $status = is_array($data) ? (int) ($data['status'] ?? $fallback_status) : (int) $fallback_status;
  if ($status <= 0) $status = (int) $fallback_status;

  return new WP_REST_Response(array(
    'code' => (string) $error->get_error_code(),
    'message' => (string) $error->get_error_message(),
  ), $status);
}

function tdw_atlas_rest_bad_request($code, $message) {
  return new WP_REST_Response(array(
    'code' => (string) $code,
    'message' => (string) $message,
  ), 400);
}

function tdw_atlas_rest_validate_map_id($value, $field = 'map_id') {
  $map_id = trim((string) $value);
  if (preg_match('/^[a-z0-9_-]{1,64}$/', $map_id) !== 1) {
    return new WP_Error(
      'tdw_atlas_rest_map_id_invalid',
      'Invalid "' . $field . '" value. Expected lowercase map key ([a-z0-9_-], max 64 chars).',
      array('status' => 400)
    );
  }
  return $map_id;
}

function tdw_atlas_rest_parse_map_ids($raw, $max_ids = 20) {
  $input = trim((string) $raw);
  if ($input === '') {
    return array();
  }

  $items = explode(',', $input);
  if (!$items) {
    return new WP_Error(
      'tdw_atlas_rest_map_ids_invalid',
      'Invalid "map_ids" value.',
      array('status' => 400)
    );
  }

  if (count($items) > (int) $max_ids) {
    return new WP_Error(
      'tdw_atlas_rest_map_ids_too_many',
      'Too many map ids in "map_ids". Maximum is ' . (int) $max_ids . '.',
      array('status' => 400)
    );
  }

  $result = array();
  foreach ($items as $item) {
    $candidate = trim((string) $item);
    $validated = tdw_atlas_rest_validate_map_id($candidate, 'map_ids');
    if (is_wp_error($validated)) {
      return $validated;
    }
    $result[$validated] = true;
  }

  return array_keys($result);
}

function tdw_atlas_rest_validate_scope($value) {
  $scope = strtolower(trim((string) $value));
  if ($scope !== 'region' && $scope !== 'country') {
    return new WP_Error(
      'tdw_atlas_rest_scope_invalid',
      'Invalid scope. Expected: region or country.',
      array('status' => 400)
    );
  }
  return $scope;
}

function tdw_atlas_rest_validate_country_code($value) {
  $country_code = trim((string) $value);
  if (preg_match('/^[A-Z]{2}$/', $country_code) !== 1) {
    return new WP_Error(
      'tdw_atlas_rest_country_code_invalid',
      'Invalid country code. Expected ISO-A2 uppercase code.',
      array('status' => 400)
    );
  }
  return $country_code;
}

function tdw_atlas_rest_validate_region_key($value) {
  $region_key = trim((string) $value);
  if (preg_match('/^[a-z0-9_-]{1,64}$/', $region_key) !== 1) {
    return new WP_Error(
      'tdw_atlas_rest_region_key_invalid',
      'Invalid region key. Expected lowercase key ([a-z0-9_-], max 64 chars).',
      array('status' => 400)
    );
  }
  return $region_key;
}

function tdw_atlas_rest_country_title($dataset_key, $country_code) {
  global $wpdb;

  $catalog_table = tdw_atlas_table_country_catalog();
  $title = $wpdb->get_var(
    $wpdb->prepare(
      "SELECT country_name FROM {$catalog_table} WHERE dataset_key = %s AND country_code = %s LIMIT 1",
      $dataset_key,
      $country_code
    )
  );

  if (!empty($wpdb->last_error)) {
    return $country_code;
  }

  $title = trim((string) $title);
  if ($title !== '') return $title;

  if (function_exists('locale_get_display_region')) {
    $translated = @locale_get_display_region('-' . $country_code, 'en');
    if (is_string($translated) && trim($translated) !== '') {
      return trim($translated);
    }
  }

  return $country_code;
}

function tdw_atlas_rest_region_title($map_config, $region_key) {
  $labels = is_array($map_config['grouping']['regionLabels'] ?? null)
    ? $map_config['grouping']['regionLabels']
    : array();
  $title = trim((string) ($labels[$region_key] ?? ''));
  if ($title !== '') return $title;
  return $region_key;
}
