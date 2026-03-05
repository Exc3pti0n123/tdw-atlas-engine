<?php

if (!defined('ABSPATH')) exit;

function tdw_atlas_admin_build_bootstrap_payload() {
  $settings = tdw_atlas_admin_repo_get_runtime_settings();
  if (is_wp_error($settings)) return $settings;

  $map_seed = tdw_atlas_admin_repo_get_map_seed_defaults();
  if (is_wp_error($map_seed)) return $map_seed;

  $datasets = tdw_atlas_admin_repo_list_datasets();
  if (is_wp_error($datasets)) return $datasets;

  $maps = tdw_atlas_admin_repo_list_maps();
  if (is_wp_error($maps)) return $maps;

  return array(
    'settings' => $settings,
    'mapDefaults' => is_array($map_seed['mapDefaults'] ?? null) ? $map_seed['mapDefaults'] : array(),
    'datasets' => $datasets,
    'maps' => $maps,
  );
}

function tdw_atlas_admin_rest_bootstrap_handler($request) {
  $payload = tdw_atlas_admin_build_bootstrap_payload();
  if (is_wp_error($payload)) {
    return tdw_atlas_rest_error_response($payload, 500);
  }

  return new WP_REST_Response($payload, 200);
}

function tdw_atlas_admin_rest_datasets_list_handler($request) {
  $datasets = tdw_atlas_admin_repo_list_datasets();
  if (is_wp_error($datasets)) {
    return tdw_atlas_rest_error_response($datasets, 500);
  }

  return new WP_REST_Response(array('datasets' => $datasets), 200);
}

function tdw_atlas_admin_rest_maps_list_handler($request) {
  $maps = tdw_atlas_admin_repo_list_maps();
  if (is_wp_error($maps)) {
    return tdw_atlas_rest_error_response($maps, 500);
  }

  return new WP_REST_Response(array('maps' => $maps), 200);
}

function tdw_atlas_admin_rest_maps_get_handler($request) {
  $map_key = tdw_atlas_rest_validate_map_id($request->get_param('map_key') ?? '', 'map_key');
  if (is_wp_error($map_key)) {
    return tdw_atlas_rest_error_response($map_key, 400);
  }

  $map = tdw_atlas_admin_repo_get_map($map_key);
  if (is_wp_error($map)) {
    return tdw_atlas_rest_error_response($map, 500);
  }

  return new WP_REST_Response($map, 200);
}

function tdw_atlas_admin_rest_maps_create_handler($request) {
  $nonce_ok = tdw_atlas_rest_require_admin_nonce($request);
  if (is_wp_error($nonce_ok)) {
    return tdw_atlas_rest_error_response($nonce_ok, 403);
  }

  $body = tdw_atlas_admin_decode_request_body($request);
  if (is_wp_error($body)) {
    return tdw_atlas_rest_error_response($body, 400);
  }

  $normalized = tdw_atlas_admin_validate_map_create_payload($body);
  if (is_wp_error($normalized)) {
    return tdw_atlas_rest_error_response($normalized, 400);
  }

  $result = tdw_atlas_admin_with_transaction(function () use ($normalized) {
    return tdw_atlas_admin_repo_create_map_from_seed($normalized);
  });

  if (is_wp_error($result)) {
    return tdw_atlas_rest_error_response($result, 500);
  }

  return new WP_REST_Response($result, 201);
}

function tdw_atlas_admin_rest_maps_general_update_handler($request) {
  $nonce_ok = tdw_atlas_rest_require_admin_nonce($request);
  if (is_wp_error($nonce_ok)) {
    return tdw_atlas_rest_error_response($nonce_ok, 403);
  }

  $map_key = tdw_atlas_rest_validate_map_id($request->get_param('map_key') ?? '', 'map_key');
  if (is_wp_error($map_key)) {
    return tdw_atlas_rest_error_response($map_key, 400);
  }

  $body = tdw_atlas_admin_decode_request_body($request);
  if (is_wp_error($body)) {
    return tdw_atlas_rest_error_response($body, 400);
  }

  $normalized = tdw_atlas_admin_validate_map_payload($body, false, $map_key);
  if (is_wp_error($normalized)) {
    return tdw_atlas_rest_error_response($normalized, 400);
  }

  $result = tdw_atlas_admin_with_transaction(function () use ($normalized) {
    return tdw_atlas_admin_repo_upsert_map($normalized, false);
  });

  if (is_wp_error($result)) {
    return tdw_atlas_rest_error_response($result, 500);
  }

  return new WP_REST_Response($result, 200);
}

function tdw_atlas_admin_rest_map_countries_get_handler($request) {
  $map_key = tdw_atlas_rest_validate_map_id($request->get_param('map_key') ?? '', 'map_key');
  if (is_wp_error($map_key)) {
    return tdw_atlas_rest_error_response($map_key, 400);
  }

  $result = tdw_atlas_admin_repo_list_map_countries($map_key);
  if (is_wp_error($result)) {
    return tdw_atlas_rest_error_response($result, 500);
  }

  return new WP_REST_Response($result, 200);
}

function tdw_atlas_admin_rest_map_countries_update_handler($request) {
  $nonce_ok = tdw_atlas_rest_require_admin_nonce($request);
  if (is_wp_error($nonce_ok)) {
    return tdw_atlas_rest_error_response($nonce_ok, 403);
  }

  $map_key = tdw_atlas_rest_validate_map_id($request->get_param('map_key') ?? '', 'map_key');
  if (is_wp_error($map_key)) {
    return tdw_atlas_rest_error_response($map_key, 400);
  }

  $body = tdw_atlas_admin_decode_request_body($request);
  if (is_wp_error($body)) {
    return tdw_atlas_rest_error_response($body, 400);
  }

  $updates = tdw_atlas_admin_validate_map_countries_payload($body);
  if (is_wp_error($updates)) {
    return tdw_atlas_rest_error_response($updates, 400);
  }

  $result = tdw_atlas_admin_with_transaction(function () use ($map_key, $updates) {
    return tdw_atlas_admin_repo_update_map_countries($map_key, $updates);
  });

  if (is_wp_error($result)) {
    return tdw_atlas_rest_error_response($result, 500);
  }

  return new WP_REST_Response($result, 200);
}

function tdw_atlas_admin_rest_maps_bulk_delete_handler($request) {
  $nonce_ok = tdw_atlas_rest_require_admin_nonce($request);
  if (is_wp_error($nonce_ok)) {
    return tdw_atlas_rest_error_response($nonce_ok, 403);
  }

  $body = tdw_atlas_admin_decode_request_body($request);
  if (is_wp_error($body)) {
    return tdw_atlas_rest_error_response($body, 400);
  }

  $map_keys = tdw_atlas_admin_validate_bulk_delete_payload($body);
  if (is_wp_error($map_keys)) {
    return tdw_atlas_rest_error_response($map_keys, 400);
  }

  $result = tdw_atlas_admin_with_transaction(function () use ($map_keys) {
    return tdw_atlas_admin_repo_bulk_delete_maps($map_keys);
  });

  if (is_wp_error($result)) {
    return tdw_atlas_rest_error_response($result, 500);
  }

  return new WP_REST_Response($result, 200);
}

function tdw_atlas_admin_rest_defaults_get_handler($request) {
  $settings = tdw_atlas_admin_repo_get_runtime_settings();
  if (is_wp_error($settings)) {
    return tdw_atlas_rest_error_response($settings, 500);
  }

  return new WP_REST_Response(array(
    'settings' => $settings,
  ), 200);
}

function tdw_atlas_admin_rest_defaults_runtime_update_handler($request) {
  $nonce_ok = tdw_atlas_rest_require_admin_nonce($request);
  if (is_wp_error($nonce_ok)) {
    return tdw_atlas_rest_error_response($nonce_ok, 403);
  }

  $body = tdw_atlas_admin_decode_request_body($request);
  if (is_wp_error($body)) {
    return tdw_atlas_rest_error_response($body, 400);
  }

  $normalized = tdw_atlas_admin_validate_runtime_defaults_payload($body);
  if (is_wp_error($normalized)) {
    return tdw_atlas_rest_error_response($normalized, 400);
  }

  $updated = update_option(TDW_ATLAS_OPTION_SETTINGS, $normalized, false);
  if ($updated === false && get_option(TDW_ATLAS_OPTION_SETTINGS, null) === null) {
    return tdw_atlas_rest_error_response(
      new WP_Error('tdw_atlas_admin_runtime_defaults_update_failed', 'Failed to update runtime defaults.', array('status' => 500)),
      500
    );
  }

  return new WP_REST_Response($normalized, 200);
}

function tdw_atlas_admin_rest_reset_handler($request) {
  $nonce_ok = tdw_atlas_rest_require_admin_nonce($request);
  if (is_wp_error($nonce_ok)) {
    return tdw_atlas_rest_error_response($nonce_ok, 403);
  }

  try {
    tdw_atlas_db_install_or_upgrade();
    tdw_atlas_reset_db_from_defaults();
  } catch (Throwable $err) {
    return tdw_atlas_rest_error_response(
      new WP_Error('tdw_atlas_admin_reset_failed', $err->getMessage(), array('status' => 500)),
      500
    );
  }

  return new WP_REST_Response(array(
    'reset' => true,
    'version' => TDW_ATLAS_PLUGIN_VERSION,
  ), 200);
}
