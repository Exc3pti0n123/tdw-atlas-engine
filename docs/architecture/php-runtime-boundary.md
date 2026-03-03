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

## Trust Boundaries

1. Request input is untrusted and must be strictly validated at REST handlers.
2. DB values are treated as runtime input and are validated before payload emission.
3. Seed file values are bootstrap input and are validated before reseed import.

## Fail-Closed Security Flow

1. Invalid REST query input returns `400` (no sanitize-and-continue).
2. Invalid runtime config rows (paths/vendor/grouping contracts) return `500` and abort payload generation.
3. Invalid seed paths/contracts throw and abort reseed.
4. Public Atlas REST surface remains read-only (`/config`, `/preview`).
