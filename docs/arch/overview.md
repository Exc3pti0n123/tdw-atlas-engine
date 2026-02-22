# TDW Atlas Architecture Overview

This page is the high-level architecture entry point for Atlas.

## Ownership Areas

- External: browser request + WordPress runtime.
- Atlas PHP: plugin bootstrap, DB/config endpoint wiring, shortcode rendering.
- Shared JS: bridge + logger consumed by Atlas.
- Atlas JS: cookie ops, adapter factory, core, renderer adapters, boot orchestration.
- Runtime Data: config endpoint + bootstrap defaults + GeoJSON files.

## Runtime Guarantees

- Static/startup-critical load order is defined by WordPress script-module dependencies.
- Dynamic vendor loading is explicit (`import()` owner: adapter).
- Fail-fast on unexpected contract/runtime errors.
- Per-instance abort is preferred over global crash.

## Reference Docs

- Module graph: `docs/arch/module-graph.md`
- Runtime flow: `docs/arch/runtime-flow.md`
- Contracts: `docs/contracts.md`
