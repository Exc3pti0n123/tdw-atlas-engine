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

1. `tdw-atlas-adapter` -> dynamic import of concrete adapter module (`assets/js/adapters/*`).
2. concrete adapter (leaflet) -> dynamic import of Leaflet ESM from runtime config vendor path.

See diagram version:
- `../diagrams/module-dependencies.md`
