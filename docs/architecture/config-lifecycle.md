# Config Lifecycle

## Inputs

1. `atlas.config.json` (bootstrap defaults)
2. DB settings option (`tdw_atlas_settings`)
3. DB maps table (`{prefix}tdw_atlas_maps`)

## Effective Config Assembly

1. Load JSON defaults.
2. Read DB settings and normalize with defaults.
3. Read active DB map rows and normalize with defaults.
4. Emit effective payload via REST route `/wp-json/tdw-atlas/v1/config`.

## Runtime Consumption

1. Boot fetches effective config once per page load.
2. Boot resolves map config by `data-map-id`.
3. Boot resolves adapter key and geojson path from map entry.

## Migration Notes

- Map rows without adapter key are normalized to `leaflet`.
- Invalid DB shapes fall back to normalized default values.
