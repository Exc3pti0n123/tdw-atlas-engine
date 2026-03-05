<?php
/**
 * Plugin Name: TDW – Atlas Engine
 * Description: Minimal atlas plugin (Leaflet + TDW Atlas boot) for rendering GeoJSON maps via shortcode.
 * Version: 0.2.0
 * Requires at least: 6.5
 * Requires Plugins: tdw-core
 * Author: Justin Errica
 * License: GPLv2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 */

if (!defined('ABSPATH')) exit;

const TDW_ATLAS_PLUGIN_VERSION = '0.2.0';
const TDW_ATLAS_OPTION_SETTINGS = 'tdw_atlas_settings';
const TDW_ATLAS_OPTION_SYSTEM = 'tdw_atlas_system';
const TDW_ATLAS_PLUGIN_FILE = __FILE__;
const TDW_ATLAS_RUNTIME_SEED_FILE = 'data/seed/atlas.runtime.seed.json';
const TDW_ATLAS_MAP_SEED_FILE = 'data/seed/atlas.map.seed.json';
const TDW_ATLAS_REQUIRED_CORE_SLUG = 'tdw-core';
const TDW_ATLAS_ADMIN_PAGE_SLUG = 'tdw-atlas-admin';
const TDW_ATLAS_ADMIN_REQUIRED_CAP = 'manage_options';
const TDW_ATLAS_REPO_SRC_URL = 'https://github.com/Exc3pti0n123/tdw-atlas-engine';
const TDW_ATLAS_REPO_DOCS_URL = 'https://github.com/Exc3pti0n123/tdw-atlas-engine/tree/main/docs';

/* ============================================================
   Helpers
   ============================================================ */

function tdw_atlas_asset_ver($abs_path, $fallback = '0.2.0') {
  return file_exists($abs_path) ? (string) filemtime($abs_path) : $fallback;
}

require_once plugin_dir_path(__FILE__) . 'includes/runtime/index.php';
require_once plugin_dir_path(__FILE__) . 'includes/db/index.php';
require_once plugin_dir_path(__FILE__) . 'includes/rest/index.php';

/**
 * Detect Atlas admin REST requests early (before REST_REQUEST is defined).
 *
 * @return bool
 */
function tdw_atlas_is_admin_rest_request() {
  $uri = isset($_SERVER['REQUEST_URI']) ? (string) $_SERVER['REQUEST_URI'] : '';
  if ($uri !== '' && strpos($uri, '/tdw-atlas/v1/admin/') !== false) {
    return true;
  }

  if (!isset($_GET['rest_route'])) {
    return false;
  }

  $raw_route = $_GET['rest_route'];
  if (is_array($raw_route)) {
    return false;
  }

  $route = (string) $raw_route;
  if (function_exists('wp_unslash')) {
    $route = (string) wp_unslash($route);
  }

  return $route !== '' && strpos($route, '/tdw-atlas/v1/admin/') !== false;
}

/**
 * Decide whether admin subsystem must be loaded for current request.
 *
 * @return bool
 */
function tdw_atlas_should_load_admin_subsystem() {
  if (function_exists('is_admin') && is_admin()) {
    return true;
  }

  return tdw_atlas_is_admin_rest_request();
}

if (tdw_atlas_should_load_admin_subsystem()) {
  require_once plugin_dir_path(__FILE__) . 'includes/admin/index.php';
}

register_activation_hook(__FILE__, 'tdw_atlas_activate');
add_action('init', 'tdw_atlas_maybe_upgrade');
add_action('rest_api_init', 'tdw_atlas_register_rest_routes');
add_action('admin_notices', 'tdw_atlas_admin_dependency_notice');

/* ============================================================
   Enqueue (Leaflet + Atlas scripts)
   ============================================================ */

function tdw_atlas_core_dependency_ready() {
  if (!function_exists('tdw_core_shared_modules_ready')) {
    return false;
  }

  return (bool) tdw_core_shared_modules_ready();
}

function tdw_atlas_dependency_error_message() {
  return 'TDW Atlas Engine requires TDW Core (plugin slug: ' . TDW_ATLAS_REQUIRED_CORE_SLUG . ') with registered shared modules (tdw-bridge, tdw-logger).';
}

function tdw_atlas_admin_dependency_notice() {
  if (!is_admin()) return;
  if (tdw_atlas_core_dependency_ready()) return;
  if (!current_user_can('activate_plugins')) return;

  echo '<div class="notice notice-error"><p>'
    . esc_html(tdw_atlas_dependency_error_message())
    . '</p></div>';
}

function tdw_atlas_enqueue_base_styles() {
  $base_dir = plugin_dir_path(__FILE__);
  $base_url = plugin_dir_url(__FILE__);
  $atlas_css_rel = 'assets/atlas.css';
  $atlas_css_abs = $base_dir . $atlas_css_rel;

  if (!wp_style_is('tdw-atlas', 'enqueued') && !wp_style_is('tdw-atlas', 'done')) {
    wp_enqueue_style(
      'tdw-atlas',
      $base_url . $atlas_css_rel,
      array(),
      tdw_atlas_asset_ver($atlas_css_abs)
    );
  }
}

function tdw_atlas_enqueue_core_shared_modules() {
  if (!function_exists('wp_enqueue_script_module')) return;

  if (!wp_script_is('tdw-bridge', 'enqueued') && !wp_script_is('tdw-bridge', 'done')) {
    wp_enqueue_script_module('tdw-bridge');
  }

  if (!wp_script_is('tdw-logger', 'enqueued') && !wp_script_is('tdw-logger', 'done')) {
    wp_enqueue_script_module('tdw-logger');
  }
}

//Enqueue vendored Leaflet 2.0.0-alpha (local vendor copy)

function tdw_atlas_enqueue_vendor_leaflet() {

  $base_path = plugin_dir_path(__FILE__) . 'assets/vendor/leaflet/2.0.0-alpha-2.1/';
  $base_url  = plugin_dir_url(__FILE__)  . 'assets/vendor/leaflet/2.0.0-alpha-2.1/';

  $css_file = $base_path . 'leaflet.css';

  // Leaflet CSS
  if (!wp_style_is('tdw-atlas-vendor-leaflet', 'enqueued') && !wp_style_is('tdw-atlas-vendor-leaflet', 'done')) {
    wp_enqueue_style(
      'tdw-atlas-vendor-leaflet',
      $base_url . 'leaflet.css',
      array(),
      file_exists($css_file) ? filemtime($css_file) : '2.0.0-alpha'
    );
  }

  // Leaflet JS - module lazy via import() in adapter

}

// Enqueue Atlas files

function tdw_atlas_enqueue_assets() {
  $base_dir = plugin_dir_path(__FILE__);
  $base_url = plugin_dir_url(__FILE__);

  tdw_atlas_enqueue_base_styles();

  // Atlas scripts
  $atlas_adapter_rel = 'assets/js/atlas-adapter.js';
  $atlas_core_rel  = 'assets/js/atlas-core.js';
  $atlas_cookie_ops_rel = 'assets/js/helpers/atlas-cookie-ops.js';
  $atlas_boot_rel = 'assets/js/atlas-boot.js';

  $atlas_adapter_abs = $base_dir . $atlas_adapter_rel;
  $atlas_core_abs  = $base_dir . $atlas_core_rel;
  $atlas_cookie_ops_abs = $base_dir . $atlas_cookie_ops_rel;
  $atlas_boot_abs = $base_dir . $atlas_boot_rel;

  if (!wp_script_is('tdw-atlas-cookie-ops', 'enqueued') && !wp_script_is('tdw-atlas-cookie-ops', 'done')) {
    wp_enqueue_script_module(
      'tdw-atlas-cookie-ops',
      $base_url . $atlas_cookie_ops_rel,
      array('tdw-bridge', 'tdw-logger'),
      tdw_atlas_asset_ver($atlas_cookie_ops_abs),
      ['in_footer' => true]
    );
  }

  if (!wp_script_is('tdw-atlas-adapter', 'enqueued') && !wp_script_is('tdw-atlas-adapter', 'done')) {
    wp_enqueue_script_module(
      'tdw-atlas-adapter',
      $base_url . $atlas_adapter_rel,
      array('tdw-logger', 'tdw-atlas-cookie-ops'),
      tdw_atlas_asset_ver($atlas_adapter_abs),
      ['in_footer' => true]
    );
  }

  if (!wp_script_is('tdw-atlas-core', 'enqueued') && !wp_script_is('tdw-atlas-core', 'done')) {
    wp_enqueue_script_module(
      'tdw-atlas-core',
      $base_url . $atlas_core_rel,
      array('tdw-atlas-adapter', 'tdw-logger', 'tdw-atlas-cookie-ops'),
      tdw_atlas_asset_ver($atlas_core_abs),
      ['in_footer' => true]
    );
  }

  if (!wp_script_is('tdw-atlas-boot', 'enqueued') && !wp_script_is('tdw-atlas-boot', 'done')) {
    wp_enqueue_script_module(
      'tdw-atlas-boot',
      $base_url . $atlas_boot_rel,
      array(
        'tdw-atlas-adapter',
        'tdw-atlas-core',
        'tdw-atlas-cookie-ops',
        'tdw-logger',
        'tdw-bridge'
      ),
      tdw_atlas_asset_ver($atlas_boot_abs),
      ['in_footer' => true]
    );
  }
}
/**
 * Enqueue all frontend assets lazily when the shortcode renders.
 *
 * Ensures assets are only enqueued once per request.
 */
function tdw_atlas_enqueue_frontend_assets_once() {
  static $done = false;
  static $result = false;
  if ($done) return $result;
  $done = true;

  if (!tdw_atlas_core_dependency_ready()) {
    tdw_atlas_enqueue_base_styles();
    $result = false;
    return $result;
  }

  tdw_atlas_enqueue_core_shared_modules();
  tdw_atlas_enqueue_vendor_leaflet();
  tdw_atlas_enqueue_assets();
  $result = true;
  return $result;
}

function tdw_atlas_render_dependency_error($config_url = '') {
  $missing_id = 'tdw-atlas-core-missing-' . wp_generate_uuid4();
  $safe_url = esc_url($config_url);
  $safe_msg = esc_html(tdw_atlas_dependency_error_message());

  return '<div class="tdw-atlas tdw-atlas-failed" id="' . esc_attr($missing_id)
    . '" data-tdw-atlas="1" data-config-url="' . $safe_url . '">'
    . '<div class="tdw-error" role="alert"><strong>TDW Error:</strong> ' . $safe_msg . '</div></div>';
}

/* ============================================================
   Shortcode: [tdw_atlas id="world"]
   - Renders a div container for a map instance resolved by runtime config under "maps".
   - Only "id" (required) is accepted.
   ============================================================ */

function tdw_atlas_shortcode($atts = array()) {
  $atts = shortcode_atts(array(
    'id' => '',
  ), $atts, 'tdw_atlas');

  $config_url  = rest_url('tdw-atlas/v1/config');

  // Minimal contract: PHP does not validate config or map ids.
  // Boot is responsible for loading config and rendering user-facing errors.
  $map_id = trim((string) $atts['id']);

  // Always enqueue runtime assets so Boot can resolve runtime errors in-container.
  if (!tdw_atlas_enqueue_frontend_assets_once()) {
    return tdw_atlas_render_dependency_error($config_url);
  }

  // If no id is provided, render a placeholder atlas container.
  // Boot will replace this with a visible fatal error ("Missing map id").
  if ($map_id === '') {
    $missing_id = 'tdw-atlas-missing-' . wp_generate_uuid4();
    return '<div class="tdw-atlas tdw-atlas-loading" id="' . esc_attr($missing_id) . '" data-tdw-atlas="1" data-config-url="' . esc_url($config_url) . '"><div class="tdw-map-loading">Loading map...</div></div>';
  }

  $container_id = 'tdw-atlas-' . sanitize_html_class($map_id);

  /*
   * Final Container Contract (frozen):
   * - class="tdw-atlas"
   * - id="tdw-atlas-<map_id>"
   * - data-tdw-atlas (presence indicates an atlas container)
   * - data-map-id (string)
   * - data-config-url (absolute URL)
   */
  $attrs = array(
    'class' => 'tdw-atlas',
    'id' => esc_attr($container_id),
    'data-tdw-atlas' => '1',
    'data-map-id' => esc_attr($map_id),
    'data-config-url' => esc_url($config_url),
  );
  $attr_str = '';
  foreach ($attrs as $k => $v) {
    if ($v === null) {
      continue;
    }
    // Allow boolean-ish attributes (render as ` data-foo`)
    if ($v === '') {
      $attr_str .= ' ' . $k;
      continue;
    }
    $attr_str .= ' ' . $k . '="' . $v . '"';
  }
  return '<div' . $attr_str . '></div>';
}
add_shortcode('tdw_atlas', 'tdw_atlas_shortcode');
