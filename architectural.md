:::MERMAID
flowchart TB
  subgraph EXTERNAL["EXTERNAL (WordPress / Page)"]
    U["User loads page"]
    WP["WordPress (PHP)"]
    subgraph WPC["WP-Container (only design classes, no id!)"]
      SC["Shortcode [tdw_atlas id='...']"]
      subgraph OUTPUT["Plugin-Container"]
        HTML["MAP"]
      end
    end
  end

  subgraph INTERNAL["Plugin TDW-Atlas"]
    PHP["tdw-atlas-engine.php (Init Plugin)
    - enqueues all js-files"]
    BOOT["atlas-boot.js (module)"]
    API["atlas-api.js (module): namespace + registry, getAdapter(name)"]
    CORE["atlas-core.js (module): createCore(), loads config + geojson, calls adapter.init(...)"]
    ADAPT["atlas-leaflet.js (module): adapter.init({el, config, geojson, leaflet}), render + fitBounds"]
    VENDOR["Leaflet vendor (JS/CSS) (constructors)"]
    CFG["atlas.config.json"]
    GEO["GeoJSON file (data/...)"]
  end

  U --> WP
  WP --> SC

  SC -->|"calls"| PHP

  PHP -->|"create container"| OUTPUT

  OUTPUT -->|"Container-Element div[data-tdw-atlas] triggers"| BOOT
  BOOT -->|"API.createCore(...)"| API
  API -->|"expone window.TDW.Atlas.Core.create"| CORE
  CORE -->|"API.getAdapter('leaflet')"| API
  CORE <-->|"gets map data"| CFG
  CORE -->|"load"|GEO
  CORE -->|"adapter.init({el, geojson})"| ADAPT
  API -->|"lookup"|ADAPT
  ADAPT <--> VENDOR
  ADAPT -->|"render map"| HTML
:::