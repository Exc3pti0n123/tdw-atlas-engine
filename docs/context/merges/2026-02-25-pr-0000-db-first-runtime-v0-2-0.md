# Merge Capsule: 2026-02-25 PR-0000 db-first-runtime-v0-2-0

- Issue: DB-first runtime refactor (grouping + whitelist + preprocess)
- PR: n/a (local branch work)
- ADR: pending

## Scope

- Hard cut from runtime `maps.{id}.regions` JSON-fetch to DB-assembled runtime payload.
- Introduce schema v5 tables for catalog/features/grouping/whitelist/part-rules.
- Keep `/wp-json/tdw-atlas/v1/config` as single runtime endpoint.

## Changed Areas

- `includes/atlas-db.php`
- `includes/atlas-runtime-config.php`
- `includes/atlas-rest.php`
- `includes/atlas-cli.php` (new)
- `assets/js/atlas-boot.js`
- `assets/adapter/leaflet/leaflet preprocessing helper module`
- `assets/adapter/leaflet/atlas-leaflet.js`
- `atlas.seed.json`
- `data/world-regions.v1.json`
- docs: contracts, architecture, diagrams, definitions, contributing

## Decision Summary

1. Runtime payload is DB-first and map-ready (`grouping`, `whitelist`, `preprocess`).
2. Whitelist is independent from grouping and follows `map > global > default`.
3. Preprocess part-rules are map-scoped and DB-backed.
4. Activation/init/version reseed policy remains deterministic in dev phase.
5. Corrupt runtime rows return REST errors (fail-fast, no silent fallback).

## Contract Impact

1. `maps.{id}.regions` removed from runtime contract.
2. Added runtime map fields:
- `datasetKey`
- `grouping`
- `whitelist`
- `preprocess`
3. Boot now fetches only GeoJSON from map asset paths.
4. Seed template contract for `data/world-regions.v1.json` changed to `set + members`.

## Tests and Status

- Status: implemented
- Static checks pending after final cleanup:
- `php -l` on plugin and include files
- `node --check` on updated JS modules
- Browser runtime smoke pending against `/wp-json/tdw-atlas/v1/config`

## Risks and Follow-ups

1. DB schema uses indexes/PKs without FK constraints (dbDelta compatibility).
2. `geojson` grouping mode requires strict property naming in runtime config.
3. Admin-specific full-catalog endpoints are intentionally out of scope.
4. Consider ADR for DB-first runtime contract finalization.
