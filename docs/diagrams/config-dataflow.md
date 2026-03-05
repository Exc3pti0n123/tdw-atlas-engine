# Config Dataflow Diagram

```mermaid
flowchart LR
  JSONR["data/seed/atlas.runtime.seed.json"] --> SEED["DB seed/reset pipeline"]
  JSONM["data/seed/atlas.map.seed.json"] --> SEED
  DS["data/dataset/*.json|*.svg"] --> ADMINAPI["admin datasets/create routes"]
  TPL["data/world-regions.v1.json (reference)"] --> JSONM
  GEO["GeoJSON dataset"] --> ADMINAPI
  O1["option: tdw_atlas_settings"] --> RC["runtime-config assembler"]
  O2["option: tdw_atlas_system"] --> RC
  T1["table: {prefix}tdw_atlas_maps"] --> RC
  ADMINAPI --> T1
  T2["table: {prefix}tdw_atlas_grouping_*"] --> RC
  T3["table: {prefix}tdw_atlas_whitelist_entries"] --> RC
  T4["table: {prefix}tdw_atlas_preprocess_part_rules"] --> RC
  T5["table: {prefix}tdw_atlas_country_review"] --> ADMINAPI
  RC --> REST["/wp-json/tdw-atlas/v1/config"]
  REST --> BOOT["atlas-boot.js"]
  BOOT --> MAP["maps.{id}"]
  MAP --> ADPKEY["adapter key"]
  MAP --> GEO2["geojson path"]
  MAP --> META["grouping + whitelist + preprocess"]
  ADPKEY --> AF["atlas-adapter.js"]
```
