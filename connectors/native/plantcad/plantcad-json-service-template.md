# CableTrayRoute Plant CAD JSON Service Template

Shared validation and preview service contract for AVEVA E3D/PDMS and SmartPlant 3D native bridge implementations.

## ValidateCableTrayRoutePackage

- Parse connector JSON.
- Require `version: "bim-connector-contract-v1"`.
- Require connectorType `aveva` or `smartplant`.
- Reject duplicate `guid` / `sourceId` / native DBREF / ObjectId values.
- Reject malformed element rows missing `elementType` or stable source identity.
- Preserve issue rows, warnings, assumptions, property sets, and mapping hints.

## ImportCableTrayRoutePreview

- Return `acceptedElements` for structurally valid rows.
- Return `rejectedElements` with row-level errors.
- Return `quantityDeltas`, `mappingDeltas`, and `newIssues`.
- Do not mutate native AVEVA, PDMS, SmartPlant, or CableTrayRoute records.

## ExportCableTrayRouteJson

- Collect native model rows for CableTray, Conduit, Equipment, Support, Cable, GenericPlantObject, and IssueRecord.
- Capture tag/name, area, level, system, dimensions, length, quantity, sourceProperties, mappedProjectId, mappingConfidence, and warnings.
