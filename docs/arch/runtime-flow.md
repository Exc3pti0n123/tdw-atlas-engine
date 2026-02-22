# TDW Atlas Runtime Flow

## Startup Sequence

1. PHP enqueues shared and Atlas startup modules in dependency order.
2. Shortcode renders one `.tdw-atlas` container per instance.
3. `tdw-atlas-cookie-ops` may enable early logging scopes from cookie.
4. `tdw-atlas-boot` reads `data-config-url` and fetches runtime config.
5. Boot applies `config.debug` (authoritative) and syncs cookie.
6. Boot resolves `maps.{id}.adapter` and asks `window.TDW.Atlas.Adapter.create(...)` for an instance.
7. Adapter factory dynamically imports the concrete adapter module when needed.
8. Boot creates one Core instance per container and runs `core.init(...)` with the adapter instance.
9. Concrete adapter dynamically imports its renderer vendor module (Leaflet) and renders the map.

## Fail-Fast Behavior

- Unexpected/invalid contract state: hard error + immediate instance abort.
- Per-instance abort is preferred to avoid global page failure.
- Intentional strict stops use ATTENTION comments in code.
- Non-critical degradation is allowed only with explicit warning.

## Instance Chain (frozen)

- `1 container -> 1 core instance -> 1 adapter instance`
- Adapter instances are produced by adapter module factory (`createAdapter`) and stay instance-local.
- Runtime state must remain instance-local.
