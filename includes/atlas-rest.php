<?php

if (!defined('ABSPATH')) exit;

function tdw_atlas_register_rest_routes() {
  register_rest_route('tdw-atlas/v1', '/config', array(
    'methods' => WP_REST_Server::READABLE,
    'permission_callback' => '__return_true',
    'callback' => function () {
      return new WP_REST_Response(tdw_atlas_get_effective_config(), 200);
    },
  ));
}
