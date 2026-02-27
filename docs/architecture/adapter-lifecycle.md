# Adapter Lifecycle

## Adapter Selection

1. Boot resolves `maps.{id}.adapter`.
2. Boot calls `window.TDW.Atlas.Adapter.create({ adapterKey, mapId, el })`.

## Adapter Factory Responsibilities

1. Resolve adapter key to module path.
2. Dynamic import adapter module.
3. Ensure module exports `createAdapter`.
4. Create adapter instance.
5. Validate required adapter contract methods.

## Adapter Instance Responsibilities

1. `init({ el, mapData, mapMeta, adapterConfig, core })`
2. `onResize(activeRegionId)`
3. `destroy()`

## Leaflet Internal Module Split (#38)

`assets/adapter/leaflet/atlas-leaflet.js` is orchestration only and delegates to:

1. `assets/adapter/leaflet/atlas-leaflet-focus.js`
   - Antimeridian-aware bounds collection.
   - Stage padding resolution.
   - Fit diagnostics helpers.
2. `assets/adapter/leaflet/atlas-leaflet-layers.js`
   - Layer feature accessors.
   - Group/country indexes.
   - Hybrid map assembly (`tdwHybridKind`).
3. `assets/adapter/leaflet/atlas-leaflet-style.js`
   - Stage/kind style policy and style application helpers.
4. `assets/adapter/leaflet/atlas-leaflet-events.js`
   - World/hybrid hover routing.
   - World/hybrid click routing.
5. `assets/adapter/leaflet/atlas-leaflet-transition.js`
   - Tokenized transition controller.
   - Atomic stage commit guard.

## Runtime Pipeline Boundary

1. Boot delegates data preparation to `assets/js/runtime/atlas-map-pipeline.js`.
2. Pipeline owns multipolygon mini-workflow (`split -> micro cleanup -> task -> setPolygonId`).
3. Pipeline owns whitelist application, grouping mode resolution (`set|geojson|off`), and runtime assignment on features.
4. Pipeline emits runtime bundle artifacts (`countryRuntimeMap`, optional `regionRuntimeMap`, grouping metadata, diagnostics).
5. `mapMeta.preprocess.enabled` is the master switch:
   - `true`: pipeline runs full preprocessing path.
   - `false`: pipeline runs passthrough path; grouping/whitelist/part-rules are ignored for this instance.

## Runtime Stage Flow (Leaflet)

1. Start stage: `world` (region-status view).
2. `world` click on region feature enters `region` stage.
3. `region`/`country` stages use one hybrid layer:
   - active region features are country-kind (`tdwHybridKind='country'`)
   - non-active region features are region-kind (`tdwHybridKind='region'`)
4. Hybrid click routing is deterministic:
   - country-kind click => `enterCountryStage(...)`
   - region-kind click => `enterRegionStage(...)` (immediate region switch)
5. Sea click is two-step:
   - `country -> region`
   - `region -> world`
6. Stage transitions are tokenized:
   - every navigation action gets a transition token.
   - only the latest token may commit.
   - stale `moveend` callbacks are ignored.
7. Stage transitions commit on movement completion (`moveend` + fallback timer), not before.

## Preview Coupling (Leaflet)

1. Preview open/close is called only from stage transition functions.
2. Stage mapping:
   - `world`: close preview
   - `region`: open region preview when enabled
   - `country`: open country preview when enabled
3. Preview close button always returns to `world` stage.

## Ownership Rule (Global vs Adapter-Specific)

1. Grouping/whitelist data is global domain data (DB-assembled, adapter-agnostic).
2. Leaflet consumes prepared runtime bundle artifacts from Boot pipeline.
3. Geometry preprocessing strategy and part-rules execution are owned by runtime pipeline, not by renderer adapters.

## Isolation Rule

- `1 container -> 1 core instance -> 1 adapter instance`.
- No shared mutable adapter runtime state across containers.
