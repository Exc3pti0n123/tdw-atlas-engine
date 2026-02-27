# Merge Capsule: 2026-02-23 PR-0000 v0-2-0-functional-only

## Scope

- v0.2.0 functional refactor only (no design overhaul).
- Core payload contract generalized.
- Regions SSoT introduced and wired into runtime config + DB.
- Leaflet adapter moved and split with one temporary helper module.

## Changed areas

1. Runtime data contracts:
- `atlas.seed.json` now includes `maps.world.regions`.
- new `data/world-regions.v1.json` as regions SSoT.

2. PHP data lifecycle:
- plugin version bumped to `0.2.0`.
- DB schema bumped to `3` with `regions_path`.
- deterministic version-based reseed implemented.

3. JS architecture:
- `core.init(...)` now expects `mapData`, `mapMeta`, `adapterConfig`.
- Boot loads runtime config + GeoJSON + country-grouping JSON per instance.
- Boot no longer performs geojson processing logic.
- adapter factory maps `leaflet` to new path `assets/adapter/leaflet/atlas-leaflet.js`.
- helper in adapter scope:
  - Leaflet preprocessing helper module (preprocessing + grouping)

4. Documentation:
- contracts + architecture + diagrams updated to new runtime boundaries and paths.

## Decision summary

1. Keep fail-fast behavior and ATTENTION comments for intentional hard-stops.
2. Keep Boot adapter-agnostic: load-only responsibilities.
3. Keep adapter-specific data processing in Leaflet helper (temporary monolith).
4. Use version-based reseed in dev phase instead of legacy row normalization.

## Contract impact

1. `Core.init` signature changed:
- from: `init({ adapter, el, config, geojson })`
- to: `init({ adapter, el, mapData, mapMeta, adapterConfig })`

2. Runtime map contract extended:
- `maps.{id}.regions` required.

3. DB map schema extended:
- `regions_path` column added.

4. Adapter path contract changed:
- dynamic import target now `assets/adapter/leaflet/atlas-leaflet.js`.

## Tests and status

- Static checks:
  - `php -l` passed for `tdw-atlas-engine.php`, `includes/atlas-db.php`, `includes/atlas-runtime-config.php`, `includes/atlas-rest.php`.
  - `node --check` passed for updated JS modules including new Leaflet adapter/helper.
- Runtime checks:
  - not executed in this capsule.

Status: `implemented`, `partially tested`.

## Risks / open follow-ups

1. Version-based reseed is intentionally destructive in this dev phase.
2. Leaflet helper is intentionally temporary and should be split later by responsibility.
3. Functional behavior should be validated in browser for:
- world render
- whitelist filter effect
- missing/invalid regions path fail-fast
- multi-instance isolation

## Links to issue/PR/ADR

- Issues: #12, #26, #27 (functional subset for v0.2.0)
- PR: `PR-0000` (fill actual PR id on merge)
- ADR: No ADR required (behavior follows previously accepted fail-fast/runtime-boundary decisions).
