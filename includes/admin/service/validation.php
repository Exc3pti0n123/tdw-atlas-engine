<?php

if (!defined('ABSPATH')) exit;

function tdw_atlas_admin_make_error($code, $message, $status = 400) {
  return new WP_Error((string) $code, (string) $message, array('status' => (int) $status));
}

function tdw_atlas_admin_reject_unknown_keys($input, $allowed_keys, $context = 'payload') {
  $candidate = is_array($input) ? $input : array();
  $allowed = array_map('strval', is_array($allowed_keys) ? $allowed_keys : array());

  foreach (array_keys($candidate) as $key) {
    $name = (string) $key;
    if (!in_array($name, $allowed, true)) {
      return tdw_atlas_admin_make_error(
        'tdw_atlas_admin_unknown_field',
        'Unknown field "' . $context . '.' . $name . '".',
        400
      );
    }
  }

  return true;
}

function tdw_atlas_admin_decode_request_body($request) {
  if (!$request instanceof WP_REST_Request) {
    return tdw_atlas_admin_make_error('tdw_atlas_admin_request_invalid', 'Invalid REST request.', 400);
  }

  $params = $request->get_json_params();
  if (is_array($params)) {
    return $params;
  }

  $raw = trim((string) $request->get_body());
  if ($raw === '') {
    return array();
  }

  $decoded = json_decode($raw, true);
  if (!is_array($decoded)) {
    return tdw_atlas_admin_make_error('tdw_atlas_admin_payload_invalid_json', 'Request body must be valid JSON object.', 400);
  }

  return $decoded;
}

function tdw_atlas_admin_validate_map_payload($payload, $is_create = true, $forced_map_key = '') {
  $input = is_array($payload) ? $payload : array();
  $unknown_top_level = tdw_atlas_admin_reject_unknown_keys(
    $input,
    array(
      'mapKey',
      'label',
      'description',
      'datasetKey',
      'geojson',
      'adapter',
      'view',
      'sortOrder',
      'grouping',
      'whitelist',
      'preprocess',
      'regionLayer',
      'focus',
      'ui',
      'mapOptions',
      'style',
    ),
    'map'
  );
  if (is_wp_error($unknown_top_level)) {
    return $unknown_top_level;
  }

  $map_key = $is_create
    ? ($input['mapKey'] ?? '')
    : (string) $forced_map_key;
  $map_key = tdw_atlas_rest_validate_map_id($map_key, 'mapKey');
  if (is_wp_error($map_key)) {
    return tdw_atlas_admin_make_error($map_key->get_error_code(), $map_key->get_error_message(), 400);
  }

  $label = trim((string) ($input['label'] ?? ''));
  if ($label === '' || mb_strlen($label) > 32) {
    return tdw_atlas_admin_make_error('tdw_atlas_admin_label_invalid', 'Label is required (max 32 chars).', 400);
  }

  $description = trim((string) ($input['description'] ?? ''));
  if (mb_strlen($description) > 191) {
    return tdw_atlas_admin_make_error('tdw_atlas_admin_description_invalid', 'Description supports max 191 chars.', 400);
  }

  $dataset_key = sanitize_key((string) ($input['datasetKey'] ?? ''));
  if ($dataset_key === '' || preg_match('/^[a-z0-9_-]{1,64}$/', $dataset_key) !== 1) {
    return tdw_atlas_admin_make_error('tdw_atlas_admin_dataset_key_invalid', 'datasetKey must match [a-z0-9_-]{1,64}.', 400);
  }

  $geojson_path = tdw_atlas_validate_plugin_relative_path_or_error(
    $input['geojson'] ?? '',
    'geojson',
    array('json')
  );
  if (is_wp_error($geojson_path)) {
    return tdw_atlas_admin_make_error('tdw_atlas_admin_geojson_invalid', $geojson_path->get_error_message(), 400);
  }

  $adapter = tdw_atlas_normalize_adapter_key($input['adapter'] ?? 'leaflet', 'leaflet');
  if (preg_match('/^[a-z0-9_-]{1,64}$/', $adapter) !== 1) {
    return tdw_atlas_admin_make_error('tdw_atlas_admin_adapter_invalid', 'adapter must match [a-z0-9_-]{1,64}.', 400);
  }

  $view = trim((string) ($input['view'] ?? ''));
  if ($view !== '' && preg_match('/^[a-z0-9_-]{1,64}$/', $view) !== 1) {
    return tdw_atlas_admin_make_error('tdw_atlas_admin_view_invalid', 'view must match [a-z0-9_-]{1,64}.', 400);
  }

  $sort_order = (int) ($input['sortOrder'] ?? 0);

  $grouping = is_array($input['grouping'] ?? null) ? $input['grouping'] : array();
  $unknown_grouping = tdw_atlas_admin_reject_unknown_keys(
    $grouping,
    array('enabled', 'mode', 'setKey', 'geojsonProperty'),
    'map.grouping'
  );
  if (is_wp_error($unknown_grouping)) {
    return $unknown_grouping;
  }

  $grouping_enabled = tdw_atlas_normalize_bool($grouping['enabled'] ?? false, false);
  $grouping_mode = tdw_atlas_db_normalize_grouping_mode($grouping['mode'] ?? 'off', 'off');
  if (!$grouping_enabled) {
    $grouping_mode = 'off';
  }

  $grouping_set_key = sanitize_key((string) ($grouping['setKey'] ?? ''));
  $grouping_geojson_property = trim((string) ($grouping['geojsonProperty'] ?? ''));

  if ($grouping_mode === 'set' && $grouping_set_key === '') {
    return tdw_atlas_admin_make_error('tdw_atlas_admin_grouping_set_missing', 'grouping.setKey is required when grouping mode is "set".', 400);
  }

  if ($grouping_mode === 'geojson' && $grouping_geojson_property === '') {
    return tdw_atlas_admin_make_error('tdw_atlas_admin_grouping_property_missing', 'grouping.geojsonProperty is required when grouping mode is "geojson".', 400);
  }

  $whitelist = is_array($input['whitelist'] ?? null) ? $input['whitelist'] : array();
  $unknown_whitelist = tdw_atlas_admin_reject_unknown_keys(
    $whitelist,
    array('enabled', 'defaultIncluded'),
    'map.whitelist'
  );
  if (is_wp_error($unknown_whitelist)) {
    return $unknown_whitelist;
  }
  $whitelist_enabled = tdw_atlas_normalize_bool($whitelist['enabled'] ?? false, false);
  $whitelist_default_included = tdw_atlas_normalize_bool($whitelist['defaultIncluded'] ?? false, false);

  $preprocess = is_array($input['preprocess'] ?? null) ? $input['preprocess'] : array();
  $unknown_preprocess = tdw_atlas_admin_reject_unknown_keys(
    $preprocess,
    array('enabled', 'partRules', 'geometryQuality', 'multiPolygon'),
    'map.preprocess'
  );
  if (is_wp_error($unknown_preprocess)) {
    return $unknown_preprocess;
  }

  $preprocess_enabled = tdw_atlas_normalize_bool($preprocess['enabled'] ?? true, true);
  $part_rules = is_array($preprocess['partRules'] ?? null) ? $preprocess['partRules'] : array();
  unset($preprocess['enabled'], $preprocess['partRules']);

  if (!is_array($preprocess)) {
    return tdw_atlas_admin_make_error('tdw_atlas_admin_preprocess_invalid', 'preprocess must be an object.', 400);
  }

  if (!is_array($part_rules)) {
    return tdw_atlas_admin_make_error('tdw_atlas_admin_part_rules_invalid', 'preprocess.partRules must be an array.', 400);
  }

  $normalized_part_rules = array();
  foreach ($part_rules as $index => $rule) {
    if (!is_array($rule)) {
      return tdw_atlas_admin_make_error('tdw_atlas_admin_part_rule_invalid', 'Each part rule must be an object.', 400);
    }

    $unknown_part_rule = tdw_atlas_admin_reject_unknown_keys(
      $rule,
      array('countryCode', 'partId', 'action', 'countryCodeOverride', 'polygonIdOverride'),
      'map.preprocess.partRules[' . (int) $index . ']'
    );
    if (is_wp_error($unknown_part_rule)) {
      return $unknown_part_rule;
    }

    $country_code = tdw_atlas_db_normalize_country_code($rule['countryCode'] ?? '');
    $part_id = trim((string) ($rule['partId'] ?? ''));
    $action = strtolower(trim((string) ($rule['action'] ?? '')));

    if (!tdw_atlas_db_is_iso_a2($country_code)) {
      return tdw_atlas_admin_make_error('tdw_atlas_admin_part_rule_country_invalid', 'partRules[' . $index . '].countryCode must be ISO-A2.', 400);
    }

    if ($part_id === '') {
      return tdw_atlas_admin_make_error('tdw_atlas_admin_part_rule_part_id_invalid', 'partRules[' . $index . '].partId is required.', 400);
    }

    if (!in_array($action, array('keep', 'drop', 'promote'), true)) {
      return tdw_atlas_admin_make_error('tdw_atlas_admin_part_rule_action_invalid', 'partRules[' . $index . '].action must be keep, drop or promote.', 400);
    }

    $country_override = tdw_atlas_db_normalize_country_code($rule['countryCodeOverride'] ?? '');
    if (!tdw_atlas_db_is_iso_a2($country_override)) {
      $country_override = null;
    }

    $polygon_override = trim((string) ($rule['polygonIdOverride'] ?? ''));
    if ($polygon_override === '') {
      $polygon_override = null;
    }

    $normalized_part_rules[] = array(
      'countryCode' => $country_code,
      'partId' => $part_id,
      'action' => $action,
      'countryCodeOverride' => $country_override,
      'polygonIdOverride' => $polygon_override,
    );
  }

  $region_layer = is_array($input['regionLayer'] ?? null) ? $input['regionLayer'] : array();
  $unknown_region_layer = tdw_atlas_admin_reject_unknown_keys(
    $region_layer,
    array('enabled'),
    'map.regionLayer'
  );
  if (is_wp_error($unknown_region_layer)) {
    return $unknown_region_layer;
  }
  $region_layer_enabled = tdw_atlas_normalize_bool($region_layer['enabled'] ?? true, true);

  $focus = is_array($input['focus'] ?? null) ? $input['focus'] : array();
  $ui = is_array($input['ui'] ?? null) ? $input['ui'] : array();
  $map_options = is_array($input['mapOptions'] ?? null) ? $input['mapOptions'] : array();
  $style = is_array($input['style'] ?? null) ? $input['style'] : array();
  $normalized_ui = tdw_atlas_normalize_preview_config($ui, array());

  return array(
    'map_key' => $map_key,
    'label' => $label,
    'description' => $description,
    'dataset_key' => $dataset_key,
    'geojson_path' => $geojson_path,
    'view_key' => $view,
    'adapter_key' => $adapter,
    'sort_order' => $sort_order,
    'grouping_mode' => $grouping_mode,
    'grouping_set_key' => $grouping_set_key,
    'grouping_geojson_property' => $grouping_geojson_property,
    'whitelist_enabled' => $whitelist_enabled,
    'whitelist_default_included' => $whitelist_default_included,
    'preprocess_enabled' => $preprocess_enabled,
    'preprocess_config' => $preprocess,
    'part_rules' => $normalized_part_rules,
    'region_layer_enabled' => $region_layer_enabled,
    'focus_config' => $focus,
    'ui_config' => $normalized_ui,
    'map_options' => $map_options,
    'style' => $style,
  );
}

function tdw_atlas_admin_validate_map_create_payload($payload) {
  $input = is_array($payload) ? $payload : array();
  $unknown = tdw_atlas_admin_reject_unknown_keys(
    $input,
    array('label', 'mapKey', 'datasetPath'),
    'createMap'
  );
  if (is_wp_error($unknown)) {
    return $unknown;
  }

  $label = trim((string) ($input['label'] ?? ''));
  if ($label === '' || mb_strlen($label) > 32) {
    return tdw_atlas_admin_make_error(
      'tdw_atlas_admin_create_label_invalid',
      'label is required (max 32 chars).',
      400
    );
  }

  $map_key = tdw_atlas_rest_validate_map_id($input['mapKey'] ?? '', 'mapKey');
  if (is_wp_error($map_key)) {
    return tdw_atlas_admin_make_error(
      $map_key->get_error_code(),
      $map_key->get_error_message(),
      400
    );
  }
  if (mb_strlen((string) $map_key) > 8) {
    return tdw_atlas_admin_make_error(
      'tdw_atlas_admin_create_map_key_too_long',
      'mapKey supports max 8 chars for create flow.',
      400
    );
  }

  $dataset_path = tdw_atlas_validate_plugin_relative_path_or_error(
    $input['datasetPath'] ?? '',
    'datasetPath',
    array('json', 'svg')
  );
  if (is_wp_error($dataset_path)) {
    return tdw_atlas_admin_make_error(
      'tdw_atlas_admin_create_dataset_path_invalid',
      $dataset_path->get_error_message(),
      400
    );
  }

  if (strpos((string) $dataset_path, 'data/dataset/') !== 0) {
    return tdw_atlas_admin_make_error(
      'tdw_atlas_admin_create_dataset_path_scope_invalid',
      'datasetPath must point to data/dataset/*.(json|svg).',
      400
    );
  }

  return array(
    'label' => $label,
    'map_key' => (string) $map_key,
    'dataset_path' => (string) $dataset_path,
  );
}

function tdw_atlas_admin_validate_bulk_delete_payload($payload) {
  $input = is_array($payload) ? $payload : array();
  $unknown = tdw_atlas_admin_reject_unknown_keys(
    $input,
    array('mapKeys'),
    'bulkDelete'
  );
  if (is_wp_error($unknown)) {
    return $unknown;
  }

  $raw_keys = $input['mapKeys'] ?? null;
  if (!is_array($raw_keys) || !$raw_keys) {
    return tdw_atlas_admin_make_error(
      'tdw_atlas_admin_bulk_delete_empty',
      'mapKeys must contain at least one map key.',
      400
    );
  }

  if (count($raw_keys) > 100) {
    return tdw_atlas_admin_make_error(
      'tdw_atlas_admin_bulk_delete_too_many',
      'mapKeys supports at most 100 keys per request.',
      400
    );
  }

  $map_keys = array();
  foreach ($raw_keys as $index => $raw_key) {
    $validated = tdw_atlas_rest_validate_map_id($raw_key, 'mapKeys[' . (int) $index . ']');
    if (is_wp_error($validated)) {
      return tdw_atlas_admin_make_error(
        $validated->get_error_code(),
        $validated->get_error_message(),
        400
      );
    }
    $map_keys[$validated] = true;
  }

  return array_keys($map_keys);
}

function tdw_atlas_admin_validate_map_countries_payload($payload) {
  $input = is_array($payload) ? $payload : array();
  $unknown = tdw_atlas_admin_reject_unknown_keys(
    $input,
    array('updates'),
    'countries'
  );
  if (is_wp_error($unknown)) {
    return $unknown;
  }

  $updates = $input['updates'] ?? null;
  if (!is_array($updates) || !$updates) {
    return tdw_atlas_admin_make_error(
      'tdw_atlas_admin_countries_updates_empty',
      'updates must contain at least one country row.',
      400
    );
  }

  if (count($updates) > 500) {
    return tdw_atlas_admin_make_error(
      'tdw_atlas_admin_countries_updates_too_many',
      'updates supports at most 500 rows per request.',
      400
    );
  }

  $normalized = array();
  foreach ($updates as $index => $row) {
    if (!is_array($row)) {
      return tdw_atlas_admin_make_error(
        'tdw_atlas_admin_countries_update_invalid',
        'Each updates row must be an object.',
        400
      );
    }

    $unknown_row = tdw_atlas_admin_reject_unknown_keys(
      $row,
      array('countryCode', 'regionKey', 'whitelist', 'confirmed'),
      'countries.updates[' . (int) $index . ']'
    );
    if (is_wp_error($unknown_row)) {
      return $unknown_row;
    }

    $country_code = tdw_atlas_db_normalize_country_code($row['countryCode'] ?? '');
    if (!tdw_atlas_db_is_iso_a2($country_code)) {
      return tdw_atlas_admin_make_error(
        'tdw_atlas_admin_countries_country_code_invalid',
        'countryCode must be ISO-A2.',
        400
      );
    }

    $region_key = sanitize_key((string) ($row['regionKey'] ?? ''));
    if ($region_key === '') {
      $region_key = 'unassigned';
    }

    $normalized[$country_code] = array(
      'countryCode' => $country_code,
      'regionKey' => $region_key,
      'whitelist' => tdw_atlas_normalize_bool($row['whitelist'] ?? false, false),
      'confirmed' => tdw_atlas_normalize_bool($row['confirmed'] ?? false, false),
    );
  }

  return array_values($normalized);
}

function tdw_atlas_admin_validate_runtime_defaults_payload($payload) {
  $input = is_array($payload) ? $payload : array();
  $unknown_top_level = tdw_atlas_admin_reject_unknown_keys(
    $input,
    array('debug', 'vendor', 'views'),
    'runtime'
  );
  if (is_wp_error($unknown_top_level)) {
    return $unknown_top_level;
  }

  $seed_defaults = tdw_atlas_load_runtime_seed_defaults();
  if (!is_array($seed_defaults)) {
    return tdw_atlas_admin_make_error('tdw_atlas_runtime_seed_missing', 'data/seed/atlas.runtime.seed.json is missing or invalid.', 500);
  }

  $debug = tdw_atlas_normalize_bool($input['debug'] ?? false, false);
  $views = is_array($input['views'] ?? null) ? $input['views'] : array();

  $vendor_candidate = is_array($input['vendor'] ?? null) ? $input['vendor'] : array();
  $vendor = tdw_atlas_normalize_vendor($vendor_candidate, $seed_defaults['vendor'] ?? array());
  if (is_wp_error($vendor)) {
    return tdw_atlas_admin_make_error($vendor->get_error_code(), $vendor->get_error_message(), 400);
  }

  return array(
    'debug' => $debug,
    'vendor' => $vendor,
    'views' => $views,
  );
}
