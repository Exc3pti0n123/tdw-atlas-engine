# Runtime Preprocessor Flow

This diagram mirrors the current processing chain in:
`assets/js/runtime/atlas-preprocessor.js`.

```mermaid
flowchart TD
  A["preparePreprocessedBundle({ mapData, mapMeta, mapConfig })"] --> A0{"preprocess.enabled?"}
  A0 -- "false" --> P0["buildPassthroughPreprocessedBundle(mapData)"]
  A0 -- "true" --> B["buildWhitelistModel(mapMeta.whitelist)"]
  B --> C["buildCountryGrouping(mapMeta.grouping, sourceMapData, whitelistModel)"]
  C --> D["prepareRuntimeMapData(sourceMapData, options.preprocess, whitelistModel)"]
  D --> E{"preprocess.enabled?"}
  E -- "false" --> E0["task=keepAll, partRules={}, geometryQuality defaults"]
  E -- "true" --> E1["resolve task/partRules/geometryQuality from preprocess config"]
  E0 --> F["Loop source features"]
  E1 --> F

  F --> G{"Country code valid and included by whitelist?"}
  G -- "No" --> F
  G -- "Yes" --> H["splitToPolygonFeatures"]
  H --> I{"Source geometry type = MultiPolygon?"}
  I -- "Yes" --> J["applyMicroPolygonCleanup(absMinArea, relMinRatio)"]
  I -- "No" --> K["skip micro cleanup, use split parts as-is"]
  J --> L["applyMultiPolygonTask(keepLargest/keepAll/keepTopN/dropParts)"]
  K --> L
  L --> M["setPolygonId"]
  M --> N["applyGeometryQuality(minArea, minVertices)"]
  N --> O["applyPartRules(keep/drop/promote)"]
  O --> O1["push ruled parts into runtimeFeatures and update audit"]
  O1 --> F

  F --> P["validateOutput(runtimeFeatures)"]
  P --> Q["emitArtifacts(countryRuntimeMap, audit)"]
  Q --> R{"grouping enabled and region layer requested?"}
  R -- "No" --> S["return countryRuntimeMap only"]
  R -- "Yes" --> T["applyCountryGroupingToRuntimeMap"]
  T --> U["toRegionLayerRuntimeMap"]
  U --> V["return runtime bundle (country/region maps + grouping + diagnostics)"]
  P0 --> V0["return passthrough runtime bundle"]
```

## Step-Order Testability Matrix

| Case | preprocess.enabled | whitelist.enabled | grouping.mode | partRules present | Expected runtime bundle |
| --- | --- | --- | --- | --- | --- |
| passthrough | `false` | any | any | any | country map only passthrough, grouping/whitelist/part-rules ignored |
| grouped-set | `true` | `true` | `set` | `false` | country + optional region layer from set mapping |
| grouped-geojson | `true` | `true` | `geojson` | `false` | country + optional region layer from GeoJSON property |
| ungrouped | `true` | `true` | `off` | `false` | country map only, no region layer |
| part-rules | `true` | `true` | `set` | `true` | country map reflects keep/drop/promote overrides before grouping layer build |
| whitelist-off | `true` | `false` | `set` | `false` | whitelist step bypassed, grouping still applied |

## Admin Mapping Matrix (Residual #32)

| Future Admin control | Runtime field | Pipeline impact |
| --- | --- | --- |
| Enable preprocess | `maps.{id}.preprocess.enabled` | selects passthrough vs full preprocess branch |
| Enable whitelist | `maps.{id}.whitelist.enabled` | include/exclude gate in whitelist step |
| Grouping mode selector | `maps.{id}.grouping.mode` | chooses `set`, `geojson`, or `off` grouping path |
| Grouping set selector | `maps.{id}.grouping.setKey` | resolves `countryToRegion` source for `set` mode |
| GeoJSON grouping property | `maps.{id}.grouping.geojsonProperty` | resolves grouping key for `geojson` mode |
| Multipolygon default task | `maps.{id}.preprocess.multiPolygon.default` | selects keep/drop strategy after split |
| Multipolygon country override | `maps.{id}.preprocess.multiPolygon.countries[ISO2]` | per-country task override |
| Micro cleanup thresholds | `maps.{id}.preprocess.microPolygonCleanup.*` | drop tiny split parts before task |
| Part rules editor | `maps.{id}.preprocess.partRules[]` | explicit keep/drop/promote override stage |

## Ownership Matrix

| Concern | Owner |
| --- | --- |
| Container discovery, config fetch, cache key | Boot (`assets/js/atlas-boot.js`) |
| GeoJSON transformation, whitelist/grouping/preprocess | Preprocessor (`assets/js/runtime/atlas-preprocessor.js`) |
| Stage machine, layer mount, pointer events, preview coupling | Adapter (`assets/adapter/leaflet/*.js`) |
