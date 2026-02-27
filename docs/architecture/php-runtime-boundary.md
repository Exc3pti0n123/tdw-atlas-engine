# PHP Runtime Boundary

## PHP Responsibilities

1. Register plugin hooks and shortcode.
2. Enqueue startup-critical JS modules with explicit dependencies.
3. Render atlas container markup.
4. Provide runtime config endpoint payload (optionally filtered by requested `map_ids`).
5. Manage DB schema lifecycle and seed defaults.

## PHP Module Layout

1. Runtime modules:
   - `includes/runtime/normalize.php`
   - `includes/runtime/payload.php`
2. DB modules:
   - `includes/db/tables.php`
   - `includes/db/helpers.php`
   - `includes/db/seed.php`
   - `includes/db/schema.php`
   - `includes/db/cli.php`
3. REST modules:
   - `includes/rest/helpers.php`
   - `includes/rest/preview.php`
   - `includes/rest/handlers.php`
   - `includes/rest/routes.php`

## JS Responsibilities

1. Load runtime config and orchestrate startup.
2. Resolve adapter and initialize core per container.
3. Fetch GeoJSON and pass DB-assembled `mapMeta` payload to renderer adapter.
4. Render fail-fast errors in container when runtime contracts fail.

## Boundary Rule

- PHP does not execute runtime rendering decisions for map behavior.
- JS runtime owns orchestration and renderer interactions.
