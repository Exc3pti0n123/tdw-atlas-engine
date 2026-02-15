<?php
/**
 * Plugin Name: TDW – Atlas Engine
 * Description: Minimal atlas plugin (Leaflet + TDW Atlas boot) for rendering GeoJSON maps via shortcode.
 * Version: 0.1.0
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
   Enqueue (Leaflet + Atlas scripts)
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
  $atlas_debug_rel = 'assets/js/atlas-debug.js';
  $atlas_api_rel   = 'assets/js/atlas-api.js';
  $atlas_core_rel  = 'assets/js/atlas-core.js';
  $atlas_leaflet_rel = 'assets/js/atlas-leaflet.js';
  $atlas_boot_rel = 'assets/js/atlas-boot.js';

  $atlas_debug_abs = $base_dir . $atlas_debug_rel;
  $atlas_api_abs   = $base_dir . $atlas_api_rel;
  $atlas_core_abs  = $base_dir . $atlas_core_rel;
  $atlas_leaflet_abs = $base_dir . $atlas_leaflet_rel;
  $atlas_boot_abs = $base_dir . $atlas_boot_rel;

  // Enqueue debug script only if debug cookie is enabled
  if (!empty($_COOKIE['tdw_atlas_debug']) && $_COOKIE['tdw_atlas_debug'] === '1') {
    wp_enqueue_script(
      'tdw-atlas-debug',
      $base_url . $atlas_debug_rel,
      array(),
      tdw_atlas_asset_ver($atlas_debug_abs),
      true
    );
    wp_script_add_data('tdw-atlas-debug', 'type', 'module');
  }

  wp_enqueue_script(
    'tdw-atlas-api',
    $base_url . $atlas_api_rel,
    array(),
    tdw_atlas_asset_ver($atlas_api_abs),
    true
  );
  wp_script_add_data('tdw-atlas-api', 'type', 'module');

  wp_enqueue_script(
    'tdw-atlas-core',
    $base_url . $atlas_core_rel,
    array('tdw-atlas-api'),
    tdw_atlas_asset_ver($atlas_core_abs),
    true
  );
  wp_script_add_data('tdw-atlas-core', 'type', 'module');

  wp_enqueue_script(
    'tdw-atlas-leaflet',
    $base_url . $atlas_leaflet_rel,
    array('tdw-atlas-api'),
    tdw_atlas_asset_ver($atlas_leaflet_abs),
    true
  );
  wp_script_add_data('tdw-atlas-leaflet', 'type', 'module');

  wp_enqueue_script(
    'tdw-atlas-boot',
    $base_url . $atlas_boot_rel,
    array(
      'tdw-atlas-api',
      'tdw-atlas-core',
      'tdw-atlas-leaflet'
    ),
    tdw_atlas_asset_ver($atlas_boot_abs),
    true
  );
  wp_script_add_data('tdw-atlas-boot', 'type', 'module');

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
  tdw_atlas_enqueue_assets();
}

/* ============================================================
   Shortcode: [tdw_atlas id="world" height="70vh"]
   - Renders a div container for a map instance defined in atlas.config.json under "maps".
   - Only "id" (required) and "height" (optional) are accepted.
   ============================================================ */

function tdw_atlas_shortcode($atts = array()) {
  $atts = shortcode_atts(array(
    'id' => '',
    'height' => '70vh',
  ), $atts, 'tdw_atlas');
  
  tdw_atlas_enqueue_frontend_assets_once();

  $plugin_url = plugin_dir_url(__FILE__);
  $config_path = plugin_dir_path(__FILE__) . 'atlas.config.json';
  $config_url = $plugin_url . 'atlas.config.json';

  // Load and parse config
  if (!file_exists($config_path)) {
    return '<div class="tdw-atlas-error">TDW Atlas Error: atlas.config.json is missing or invalid.</div>';
  }
  $config_raw = file_get_contents($config_path);
  $config = json_decode($config_raw, true);
  if (!is_array($config) || empty($config['maps']) || !is_array($config['maps'])) {
    return '<div class="tdw-atlas-error">TDW Atlas Error: atlas.config.json is missing or invalid.</div>';
  }

  $map_id = trim($atts['id']);
  if ($map_id === '') {
    return '<div class="tdw-atlas-error">TDW Atlas Error: No map ID provided. Example: [tdw_atlas id="world"]</div>';
  }
  if (!array_key_exists($map_id, $config['maps'])) {
    return '<div class="tdw-atlas-error">TDW Atlas Error: Map ID "' . esc_html($map_id) . '" not found in atlas.config.json.</div>';
  }
  $map = $config['maps'][$map_id];
  if (empty($map['geojson'])) {
    return '<div class="tdw-atlas-error">TDW Atlas Error: Map "' . esc_html($map_id) . '" has no geojson in atlas.config.json.</div>';
  }
  $geojson_url = esc_url($plugin_url . ltrim($map['geojson'], '/'));
  $height = $atts['height'];
  $container_id = 'tdw-atlas-' . sanitize_html_class($map_id);

  /*
   * Final Container Contract (frozen):
   * - class="tdw-atlas"
   * - id="tdw-atlas-<map_id>"
   * - data-tdw-atlas (presence indicates an atlas container)
   * - data-map-id (string)
   * - data-geojson-url (absolute URL)
   * - data-config-url (absolute URL)
   * - optional: data-view, data-preset
   * - inline style must set width + height
   */
  $attrs = array(
    'class' => 'tdw-atlas',
    'id' => esc_attr($container_id),
    'data-map-id' => esc_attr($map_id),
    'data-tdw-atlas' => '1',
    'data-geojson-url' => $geojson_url,
    'data-config-url' => esc_url($config_url),
    'style' => 'width:100%;height:' . esc_attr($height) . ';'
  );
  if (!empty($map['view'])) {
    $attrs['data-view'] = esc_attr($map['view']);
  }
  if (!empty($map['preset'])) {
    $attrs['data-preset'] = esc_attr($map['preset']);
  }
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