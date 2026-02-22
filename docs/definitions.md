# Definitions

## Core Terms

- Atlas Container:
  - DOM element rendered by shortcode (`.tdw-atlas[data-tdw-atlas="1"]`).
- Runtime Config:
  - Effective config payload from `/wp-json/tdw-atlas/v1/config`.
- Bootstrap Defaults:
  - Static defaults in `atlas.config.json`, used for DB seeding/fallback.
- Adapter Key:
  - `maps.{id}.adapter` value selecting concrete renderer adapter module.
- Adapter Factory:
  - `window.TDW.Atlas.Adapter.create(...)`, resolves and validates adapter instance.
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
