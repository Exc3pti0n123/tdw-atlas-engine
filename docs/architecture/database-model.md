# Database Model (v10)

Status: `active baseline`
Scope: runtime authority for maps, grouping, whitelist, preprocess, dataset metadata, and country review workflow.

## Runtime Authority

1. Runtime authority is WordPress DB.
2. Seed sources are `data/seed/atlas.runtime.seed.json` and `data/seed/atlas.map.seed.json`.
3. Dataset discovery source is `data/dataset/*` (`.json`, `.svg`).
4. Runtime JS does not read DB directly; it consumes `/wp-json/tdw-atlas/v1/config`.

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
4. `description` (nullable, ungeseeded)
5. `dataset_key`
6. `geojson_path`
7. `view_key`
8. `adapter_key`
9. `sort_order`
10. `preprocess_enabled`
11. `region_layer_enabled`
12. `grouping_mode` (`set|geojson|off`)
13. `grouping_set_id`
14. `grouping_geojson_property`
15. `whitelist_enabled`
16. `whitelist_default_included`
17. `preprocess_config_json`
18. `focus_config_json`
19. `ui_config_json`
20. `map_options_json`
21. `style_json`
22. `created_at`
23. `updated_at`

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
5. `source_type` (`system|custom|geojson|map`)
6. `is_locked`
7. `created_at`
8. `updated_at`

Unique: `(dataset_key, set_key)`

### Table `{prefix}tdw_atlas_grouping_members`

1. `set_id`
2. `country_code`
3. `region_key`

PK: `(set_id, country_code)`

### Table `{prefix}tdw_atlas_whitelist_entries`

1. `dataset_key`
2. `scope_type` (`global|map`)
3. `scope_key` (`*` for global or map key)
4. `country_code`
5. `is_included`
6. `created_at`
7. `updated_at`

PK: `(dataset_key, scope_type, scope_key, country_code)`

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

### Table `{prefix}tdw_atlas_country_review`

1. `map_key`
2. `country_code`
3. `is_confirmed`
4. `updated_at`

PK: `(map_key, country_code)`

## Seed and Create Policy

1. Activation: install/upgrade schema, then reset+seed from `runtime.seed` + `map.seed`.
2. Reset/reseed does not create default map rows (`maps: {}` remains valid).
3. Create flow joins dataset countries against `countryProfile.members` from `atlas.map.seed`.
4. Match order: ISO2 primary, ISO3 fallback.
5. Missing profile mappings:
   - `>=10`: create fails (`400`)
   - `<=9`: create succeeds with `region=unassigned`, `whitelist=false`, `confirmed=false`
6. Seed countries not present in selected dataset are ignored for that map and logged once.

## Admin Write Surface (`#14`, hard-cut)

1. `GET /admin/bootstrap`
2. `GET /admin/datasets`
3. `GET /admin/maps`
4. `GET /admin/maps/{map_key}`
5. `POST /admin/maps/create`
6. `PUT /admin/maps/{map_key}/general`
7. `GET /admin/maps/{map_key}/countries`
8. `PUT /admin/maps/{map_key}/countries`
9. `POST /admin/maps/bulk-delete`
10. `GET /admin/defaults`
11. `PUT /admin/defaults/runtime`
12. `POST /admin/reset`

Rules:
1. Mutating routes require `manage_options` + REST nonce.
2. Payloads are strict-schema and fail-closed.
3. Multi-step writes are transaction-wrapped.

## Runtime Payload Contract Notes

`/wp-json/tdw-atlas/v1/config` emits per-map:

1. `grouping`
2. `whitelist`
3. `preprocess`
4. `focus`
5. `ui.preview`

Boot forwards `grouping/whitelist/preprocess/regionLayer` as `mapMeta` and full map config (including `focus` + `ui.preview`) as `adapterConfig.map`.

`/wp-json/tdw-atlas/v1/preview` remains read-only and non-blocking for rendering.
