<?php

if (!defined('ABSPATH')) exit;

function tdw_atlas_admin_get_page_hook_suffix() {
  return isset($GLOBALS['tdw_atlas_admin_page_hook_suffix'])
    ? (string) $GLOBALS['tdw_atlas_admin_page_hook_suffix']
    : '';
}

function tdw_atlas_admin_render_page() {
  if (!current_user_can(TDW_ATLAS_ADMIN_REQUIRED_CAP)) {
    return;
  }

  echo '<div class="wrap tdw-atlas-admin-wrap">';
  if (function_exists('tdw_core_render_admin_header')) {
    tdw_core_render_admin_header(array(
      'title' => 'Atlas',
      'version' => TDW_ATLAS_PLUGIN_VERSION,
      'srcUrl' => TDW_ATLAS_REPO_SRC_URL,
      'docsUrl' => TDW_ATLAS_REPO_DOCS_URL,
      'refreshMode' => 'soft',
    ));
  } else {
    echo '<h1>' . esc_html__('Atlas', 'tdw-atlas-engine') . '</h1>';
  }
  echo '<div id="tdw-atlas-admin-app" data-tdw-atlas-admin="1"></div>';
  echo '</div>';
}

function tdw_atlas_admin_register_submenu($parent_slug) {
  if (!is_admin()) {
    return;
  }

  $hook_suffix = add_submenu_page(
    (string) $parent_slug,
    __('TDW Atlas', 'tdw-atlas-engine'),
    __('Atlas', 'tdw-atlas-engine'),
    TDW_ATLAS_ADMIN_REQUIRED_CAP,
    TDW_ATLAS_ADMIN_PAGE_SLUG,
    'tdw_atlas_admin_render_page'
  );

  if (is_string($hook_suffix) && $hook_suffix !== '') {
    $GLOBALS['tdw_atlas_admin_page_hook_suffix'] = $hook_suffix;
  }
}
add_action('tdw_core_admin_menu', 'tdw_atlas_admin_register_submenu', 20, 1);
