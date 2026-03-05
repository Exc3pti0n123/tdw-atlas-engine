<?php

if (!defined('ABSPATH')) exit;

/**
 * Resolve requested admin map key from query parameter.
 *
 * @return string
 */
function tdw_atlas_admin_requested_map_key() {
  if (!isset($_GET['id'])) {
    return '';
  }

  $candidate = tdw_atlas_rest_validate_map_id(
    (string) wp_unslash($_GET['id']),
    'id'
  );

  return is_wp_error($candidate) ? '' : (string) $candidate;
}

/**
 * Build canonical Atlas admin list URL.
 *
 * @return string
 */
function tdw_atlas_admin_list_url() {
  return add_query_arg(
    array('page' => TDW_ATLAS_ADMIN_PAGE_SLUG),
    admin_url('admin.php')
  );
}

function tdw_atlas_admin_enqueue_assets($hook_suffix) {
  if (!is_admin()) {
    return;
  }

  $expected_hook = tdw_atlas_admin_get_page_hook_suffix();
  if ($expected_hook === '' || $hook_suffix !== $expected_hook) {
    return;
  }

  $base_dir = plugin_dir_path(TDW_ATLAS_PLUGIN_FILE);
  $base_url = plugin_dir_url(TDW_ATLAS_PLUGIN_FILE);

  $css_rel = 'assets/admin/atlas-admin.css';
  $css_abs = $base_dir . $css_rel;
  $js_rel = 'assets/admin/atlas-admin.js';
  $js_abs = $base_dir . $js_rel;

  wp_enqueue_style(
    'tdw-atlas-admin',
    $base_url . $css_rel,
    array(),
    tdw_atlas_asset_ver($css_abs)
  );

  wp_enqueue_script(
    'tdw-atlas-admin',
    $base_url . $js_rel,
    array(),
    tdw_atlas_asset_ver($js_abs),
    true
  );

  $rest_base = wp_make_link_relative(rest_url('tdw-atlas/v1/admin'));
  if (!is_string($rest_base) || trim($rest_base) === '') {
    $rest_base = rest_url('tdw-atlas/v1/admin');
  }

  wp_add_inline_script(
    'tdw-atlas-admin',
    'window.TDW_ATLAS_ADMIN_CONFIG = ' . wp_json_encode(array(
      'restBase' => esc_url_raw($rest_base),
      'restNonce' => wp_create_nonce('wp_rest'),
      'pageSlug' => TDW_ATLAS_ADMIN_PAGE_SLUG,
      'adminListUrl' => esc_url_raw(tdw_atlas_admin_list_url()),
      'selectedMapKey' => tdw_atlas_admin_requested_map_key(),
      'viewMode' => tdw_atlas_admin_requested_map_key() !== '' ? 'edit' : 'list',
      'pluginVersion' => TDW_ATLAS_PLUGIN_VERSION,
      'mapKeyPattern' => '^[a-z0-9_-]{1,64}$',
      'safePathPattern' => '^[A-Za-z0-9._/-]+\\.(json|svg)$',
      'datasetPathPattern' => '^data/dataset/[A-Za-z0-9._/-]+\\.(json|svg)$',
      'autosaveDebounceMs' => 800,
      'mismatchThreshold' => 10,
    )) . ';',
    'before'
  );
}
add_action('admin_enqueue_scripts', 'tdw_atlas_admin_enqueue_assets');
