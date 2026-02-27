# Database Model (v7)

Status: `active baseline`
Scope: runtime authority for grouping, whitelist, preprocess and dataset metadata.

## Runtime Authority

1. Runtime authority is WordPress DB.
2. `atlas.seed.json` and `data/world-regions.v1.json` are seed/template sources.
3. Runtime JS does not read DB directly; it consumes `/wp-json/tdw-atlas/v1/config`.

## Core DB Objects

### Option `tdw_atlas_settings`

1. `debug: bool`
2. `vendor: { leafletJs, leafletCss }`
3. `views: object`

### Option `tdw_atlas_system`

1. `seed_source_version`
2. `last_seeded_at`

### Table `{prefix}tdw_atlas_maps`

1. `id` (PK)
2. `map_key` (unique)
3. `label`
4. `dataset_key`
5. `geojson_path`
6. `view_key`
7. `adapter_key`
8. `sort_order`
9. `preprocess_enabled` (master switch for all preprocessor-managed behavior)
10. `region_layer_enabled`
11. `grouping_mode` (`set|geojson|off`)
12. `grouping_set_id`
13. `grouping_geojson_property`
14. `whitelist_enabled`
15. `whitelist_default_included`
16. `preprocess_config_json`
17. `focus_config_json`
18. `ui_config_json`
19. `created_at`
20. `updated_at`

### Table `{prefix}tdw_atlas_country_catalog`

1. `dataset_key`
2. `country_code`
3. `country_name`
4. `adm0_a3`
5. `region_un`
6. `subregion`
7. `created_at`
8. `updated_at`

PK: `(dataset_key, country_code)`

### Table `{prefix}tdw_atlas_dataset_features`

1. `dataset_key`
2. `feature_uid`
3. `country_code`
4. `part_id`
5. `part_index`
6. `area_rank`
7. `area_score`
8. `created_at`
9. `updated_at`

PK: `(dataset_key, feature_uid)`
Unique: `(dataset_key, part_id)`

### Table `{prefix}tdw_atlas_grouping_sets`

1. `id` (PK)
2. `dataset_key`
3. `set_key`
4. `label`
5. `source_type` (`system|custom|geojson`)
6. `is_locked`
7. `created_at`
8. `updated_at`

Unique: `(dataset_key, set_key)`

### Table `{prefix}tdw_atlas_grouping_members`

1. `set_id`
2. `country_code`
3. `region_key`

PK: `(set_id, country_code)`

### Table `{prefix}tdw_atlas_whitelist_entries` (scoped)

1. `dataset_key`
2. `scope_type` (`global|map`)
3. `scope_key` (`*` for global or map key)
4. `country_code`
5. `is_included`
6. `created_at`
7. `updated_at`

PK: `(dataset_key, scope_type, scope_key, country_code)`

Priority rule: `map override > global baseline > default`

### Table `{prefix}tdw_atlas_preprocess_part_rules`

1. `dataset_key`
2. `map_key`
3. `country_code`
4. `part_id`
5. `action` (`keep|drop|promote`)
6. `country_code_override`
7. `polygon_id_override`
8. `created_at`
9. `updated_at`

PK: `(dataset_key, map_key, country_code, part_id)`

## Seed Policy

1. Activation: install/upgrade schema then seed.
2. Init-if-missing: reseed when required seed data is absent.
3. Version change: deterministic reset + reseed (dev policy).
4. Corrupt runtime rows: fail-fast (REST returns error), no silent auto-repair.
5. Manual debug reset command (when WP-CLI is available): `wp tdw-atlas db_reset`.
6. Current dev seed flow intentionally does not use DB transaction wrappers.

## Admin GUI Follow-up (`#14`)

1. CRUD operations must use DB transactions:
   - `START TRANSACTION`
   - `COMMIT` on full success
   - `ROLLBACK` on any error
2. Applies to map CRUD, grouping/whitelist/part-rules bulk writes, and UI-driven reset/reseed.
3. Goal: no half-written DB state from admin write actions.

## Seed Sources

1. `atlas.seed.json`
2. `data/world-regions.v1.json` (generic template: `set + members`)
3. GeoJSON source file declared in each map (`geojson_path`) for country/part extraction.

## Runtime Payload Contract Notes

`/wp-json/tdw-atlas/v1/config` emits per-map:

1. `grouping`
2. `whitelist`
3. `preprocess`
4. `focus`
5. `ui.preview`

Boot forwards `grouping/whitelist/preprocess/regionLayer` as `mapMeta` and full map config (including `focus` + `ui.preview`) as `adapterConfig.map`.

`/wp-json/tdw-atlas/v1/preview` resolves placeholder preview payload per map/scope/key. This route is read-only and non-blocking for map rendering.
