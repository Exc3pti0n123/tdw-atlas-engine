:::MERMAID
flowchart TD
  subgraph EXT["External Ownership"]
    U["User requests page"]
    WP["WordPress Runtime"]
  end

  subgraph PHPC["Atlas PHP Ownership"]
    PHP["tdw-atlas-engine.php (enqueue initiator)"]
    C["Shortcode renders div.tdw-atlas (if id exists)"]
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
    CFG["atlas.config.json"]
    GEO["GeoJSON file"]
  end

  subgraph INIT["Runtime Initiators"]
    I1["Bridge initiates eager vendor contracts (Cookies)"]
    I2["CookieOps initiates early logging from cookie"]
    I3["Boot initiates config read + final logging state + map boot"]
  end

  subgraph RENDER["Atlas Runtime Outcome"]
    DBG["Apply config.debug (authoritative)"]
    CK["Sync tdw_atlas_debug cookie"]
    R["core.init(adapter, el, config, geojson)"]
    MAP["Rendered map or in-container error UI"]
  end

  U --> WP
  WP --> PHP
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

  M7 --> CFG
  CFG --> DBG
  DBG --> CK
  M7 --> GEO
  M7 --> R
  R --> MAP
:::
