# System Architecture

This is the top-level architecture document for TDW Atlas Engine.

## System Boundaries

1. WordPress/PHP side:
- plugin bootstrap (`tdw-atlas-engine.php`)
- DB/config assembly (`includes/*`)
- runtime config endpoint (`/wp-json/tdw-atlas/v1/config`)

2. Browser/JS side:
- shared modules from sibling plugin `tdw-core` (`tdw-bridge`, `tdw-logger`)
- atlas modules (`cookie-ops`, `adapter factory`, `core`, `boot`)
- concrete renderer adapter modules loaded dynamically (`assets/adapter/*`)

3. Adjacent plugin dependencies:
- `tdw-core`: required shared runtime contracts (namespace + bridge/logger).
- `tdw-design`: optional token provider for Atlas CSS.

## Runtime Model

1. PHP renders container and enqueues startup-critical modules.
2. Boot loads runtime config once and iterates containers.
3. Boot resolves map entry and adapter key.
4. Adapter factory imports concrete adapter module and creates instance.
5. Boot loads GeoJSON and forwards DB-assembled `mapMeta` payload per container.
6. Boot runs the runtime preprocessor to build a prepared runtime bundle.
7. Core initializes with adapter instance per container.
8. Adapter renders prepared map bundle or emits fail-fast error per container.

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
