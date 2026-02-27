# Config Lifecycle

## Inputs

1. `atlas.seed.json` (bootstrap defaults + seed directives)
2. Grouping template file(s), currently `data/world-regions.v1.json` (seed/import template)
3. DB settings option (`tdw_atlas_settings`)
4. DB domain tables (`tdw_atlas_maps`, `tdw_atlas_grouping_*`, `tdw_atlas_whitelist_entries`, `tdw_atlas_preprocess_part_rules`)

## Effective Config Assembly

1. Load JSON defaults for bootstrap fallback fields (`meta`, `vendor`, optional style/mapOptions defaults).
2. Read DB settings.
3. Read map rows (optionally filtered by requested `map_ids`).
4. Resolve per-map runtime payload blocks directly from DB:
   - `grouping`
   - `whitelist`
   - `preprocess`
5. Emit effective payload via REST route `/wp-json/tdw-atlas/v1/config`.

## Runtime Consumption

1. Boot fetches effective config once per page load.
2. Boot resolves map config by `data-map-id`.
3. Boot resolves adapter key and GeoJSON path from map entry.
4. Boot forwards DB-assembled `grouping/whitelist/preprocess` as `mapMeta` to Core/Adapter.

## Versioned Reseed Notes

- On activation or missing seed data, Atlas seeds DB from bootstrap files.
- On plugin version change, Atlas performs deterministic DB reset + reseed (dev policy).
- Corrupt/inconsistent runtime DB data is fail-fast and returned as REST error (no silent auto-repair).
