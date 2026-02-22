# Adapter Lifecycle

## Adapter Selection

1. Boot resolves `maps.{id}.adapter`.
2. Boot calls `window.TDW.Atlas.Adapter.create({ adapterKey, mapId, el })`.

## Adapter Factory Responsibilities

1. Resolve adapter key to module path.
2. Dynamic import adapter module.
3. Ensure module exports `createAdapter`.
4. Create adapter instance.
5. Validate required adapter contract methods.

## Adapter Instance Responsibilities

1. `init({ el, config, geojson, core })`
2. `onResize(activeRegionId)`
3. `destroy()`

## Isolation Rule

- `1 container -> 1 core instance -> 1 adapter instance`.
- No shared mutable adapter runtime state across containers.
