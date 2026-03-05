<?php

if (!defined('ABSPATH')) exit;

function tdw_atlas_admin_repo_decode_json_object($raw_json, $field, $map_key = '', $fallback = array()) {
  $raw = trim((string) $raw_json);
  if ($raw === '') {
    return is_array($fallback) ? $fallback : array();
  }

  $decoded = json_decode($raw, true);
  if (!is_array($decoded)) {
    $suffix = $map_key !== '' ? (' for map "' . $map_key . '"') : '';
    return new WP_Error(
      'tdw_atlas_admin_json_decode_failed',
      'Invalid ' . $field . $suffix . '.',
      array('status' => 500)
    );
  }

  return $decoded;
}

function tdw_atlas_admin_repo_map_row_format($column) {
  $map = array(
    'map_key' => '%s',
    'label' => '%s',
    'description' => '%s',
    'dataset_key' => '%s',
    'geojson_path' => '%s',
    'view_key' => '%s',
    'adapter_key' => '%s',
    'sort_order' => '%d',
    'preprocess_enabled' => '%d',
    'region_layer_enabled' => '%d',
    'grouping_mode' => '%s',
    'grouping_set_id' => '%d',
    'grouping_geojson_property' => '%s',
    'whitelist_enabled' => '%d',
    'whitelist_default_included' => '%d',
    'preprocess_config_json' => '%s',
    'focus_config_json' => '%s',
    'ui_config_json' => '%s',
    'map_options_json' => '%s',
    'style_json' => '%s',
    'created_at' => '%s',
    'updated_at' => '%s',
  );

  return isset($map[$column]) ? $map[$column] : '%s';
}

function tdw_atlas_admin_repo_map_row_formats($row_data) {
  $formats = array();
  foreach (array_keys((array) $row_data) as $column) {
    $formats[] = tdw_atlas_admin_repo_map_row_format((string) $column);
  }
  return $formats;
}

function tdw_atlas_admin_repo_abs_to_rel_path($abs_path) {
  $base = plugin_dir_path(TDW_ATLAS_PLUGIN_FILE);
  $absolute = (string) $abs_path;
  if ($absolute === '' || strpos($absolute, $base) !== 0) {
    return '';
  }

  return ltrim(substr($absolute, strlen($base)), '/');
}

function tdw_atlas_admin_repo_resolve_grouping_set_id($dataset_key, $grouping_mode, $grouping_set_key) {
  global $wpdb;

  if ($grouping_mode !== 'set') {
    return null;
  }

  $set_key = sanitize_key((string) $grouping_set_key);
  if ($set_key === '') {
    return new WP_Error(
      'tdw_atlas_admin_grouping_set_missing',
      'grouping.setKey is required when grouping mode is "set".',
      array('status' => 400)
    );
  }

  $table = tdw_atlas_table_grouping_sets();
  $set_id = (int) $wpdb->get_var(
    $wpdb->prepare(
      "SELECT id FROM {$table} WHERE dataset_key = %s AND set_key = %s LIMIT 1",
      $dataset_key,
      $set_key
    )
  );

  if (!empty($wpdb->last_error)) {
    return new WP_Error(
      'tdw_atlas_admin_grouping_set_read_failed',
      $wpdb->last_error,
      array('status' => 500)
    );
  }

  if ($set_id <= 0) {
    return new WP_Error(
      'tdw_atlas_admin_grouping_set_not_found',
      'Grouping set not found for dataset "' . $dataset_key . '" and setKey "' . $set_key . '".',
      array('status' => 400)
    );
  }

  return $set_id;
}

function tdw_atlas_admin_repo_ensure_dataset_seeded($dataset_key, $geojson_path) {
  global $wpdb;

  $table = tdw_atlas_table_country_catalog();
  $count = (int) $wpdb->get_var(
    $wpdb->prepare(
      "SELECT COUNT(*) FROM {$table} WHERE dataset_key = %s",
      $dataset_key
    )
  );

  if (!empty($wpdb->last_error)) {
    return new WP_Error(
      'tdw_atlas_admin_dataset_count_failed',
      $wpdb->last_error,
      array('status' => 500)
    );
  }

  if ($count > 0) {
    return true;
  }

  try {
    tdw_atlas_db_seed_dataset_from_geojson($dataset_key, $geojson_path);
  } catch (Throwable $err) {
    return new WP_Error(
      'tdw_atlas_admin_dataset_seed_failed',
      $err->getMessage(),
      array('status' => 400)
    );
  }

  return true;
}

function tdw_atlas_admin_repo_sync_map_whitelist_entries($dataset_key, $map_key, $enabled, $default_included) {
  global $wpdb;

  $whitelist_table = tdw_atlas_table_whitelist_entries();
  $existing_count = (int) $wpdb->get_var(
    $wpdb->prepare(
      "SELECT COUNT(*) FROM {$whitelist_table} WHERE dataset_key = %s AND scope_type = 'map' AND scope_key = %s",
      $dataset_key,
      $map_key
    )
  );

  if (!empty($wpdb->last_error)) {
    return new WP_Error(
      'tdw_atlas_admin_whitelist_count_failed',
      $wpdb->last_error,
      array('status' => 500)
    );
  }

  // Preserve existing per-country user edits; seed defaults only for fresh map+dataset pairs.
  if ($existing_count > 0) {
    return true;
  }

  $wpdb->delete(
    $whitelist_table,
    array(
      'scope_type' => 'map',
      'scope_key' => $map_key,
    ),
    array('%s', '%s')
  );
  if (!empty($wpdb->last_error)) {
    return new WP_Error(
      'tdw_atlas_admin_whitelist_cleanup_failed',
      $wpdb->last_error,
      array('status' => 500)
    );
  }

  if (!$enabled) {
    return true;
  }

  $catalog_table = tdw_atlas_table_country_catalog();
  $countries = $wpdb->get_col(
    $wpdb->prepare(
      "SELECT country_code FROM {$catalog_table} WHERE dataset_key = %s ORDER BY country_code ASC",
      $dataset_key
    )
  );

  if (!empty($wpdb->last_error)) {
    return new WP_Error(
      'tdw_atlas_admin_whitelist_catalog_read_failed',
      $wpdb->last_error,
      array('status' => 500)
    );
  }

  if (!is_array($countries) || !$countries) {
    return new WP_Error(
      'tdw_atlas_admin_whitelist_catalog_empty',
      'Cannot enable whitelist: dataset catalog is empty for dataset "' . $dataset_key . '".',
      array('status' => 400)
    );
  }

  $now = current_time('mysql', true);
  foreach ($countries as $country_code) {
    $code = tdw_atlas_db_normalize_country_code($country_code);
    if (!tdw_atlas_db_is_iso_a2($code)) {
      continue;
    }

    $wpdb->insert(
      $whitelist_table,
      array(
        'dataset_key' => $dataset_key,
        'scope_type' => 'map',
        'scope_key' => $map_key,
        'country_code' => $code,
        'is_included' => $default_included ? 1 : 0,
        'created_at' => $now,
        'updated_at' => $now,
      ),
      array('%s', '%s', '%s', '%s', '%d', '%s', '%s')
    );

    if (!empty($wpdb->last_error)) {
      return new WP_Error(
        'tdw_atlas_admin_whitelist_insert_failed',
        $wpdb->last_error,
        array('status' => 500)
      );
    }
  }

  return true;
}

function tdw_atlas_admin_repo_replace_part_rules($dataset_key, $map_key, $rules) {
  global $wpdb;

  $table = tdw_atlas_table_preprocess_part_rules();

  $wpdb->delete(
    $table,
    array(
      'dataset_key' => $dataset_key,
      'map_key' => $map_key,
    ),
    array('%s', '%s')
  );

  if (!empty($wpdb->last_error)) {
    return new WP_Error(
      'tdw_atlas_admin_part_rules_delete_failed',
      $wpdb->last_error,
      array('status' => 500)
    );
  }

  $rows = is_array($rules) ? $rules : array();
  if (!$rows) {
    return true;
  }

  $now = current_time('mysql', true);
  foreach ($rows as $rule) {
    if (!is_array($rule)) {
      continue;
    }

    $wpdb->insert(
      $table,
      array(
        'dataset_key' => $dataset_key,
        'map_key' => $map_key,
        'country_code' => tdw_atlas_db_normalize_country_code($rule['countryCode'] ?? ''),
        'part_id' => trim((string) ($rule['partId'] ?? '')),
        'action' => strtolower(trim((string) ($rule['action'] ?? ''))),
        'country_code_override' => $rule['countryCodeOverride'] ?? null,
        'polygon_id_override' => $rule['polygonIdOverride'] ?? null,
        'created_at' => $now,
        'updated_at' => $now,
      ),
      array('%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s')
    );

    if (!empty($wpdb->last_error)) {
      return new WP_Error(
        'tdw_atlas_admin_part_rules_insert_failed',
        $wpdb->last_error,
        array('status' => 500)
      );
    }
  }

  return true;
}

function tdw_atlas_admin_repo_list_maps() {
  global $wpdb;

  $table = tdw_atlas_table_maps();
  $rows = $wpdb->get_results(
    "SELECT id, map_key, label, description, dataset_key, geojson_path, adapter_key, view_key, grouping_mode, whitelist_enabled, sort_order, updated_at
     FROM {$table}
     ORDER BY sort_order ASC, id ASC",
    ARRAY_A
  );

  if (!empty($wpdb->last_error)) {
    return new WP_Error(
      'tdw_atlas_admin_maps_list_failed',
      $wpdb->last_error,
      array('status' => 500)
    );
  }

  $result = array();
  foreach ((array) $rows as $row) {
    $map_key = (string) ($row['map_key'] ?? '');
    if ($map_key === '') continue;

    $result[] = array(
      'id' => (int) ($row['id'] ?? 0),
      'mapKey' => $map_key,
      'label' => (string) ($row['label'] ?? ''),
      'description' => (string) ($row['description'] ?? ''),
      'datasetKey' => (string) ($row['dataset_key'] ?? ''),
      'geojson' => (string) ($row['geojson_path'] ?? ''),
      'adapter' => (string) ($row['adapter_key'] ?? ''),
      'view' => (string) ($row['view_key'] ?? ''),
      'groupingMode' => (string) ($row['grouping_mode'] ?? 'off'),
      'whitelistEnabled' => ((int) ($row['whitelist_enabled'] ?? 0)) === 1,
      'sortOrder' => (int) ($row['sort_order'] ?? 0),
      'updatedAt' => (string) ($row['updated_at'] ?? ''),
      'preview' => trim((string) ($row['dataset_key'] ?? '')) . ' • ' . trim((string) ($row['adapter_key'] ?? '')),
    );
  }

  return $result;
}

function tdw_atlas_admin_repo_get_map($map_key) {
  global $wpdb;

  $table = tdw_atlas_table_maps();
  $row = $wpdb->get_row(
    $wpdb->prepare(
      "SELECT id, map_key, label, description, dataset_key, geojson_path, view_key, adapter_key, sort_order,
              preprocess_enabled, region_layer_enabled, grouping_mode, grouping_set_id, grouping_geojson_property,
              whitelist_enabled, whitelist_default_included, preprocess_config_json, focus_config_json, ui_config_json,
              map_options_json, style_json, created_at, updated_at
       FROM {$table}
       WHERE map_key = %s
       LIMIT 1",
      $map_key
    ),
    ARRAY_A
  );

  if (!empty($wpdb->last_error)) {
    return new WP_Error(
      'tdw_atlas_admin_map_read_failed',
      $wpdb->last_error,
      array('status' => 500)
    );
  }

  if (!is_array($row) || !$row) {
    return new WP_Error(
      'tdw_atlas_admin_map_not_found',
      'Map not found.',
      array('status' => 404)
    );
  }

  $grouping_set_key = '';
  $grouping_set_id = (int) ($row['grouping_set_id'] ?? 0);
  $dataset_key = (string) ($row['dataset_key'] ?? '');
  $map_key_value = (string) ($row['map_key'] ?? '');
  $sets_table = tdw_atlas_table_grouping_sets();
  if ($grouping_set_id > 0) {
    $grouping_set_key = (string) $wpdb->get_var(
      $wpdb->prepare(
        "SELECT set_key FROM {$sets_table} WHERE id = %d LIMIT 1",
        $grouping_set_id
      )
    );

    if (!empty($wpdb->last_error)) {
      return new WP_Error(
        'tdw_atlas_admin_grouping_set_lookup_failed',
        $wpdb->last_error,
        array('status' => 500)
      );
    }
  }

  if ($grouping_set_key === '' && $dataset_key !== '' && $map_key_value !== '') {
    $candidate_set_key = tdw_atlas_admin_repo_map_grouping_set_key($map_key_value);
    $candidate_exists = (int) $wpdb->get_var(
      $wpdb->prepare(
        "SELECT id FROM {$sets_table} WHERE dataset_key = %s AND set_key = %s LIMIT 1",
        $dataset_key,
        $candidate_set_key
      )
    );

    if (!empty($wpdb->last_error)) {
      return new WP_Error(
        'tdw_atlas_admin_grouping_set_lookup_failed',
        $wpdb->last_error,
        array('status' => 500)
      );
    }

    if ($candidate_exists > 0) {
      $grouping_set_key = $candidate_set_key;
    }
  }

  $preprocess = tdw_atlas_admin_repo_decode_json_object($row['preprocess_config_json'] ?? '', 'preprocess_config_json', $map_key, array());
  if (is_wp_error($preprocess)) return $preprocess;
  $focus = tdw_atlas_admin_repo_decode_json_object($row['focus_config_json'] ?? '', 'focus_config_json', $map_key, array());
  if (is_wp_error($focus)) return $focus;
  $ui = tdw_atlas_admin_repo_decode_json_object($row['ui_config_json'] ?? '', 'ui_config_json', $map_key, array());
  if (is_wp_error($ui)) return $ui;
  $map_options = tdw_atlas_admin_repo_decode_json_object($row['map_options_json'] ?? '', 'map_options_json', $map_key, array());
  if (is_wp_error($map_options)) return $map_options;
  $style = tdw_atlas_admin_repo_decode_json_object($row['style_json'] ?? '', 'style_json', $map_key, array());
  if (is_wp_error($style)) return $style;

  $part_rules_rows = $wpdb->get_results(
    $wpdb->prepare(
      "SELECT country_code, part_id, action, country_code_override, polygon_id_override
       FROM " . tdw_atlas_table_preprocess_part_rules() . "
       WHERE dataset_key = %s AND map_key = %s
       ORDER BY country_code ASC, part_id ASC",
      (string) ($row['dataset_key'] ?? ''),
      $map_key
    ),
    ARRAY_A
  );

  if (!empty($wpdb->last_error)) {
    return new WP_Error(
      'tdw_atlas_admin_part_rules_read_failed',
      $wpdb->last_error,
      array('status' => 500)
    );
  }

  $part_rules = array();
  foreach ((array) $part_rules_rows as $rule) {
    $part_rules[] = array(
      'countryCode' => (string) ($rule['country_code'] ?? ''),
      'partId' => (string) ($rule['part_id'] ?? ''),
      'action' => (string) ($rule['action'] ?? ''),
      'countryCodeOverride' => (string) ($rule['country_code_override'] ?? ''),
      'polygonIdOverride' => (string) ($rule['polygon_id_override'] ?? ''),
    );
  }

  $preprocess['enabled'] = tdw_atlas_normalize_bool($row['preprocess_enabled'] ?? 1, true);
  $preprocess['partRules'] = $part_rules;

  return array(
    'id' => (int) ($row['id'] ?? 0),
    'mapKey' => (string) ($row['map_key'] ?? ''),
    'label' => (string) ($row['label'] ?? ''),
    'description' => (string) ($row['description'] ?? ''),
    'datasetKey' => (string) ($row['dataset_key'] ?? ''),
    'geojson' => (string) ($row['geojson_path'] ?? ''),
    'view' => (string) ($row['view_key'] ?? ''),
    'adapter' => (string) ($row['adapter_key'] ?? ''),
    'sortOrder' => (int) ($row['sort_order'] ?? 0),
    'grouping' => array(
      'enabled' => strtolower((string) ($row['grouping_mode'] ?? 'off')) !== 'off',
      'mode' => strtolower((string) ($row['grouping_mode'] ?? 'off')),
      'setKey' => $grouping_set_key,
      'geojsonProperty' => (string) ($row['grouping_geojson_property'] ?? ''),
    ),
    'whitelist' => array(
      'enabled' => tdw_atlas_normalize_bool($row['whitelist_enabled'] ?? 0, false),
      'defaultIncluded' => tdw_atlas_normalize_bool($row['whitelist_default_included'] ?? 0, false),
    ),
    'preprocess' => $preprocess,
    'regionLayer' => array(
      'enabled' => tdw_atlas_normalize_bool($row['region_layer_enabled'] ?? 1, true),
    ),
    'focus' => $focus,
    'ui' => tdw_atlas_normalize_preview_config($ui, array()),
    'mapOptions' => $map_options,
    'style' => $style,
    'createdAt' => (string) ($row['created_at'] ?? ''),
    'updatedAt' => (string) ($row['updated_at'] ?? ''),
  );
}

function tdw_atlas_admin_repo_upsert_map($normalized_map, $is_create = true) {
  global $wpdb;

  $map = is_array($normalized_map) ? $normalized_map : array();
  $map_key = (string) ($map['map_key'] ?? '');
  if ($map_key === '') {
    return new WP_Error('tdw_atlas_admin_map_key_missing', 'Missing map key.', array('status' => 400));
  }

  $dataset_key = (string) ($map['dataset_key'] ?? '');
  $geojson_path = (string) ($map['geojson_path'] ?? '');

  $dataset_seeded = tdw_atlas_admin_repo_ensure_dataset_seeded($dataset_key, $geojson_path);
  if (is_wp_error($dataset_seeded)) {
    return $dataset_seeded;
  }

  $grouping_set_id = tdw_atlas_admin_repo_resolve_grouping_set_id(
    $dataset_key,
    (string) ($map['grouping_mode'] ?? 'off'),
    (string) ($map['grouping_set_key'] ?? '')
  );
  if (is_wp_error($grouping_set_id)) {
    return $grouping_set_id;
  }

  $maps_table = tdw_atlas_table_maps();
  $now = current_time('mysql', true);

  $row_data = array(
    'label' => (string) ($map['label'] ?? ''),
    'description' => (string) ($map['description'] ?? ''),
    'dataset_key' => $dataset_key,
    'geojson_path' => $geojson_path,
    'view_key' => (string) ($map['view_key'] ?? ''),
    'adapter_key' => (string) ($map['adapter_key'] ?? 'leaflet'),
    'sort_order' => (int) ($map['sort_order'] ?? 0),
    'preprocess_enabled' => !empty($map['preprocess_enabled']) ? 1 : 0,
    'region_layer_enabled' => !empty($map['region_layer_enabled']) ? 1 : 0,
    'grouping_mode' => (string) ($map['grouping_mode'] ?? 'off'),
    'grouping_set_id' => is_int($grouping_set_id) ? $grouping_set_id : null,
    'grouping_geojson_property' => (string) ($map['grouping_geojson_property'] ?? ''),
    'whitelist_enabled' => !empty($map['whitelist_enabled']) ? 1 : 0,
    'whitelist_default_included' => !empty($map['whitelist_default_included']) ? 1 : 0,
    'preprocess_config_json' => wp_json_encode(is_array($map['preprocess_config'] ?? null) ? $map['preprocess_config'] : array()),
    'focus_config_json' => wp_json_encode(is_array($map['focus_config'] ?? null) ? $map['focus_config'] : array()),
    'ui_config_json' => wp_json_encode(is_array($map['ui_config'] ?? null) ? $map['ui_config'] : array()),
    'map_options_json' => wp_json_encode(is_array($map['map_options'] ?? null) ? $map['map_options'] : array()),
    'style_json' => wp_json_encode(is_array($map['style'] ?? null) ? $map['style'] : array()),
    'updated_at' => $now,
  );

  if ($is_create) {
    $existing = $wpdb->get_var(
      $wpdb->prepare(
        "SELECT id FROM {$maps_table} WHERE map_key = %s LIMIT 1",
        $map_key
      )
    );

    if (!empty($wpdb->last_error)) {
      return new WP_Error('tdw_atlas_admin_map_lookup_failed', $wpdb->last_error, array('status' => 500));
    }

    if ((int) $existing > 0) {
      return new WP_Error(
        'tdw_atlas_admin_map_exists',
        'Map key already exists.',
        array('status' => 400)
      );
    }

    $row_data['map_key'] = $map_key;
    $row_data['created_at'] = $now;

    $insert_formats = tdw_atlas_admin_repo_map_row_formats($row_data);
    $wpdb->insert(
      $maps_table,
      $row_data,
      $insert_formats
    );

    if (!empty($wpdb->last_error)) {
      return new WP_Error('tdw_atlas_admin_map_insert_failed', $wpdb->last_error, array('status' => 500));
    }
  } else {
    $update_formats = tdw_atlas_admin_repo_map_row_formats($row_data);
    $updated = $wpdb->update(
      $maps_table,
      $row_data,
      array('map_key' => $map_key),
      $update_formats,
      array('%s')
    );

    if ($updated === false || !empty($wpdb->last_error)) {
      return new WP_Error('tdw_atlas_admin_map_update_failed', $wpdb->last_error, array('status' => 500));
    }

    if ($updated === 0) {
      $exists = $wpdb->get_var(
        $wpdb->prepare(
          "SELECT id FROM {$maps_table} WHERE map_key = %s LIMIT 1",
          $map_key
        )
      );

      if (!empty($wpdb->last_error)) {
        return new WP_Error('tdw_atlas_admin_map_lookup_failed', $wpdb->last_error, array('status' => 500));
      }

      if ((int) $exists <= 0) {
        return new WP_Error('tdw_atlas_admin_map_not_found', 'Map not found.', array('status' => 404));
      }
    }
  }

  $whitelist_synced = tdw_atlas_admin_repo_sync_map_whitelist_entries(
    $dataset_key,
    $map_key,
    !empty($map['whitelist_enabled']),
    !empty($map['whitelist_default_included'])
  );
  if (is_wp_error($whitelist_synced)) {
    return $whitelist_synced;
  }

  $rules_synced = tdw_atlas_admin_repo_replace_part_rules(
    $dataset_key,
    $map_key,
    $map['part_rules'] ?? array()
  );
  if (is_wp_error($rules_synced)) {
    return $rules_synced;
  }

  return tdw_atlas_admin_repo_get_map($map_key);
}

function tdw_atlas_admin_repo_delete_map($map_key) {
  global $wpdb;

  $maps_table = tdw_atlas_table_maps();
  $existing = $wpdb->get_row(
    $wpdb->prepare(
      "SELECT map_key, dataset_key, grouping_set_id FROM {$maps_table} WHERE map_key = %s LIMIT 1",
      $map_key
    ),
    ARRAY_A
  );

  if (!empty($wpdb->last_error)) {
    return new WP_Error('tdw_atlas_admin_map_lookup_failed', $wpdb->last_error, array('status' => 500));
  }

  if (!is_array($existing) || !$existing) {
    return new WP_Error('tdw_atlas_admin_map_not_found', 'Map not found.', array('status' => 404));
  }

  $dataset_key = (string) ($existing['dataset_key'] ?? '');
  $grouping_set_id = (int) ($existing['grouping_set_id'] ?? 0);

  $wpdb->delete(
    tdw_atlas_table_whitelist_entries(),
    array(
      'dataset_key' => $dataset_key,
      'scope_type' => 'map',
      'scope_key' => $map_key,
    ),
    array('%s', '%s', '%s')
  );
  if (!empty($wpdb->last_error)) {
    return new WP_Error('tdw_atlas_admin_whitelist_delete_failed', $wpdb->last_error, array('status' => 500));
  }

  $wpdb->delete(
    tdw_atlas_table_preprocess_part_rules(),
    array(
      'dataset_key' => $dataset_key,
      'map_key' => $map_key,
    ),
    array('%s', '%s')
  );
  if (!empty($wpdb->last_error)) {
    return new WP_Error('tdw_atlas_admin_part_rules_delete_failed', $wpdb->last_error, array('status' => 500));
  }

  $wpdb->delete(
    tdw_atlas_table_country_review(),
    array('map_key' => $map_key),
    array('%s')
  );
  if (!empty($wpdb->last_error)) {
    return new WP_Error('tdw_atlas_admin_country_review_delete_failed', $wpdb->last_error, array('status' => 500));
  }

  if ($grouping_set_id > 0) {
    $wpdb->delete(
      tdw_atlas_table_grouping_members(),
      array('set_id' => $grouping_set_id),
      array('%d')
    );
    if (!empty($wpdb->last_error)) {
      return new WP_Error('tdw_atlas_admin_grouping_members_delete_failed', $wpdb->last_error, array('status' => 500));
    }

    $wpdb->delete(
      tdw_atlas_table_grouping_sets(),
      array('id' => $grouping_set_id),
      array('%d')
    );
    if (!empty($wpdb->last_error)) {
      return new WP_Error('tdw_atlas_admin_grouping_set_delete_failed', $wpdb->last_error, array('status' => 500));
    }
  }

  $deleted = $wpdb->delete(
    $maps_table,
    array('map_key' => $map_key),
    array('%s')
  );

  if ($deleted === false || !empty($wpdb->last_error)) {
    return new WP_Error('tdw_atlas_admin_map_delete_failed', $wpdb->last_error, array('status' => 500));
  }

  return array(
    'deleted' => true,
    'mapKey' => $map_key,
  );
}

function tdw_atlas_admin_repo_dataset_dir_rel() {
  return 'data/dataset';
}

function tdw_atlas_admin_repo_dataset_paths() {
  $base_abs = plugin_dir_path(TDW_ATLAS_PLUGIN_FILE) . tdw_atlas_admin_repo_dataset_dir_rel();
  if (!is_dir($base_abs)) {
    return array();
  }

  $entries = scandir($base_abs);
  if (!is_array($entries)) {
    return array();
  }

  $paths = array();
  foreach ($entries as $entry) {
    $name = (string) $entry;
    if ($name === '.' || $name === '..') {
      continue;
    }
    $abs_path = rtrim($base_abs, '/') . '/' . $name;
    if (!is_file($abs_path)) {
      continue;
    }
    $ext = strtolower((string) pathinfo($name, PATHINFO_EXTENSION));
    if (!in_array($ext, array('json', 'svg'), true)) {
      continue;
    }
    $paths[] = $abs_path;
  }

  sort($paths, SORT_STRING);
  return $paths;
}

function tdw_atlas_admin_repo_extract_geojson_countries($dataset_path) {
  $json = tdw_atlas_load_seed_json_file($dataset_path);
  if (!is_array($json)) {
    return new WP_Error(
      'tdw_atlas_admin_dataset_json_invalid',
      'Dataset JSON is missing or invalid: ' . $dataset_path,
      array('status' => 400)
    );
  }

  if (trim((string) ($json['type'] ?? '')) !== 'FeatureCollection') {
    return new WP_Error(
      'tdw_atlas_admin_dataset_type_invalid',
      'GeoJSON dataset must be a FeatureCollection: ' . $dataset_path,
      array('status' => 400)
    );
  }

  $features = is_array($json['features'] ?? null) ? $json['features'] : null;
  if (!is_array($features)) {
    return new WP_Error(
      'tdw_atlas_admin_dataset_features_missing',
      'GeoJSON dataset is missing features array: ' . $dataset_path,
      array('status' => 400)
    );
  }

  $countries = array();
  foreach ($features as $feature) {
    if (!is_array($feature)) {
      continue;
    }

    $props = is_array($feature['properties'] ?? null) ? $feature['properties'] : array();
    $country_code = tdw_atlas_db_resolve_country_code($props);
    if (!tdw_atlas_db_is_iso_a2($country_code)) {
      continue;
    }

    $iso3 = strtoupper(trim((string) ($props['ISO_A3_EH'] ?? $props['ISO_A3'] ?? '')));
    if (preg_match('/^[A-Z]{3}$/', $iso3) !== 1) {
      $iso3 = '';
    }

    if (!isset($countries[$country_code])) {
      $countries[$country_code] = array(
        'countryCode' => $country_code,
        'iso3' => $iso3,
        'countryName' => trim((string) ($props['NAME_EN'] ?? $props['NAME'] ?? $props['ADMIN'] ?? $country_code)),
      );
      continue;
    }

    if ($countries[$country_code]['iso3'] === '' && $iso3 !== '') {
      $countries[$country_code]['iso3'] = $iso3;
    }
  }

  if (!$countries) {
    return new WP_Error(
      'tdw_atlas_admin_dataset_countries_missing',
      'Dataset does not expose valid ISO-A2 countries: ' . $dataset_path,
      array('status' => 400)
    );
  }

  ksort($countries, SORT_STRING);
  return array_values($countries);
}

function tdw_atlas_admin_repo_read_svg_dataset_meta($dataset_path) {
  $abs = plugin_dir_path(TDW_ATLAS_PLUGIN_FILE) . $dataset_path;
  if (!file_exists($abs)) {
    return new WP_Error(
      'tdw_atlas_admin_dataset_svg_missing',
      'Dataset SVG is missing: ' . $dataset_path,
      array('status' => 400)
    );
  }

  $raw = file_get_contents($abs);
  if (!is_string($raw) || trim($raw) === '') {
    return new WP_Error(
      'tdw_atlas_admin_dataset_svg_invalid',
      'Dataset SVG is unreadable: ' . $dataset_path,
      array('status' => 400)
    );
  }

  if (stripos($raw, '<svg') === false) {
    return new WP_Error(
      'tdw_atlas_admin_dataset_svg_invalid',
      'Dataset SVG root element is missing: ' . $dataset_path,
      array('status' => 400)
    );
  }

  return array(
    'supported' => false,
    'countryCount' => 0,
    'isoMode' => 'none',
    'warnings' => array('SVG parsing is not yet supported for create flow.'),
  );
}

function tdw_atlas_admin_repo_dataset_key_from_path($dataset_path) {
  $base = pathinfo((string) $dataset_path, PATHINFO_FILENAME);
  $normalized = sanitize_key((string) $base);
  if ($normalized === '') {
    $normalized = 'dataset';
  }
  if (strlen($normalized) > 64) {
    $normalized = substr($normalized, 0, 64);
  }
  return $normalized;
}

function tdw_atlas_admin_repo_dataset_summary($dataset_path) {
  $validated = tdw_atlas_validate_plugin_relative_path_or_error($dataset_path, 'datasetPath', array('json', 'svg'));
  if (is_wp_error($validated)) {
    return $validated;
  }

  $safe_path = (string) $validated;
  if (strpos($safe_path, tdw_atlas_admin_repo_dataset_dir_rel() . '/') !== 0) {
    return new WP_Error(
      'tdw_atlas_admin_dataset_path_scope_invalid',
      'Dataset path must be inside data/dataset.',
      array('status' => 400)
    );
  }

  $base_name = pathinfo($safe_path, PATHINFO_FILENAME);
  $dataset_id = sanitize_key((string) $base_name);
  if ($dataset_id === '') {
    $dataset_id = 'dataset';
  }

  $title = ucwords(str_replace(array('-', '_', '.'), ' ', (string) $base_name));
  $ext = strtolower((string) pathinfo($safe_path, PATHINFO_EXTENSION));

  if ($ext === 'json') {
    $countries = tdw_atlas_admin_repo_extract_geojson_countries($safe_path);
    if (is_wp_error($countries)) {
      return $countries;
    }

    return array(
      'datasetId' => $dataset_id,
      'title' => $title,
      'datasetPath' => $safe_path,
      'type' => 'geojson',
      'supported' => true,
      'countryCount' => count($countries),
      'isoMode' => 'iso2+iso3',
      'warnings' => array(),
    );
  }

  if ($ext === 'svg') {
    $svg_meta = tdw_atlas_admin_repo_read_svg_dataset_meta($safe_path);
    if (is_wp_error($svg_meta)) {
      return $svg_meta;
    }

    return array(
      'datasetId' => $dataset_id,
      'title' => $title,
      'datasetPath' => $safe_path,
      'type' => 'svg',
      'supported' => false,
      'countryCount' => (int) ($svg_meta['countryCount'] ?? 0),
      'isoMode' => (string) ($svg_meta['isoMode'] ?? 'none'),
      'warnings' => is_array($svg_meta['warnings'] ?? null) ? $svg_meta['warnings'] : array(),
    );
  }

  return new WP_Error(
    'tdw_atlas_admin_dataset_ext_invalid',
    'Unsupported dataset extension for path: ' . $safe_path,
    array('status' => 400)
  );
}

function tdw_atlas_admin_repo_list_datasets() {
  $paths = tdw_atlas_admin_repo_dataset_paths();
  if (!$paths) {
    return new WP_Error(
      'tdw_atlas_admin_datasets_missing',
      'No datasets found in data/dataset.',
      array('status' => 500)
    );
  }

  $datasets = array();
  foreach ($paths as $abs_path) {
    $relative = tdw_atlas_admin_repo_abs_to_rel_path($abs_path);
    if ($relative === '') {
      continue;
    }
    $summary = tdw_atlas_admin_repo_dataset_summary($relative);
    if (is_wp_error($summary)) {
      return $summary;
    }
    $datasets[] = $summary;
  }

  if (!$datasets) {
    return new WP_Error(
      'tdw_atlas_admin_datasets_unavailable',
      'No valid datasets available in data/dataset.',
      array('status' => 500)
    );
  }

  return $datasets;
}

function tdw_atlas_admin_repo_country_profile_indexes($members) {
  $list = is_array($members) ? $members : array();
  $by_iso2 = array();
  $by_iso3 = array();

  foreach ($list as $member) {
    if (!is_array($member)) {
      continue;
    }
    $country_code = strtoupper(trim((string) ($member['countryCode'] ?? '')));
    if (!tdw_atlas_db_is_iso_a2($country_code)) {
      continue;
    }

    $item = array(
      'countryCode' => $country_code,
      'iso3' => strtoupper(trim((string) ($member['iso3'] ?? ''))),
      'regionKey' => sanitize_key((string) ($member['regionKey'] ?? '')),
      'whitelist' => tdw_atlas_normalize_bool($member['whitelist'] ?? false, false),
    );
    if ($item['regionKey'] === '') {
      $item['regionKey'] = 'unassigned';
    }
    $by_iso2[$country_code] = $item;

    if (preg_match('/^[A-Z]{3}$/', $item['iso3']) === 1) {
      $by_iso3[$item['iso3']] = $item;
    }
  }

  return array(
    'byIso2' => $by_iso2,
    'byIso3' => $by_iso3,
  );
}

function tdw_atlas_admin_repo_map_grouping_set_key($map_key) {
  $set_key = sanitize_key('map-' . (string) $map_key);
  if ($set_key === '') {
    $set_key = 'map';
  }
  if (strlen($set_key) > 64) {
    $set_key = substr($set_key, 0, 64);
  }
  return $set_key;
}

function tdw_atlas_admin_repo_upsert_map_grouping_set($dataset_key, $map_key, $map_label, $country_rows) {
  global $wpdb;

  $set_key = tdw_atlas_admin_repo_map_grouping_set_key($map_key);

  $sets_table = tdw_atlas_table_grouping_sets();
  $members_table = tdw_atlas_table_grouping_members();

  $set_id = (int) $wpdb->get_var(
    $wpdb->prepare(
      "SELECT id FROM {$sets_table} WHERE dataset_key = %s AND set_key = %s LIMIT 1",
      $dataset_key,
      $set_key
    )
  );
  if (!empty($wpdb->last_error)) {
    return new WP_Error('tdw_atlas_admin_grouping_set_lookup_failed', $wpdb->last_error, array('status' => 500));
  }

  $now = current_time('mysql', true);
  if ($set_id <= 0) {
    $wpdb->insert(
      $sets_table,
      array(
        'dataset_key' => $dataset_key,
        'set_key' => $set_key,
        'label' => trim((string) $map_label) !== '' ? trim((string) $map_label) : ('Map ' . $map_key),
        'source_type' => 'map',
        'is_locked' => 0,
        'created_at' => $now,
        'updated_at' => $now,
      ),
      array('%s', '%s', '%s', '%s', '%d', '%s', '%s')
    );
    if (!empty($wpdb->last_error)) {
      return new WP_Error('tdw_atlas_admin_grouping_set_insert_failed', $wpdb->last_error, array('status' => 500));
    }
    $set_id = (int) $wpdb->insert_id;
  } else {
    $wpdb->update(
      $sets_table,
      array(
        'label' => trim((string) $map_label) !== '' ? trim((string) $map_label) : ('Map ' . $map_key),
        'source_type' => 'map',
        'is_locked' => 0,
        'updated_at' => $now,
      ),
      array('id' => $set_id),
      array('%s', '%s', '%d', '%s'),
      array('%d')
    );
    if (!empty($wpdb->last_error)) {
      return new WP_Error('tdw_atlas_admin_grouping_set_update_failed', $wpdb->last_error, array('status' => 500));
    }
  }

  $wpdb->delete($members_table, array('set_id' => $set_id), array('%d'));
  if (!empty($wpdb->last_error)) {
    return new WP_Error('tdw_atlas_admin_grouping_members_delete_failed', $wpdb->last_error, array('status' => 500));
  }

  foreach ((array) $country_rows as $row) {
    $country_code = tdw_atlas_db_normalize_country_code($row['countryCode'] ?? '');
    if (!tdw_atlas_db_is_iso_a2($country_code)) {
      continue;
    }
    $region_key = sanitize_key((string) ($row['regionKey'] ?? ''));
    if ($region_key === '') {
      $region_key = 'unassigned';
    }
    $wpdb->insert(
      $members_table,
      array(
        'set_id' => $set_id,
        'country_code' => $country_code,
        'region_key' => $region_key,
      ),
      array('%d', '%s', '%s')
    );
    if (!empty($wpdb->last_error)) {
      return new WP_Error('tdw_atlas_admin_grouping_member_insert_failed', $wpdb->last_error, array('status' => 500));
    }
  }

  return $set_key;
}

function tdw_atlas_admin_repo_replace_map_whitelist_entries($dataset_key, $map_key, $country_rows) {
  global $wpdb;

  $table = tdw_atlas_table_whitelist_entries();
  $wpdb->delete(
    $table,
    array(
      'dataset_key' => $dataset_key,
      'scope_type' => 'map',
      'scope_key' => $map_key,
    ),
    array('%s', '%s', '%s')
  );
  if (!empty($wpdb->last_error)) {
    return new WP_Error('tdw_atlas_admin_whitelist_replace_delete_failed', $wpdb->last_error, array('status' => 500));
  }

  $now = current_time('mysql', true);
  foreach ((array) $country_rows as $row) {
    $country_code = tdw_atlas_db_normalize_country_code($row['countryCode'] ?? '');
    if (!tdw_atlas_db_is_iso_a2($country_code)) {
      continue;
    }

    $wpdb->insert(
      $table,
      array(
        'dataset_key' => $dataset_key,
        'scope_type' => 'map',
        'scope_key' => $map_key,
        'country_code' => $country_code,
        'is_included' => !empty($row['whitelist']) ? 1 : 0,
        'created_at' => $now,
        'updated_at' => $now,
      ),
      array('%s', '%s', '%s', '%s', '%d', '%s', '%s')
    );
    if (!empty($wpdb->last_error)) {
      return new WP_Error('tdw_atlas_admin_whitelist_replace_insert_failed', $wpdb->last_error, array('status' => 500));
    }
  }

  return true;
}

function tdw_atlas_admin_repo_replace_country_review_rows($map_key, $country_rows) {
  global $wpdb;

  $table = tdw_atlas_table_country_review();
  $wpdb->delete($table, array('map_key' => $map_key), array('%s'));
  if (!empty($wpdb->last_error)) {
    return new WP_Error('tdw_atlas_admin_country_review_delete_failed', $wpdb->last_error, array('status' => 500));
  }

  $now = current_time('mysql', true);
  foreach ((array) $country_rows as $row) {
    $country_code = tdw_atlas_db_normalize_country_code($row['countryCode'] ?? '');
    if (!tdw_atlas_db_is_iso_a2($country_code)) {
      continue;
    }

    $wpdb->insert(
      $table,
      array(
        'map_key' => $map_key,
        'country_code' => $country_code,
        'is_confirmed' => !empty($row['confirmed']) ? 1 : 0,
        'updated_at' => $now,
      ),
      array('%s', '%s', '%d', '%s')
    );
    if (!empty($wpdb->last_error)) {
      return new WP_Error('tdw_atlas_admin_country_review_insert_failed', $wpdb->last_error, array('status' => 500));
    }
  }

  return true;
}

function tdw_atlas_admin_repo_create_map_from_seed($normalized_payload) {
  $payload = is_array($normalized_payload) ? $normalized_payload : array();
  $map_key = (string) ($payload['map_key'] ?? '');
  $label = (string) ($payload['label'] ?? '');
  $dataset_path = (string) ($payload['dataset_path'] ?? '');

  if ($map_key === '' || $label === '' || $dataset_path === '') {
    return new WP_Error(
      'tdw_atlas_admin_create_payload_invalid',
      'Invalid create payload.',
      array('status' => 400)
    );
  }

  $dataset = tdw_atlas_admin_repo_dataset_summary($dataset_path);
  if (is_wp_error($dataset)) {
    return $dataset;
  }
  if (empty($dataset['supported'])) {
    return new WP_Error(
      'tdw_atlas_admin_dataset_not_supported',
      'Selected dataset is not supported for create flow yet.',
      array('status' => 400)
    );
  }

  $map_seed = tdw_atlas_load_map_seed_defaults();
  if (!is_array($map_seed)) {
    return new WP_Error(
      'tdw_atlas_admin_map_seed_missing',
      'data/seed/atlas.map.seed.json is missing or invalid.',
      array('status' => 500)
    );
  }

  $map_defaults = is_array($map_seed['mapDefaults'] ?? null) ? $map_seed['mapDefaults'] : array();
  $profile_members = is_array($map_seed['countryProfile']['members'] ?? null) ? $map_seed['countryProfile']['members'] : array();
  $profile_indexes = tdw_atlas_admin_repo_country_profile_indexes($profile_members);

  $countries = tdw_atlas_admin_repo_extract_geojson_countries($dataset_path);
  if (is_wp_error($countries)) {
    return $countries;
  }

  $country_rows = array();
  $mismatches = array();
  foreach ($countries as $country) {
    $country_code = (string) ($country['countryCode'] ?? '');
    $iso3 = strtoupper(trim((string) ($country['iso3'] ?? '')));

    $profile = $profile_indexes['byIso2'][$country_code] ?? null;
    if (!is_array($profile) && preg_match('/^[A-Z]{3}$/', $iso3) === 1) {
      $profile = $profile_indexes['byIso3'][$iso3] ?? null;
    }

    if (is_array($profile)) {
      $country_rows[] = array(
        'countryCode' => $country_code,
        'regionKey' => sanitize_key((string) ($profile['regionKey'] ?? '')) ?: 'unassigned',
        'whitelist' => tdw_atlas_normalize_bool($profile['whitelist'] ?? false, false),
        'confirmed' => true,
      );
      continue;
    }

    $mismatches[] = $country_code;
    $country_rows[] = array(
      'countryCode' => $country_code,
      'regionKey' => 'unassigned',
      'whitelist' => false,
      'confirmed' => false,
    );
  }

  if (count($mismatches) >= 10) {
    return new WP_Error(
      'tdw_atlas_admin_create_mismatch_threshold',
      'Create blocked: dataset has ' . count($mismatches) . ' countries without profile mapping (threshold: 10).',
      array('status' => 400)
    );
  }

  $dataset_key = tdw_atlas_admin_repo_dataset_key_from_path($dataset_path);
  $seeded = tdw_atlas_admin_repo_ensure_dataset_seeded($dataset_key, $dataset_path);
  if (is_wp_error($seeded)) {
    return $seeded;
  }

  $grouping_set_key = tdw_atlas_admin_repo_upsert_map_grouping_set($dataset_key, $map_key, $label, $country_rows);
  if (is_wp_error($grouping_set_key)) {
    return $grouping_set_key;
  }

  $grouping_defaults = is_array($map_defaults['grouping'] ?? null) ? $map_defaults['grouping'] : array();
  $grouping_mode = tdw_atlas_db_normalize_grouping_mode($grouping_defaults['mode'] ?? 'set', 'set');
  if (!tdw_atlas_normalize_bool($grouping_defaults['enabled'] ?? true, true)) {
    $grouping_mode = 'off';
  }

  $map_payload = array(
    'mapKey' => $map_key,
    'label' => $label,
    'description' => '',
    'datasetKey' => $dataset_key,
    'geojson' => $dataset_path,
    'adapter' => (string) ($map_defaults['adapter'] ?? 'leaflet'),
    'view' => (string) ($map_defaults['view'] ?? ''),
    'sortOrder' => 0,
    'grouping' => array(
      'enabled' => $grouping_mode !== 'off',
      'mode' => $grouping_mode,
      'setKey' => $grouping_mode === 'set' ? $grouping_set_key : '',
      'geojsonProperty' => (string) ($grouping_defaults['geojsonProperty'] ?? ''),
    ),
    'whitelist' => is_array($map_defaults['whitelist'] ?? null) ? $map_defaults['whitelist'] : array(),
    'preprocess' => is_array($map_defaults['preprocess'] ?? null) ? $map_defaults['preprocess'] : array(),
    'regionLayer' => is_array($map_defaults['regionLayer'] ?? null) ? $map_defaults['regionLayer'] : array(),
    'focus' => is_array($map_defaults['focus'] ?? null) ? $map_defaults['focus'] : array(),
    'ui' => is_array($map_defaults['ui'] ?? null) ? $map_defaults['ui'] : array(),
    'mapOptions' => is_array($map_defaults['mapOptions'] ?? null) ? $map_defaults['mapOptions'] : array(),
    'style' => is_array($map_defaults['style'] ?? null) ? $map_defaults['style'] : array(),
  );

  $normalized_map = tdw_atlas_admin_validate_map_payload($map_payload, true);
  if (is_wp_error($normalized_map)) {
    return $normalized_map;
  }

  $created_map = tdw_atlas_admin_repo_upsert_map($normalized_map, true);
  if (is_wp_error($created_map)) {
    return $created_map;
  }

  $whitelist_saved = tdw_atlas_admin_repo_replace_map_whitelist_entries($dataset_key, $map_key, $country_rows);
  if (is_wp_error($whitelist_saved)) {
    return $whitelist_saved;
  }

  $review_saved = tdw_atlas_admin_repo_replace_country_review_rows($map_key, $country_rows);
  if (is_wp_error($review_saved)) {
    return $review_saved;
  }

  $countries_payload = tdw_atlas_admin_repo_list_map_countries($map_key);
  if (is_wp_error($countries_payload)) {
    return $countries_payload;
  }

  if (count($profile_members) > count($countries)) {
    tdw_atlas_seed_log('seed contained extra countries not present in selected dataset', array(
      'seedCountries' => count($profile_members),
      'datasetCountries' => count($countries),
      'datasetPath' => $dataset_path,
    ));
  }

  return array(
    'created' => true,
    'mapKey' => $map_key,
    'map' => $created_map,
    'mismatchSummary' => $countries_payload['mismatchSummary'] ?? array(),
  );
}

function tdw_atlas_admin_repo_bulk_delete_maps($map_keys) {
  $keys = array_values((array) $map_keys);
  if (!$keys) {
    return new WP_Error(
      'tdw_atlas_admin_bulk_delete_empty',
      'No map keys were provided for bulk delete.',
      array('status' => 400)
    );
  }

  $deleted_keys = array();
  foreach ($keys as $map_key) {
    $result = tdw_atlas_admin_repo_delete_map((string) $map_key);
    if (is_wp_error($result)) {
      return $result;
    }
    $deleted_keys[] = (string) ($result['mapKey'] ?? (string) $map_key);
  }

  return array(
    'deleted' => true,
    'mapKeys' => $deleted_keys,
    'count' => count($deleted_keys),
  );
}

function tdw_atlas_admin_repo_get_runtime_settings() {
  $runtime_defaults = tdw_atlas_load_runtime_seed_defaults();
  if (!is_array($runtime_defaults)) {
    return new WP_Error(
      'tdw_atlas_runtime_seed_missing',
      'data/seed/atlas.runtime.seed.json is missing or invalid.',
      array('status' => 500)
    );
  }

  return tdw_atlas_get_db_settings_or_default($runtime_defaults);
}

function tdw_atlas_admin_repo_get_map_seed_defaults() {
  $seed_defaults = tdw_atlas_load_map_seed_defaults();
  if (!is_array($seed_defaults)) {
    return new WP_Error(
      'tdw_atlas_map_seed_missing',
      'data/seed/atlas.map.seed.json is missing or invalid.',
      array('status' => 500)
    );
  }

  return $seed_defaults;
}

function tdw_atlas_admin_repo_list_map_countries($map_key) {
  global $wpdb;

  $map = tdw_atlas_admin_repo_get_map($map_key);
  if (is_wp_error($map)) {
    return $map;
  }

  $dataset_key = (string) ($map['datasetKey'] ?? '');
  $grouping_set_key = (string) ($map['grouping']['setKey'] ?? '');
  if ($dataset_key === '') {
    return new WP_Error('tdw_atlas_admin_map_dataset_missing', 'Map datasetKey is missing.', array('status' => 500));
  }
  if ($grouping_set_key === '') {
    $grouping_set_key = tdw_atlas_admin_repo_map_grouping_set_key($map_key);
  }

  $sets_table = tdw_atlas_table_grouping_sets();
  $set_id = (int) $wpdb->get_var(
    $wpdb->prepare(
      "SELECT id FROM {$sets_table} WHERE dataset_key = %s AND set_key = %s LIMIT 1",
      $dataset_key,
      $grouping_set_key
    )
  );
  if (!empty($wpdb->last_error)) {
    return new WP_Error('tdw_atlas_admin_grouping_set_lookup_failed', $wpdb->last_error, array('status' => 500));
  }
  if ($set_id <= 0) {
    return new WP_Error('tdw_atlas_admin_grouping_set_not_found', 'Map grouping set not found.', array('status' => 500));
  }

  $catalog_table = tdw_atlas_table_country_catalog();
  $catalog_rows = $wpdb->get_results(
    $wpdb->prepare(
      "SELECT country_code, country_name FROM {$catalog_table} WHERE dataset_key = %s ORDER BY country_name ASC, country_code ASC",
      $dataset_key
    ),
    ARRAY_A
  );
  if (!empty($wpdb->last_error)) {
    return new WP_Error('tdw_atlas_admin_country_catalog_read_failed', $wpdb->last_error, array('status' => 500));
  }

  $members_table = tdw_atlas_table_grouping_members();
  $member_rows = $wpdb->get_results(
    $wpdb->prepare(
      "SELECT country_code, region_key FROM {$members_table} WHERE set_id = %d",
      $set_id
    ),
    ARRAY_A
  );
  if (!empty($wpdb->last_error)) {
    return new WP_Error('tdw_atlas_admin_grouping_members_read_failed', $wpdb->last_error, array('status' => 500));
  }

  $whitelist_table = tdw_atlas_table_whitelist_entries();
  $whitelist_rows = $wpdb->get_results(
    $wpdb->prepare(
      "SELECT country_code, is_included FROM {$whitelist_table} WHERE dataset_key = %s AND scope_type = 'map' AND scope_key = %s",
      $dataset_key,
      $map_key
    ),
    ARRAY_A
  );
  if (!empty($wpdb->last_error)) {
    return new WP_Error('tdw_atlas_admin_whitelist_map_read_failed', $wpdb->last_error, array('status' => 500));
  }

  $review_table = tdw_atlas_table_country_review();
  $review_rows = $wpdb->get_results(
    $wpdb->prepare(
      "SELECT country_code, is_confirmed FROM {$review_table} WHERE map_key = %s",
      $map_key
    ),
    ARRAY_A
  );
  if (!empty($wpdb->last_error)) {
    return new WP_Error('tdw_atlas_admin_country_review_read_failed', $wpdb->last_error, array('status' => 500));
  }

  $region_by_country = array();
  foreach ((array) $member_rows as $row) {
    $country_code = tdw_atlas_db_normalize_country_code($row['country_code'] ?? '');
    if (!tdw_atlas_db_is_iso_a2($country_code)) {
      continue;
    }
    $region = sanitize_key((string) ($row['region_key'] ?? ''));
    $region_by_country[$country_code] = $region !== '' ? $region : 'unassigned';
  }

  $whitelist_by_country = array();
  foreach ((array) $whitelist_rows as $row) {
    $country_code = tdw_atlas_db_normalize_country_code($row['country_code'] ?? '');
    if (!tdw_atlas_db_is_iso_a2($country_code)) {
      continue;
    }
    $whitelist_by_country[$country_code] = ((int) ($row['is_included'] ?? 0)) === 1;
  }

  if (!empty($map['whitelist']['enabled']) && !$whitelist_by_country && is_array($catalog_rows) && count($catalog_rows) > 0) {
    tdw_atlas_seed_log('map whitelist entries missing while whitelist is enabled', array(
      'mapKey' => $map_key,
      'datasetKey' => $dataset_key,
      'catalogCountries' => count($catalog_rows),
    ));
  }

  $confirmed_by_country = array();
  foreach ((array) $review_rows as $row) {
    $country_code = tdw_atlas_db_normalize_country_code($row['country_code'] ?? '');
    if (!tdw_atlas_db_is_iso_a2($country_code)) {
      continue;
    }
    $confirmed_by_country[$country_code] = ((int) ($row['is_confirmed'] ?? 0)) === 1;
  }

  $countries = array();
  $open_mismatches = array();
  foreach ((array) $catalog_rows as $row) {
    $country_code = tdw_atlas_db_normalize_country_code($row['country_code'] ?? '');
    if (!tdw_atlas_db_is_iso_a2($country_code)) {
      continue;
    }
    $country_name = trim((string) ($row['country_name'] ?? $country_code));
    $region_key = $region_by_country[$country_code] ?? 'unassigned';
    $whitelist = $whitelist_by_country[$country_code] ?? false;
    $confirmed = array_key_exists($country_code, $confirmed_by_country)
      ? $confirmed_by_country[$country_code]
      : ($region_key !== 'unassigned');
    $status = 'ok';
    if ($region_key === 'unassigned') {
      $status = $confirmed ? 'confirmed' : 'mismatch';
      if (!$confirmed) {
        $open_mismatches[] = $country_code;
      }
    }

    $countries[] = array(
      'countryCode' => $country_code,
      'countryName' => $country_name,
      'regionKey' => $region_key,
      'whitelist' => $whitelist,
      'confirmed' => $confirmed,
      'status' => $status,
    );
  }

  usort($countries, static function ($a, $b) {
    $an = strtolower(trim((string) ($a['countryName'] ?? '')));
    $bn = strtolower(trim((string) ($b['countryName'] ?? '')));
    if ($an === $bn) {
      return strcmp((string) ($a['countryCode'] ?? ''), (string) ($b['countryCode'] ?? ''));
    }
    return strcmp($an, $bn);
  });

  $open_count = count($open_mismatches);
  $severity = 'none';
  if ($open_count >= 10) {
    $severity = 'red';
  } elseif ($open_count > 0) {
    $severity = 'yellow';
  }

  return array(
    'mapKey' => $map_key,
    'datasetKey' => $dataset_key,
    'countries' => $countries,
    'mismatchSummary' => array(
      'openCount' => $open_count,
      'severity' => $severity,
      'threshold' => 10,
      'openCountryCodes' => $open_mismatches,
    ),
  );
}

function tdw_atlas_admin_repo_update_map_countries($map_key, $updates) {
  global $wpdb;

  $payload = tdw_atlas_admin_repo_list_map_countries($map_key);
  if (is_wp_error($payload)) {
    return $payload;
  }

  $dataset_key = (string) ($payload['datasetKey'] ?? '');
  if ($dataset_key === '') {
    return new WP_Error('tdw_atlas_admin_map_dataset_missing', 'Map datasetKey is missing.', array('status' => 500));
  }

  $map = tdw_atlas_admin_repo_get_map($map_key);
  if (is_wp_error($map)) {
    return $map;
  }
  $grouping_set_key = (string) ($map['grouping']['setKey'] ?? '');
  if ($grouping_set_key === '') {
    $grouping_set_key = tdw_atlas_admin_repo_map_grouping_set_key($map_key);
  }

  $sets_table = tdw_atlas_table_grouping_sets();
  $set_id = (int) $wpdb->get_var(
    $wpdb->prepare(
      "SELECT id FROM {$sets_table} WHERE dataset_key = %s AND set_key = %s LIMIT 1",
      $dataset_key,
      $grouping_set_key
    )
  );
  if (!empty($wpdb->last_error)) {
    return new WP_Error('tdw_atlas_admin_grouping_set_lookup_failed', $wpdb->last_error, array('status' => 500));
  }
  if ($set_id <= 0) {
    return new WP_Error('tdw_atlas_admin_grouping_set_not_found', 'Map grouping set not found.', array('status' => 500));
  }

  $catalog_table = tdw_atlas_table_country_catalog();
  $catalog_codes = $wpdb->get_col(
    $wpdb->prepare(
      "SELECT country_code FROM {$catalog_table} WHERE dataset_key = %s",
      $dataset_key
    )
  );
  if (!empty($wpdb->last_error)) {
    return new WP_Error('tdw_atlas_admin_country_catalog_read_failed', $wpdb->last_error, array('status' => 500));
  }

  $valid_codes = array();
  foreach ((array) $catalog_codes as $code) {
    $country_code = tdw_atlas_db_normalize_country_code($code);
    if (tdw_atlas_db_is_iso_a2($country_code)) {
      $valid_codes[$country_code] = true;
    }
  }

  $members_table = tdw_atlas_table_grouping_members();
  $whitelist_table = tdw_atlas_table_whitelist_entries();
  $review_table = tdw_atlas_table_country_review();
  $now = current_time('mysql', true);

  foreach ((array) $updates as $row) {
    $country_code = tdw_atlas_db_normalize_country_code($row['countryCode'] ?? '');
    if (!isset($valid_codes[$country_code])) {
      return new WP_Error(
        'tdw_atlas_admin_country_code_not_in_dataset',
        'countryCode "' . $country_code . '" is not part of this dataset.',
        array('status' => 400)
      );
    }

    $region_key = sanitize_key((string) ($row['regionKey'] ?? ''));
    if ($region_key === '') {
      $region_key = 'unassigned';
    }
    $whitelist = !empty($row['whitelist']) ? 1 : 0;
    $confirmed = !empty($row['confirmed']) ? 1 : 0;

    $wpdb->replace(
      $members_table,
      array(
        'set_id' => $set_id,
        'country_code' => $country_code,
        'region_key' => $region_key,
      ),
      array('%d', '%s', '%s')
    );
    if (!empty($wpdb->last_error)) {
      return new WP_Error('tdw_atlas_admin_grouping_member_replace_failed', $wpdb->last_error, array('status' => 500));
    }

    $wpdb->replace(
      $whitelist_table,
      array(
        'dataset_key' => $dataset_key,
        'scope_type' => 'map',
        'scope_key' => $map_key,
        'country_code' => $country_code,
        'is_included' => $whitelist,
        'created_at' => $now,
        'updated_at' => $now,
      ),
      array('%s', '%s', '%s', '%s', '%d', '%s', '%s')
    );
    if (!empty($wpdb->last_error)) {
      return new WP_Error('tdw_atlas_admin_whitelist_replace_failed', $wpdb->last_error, array('status' => 500));
    }

    $wpdb->replace(
      $review_table,
      array(
        'map_key' => $map_key,
        'country_code' => $country_code,
        'is_confirmed' => $confirmed,
        'updated_at' => $now,
      ),
      array('%s', '%s', '%d', '%s')
    );
    if (!empty($wpdb->last_error)) {
      return new WP_Error('tdw_atlas_admin_country_review_replace_failed', $wpdb->last_error, array('status' => 500));
    }
  }

  return tdw_atlas_admin_repo_list_map_countries($map_key);
}
