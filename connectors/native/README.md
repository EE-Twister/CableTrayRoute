# CableTrayRoute Native BIM/CAD Connector Starter Kit

This directory contains SDK-ready source templates for external desktop add-ins that exchange JSON packages with CableTrayRoute.

The templates are intentionally review-only. They expose command placeholders for:

- `ExportCableTrayRouteJson`
- `ImportCableTrayRoutePreview`
- `ValidateCableTrayRoutePackage`

Compiled and certified add-ins require the target desktop SDK, application install, signing policy, and project-specific QA outside the browser-local CableTrayRoute build.

## Contract

All templates target `bim-connector-contract-v1` from `analysis/bimConnectorContract.mjs`.

## Folders

- `revit/`: Autodesk Revit C# add-in starter.
- `autocad/`: AutoCAD .NET bundle starter.
- `shared/`: Contract notes shared by both templates.
