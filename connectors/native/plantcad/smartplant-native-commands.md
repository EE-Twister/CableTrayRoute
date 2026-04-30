# CableTrayRoute SmartPlant 3D Functional Native Bridge Template

This CI-safe template describes SDK-ready command and service responsibilities for a Hexagon SmartPlant 3D connector. Compile and adapt it only in a licensed project SDK environment.

## Commands

- `ExportCableTrayRouteJson`: query SmartPlant 3D objects by ObjectId, tag/name, system, area, level, class, dimensions, length, and quantity. Export CableTray, Conduit, Equipment, Support, Cable, GenericPlantObject, property sets, mapping hints, issue records, warnings, and assumptions.
- `ValidateCableTrayRoutePackage`: read connector JSON, validate `bim-connector-contract-v1`, require connectorType `smartplant`, reject duplicate source IDs and malformed element rows, and report validation rows.
- `ImportCableTrayRoutePreview`: produce accepted/rejected preview rows, quantity deltas, mapping deltas, issue deltas, and recommended next actions. Keep native model mutation disabled.
- `OpenCableTrayRouteBridge`: open or document the project exchange folder and local CableTrayRoute bridge/readiness URL.

## Service Outline

- `SmartPlantConnectorJsonService.CollectObjects()` queries SmartPlant object classes and preserves ObjectId as `sourceId`.
- `SmartPlantConnectorJsonService.WritePackage()` serializes connector payloads with elements, quantities, propertySets, mappingHints, issues, warnings, and assumptions.
- `SmartPlantConnectorJsonService.BuildPreview()` validates return packages and returns review-only accepted/rejected rows.
