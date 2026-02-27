<?php

if (!defined('ABSPATH')) exit;

function tdw_atlas_register_rest_routes() {
  register_rest_route('tdw-atlas/v1', '/config', array(
    'methods' => WP_REST_Server::READABLE,
    'permission_callback' => '__return_true',
    'callback' => 'tdw_atlas_rest_config_handler',
  ));

  register_rest_route('tdw-atlas/v1', '/preview', array(
    'methods' => WP_REST_Server::READABLE,
    'permission_callback' => '__return_true',
    'callback' => 'tdw_atlas_rest_preview_handler',
  ));
}
