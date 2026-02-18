:::MERMAID
flowchart TD
  subgraph EXT["External Ownership"]
    U["User requests page"]
    WP["WordPress Runtime"]
  end

  subgraph PHPC["Atlas PHP Ownership"]
    PHP["tdw-atlas-engine.php (bootstrap + enqueue initiator)"]
    PRC["tdw-atlas-engine/includes/atlas-runtime-config.php"]
    PDB["tdw-atlas-engine/includes/atlas-db.php"]
    PREST["tdw-atlas-engine/includes/atlas-rest.php"]
    C["Shortcode renders div.tdw-atlas"]
  end

  subgraph SHARED["TDW Shared Modules (consumed by Atlas)"]
    M1["1) tdw-bridge"]
    M2["2) tdw-logger"]
  end

  subgraph ATLAS["Atlas Module Ownership"]
    M3["3) tdw-atlas-cookie-ops"]
    M4["4) tdw-atlas-api"]
    M5["5) tdw-atlas-core"]
    M6["6) tdw-atlas-leaflet"]
    M7["7) tdw-atlas-boot"]
  end

  subgraph DATA["Atlas Runtime Data"]
    CFG["/wp-json/tdw-atlas/v1/config (runtime endpoint)"]
    BOOTCFG["tdw-atlas-engine/atlas.config.json (bootstrap defaults)"]
    GEO["GeoJSON file (maps.*.geojson)"]
  end

  subgraph VENDOR["Dynamic Vendor Runtime"]
    V1["Leaflet ESM module"]
  end

  subgraph INIT["Runtime Initiators"]
    I1["Bridge initiates eager vendor contracts (Cookies)"]
    I2["CookieOps initiates early logging from cookie"]
    I3["Boot initiates config read + final logging state + map boot"]
    I4["Adapter initiates dynamic import(leafletJs)"]
  end

  subgraph RENDER["Atlas Runtime Outcome"]
    DBG["Apply config.debug (authoritative)"]
    CK["Sync tdw_atlas_debug cookie"]
    R["core.init(adapter, el, config, geojson)"]
    MAP["Rendered map or in-container error UI"]
  end

  U --> WP
  WP --> PHP
  PHP --> PRC
  PHP --> PDB
  PHP --> PREST
  PHP --> C
  PHP -->|"enqueue order"| M1
  M1 --> M2
  M2 --> M3
  M3 --> M4
  M4 --> M5
  M4 --> M6
  M5 --> M7
  M6 --> M7

  M1 --> I1
  M3 --> I2
  M7 --> I3
  M6 --> I4
  I4 --> V1

  C -->|"data-config-url"| M7
  M7 -->|"GET config"| CFG
  CFG -->|"route dispatch"| PREST
  PREST -->|"register_rest_route(tdw-atlas/v1/config)"| CFG
  PREST -->|"callback: tdw_atlas_get_effective_config()"| PRC
  BOOTCFG -->|"tdw_atlas_load_json_defaults()"| PRC
  PRC -->|"defaults + normalized runtime config"| PDB
  PDB -->|"seed/upgrade + maps from DB"| PRC
  CFG --> DBG
  DBG --> CK
  M7 --> GEO
  M7 --> R
  R --> MAP
:::
