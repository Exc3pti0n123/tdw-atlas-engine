# Module Graph

## Static Startup-Critical Graph (Authoritative)

1. `tdw-bridge`
2. `tdw-logger`
3. `tdw-atlas-cookie-ops`
4. `tdw-atlas-adapter`
5. `tdw-atlas-core`
6. `tdw-atlas-boot`

Owner:
- PHP script-module dependency graph in `tdw-atlas-engine.php`.

## Dynamic Runtime Graph

1. `tdw-atlas-boot` -> imports runtime pipeline module (`assets/js/runtime/atlas-map-pipeline.js`).
2. `tdw-atlas-adapter` -> dynamic import of concrete adapter module (`assets/adapter/*`).
3. shared helper modules (imported by Atlas modules):
   - `assets/shared/tdw-logger.js`
   - `assets/js/helpers/atlas-shared.js`
4. concrete adapter (leaflet) orchestrator module:
   - `assets/adapter/leaflet/atlas-leaflet.js`
5. leaflet orchestrator -> internal helper modules:
   - `assets/adapter/leaflet/atlas-leaflet-focus.js`
   - `assets/adapter/leaflet/atlas-leaflet-layers.js`
   - `assets/adapter/leaflet/atlas-leaflet-style.js`
   - `assets/adapter/leaflet/atlas-leaflet-events.js`
   - `assets/adapter/leaflet/atlas-leaflet-transition.js`
6. concrete adapter (leaflet) -> dynamic import of Leaflet ESM from runtime config vendor path.

See diagram version:
- `../diagrams/module-dependencies.md`
