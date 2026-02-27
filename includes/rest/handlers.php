<?php

if (!defined('ABSPATH')) exit;

function tdw_atlas_rest_config_handler($request) {
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
}

function tdw_atlas_rest_preview_handler($request) {
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
}
