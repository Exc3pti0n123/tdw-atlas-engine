<?php
/**
 * Plugin Name: TDW – Atlas Engine
 * Description: Minimal atlas plugin (Leaflet + TDW Atlas boot) for rendering GeoJSON maps via shortcode.
 * Version: 0.2.0
 * Author: Justin Errica
 */

if (!defined('ABSPATH')) exit;

const TDW_ATLAS_PLUGIN_VERSION = '0.2.0';
const TDW_ATLAS_OPTION_SETTINGS = 'tdw_atlas_settings';
const TDW_ATLAS_OPTION_SYSTEM = 'tdw_atlas_system';
const TDW_ATLAS_PLUGIN_FILE = __FILE__;
const TDW_ATLAS_SEED_FILE = 'atlas.seed.json';

/* ============================================================
   Helpers
   ============================================================ */

function tdw_atlas_asset_ver($abs_path, $fallback = '0.2.0') {
  return file_exists($abs_path) ? (string) filemtime($abs_path) : $fallback;
}

require_once plugin_dir_path(__FILE__) . 'includes/atlas-runtime-config.php';
require_once plugin_dir_path(__FILE__) . 'includes/atlas-db.php';
require_once plugin_dir_path(__FILE__) . 'includes/atlas-rest.php';
require_once plugin_dir_path(__FILE__) . 'includes/atlas-cli.php';

register_activation_hook(__FILE__, 'tdw_atlas_activate');
add_action('init', 'tdw_atlas_maybe_upgrade');
add_action('rest_api_init', 'tdw_atlas_register_rest_routes');

/* ============================================================
   Enqueue (Leaflet + shared + Atlas scripts)
   ============================================================ */

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

// Enqueue shared modules

function tdw_shared_enqueue_assets() {
  $base_dir = plugin_dir_path(__FILE__);
  $base_url = plugin_dir_url(__FILE__);

  // Shared modules: tdw-bridge.js + tdw-logger.js
  $tdw_bridge_rel = 'assets/shared/tdw-bridge.js';
  $tdw_bridge_abs = $base_dir . $tdw_bridge_rel;
  $tdw_logger_rel = 'assets/shared/tdw-logger.js';
  $tdw_logger_abs = $base_dir . $tdw_logger_rel;

  if (!wp_script_is('tdw-bridge', 'enqueued') && !wp_script_is('tdw-bridge', 'done')) {
    wp_enqueue_script_module(
      'tdw-bridge',
      $base_url . $tdw_bridge_rel,
      array(),
      tdw_atlas_asset_ver($tdw_bridge_abs),
      ['in_footer' => true]
    );
  }

  if (!wp_script_is('tdw-logger', 'enqueued') && !wp_script_is('tdw-logger', 'done')) {
    wp_enqueue_script_module(
      'tdw-logger',
      $base_url . $tdw_logger_rel,
      array('tdw-bridge'),
      tdw_atlas_asset_ver($tdw_logger_abs),
      ['in_footer' => true]
    );
  }

}

// Enqueue Atlas files

function tdw_atlas_enqueue_assets() {
  $base_dir = plugin_dir_path(__FILE__);
  $base_url = plugin_dir_url(__FILE__);

  // Plugin css
  $atlas_css_rel = 'assets/atlas.css';
  $atlas_css_abs = $base_dir . $atlas_css_rel;
  wp_enqueue_style(
    'tdw-atlas',
    $base_url . $atlas_css_rel,
    array(),
    tdw_atlas_asset_ver($atlas_css_abs)
  );

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
  if ($done) return;
  $done = true;
  tdw_atlas_enqueue_vendor_leaflet();
  tdw_shared_enqueue_assets();
  tdw_atlas_enqueue_assets();
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
  tdw_atlas_enqueue_frontend_assets_once();

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
