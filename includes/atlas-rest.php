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

function tdw_atlas_register_rest_routes() {
  register_rest_route('tdw-atlas/v1', '/config', array(
    'methods' => WP_REST_Server::READABLE,
    'permission_callback' => '__return_true',
    'callback' => function ($request) {
      $requested_map_keys = array();
      $raw_map_ids = $request instanceof WP_REST_Request
        ? (string) ($request->get_param('map_ids') ?? '')
        : '';

      if ($raw_map_ids !== '') {
        $requested_map_keys = array_values(array_filter(array_map('sanitize_key', explode(',', $raw_map_ids)), function ($value) {
          return is_string($value) && $value !== '';
        }));
      }

      $config = tdw_atlas_get_effective_config($requested_map_keys);
      if (is_wp_error($config)) {
        $error_data = $config->get_error_data();
        $status = is_array($error_data) ? (int) ($error_data['status'] ?? 500) : 500;
        return new WP_REST_Response(array(
          'code' => $config->get_error_code(),
          'message' => $config->get_error_message(),
        ), $status > 0 ? $status : 500);
      }

      return new WP_REST_Response($config, 200);
    },
  ));

  register_rest_route('tdw-atlas/v1', '/preview', array(
    'methods' => WP_REST_Server::READABLE,
    'permission_callback' => '__return_true',
    'callback' => function ($request) {
      $map_id = $request instanceof WP_REST_Request
        ? sanitize_key((string) ($request->get_param('map_id') ?? ''))
        : '';
      $scope = $request instanceof WP_REST_Request
        ? strtolower(trim((string) ($request->get_param('scope') ?? '')))
        : '';
      $key = $request instanceof WP_REST_Request
        ? trim((string) ($request->get_param('key') ?? ''))
        : '';

      if ($map_id === '') {
        return tdw_atlas_rest_bad_request(
          'tdw_atlas_preview_map_id_required',
          'Missing required query param: map_id'
        );
      }

      if ($scope !== 'region' && $scope !== 'country') {
        return tdw_atlas_rest_bad_request(
          'tdw_atlas_preview_scope_invalid',
          'Invalid scope. Expected: region or country'
        );
      }

      if ($key === '') {
        return tdw_atlas_rest_bad_request(
          'tdw_atlas_preview_key_required',
          'Missing required query param: key'
        );
      }

      if ($scope === 'country') {
        $key = strtoupper($key);
      } else {
        $key = sanitize_key($key);
      }

      if ($key === '') {
        return tdw_atlas_rest_bad_request(
          'tdw_atlas_preview_key_invalid',
          'Invalid key value for selected scope'
        );
      }

      $payload = tdw_atlas_rest_preview_payload($map_id, $scope, $key);
      if (is_wp_error($payload)) {
        $error_data = $payload->get_error_data();
        $status = is_array($error_data) ? (int) ($error_data['status'] ?? 500) : 500;
        return new WP_REST_Response(array(
          'code' => $payload->get_error_code(),
          'message' => $payload->get_error_message(),
        ), $status > 0 ? $status : 500);
      }

      return new WP_REST_Response($payload, 200);
    },
  ));
}
