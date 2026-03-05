<?php

if (!defined('ABSPATH')) exit;

function tdw_atlas_admin_register_rest_routes() {
  register_rest_route('tdw-atlas/v1', '/admin/bootstrap', array(
    'methods' => WP_REST_Server::READABLE,
    'permission_callback' => 'tdw_atlas_rest_admin_permission',
    'callback' => 'tdw_atlas_admin_rest_bootstrap_handler',
  ));

  register_rest_route('tdw-atlas/v1', '/admin/datasets', array(
    'methods' => WP_REST_Server::READABLE,
    'permission_callback' => 'tdw_atlas_rest_admin_permission',
    'callback' => 'tdw_atlas_admin_rest_datasets_list_handler',
  ));

  register_rest_route('tdw-atlas/v1', '/admin/maps', array(
    'methods' => WP_REST_Server::READABLE,
    'permission_callback' => 'tdw_atlas_rest_admin_permission',
    'callback' => 'tdw_atlas_admin_rest_maps_list_handler',
  ));

  register_rest_route('tdw-atlas/v1', '/admin/maps/create', array(
    'methods' => WP_REST_Server::CREATABLE,
    'permission_callback' => 'tdw_atlas_rest_admin_permission',
    'callback' => 'tdw_atlas_admin_rest_maps_create_handler',
  ));

  register_rest_route('tdw-atlas/v1', '/admin/maps/bulk-delete', array(
    'methods' => WP_REST_Server::CREATABLE,
    'permission_callback' => 'tdw_atlas_rest_admin_permission',
    'callback' => 'tdw_atlas_admin_rest_maps_bulk_delete_handler',
  ));

  register_rest_route('tdw-atlas/v1', '/admin/maps/(?P<map_key>[a-z0-9_-]{1,64})', array(
    array(
      'methods' => WP_REST_Server::READABLE,
      'permission_callback' => 'tdw_atlas_rest_admin_permission',
      'callback' => 'tdw_atlas_admin_rest_maps_get_handler',
    ),
  ));

  register_rest_route('tdw-atlas/v1', '/admin/maps/(?P<map_key>[a-z0-9_-]{1,64})/general', array(
    'methods' => WP_REST_Server::EDITABLE,
    'permission_callback' => 'tdw_atlas_rest_admin_permission',
    'callback' => 'tdw_atlas_admin_rest_maps_general_update_handler',
  ));

  register_rest_route('tdw-atlas/v1', '/admin/maps/(?P<map_key>[a-z0-9_-]{1,64})/countries', array(
    array(
      'methods' => WP_REST_Server::READABLE,
      'permission_callback' => 'tdw_atlas_rest_admin_permission',
      'callback' => 'tdw_atlas_admin_rest_map_countries_get_handler',
    ),
    array(
      'methods' => WP_REST_Server::EDITABLE,
      'permission_callback' => 'tdw_atlas_rest_admin_permission',
      'callback' => 'tdw_atlas_admin_rest_map_countries_update_handler',
    ),
  ));

  register_rest_route('tdw-atlas/v1', '/admin/defaults', array(
    'methods' => WP_REST_Server::READABLE,
    'permission_callback' => 'tdw_atlas_rest_admin_permission',
    'callback' => 'tdw_atlas_admin_rest_defaults_get_handler',
  ));

  register_rest_route('tdw-atlas/v1', '/admin/defaults/runtime', array(
    'methods' => WP_REST_Server::EDITABLE,
    'permission_callback' => 'tdw_atlas_rest_admin_permission',
    'callback' => 'tdw_atlas_admin_rest_defaults_runtime_update_handler',
  ));

  register_rest_route('tdw-atlas/v1', '/admin/reset', array(
    'methods' => WP_REST_Server::CREATABLE,
    'permission_callback' => 'tdw_atlas_rest_admin_permission',
    'callback' => 'tdw_atlas_admin_rest_reset_handler',
  ));
}
add_action('rest_api_init', 'tdw_atlas_admin_register_rest_routes');
