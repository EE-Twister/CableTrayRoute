# CableTrayRoute SmartPlant 3D Bridge Notes

This document is a CI-safe starter note for a future Hexagon SmartPlant 3D connector.

## Contract

- Contract version: `bim-connector-contract-v1`
- Connector type: `smartplant`
- Import mode: review-only preview
- Write-back mode: deferred

## Recommended command responsibilities

- `ExportCableTrayRouteJson`: collect SmartPlant object IDs, tags, system/area/level properties, dimensions, quantities, and issue references.
- `ImportCableTrayRoutePreview`: validate returned CableTrayRoute rows and show review differences before native model edits.
- `ValidateCableTrayRoutePackage`: reject stale contract versions, duplicate IDs, unsupported categories, and malformed rows.
- `OpenCableTrayRouteBridge`: open the agreed file exchange location or project bridge instructions.

Compiled deployment requires the project-approved SmartPlant 3D SDK/runtime and is outside CableTrayRoute CI.
