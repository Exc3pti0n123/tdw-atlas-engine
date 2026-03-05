<?php

if (!defined('ABSPATH')) exit;

function tdw_atlas_admin_with_transaction($callback) {
  global $wpdb;

  if (!is_callable($callback)) {
    return new WP_Error(
      'tdw_atlas_admin_transaction_callback_invalid',
      'Transaction callback is not callable.',
      array('status' => 500)
    );
  }

  $wpdb->query('START TRANSACTION');
  if (!empty($wpdb->last_error)) {
    return new WP_Error(
      'tdw_atlas_admin_transaction_start_failed',
      'Failed to start DB transaction: ' . $wpdb->last_error,
      array('status' => 500)
    );
  }

  try {
    $result = call_user_func($callback);

    if (is_wp_error($result)) {
      $wpdb->query('ROLLBACK');
      return $result;
    }

    if (!empty($wpdb->last_error)) {
      $message = $wpdb->last_error;
      $wpdb->query('ROLLBACK');
      return new WP_Error(
        'tdw_atlas_admin_transaction_query_failed',
        'Database query failed: ' . $message,
        array('status' => 500)
      );
    }

    $wpdb->query('COMMIT');
    if (!empty($wpdb->last_error)) {
      $message = $wpdb->last_error;
      $wpdb->query('ROLLBACK');
      return new WP_Error(
        'tdw_atlas_admin_transaction_commit_failed',
        'Failed to commit DB transaction: ' . $message,
        array('status' => 500)
      );
    }

    return $result;
  } catch (Throwable $err) {
    $wpdb->query('ROLLBACK');
    return new WP_Error(
      'tdw_atlas_admin_transaction_exception',
      $err->getMessage(),
      array('status' => 500)
    );
  }
}
