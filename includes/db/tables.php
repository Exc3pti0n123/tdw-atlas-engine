<?php

if (!defined('ABSPATH')) exit;

function tdw_atlas_table_maps() {
  global $wpdb;
  return $wpdb->prefix . 'tdw_atlas_maps';
}

function tdw_atlas_table_country_catalog() {
  global $wpdb;
  return $wpdb->prefix . 'tdw_atlas_country_catalog';
}

function tdw_atlas_table_dataset_features() {
  global $wpdb;
  return $wpdb->prefix . 'tdw_atlas_dataset_features';
}

function tdw_atlas_table_grouping_sets() {
  global $wpdb;
  return $wpdb->prefix . 'tdw_atlas_grouping_sets';
}

function tdw_atlas_table_grouping_members() {
  global $wpdb;
  return $wpdb->prefix . 'tdw_atlas_grouping_members';
}

function tdw_atlas_table_whitelist_entries() {
  global $wpdb;
  return $wpdb->prefix . 'tdw_atlas_whitelist_entries';
}

function tdw_atlas_table_preprocess_part_rules() {
  global $wpdb;
  return $wpdb->prefix . 'tdw_atlas_preprocess_part_rules';
}

function tdw_atlas_seed_log($message, $context = array()) {
  $suffix = '';
  if (is_array($context) && $context) {
    $encoded = wp_json_encode($context);
    $suffix = is_string($encoded) ? ' ' . $encoded : '';
  }

  $line = '[TDW ATLAS SEED] ' . trim((string) $message) . $suffix;

  if (defined('WP_CLI') && WP_CLI && class_exists('WP_CLI')) {
    WP_CLI::log($line);
  }

  error_log($line);
}
