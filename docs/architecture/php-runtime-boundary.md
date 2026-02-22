# PHP Runtime Boundary

## PHP Responsibilities

1. Register plugin hooks and shortcode.
2. Enqueue startup-critical JS modules with explicit dependencies.
3. Render atlas container markup.
4. Provide runtime config endpoint payload.
5. Manage DB schema lifecycle and seed defaults.

## JS Responsibilities

1. Load runtime config and orchestrate startup.
2. Resolve adapter and initialize core per container.
3. Fetch geojson and invoke renderer adapter.
4. Render fail-fast errors in container when runtime contracts fail.

## Boundary Rule

- PHP does not execute runtime rendering decisions for map behavior.
- JS runtime owns orchestration and renderer interactions.
