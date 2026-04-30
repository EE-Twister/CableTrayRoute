# CableTrayRoute Plant CAD Connector Starter

This folder contains CI-safe source notes and pseudo-command templates for AVEVA E3D/PDMS and Hexagon SmartPlant 3D connector handoff.

CableTrayRoute does not compile or certify AVEVA or SmartPlant plugins in CI. Use these files as a contract-aligned starting point for project-specific SDK work.

## Supported V1 workflow

- Export CableTrayRoute connector JSON from BIM Coordination.
- Load the package into an AVEVA or SmartPlant project-specific command.
- Preview imported rows before any native model updates are authored.
- Return reviewed connector packages with stable IDs, quantities, mapping hints, and issue records.

## Required commands

- `ExportCableTrayRouteJson`
- `ImportCableTrayRoutePreview`
- `ValidateCableTrayRoutePackage`
- `OpenCableTrayRouteBridge`

All commands are review-only in V1. Native write-back, automatic model mutation, and certified deployment require a project-specific AVEVA or Hexagon SDK environment.

## Functional starter files

- `aveva-native-commands.pml`: PML-style command template for AVEVA E3D/PDMS export, validation, import preview, and bridge folder guidance.
- `smartplant-native-commands.md`: SmartPlant 3D SDK-ready command/service outline for the same review-only workflow.
- `plantcad-json-service-template.md`: shared JSON validation and preview service contract for both native environments.
- `plantcad-mapping-notes.md`: mapping coverage for trays, conduits, equipment, supports, cables, generic plant objects, quantities, properties, and issues.
