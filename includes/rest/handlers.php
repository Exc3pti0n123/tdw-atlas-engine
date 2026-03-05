<?php

if (!defined('ABSPATH')) exit;

function tdw_atlas_rest_config_handler($request) {
  $requested_map_keys = array();
  $raw_map_ids = $request instanceof WP_REST_Request
    ? (string) ($request->get_param('map_ids') ?? '')
    : '';

  if ($raw_map_ids !== '') {
    $requested_map_keys = tdw_atlas_rest_parse_map_ids($raw_map_ids);
    if (is_wp_error($requested_map_keys)) {
      return tdw_atlas_rest_error_response($requested_map_keys, 400);
    }
  }

  $config = tdw_atlas_get_effective_config($requested_map_keys);
  if (is_wp_error($config)) {
    return tdw_atlas_rest_error_response($config, 500);
  }

  if (is_array($config) && is_array($config['maps'] ?? null)) {
    $config['maps'] = (object) $config['maps'];
  }

  return new WP_REST_Response($config, 200);
}

function tdw_atlas_rest_preview_handler($request) {
  $raw_map_id = $request instanceof WP_REST_Request
    ? (string) ($request->get_param('map_id') ?? '')
    : '';
  $raw_scope = $request instanceof WP_REST_Request
    ? (string) ($request->get_param('scope') ?? '')
    : '';
  $raw_key = $request instanceof WP_REST_Request
    ? (string) ($request->get_param('key') ?? '')
    : '';

  if (trim($raw_map_id) === '') {
    return tdw_atlas_rest_bad_request('tdw_atlas_preview_map_id_required', 'Missing required query param: map_id');
  }
  if (trim($raw_scope) === '') {
    return tdw_atlas_rest_bad_request('tdw_atlas_preview_scope_required', 'Missing required query param: scope');
  }
  if (trim($raw_key) === '') {
    return tdw_atlas_rest_bad_request('tdw_atlas_preview_key_required', 'Missing required query param: key');
  }

  $map_id = tdw_atlas_rest_validate_map_id($raw_map_id, 'map_id');
  if (is_wp_error($map_id)) {
    return tdw_atlas_rest_error_response($map_id, 400);
  }

  $scope = tdw_atlas_rest_validate_scope($raw_scope);
  if (is_wp_error($scope)) {
    return tdw_atlas_rest_error_response($scope, 400);
  }

  $key = $scope === 'country'
    ? tdw_atlas_rest_validate_country_code($raw_key)
    : tdw_atlas_rest_validate_region_key($raw_key);
  if (is_wp_error($key)) {
    return tdw_atlas_rest_error_response($key, 400);
  }

  $payload = tdw_atlas_rest_preview_payload($map_id, $scope, $key);
  if (is_wp_error($payload)) {
    return tdw_atlas_rest_error_response($payload, 500);
  }

  return new WP_REST_Response($payload, 200);
}
