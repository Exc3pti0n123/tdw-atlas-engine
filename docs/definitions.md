# Definitions

## Core Terms

- Atlas Container:
  - DOM element rendered by shortcode (`.tdw-atlas[data-tdw-atlas="1"]`).
- Runtime Config:
  - Effective config payload from `/wp-json/tdw-atlas/v1/config`.
- Bootstrap Defaults:
  - Static defaults in `atlas.seed.json`, used for DB seeding/fallback.
- Adapter Key:
  - `maps.{id}.adapter` value selecting concrete renderer adapter module.
- Adapter Factory:
  - `window.TDW.Atlas.Adapter.create(...)`, resolves and validates adapter instance.
- Country Grouping:
  - Runtime payload block under `maps.{id}.grouping`.
  - Canonical runtime mapping `countryToRegion` is DB-assembled for mode `set`.
  - Adapter-agnostic domain data (not renderer-specific behavior).
- Whitelist:
  - Runtime payload block under `maps.{id}.whitelist`.
  - Include/exclude policy independent from grouping (`map override > global baseline > default`).
- Preprocess Profile:
  - Adapter-specific geometry processing policy (e.g. multipolygon strategy).
- Scoped Logger Helper:
  - `assets/shared/tdw-logger.js`.
  - Exposes `window.TDW.Logger.createScopedLogger(SCOPE)` for standardized `dlog/dwarn/derror`.
- Shared Helper Module:
  - `assets/js/helpers/atlas-shared.js`.
  - Hosts shared normalization helpers used across Boot/Pipeline/Adapter modules.
- Core Instance:
  - Instance from `window.TDW.Atlas.Core.create()` for one container.
- Merge Capsule:
  - Durable merge context document in `docs/context/merges/`.
- Branch Capsule:
  - Optional working context document in `docs/context/branches/`.

## Test Status Wording

- `implemented`:
  - change is coded, not yet verified adequately.
- `partially tested`:
  - smoke/limited validation done, full matrix pending.
- `done tested`:
  - acceptance criteria and intended tests completed.
