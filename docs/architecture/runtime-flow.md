# Runtime Flow

Linear startup chain: `Boot -> Pipeline -> Core -> Adapter`.

## Startup Sequence

1. PHP enqueues startup-critical modules in dependency order.
2. Shortcode renders one atlas container per map instance.
3. CookieOps may apply early logging state from cookie.
4. Boot fetches runtime config from `data-config-url` (`/wp-json/tdw-atlas/v1/config`) and passes page-local `map_ids` when available.
5. Boot applies authoritative logging state from `config.debug`.
6. Boot resolves `mapId` and `maps.{id}.adapter`.
7. Adapter factory imports concrete adapter module lazily.
8. Factory returns validated adapter instance.
9. Boot computes a runtime-bundle cache key from effective map signature (`mapId`, base URL, `geojson`, `datasetKey`, `grouping`, `whitelist`, `preprocess`, `regionLayer`).
10. Boot fetches `maps.{id}.geojson` only on cache miss and runs the runtime pipeline once per key.
11. Boot builds `mapMeta` from runtime config (`grouping`, `whitelist`, `preprocess`, `regionLayer`).
12. Boot forwards adapter-facing map config via `adapterConfig.map` (including `focus` + `ui.preview`).
13. Boot creates core instance and calls `core.init({ adapter, el, mapData, mapMeta, adapterConfig })` where `mapData` is the prepared runtime bundle.
14. Adapter initializes preview overlay via adapter-agnostic UI module (`assets/js/ui/atlas-preview.js`).
15. Adapter performs renderer-local vendor validation/loading (Leaflet JS/CSS), not Boot.
16. Adapter enters deterministic stage machine:
    - `world`: full region-status view.
    - `region`: active region expanded to countries, all other regions remain region-status.
    - `country`: same hybrid view as `region`, plus selected country.
17. Region click in `world` enters `region` stage for the clicked group.
18. In hybrid stages (`region`/`country`), click routing is feature-kind based:
    - `tdwHybridKind='country'`: country selection in active region.
    - `tdwHybridKind='region'`: immediate region switch (resolves #34 by construction).
19. Sea click uses two-step back navigation:
    - `country -> region` (clear selected country)
    - `region -> world`
    - `world -> no-op`
20. Stage transitions are tokenized; only latest transition token may commit after `moveend`/fallback.
21. Preview lifecycle is stage-driven only:
    - `world`: preview closed.
    - `region`: region preview if enabled.
    - `country`: country preview if enabled.
    - preview close button => world stage.
22. Preview content is fetched from `/wp-json/tdw-atlas/v1/preview` with local fallback on request failure.

## Failure Strategy

- Contract/runtime errors fail fast per container.
- Global page crash is avoided where possible.
- Error rendering is visible in the affected container.
- Preview fetch errors are explicitly non-fatal and degrade to placeholder content.
