=== TDW Atlas Engine ===
Contributors: thedesertwhale
Tags: map, atlas, leaflet, geojson, shortcode
Requires at least: 6.5
Tested up to: 6.8
Requires PHP: 8.1
Stable tag: 0.2.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

TDW Atlas Engine renders interactive atlas maps via shortcode with a strict fail-fast runtime and adapter-based renderer architecture.

== Description ==

TDW Atlas Engine is a WordPress plugin focused on deterministic map runtime behavior:

* Requires `TDW Core` (`tdw-core`) for shared namespace runtime modules (`tdw-bridge`, `tdw-logger`).
* One shortcode container initializes one runtime core instance.
* Adapter factory resolves renderer implementation (Leaflet in current MVP).
* Runtime config is served from the DB-backed REST endpoint.
* Map data is preprocessed before adapter rendering.
* Invalid contracts fail closed with in-container diagnostics.

Main shortcode:

`[tdw_atlas id="world"]`

== Installation ==

1. Upload the plugin folder to `/wp-content/plugins/tdw-atlas-engine/`, or install the ZIP in WordPress admin.
2. Install and activate `TDW Core` (`tdw-core`).
3. Activate the plugin through the WordPress "Plugins" screen.
4. Place `[tdw_atlas id="world"]` in a page or post.
5. Open the page and verify map rendering.

== Frequently Asked Questions ==

= Does this plugin expose public write endpoints? =

No. Public REST endpoints are read-only in the current version.

= Where does runtime config come from? =

From `/wp-json/tdw-atlas/v1/config`, assembled from plugin seed defaults and DB state.

= Is the plugin mobile-optimized? =

The current milestone is functional-first MVP. UI polish and deeper mobile UX are planned follow-ups.

== Changelog ==

= 0.2.0 =
* Refactored runtime to preprocessor + adapter orchestration.
* Added deterministic stage transitions for world/region/country flow.
* Added preview overlay infrastructure with placeholder content route.
* Added strict security baseline (fail-closed REST input and path validation).

== Upgrade Notice ==

= 0.2.0 =
Development milestone update. In local dev mode, DB reseed/reset flows may be destructive by design.
