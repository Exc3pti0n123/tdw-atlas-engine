# TDW Atlas Engine

WordPress plugin for rendering GeoJSON maps via shortcode with a strict ESM runtime architecture.

## Quick Start

1. Activate the plugin in WordPress.
2. Add shortcode to a page:
`[tdw_atlas id="world"]`
3. Open runtime config endpoint:
`/wp-json/tdw-atlas/v1/config`

## Start Here (One-Click Onboarding)

- Human onboarding:
  - `docs/onboarding/human.md`
- Machine onboarding:
  - `docs/onboarding/machine.md`

## Core Docs

- Docs index:
  - `docs/README.md`
- Contracts (single source of truth):
  - `docs/contracts.md`
- System architecture:
  - `docs/system-architecture.md`
- Merge/process policy:
  - `docs/process/merge-strategy.md`
- Quick pre-flight checklists:
  - `docs/process/quick-checklists.md`

## Runtime Snapshot

- Global namespace: `window.TDW`
- Core factory: `window.TDW.Atlas.Core.create`
- Adapter factory: `window.TDW.Atlas.Adapter.create`
- Runtime config source: `/wp-json/tdw-atlas/v1/config`

## Contribution

Read `CONTRIBUTING.md` before creating a branch or PR.
