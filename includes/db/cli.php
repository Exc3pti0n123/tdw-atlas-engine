<?php

if (!defined('ABSPATH')) exit;

if (!defined('WP_CLI') || !WP_CLI) {
  return;
}

/**
 * TDW Atlas WP-CLI commands.
 */
class TDW_Atlas_CLI_Command {
  /**
   * Reset Atlas DB and reseed from data/seed/atlas.runtime.seed.json + data/seed/atlas.map.seed.json.
   *
   * ## EXAMPLES
   *
   *     wp tdw-atlas db_reset
   */
  public function db_reset() {
    tdw_atlas_db_install_or_upgrade();
    tdw_atlas_reset_db_from_defaults();
    WP_CLI::success('TDW Atlas DB reset and reseed complete.');
  }
}

WP_CLI::add_command('tdw-atlas', 'TDW_Atlas_CLI_Command');
