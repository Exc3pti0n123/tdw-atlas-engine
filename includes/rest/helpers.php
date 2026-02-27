<?php

if (!defined('ABSPATH')) exit;

function tdw_atlas_rest_bad_request($code, $message) {
  return new WP_REST_Response(array(
    'code' => (string) $code,
    'message' => (string) $message,
  ), 400);
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
