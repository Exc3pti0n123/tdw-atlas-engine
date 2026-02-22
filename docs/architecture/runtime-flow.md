# Runtime Flow

## Startup Sequence

1. PHP enqueues startup-critical modules in dependency order.
2. Shortcode renders one atlas container per map instance.
3. CookieOps may apply early logging state from cookie.
4. Boot fetches runtime config from `data-config-url`.
5. Boot applies authoritative logging state from `config.debug`.
6. Boot resolves `mapId` and `maps.{id}.adapter`.
7. Adapter factory imports concrete adapter module lazily.
8. Factory returns validated adapter instance.
9. Boot creates core instance and calls `core.init({ adapter, el, config, geojson })`.
10. Adapter loads renderer vendor module and renders map.

## Failure Strategy

- Contract/runtime errors fail fast per container.
- Global page crash is avoided where possible.
- Error rendering is visible in the affected container.
