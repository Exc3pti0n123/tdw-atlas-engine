# Config Lifecycle

## Inputs

1. `data/seed/atlas.runtime.seed.json` (runtime defaults: `meta`, `debug`, `vendor`, `views`)
2. `data/seed/atlas.map.seed.json` (`mapDefaults` + `countryProfile.members`)
3. Dataset catalog `data/dataset/*` (`.json`, `.svg`)
4. Optional reference file `data/world-regions.v1.json` (maintenance input for country profile)
5. DB settings options (`tdw_atlas_settings`, `tdw_atlas_system`)
6. DB domain tables (`tdw_atlas_maps`, `tdw_atlas_grouping_*`, `tdw_atlas_whitelist_entries`, `tdw_atlas_preprocess_part_rules`, `tdw_atlas_country_review`)

## Effective Config Assembly

1. Load runtime defaults from `data/seed/atlas.runtime.seed.json`.
2. Load map defaults from `data/seed/atlas.map.seed.json`.
3. Read DB settings/options.
4. Read map rows (optionally filtered by requested `map_ids`).
5. Resolve per-map runtime payload blocks directly from DB:
   - `grouping`
   - `whitelist`
   - `preprocess`
6. Apply map-seed fallback for optional map fields when DB values are missing.
7. Emit effective payload via REST route `/wp-json/tdw-atlas/v1/config`.

## Admin Create Flow

1. Admin lists datasets from `data/dataset/*` (`GET /admin/datasets`).
2. User confirms `Map title + map id + dataset` in New modal.
3. Server loads `atlas.map.seed` + selected dataset, joins countries against `countryProfile`.
4. Missing profile mappings policy:
   - `>=10`: create fails (`400`).
   - `<=9`: create succeeds with `region=unassigned`, `whitelist=false`, `confirmed=false`.
5. Server creates map + map-scoped grouping set + whitelist + review rows transactionally.
6. User is redirected to edit page `?id=<map_key>`.

## Admin Edit Flow (`?id=<map_key>`)

1. Tab `General` loads map-level settings and autosaves via `PUT /admin/maps/{map_key}/general`.
2. Tab `Countries` loads country rows via `GET /admin/maps/{map_key}/countries`.
3. Country updates autosave in debounced bulk via `PUT /admin/maps/{map_key}/countries`.
4. Mismatch is open when `region=unassigned` and `confirmed=false`.
5. Mismatch panel severity:
   - `yellow`: `1-9` open mismatches
   - `red`: `>=10` open mismatches (informational in edit mode; create is already blocked at threshold)

## Runtime Consumption

1. Boot fetches effective config once per page load.
2. Boot resolves map config by `data-map-id`.
3. Boot resolves adapter key and GeoJSON path from map entry.
4. Boot forwards DB-assembled `grouping/whitelist/preprocess` as `mapMeta` to Core/Adapter.

## Versioned Reseed Notes

- On activation or missing seed data, Atlas seeds DB from bootstrap files.
- On plugin version change, Atlas performs deterministic DB reset + reseed (dev policy).
- Reset/reseed does not create map rows; empty maps are an explicit valid state.
- Corrupt/inconsistent runtime DB data is fail-fast and returned as REST error (no silent auto-repair).
