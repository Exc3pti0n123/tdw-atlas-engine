<?php
/**
 * Plugin Name: TDW – Atlas Engine
 * Description: Minimal atlas plugin (Leaflet + TDW Atlas boot) for rendering GeoJSON maps via shortcode.
 * Version: 0.1.1
 * Author: Justin Errica
 */

if (!defined('ABSPATH')) exit;

/* ============================================================
   Helpers
   ============================================================ */

function tdw_atlas_asset_ver($abs_path, $fallback = '0.1.0') {
  return file_exists($abs_path) ? (string) filemtime($abs_path) : $fallback;
}

/* ============================================================
   Enqueue (Leaflet + shared + Atlas scripts)
   ============================================================ */

//Enqueue vendored Leaflet 2.0.0-alpha (local vendor copy)

function tdw_atlas_enqueue_vendor_leaflet() {

  $base_path = plugin_dir_path(__FILE__) . 'assets/vendor/leaflet/2.0.0-alpha-2.1/';
  $base_url  = plugin_dir_url(__FILE__)  . 'assets/vendor/leaflet/2.0.0-alpha-2.1/';

  $js_file  = $base_path . 'leaflet-src.js';
  $css_file = $base_path . 'leaflet.css';

  // Leaflet CSS
  wp_enqueue_style(
    'tdw-atlas-vendor-leaflet',
    $base_url . 'leaflet.css',
    array(),
    file_exists($css_file) ? filemtime($css_file) : '2.0.0-alpha'
  );

  // Leaflet JS - module lazy via import() in adapter

}

//Enqueue shared files (temporary)

function tdw_shared_enqueue_assets() {
  $base_dir = plugin_dir_path(__FILE__);
  $base_url = plugin_dir_url(__FILE__);

  // Shared modules: tdw-bridge.js + tdw-logger.js
  $tdw_bridge_rel = 'assets/shared/tdw-bridge.js';
  $tdw_bridge_abs = $base_dir . $tdw_bridge_rel;
  $tdw_logger_rel = 'assets/shared/tdw-logger.js';
  $tdw_logger_abs = $base_dir . $tdw_logger_rel;


  wp_enqueue_script_module(
    'tdw-bridge',
    $base_url . $tdw_bridge_rel,
    array(),
    tdw_atlas_asset_ver($tdw_bridge_abs),
    ['in_footer' => true]
  );

  wp_enqueue_script_module(
    'tdw-logger',
    $base_url . $tdw_logger_rel,
    array('tdw-bridge'),
    tdw_atlas_asset_ver($tdw_logger_abs),
    ['in_footer' => true]
  );

}

//Enqueue Atlas files

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
//  $atlas_debug_rel = 'assets/js/atlas-debug.js';
  $atlas_api_rel   = 'assets/js/atlas-api.js';
  $atlas_core_rel  = 'assets/js/atlas-core.js';
  $atlas_leaflet_rel = 'assets/js/atlas-leaflet.js';
  $atlas_cookie_ops_rel = 'assets/js/helpers/atlas-cookie-ops.js';
  $atlas_boot_rel = 'assets/js/atlas-boot.js';

 // $atlas_debug_abs = $base_dir . $atlas_debug_rel;
  $atlas_api_abs   = $base_dir . $atlas_api_rel;
  $atlas_core_abs  = $base_dir . $atlas_core_rel;
  $atlas_leaflet_abs = $base_dir . $atlas_leaflet_rel;
  $atlas_cookie_ops_abs = $base_dir . $atlas_cookie_ops_rel;
  $atlas_boot_abs = $base_dir . $atlas_boot_rel;

  // Enqueue debug script only if debug cookie is enabled
/*  if (!empty($_COOKIE['tdw_atlas_debug']) && $_COOKIE['tdw_atlas_debug'] === '1') {
    wp_enqueue_script_module(
      'tdw-atlas-debug',
      $base_url . $atlas_debug_rel,
      array(),
      tdw_atlas_asset_ver($atlas_debug_abs),
      ['in_footer' => true]
    );
  }
 */   

  wp_enqueue_script_module(
    'tdw-atlas-cookie-ops',
    $base_url . $atlas_cookie_ops_rel,
    array('tdw-bridge', 'tdw-logger'),
    tdw_atlas_asset_ver($atlas_cookie_ops_abs),
    ['in_footer' => true]
  );

  wp_enqueue_script_module(
    'tdw-atlas-api',
    $base_url . $atlas_api_rel,
    array('tdw-logger', 'tdw-atlas-cookie-ops'),
    tdw_atlas_asset_ver($atlas_api_abs),
    ['in_footer' => true]
  );

  wp_enqueue_script_module(
    'tdw-atlas-core',
    $base_url . $atlas_core_rel,
    array('tdw-atlas-api', 'tdw-logger', 'tdw-atlas-cookie-ops'),
    tdw_atlas_asset_ver($atlas_core_abs),
    ['in_footer' => true]
  );

  wp_enqueue_script_module(
    'tdw-atlas-leaflet',
    $base_url . $atlas_leaflet_rel,
    array('tdw-atlas-api', 'tdw-logger', 'tdw-atlas-cookie-ops'),
    tdw_atlas_asset_ver($atlas_leaflet_abs),
    ['in_footer' => true]
  );

  wp_enqueue_script_module(
    'tdw-atlas-boot',
    $base_url . $atlas_boot_rel,
    array(
      'tdw-atlas-api',
      'tdw-atlas-core',
      'tdw-atlas-leaflet',
      'tdw-atlas-cookie-ops',
      'tdw-logger',
      'tdw-bridge'
    ),
    tdw_atlas_asset_ver($atlas_boot_abs),
    ['in_footer' => true]
  );

  // Expose plugin base URL + config URL for JS
  $config_rel = 'atlas.config.json';
  $config_abs = $base_dir . $config_rel;
  wp_add_inline_script(
    'tdw-atlas-core',
    'window.TDW_ATLAS_BOOT = window.TDW_ATLAS_BOOT || {}; ' .
    'window.TDW_ATLAS_BOOT.baseUrl=' . wp_json_encode($base_url) . ';' .
    'window.TDW_ATLAS_BOOT.configUrl=' . wp_json_encode($base_url . $config_rel) . ';' .
    'window.TDW_ATLAS_BOOT.hasConfig=' . wp_json_encode(file_exists($config_abs)) . ';' .
    'window.TDW_ATLAS_BOOT.pluginVersion=' . wp_json_encode('0.1.0') . ';',
    'before'
  );
}
// TODO: For MVP, assets are enqueued only when the shortcode renders.
// In the future, we need a global loader for global functions / admin UI, etc.

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
   - Renders a div container for a map instance defined in atlas.config.json under "maps".
   - Only "id" (required) is accepted.
   ============================================================ */

function tdw_atlas_shortcode($atts = array()) {
  $atts = shortcode_atts(array(
    'id' => '',
  ), $atts, 'tdw_atlas');
  
  tdw_atlas_enqueue_frontend_assets_once();

  $plugin_url  = plugin_dir_url(__FILE__);
  $config_url  = $plugin_url . 'atlas.config.json';

  // Minimal contract: PHP does not validate config or map ids.
  // Boot is responsible for loading config and rendering user-facing errors.
  $map_id = trim((string) $atts['id']);

  // If no id is provided, render nothing (Boot cannot target a container reliably).
  if ($map_id === '') {
    return '';
  }

  $container_id = 'tdw-atlas-' . sanitize_html_class($map_id);

  /*
   * Final Container Contract (frozen):
   * - class="tdw-atlas"
   * - id="tdw-atlas-<map_id>"
   * - data-tdw-atlas (presence indicates an atlas container)
   * - data-map-id (string)
   * - data-config-url (absolute URL)
   * - optional: data-view, data-preset (future)
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
