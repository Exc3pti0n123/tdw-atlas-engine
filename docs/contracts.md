# TDW Atlas Engine — Contracts & Stakeholders

This document freezes **public contracts** between the TDW Atlas plugin components.
If you change a contract, update this file and bump the plugin version.

## Stakeholders

- **WordPress Runtime (PHP)**: renders shortcodes, serves static assets, decides which scripts/styles are enqueued.
- **Content Editors (WP Block Editor)**: place `[tdw_atlas]` shortcodes and wrap them in layout groups.
- **Theme / tdw-site-core**: provides global design tokens (CSS variables) used by Atlas UI.
- **TDW Atlas Boot (JS)**: orchestrates loading config + map data and wiring Core + Adapter.
- **TDW Atlas Adapter Factory (JS)**: resolves configured adapter key to concrete adapter instance.
- **TDW Atlas Core (JS)**: per-instance state machine; calls adapter methods; no DOM scanning.
- **Adapters (JS)**: render implementation (Leaflet today) and map-specific behaviors.
- **Vendor Libraries**: Leaflet (ESM), its CSS, images, and sourcemaps.
- **Data Providers**: GeoJSON datasets (e.g., Natural Earth) and any future custom region groupings.
- **Developers / Contributors**: maintain code quality, contracts, and onboarding docs.

---

## Contract 1 — WordPress Shortcode

### Name
- [tdw_atlas]

### Purpose
- Renders exactly one Atlas container element into the page.

### Attributes (shortcode)
- `id` **(required)**: map instance id; must match a key in effective runtime config under `maps`.

### Failure behavior
- Missing `id` => shortcode renders a placeholder atlas container; Boot resolves a visible in-container runtime error.
- Unknown `id` (not in config) => PHP still renders the container; Boot renders the runtime error in-container.
- No fallback ids.

---

## Contract 2 — Container Element (DOM)

### Selector
- `.tdw-atlas` (single container per shortcode)

### Required attributes
- `id` (DOM id): `tdw-atlas-{mapId}` (example: `tdw-atlas-world`)
- `class`: includes `tdw-atlas`
- `data-tdw-atlas="1"` (presence marker)
- `data-map-id` (string): must match the shortcode `id`
- `data-config-url` (absolute URL): URL to effective runtime config endpoint

### Optional attributes (future)
- `data-view` (string): view preset id (example: `world`)
- `data-adapter` (string): adapter name override (default: `leaflet`)
- `data-debug` ("1"/"0"): per-instance debug override

### Notes
- The *outer* WP Group (your layout wrapper) should only contain design classes; it should not be used as the Atlas anchor.

---

## Contract 3 — File structure convention

All Atlas JS modules follow the same internal layout:

Reference template:
- `docs/templates/module-template.md`

0) **META** (Header Block)
   - Module name and responsibility (1–2 lines)
   - Public surface (what it exports under `window.TDW.Atlas.*`)
   - Load behavior (when/why it runs, auto-run yes/no)
   - Side-effects (DOM access, network, adapter registration, etc.)
   - External dependencies (Boot, Adapter Factory, Core, vendor modules, config)
1) **MODULE INIT** (namespace + constants + tiny helpers)
2) **FUNCTIONS** (callable logic / utilities)
3) **PUBLIC API** (exports under `window.TDW.Atlas.*`)
4) **AUTO-RUN** (optional wiring / start-up hooks)

Notes:
- Keep MODULE INIT minimal (no DOM scanning, no network).
- AUTO-RUN must be the only place that registers event listeners or starts orchestration.
- Functions in section `2) FUNCTIONS` should use JSDoc (`@param`, `@returns`) for non-trivial behavior.

## Contract 4 — Config Source (JSON bootstrap + DB-backed runtime)

### Bootstrap location
- Plugin root: `tdw-atlas-engine/atlas.config.json`

### Minimal schema (MVP)
```json
{
  "meta": { "engine": "tdw-atlas-engine", "version": "0.1.3" },
  "debug": true,
  "vendor": {
    "leafletJs": "/wp-content/plugins/tdw-atlas-engine/assets/vendor/leaflet/2.0.0-alpha-2.1/leaflet-src.js",
    "leafletCss": "/wp-content/plugins/tdw-atlas-engine/assets/vendor/leaflet/2.0.0-alpha-2.1/leaflet.css"
  },
  "maps": {
    "world": { "adapter": "leaflet", "geojson": "data/ne_50m_admin_0_countries_lakes.json", "view": "world" }
  },
  "views": {
    "world": { "bounds": [[-60, -180], [85, 180]] }
  }
}
```

### Rules
- `debug` is the single authoritative source for whether debug should be enabled.
- Runtime config is served via `/wp-json/tdw-atlas/v1/config` (effective config from DB with JSON fallback).
- `maps.{id}.adapter` is required and selects the concrete adapter module.
- `maps.{id}.geojson` is typically a relative path inside the plugin; Boot resolves it relative to `meta.baseUrl` (fallback: `data-config-url`).
- `views.{viewId}.bounds` is optional but recommended for predictable fit.

### PHP implementation ownership
- `tdw-atlas-engine.php`: plugin bootstrap, constants, hooks, enqueue, shortcode.
- `includes/atlas-runtime-config.php`: runtime config assembly (JSON defaults + DB effective config).
- `includes/atlas-db.php`: DB table/schema, seeding, activation/upgrade lifecycle.
- `includes/atlas-rest.php`: route registration for config endpoint.

---


## Contract 5 — Logging & Debugging

### Purpose
Defines how logging and debug behavior work across all Atlas modules (Boot, Adapter Factory, Core, Adapters).
Ensures predictable diagnostics without polluting production consoles.
Debug is strictly observational.
For runtime sequencing see Contract 17.

### Logging Levels

- `log`
  - Informational lifecycle messages
  - Visible **only when debug is enabled**

- `warn`
  - Non-fatal irregularities
  - Visible **only when debug is enabled**

- `error`
  - Fatal contract violations or broken dependencies
  - **Always visible**, independent of debug mode by conditional routing

- `innerHTML`
  - only in case of DOM render failure
  - additionally with `error`

### Routing Rules

- All Atlas modules (Boot, Adapter Factory, Core, Adapters) must use the shared TDW logger:
  - `window.TDW._logger`
- The logger is scope-based (e.g. `"ATLAS BOOT"`, `"ATLAS CORE"`).
- No module may call `console.log` or `console.warn` directly.
- `console.error` is only allowed as a hard fallback if the logger is unavailable.

Atlas perspective:
- Atlas consumes the logger as a shared dependency (`tdw-logger`), but does not own logger internals.
- Shared logger core contracts are documented in the shared/core docs (outside Atlas).

Logging must be done via:

- `window.TDW._logger.log(scope, ...)`
- `window.TDW._logger.warn(scope, ...)`
- `window.TDW._logger.error(scope, el?, message, ...)`

### Fatal Error Contract

- `error(scope, el, message, ...)` is considered **fatal**.
- If `el` is provided:
  - A visible error container must be rendered inside that element.
  - The element must receive `.tdw-atlas-failed`.
- If `el` is not provided:
  - Only `console.error` is emitted.

Fatal errors must:
- Stop further processing for that map instance.
- Never fail silently.

### Debug Enablement Model

- Debug is scope-based.
- Each module scope can be enabled/disabled independently.
- Debug state may be initialized by:
  - Cookie
  - runtime config from `data-config-url`
- Manual runtime call (`setDebugEnabled(scope, boolean)`)

The logger itself is framework-agnostic and does not contain Atlas-specific logic.

### Fail-Fast Attention Principle

- Unexpected runtime or contract states must fail fast (`error` + immediate abort of current flow).
- Per-instance abort is preferred over global crash.
- No silent fallbacks for contract violations.
- If code intentionally hard-stops even though execution could continue, it must include:
  - `// ATTENTION: intentional hard-stop for diagnosability; runtime could continue.`
- Non-critical degradation is allowed only with explicit `warn` diagnostic.

### Logging Flow (Expected Runtime Behavior)

- `tdw-logger` initializes logger functions and scope state (shared dependency, eager enqueued).
- `atlas-cookie-ops` may apply early log enablement from `tdw_atlas_debug` cookie before Boot starts.
- `atlas-boot` loads effective config from `data-config-url` and applies final state from `config.debug` (authoritative).
- `atlas-boot` synchronizes `tdw_atlas_debug` cookie to the applied `config.debug` value.
- Hysteresis is expected across reloads:
  - Cookie can make early logs visible for the current request.
  - Boot may later disable them in the same request if `config.debug` is false.
  - The next reload reflects the synchronized cookie value.

### DOM Failure Policy

- Visible error rendering must happen through the shared logger.
- PHP must not generate error fallbacks for runtime JS failures.
- The container element defined by the shortcode is always the anchor for fatal rendering.

---



## Contract 6 — Global ATLAS Namespace

All public plugin JS attaches under:
- `window.TDW.Atlas`

### Required keys
- `window.TDW.Atlas.Adapter`
- `window.TDW.Atlas.Core`

### Forbidden
- No other top-level globals
- No legacy globals like `window.TDW_ATLAS_BOOT`

### Namespace rule
- Module code may initialize `window.TDW` / `window.TDW.Atlas` idempotently.
- Public runtime surface must remain inside `window.TDW.*`.

---

## Contract 7 — Adapter Factory

### Location
- `assets/js/atlas-adapter.js`

### Required API surface
- `window.TDW.Atlas.Adapter.create({ adapterKey, mapId, el })`

### Behavior
- Factory dynamically imports concrete adapter modules by key.
- Unknown adapter key is a hard per-instance failure.
- Concrete adapter module must export `createAdapter()`.

---

## Contract 8 — Core Factory

### Location
- `assets/js/atlas-core.js`

### Export
- `window.TDW.Atlas.Core.create` (function)

### Rules
- Core is a **factory**, not a singleton.
- Core does **not** scan the DOM.
- Core does **not** fetch but forward GeoJSON.

---

## Contract 9 — Core Instance API

Each Core instance exposes:
- `init({ adapter, el, geojson, config })`
- `destroy()`

Notes:
- Core consumes adapter instances from Adapter Factory and validates only Core-boundary inputs.
- Core uses isolated adapter instances per map instance.
- Core-Adapter instance chain is fixed:
  - `1 container -> 1 core instance -> 1 adapter instance`.
  - Adapter instances are created by adapter module factories (`createAdapter`).
  - Adapter instance state must stay local to that instance (no shared mutable runtime state across containers).

---

## Contract 10 — Adapter Contract (Leaflet + future adapters)

Adapters must implement:
- `init({ el, config, geojson, core })`  *(may be async)*
- `onResize(activeRegionId)`
- `destroy()`

### Rendering responsibility
- Adapter creates all internal DOM for the map (Leaflet container, panes, tooltips).
- Adapter is responsible for fitting bounds and applying view presets.

---

## Contract 11 — Boot Orchestration

### Location
- `assets/js/atlas-boot.js`

### Responsibilities
- Find all `.tdw-atlas[data-tdw-atlas="1"]` containers.
- Load effective config once (shared across instances).
- Apply debug enablement from `config.debug` (authoritative source).
- Sync cookie `tdw_atlas_debug` to the applied debug state.
- For each container:
  - Resolve adapter key from `maps[mapId].adapter`.
  - Create adapter instance via `window.TDW.Atlas.Adapter.create(...)`.
  - Resolve map entry (`maps[mapId]`) and view preset (`views[viewId]`).
  - Fetch GeoJSON (or pass URL to adapter if configured later).
  - Create a Core instance and call `core.init(...)` with adapter + config + el.

### Non-responsibilities
- Boot does not contain adapter logic.
- Boot does not register adapters.

---


## Contract 12 — Archived Debug Script (non-runtime)

### Location
- `assets/js/atlas-debug.js.old`

### Purpose
- Historical reference only.
- Not part of active runtime/module graph.

### Load Behavior
- Not enqueued in current architecture.

### Rule
- Keep as archive or delete later; do not treat it as a current contract source.

---



## Contract 13 — Vendor Loading (Leaflet ESM)

### Leaflet JS
- Must be loaded via `import()` from `config.vendor.leafletJs` (ESM build).

### Leaflet CSS
- Must be injected once (link tag) from `config.vendor.leafletCss`.

### Rule
- No reliance on globals like `window.L`.
- Leaflet integration is strict 2.x (no 1.x constructor/factory fallback).

---

## Contract 14 — Design Tokens

Atlas CSS must rely on tokens provided by `tdw-site-core`:
- `--tdw-bg`, `--tdw-text`, `--tdw-muted`, `--tdw-water`, `--tdw-border`, etc.

### Debug helper
- In debug mode, a token check may warn if required tokens are missing.

---

## Contract 15 — Data Attribution (future)

When we add a visible attribution UI, it must support:
- Dataset name + source
- License / terms reference

(Not required for MVP rendering.)

---

## Contract 16 — Atlas Cookie Operations

### Location
- `assets/js/helpers/atlas-cookie-ops.js`

### Public surface
- `window.TDW.Atlas.CookieOps.getRaw(name)`
- `window.TDW.Atlas.CookieOps.setRaw(name, value, options?)`
- `window.TDW.Atlas.CookieOps.remove(name, options?)`
- `window.TDW.Atlas.CookieOps.getBool(name)`
- `window.TDW.Atlas.CookieOps.setBool(name, enabled, options?)`
- `window.TDW.Atlas.CookieOps.getJson(name)`
- `window.TDW.Atlas.CookieOps.setJson(name, value, options?)`
- `window.TDW.Atlas.CookieOps.getDebugFlag()`
- `window.TDW.Atlas.CookieOps.setDebugFlag(enabled, options?)`
- `window.TDW.Atlas.CookieOps.clearDebugFlag(options?)`
- `window.TDW.Atlas.CookieOps.initDebugFromCookie()`

### Rules
- CookieOps must use `window.TDW.vendor.Cookies` as backend.
- Atlas modules must not access js-cookie directly.
- Default attributes: `path=/`, `sameSite=Lax`, `secure` when HTTPS.
- CookieOps may call `window.TDW._logger.setDebugEnabled(...)` to apply early log state from cookie.
- Cookie debug init may enable early runtime logs before config is loaded.
- Runtime debug authority remains effective runtime config; Boot may sync that value back into cookie.

### Shared Bridge

- Shared vendor namespace attachments are provided by `assets/shared/tdw-bridge.js`.
- Current bridge API:
  - `window.TDW.bridge.define(name, loader, options?)`
  - `window.TDW.bridge.get(name)` (async)
  - `window.TDW.bridge.getSync(name)` (sync, resolved values only)
- Current contract exposed by bridge:
  - `window.TDW.vendor.Cookies` (eager)
- Atlas uses the bridge, but bridge internals are shared-layer concerns.

### Bridge Loading Modes (Atlas usage policy)

- `always-load` (eager): required for small, foundational libs used in early startup.
  - Atlas example: `Cookies`.
- `load-on-call` (lazy): use for optional/heavy libs via `bridge.get(name)`.
- `conditional` eager: allowed for non-critical diagnostics/features with explicit condition.
- Atlas logger is **not** loaded through bridge; it remains an explicit shared module dependency.

---

## Contract 17 — Script Module Load Order

Required dependency graph for predictable logging and runtime:

1. `tdw-bridge`
2. `tdw-logger`
3. `tdw-atlas-cookie-ops`
4. `tdw-atlas-adapter`
5. `tdw-atlas-core`
6. `tdw-atlas-boot`

Rules:

- For static/startup-critical modules, this PHP dependency graph is the authoritative load order.
- `tdw-atlas-cookie-ops` must run before Adapter/Core/Boot to allow early logging from cookie state.
- `tdw-atlas-boot` must run last to apply authoritative config and start orchestration.
- Any new module that emits `dlog`/`dwarn` during module evaluation must depend on `tdw-logger` and `tdw-atlas-cookie-ops`.
- Dynamic import authority is owned by explicit `import()` call sites (Adapter Factory for adapter modules, Leaflet adapter for Leaflet vendor module).
- Initiators:
  - PHP enqueue initiates shared + atlas module loading.
  - `tdw-bridge` initiates eager shared vendor contracts.
  - `tdw-atlas-cookie-ops` initiates early log scope enablement from cookie.
  - `tdw-atlas-boot` initiates config read, final log-state apply, and map boot.
