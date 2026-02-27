# Module Dependencies Diagram

```mermaid
flowchart TD
  M1["tdw-bridge"] --> M2["tdw-logger"]
  M2 --> M3["tdw-atlas-cookie-ops"]
  M3 --> M4["tdw-atlas-adapter"]
  M4 --> M5["tdw-atlas-core"]
  M5 --> M6["tdw-atlas-boot"]
  M6 --> P1["assets/js/runtime/atlas-map-pipeline.js"]
  M4 -."dynamic import".-> A1["assets/adapter/leaflet/atlas-leaflet.js"]
  A1 -."dynamic import".-> V1["Leaflet ESM"]
```
