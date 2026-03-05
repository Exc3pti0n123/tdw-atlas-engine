# System Architecture

This is the top-level architecture document for TDW Atlas Engine.

## System Boundaries

1. WordPress/PHP side:
- plugin bootstrap (`tdw-atlas-engine.php`)
- DB/config assembly (`includes/*`)
- runtime config endpoint (`/wp-json/tdw-atlas/v1/config`)
- isolated admin write surface (`/wp-json/tdw-atlas/v1/admin/*`)

2. Browser/JS side:
- shared modules from sibling plugin `tdw-core` (`tdw-bridge`, `tdw-logger`)
- atlas modules (`cookie-ops`, `adapter factory`, `core`, `boot`)
- concrete renderer adapter modules loaded dynamically (`assets/adapter/*`)

3. Adjacent plugin dependencies:
- `tdw-core`: required shared runtime contracts (namespace + bridge/logger).
- `tdw-design`: optional token provider for Atlas CSS.

4. Adjacent documentation contracts:
- `../../tdw-core/docs/contracts.md`
- `../../tdw-design/docs/contracts.md`

## Runtime Model

1. PHP renders container and enqueues startup-critical modules.
2. Boot loads runtime config once and iterates containers.
3. Boot resolves map entry and adapter key.
4. Adapter factory imports concrete adapter module and creates instance.
5. Boot loads GeoJSON and forwards DB-assembled `mapMeta` payload per container.
6. Boot runs the runtime preprocessor to build a prepared runtime bundle.
7. Core initializes with adapter instance per container.
8. Adapter renders prepared map bundle or emits fail-fast error per container.

## Seed Model (Hard-Cut #35)

1. `data/seed/atlas.runtime.seed.json` seeds global runtime defaults (`debug`, `vendor`, `views`, `meta`).
2. `data/seed/atlas.map.seed.json` seeds map defaults + country profile.
3. Activation/version reseed creates no default map rows; empty `maps` is valid runtime state.

## Admin Model (Isolated #14)

1. Admin code is isolated in `includes/admin/*` and `assets/admin/*`.
2. Atlas admin is list-first:
- list page: `admin.php?page=tdw-atlas-admin`
- edit page: `admin.php?page=tdw-atlas-admin&id=<map_key>`
3. New maps are created from selected datasets under `data/dataset/*` via one-click modal (`POST /admin/maps/create`).
4. Bulk delete is handled via dedicated modal + transactional endpoint.
5. Admin writes are capability + nonce protected and transaction-wrapped.
6. Public routes stay read-only (`/config`, `/preview`).
7. Header shell is rendered via `tdw-core` shared admin header helper (logo + title + version + `src | docs` + refresh).
8. Edit UI uses tabbed sections (`General`, `Countries`) with debounced autosave and mismatch review workflow.

## Source-of-Truth Policy

1. Runtime/public contracts:
- `docs/contracts.md`

2. Process/merge policy:
- `docs/process/merge-strategy.md`

3. Architecture decision record:
- `docs/adr/`

## Security Baseline (v0.2.0)

1. Public REST surface is read-only.
2. Request/DB inputs are validated fail-closed before runtime payload emission.
3. Runtime/seed file paths are restricted to safe plugin-local paths.
4. Admin write routes require `manage_options` + REST nonce.

## Deep-Dive Docs

- `architecture/runtime-flow.md`
- `architecture/module-graph.md`
- `architecture/config-lifecycle.md`
- `architecture/adapter-lifecycle.md`
- `architecture/php-runtime-boundary.md`
- `architecture/database-model.md`

## Diagram Set

- `diagrams/system-environment.md`
- `diagrams/module-dependencies.md`
- `diagrams/runtime-sequence.md`
- `diagrams/config-dataflow.md`
- `diagrams/preprocessor-flow.md`
