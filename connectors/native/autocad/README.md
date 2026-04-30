# CableTrayRoute AutoCAD Connector Bridge

This is SDK-ready source for a review-only AutoCAD .NET add-in bundle and local CableTrayRoute bridge workflow. It is not compiled by CableTrayRoute CI.

## Prerequisites

- AutoCAD, AutoCAD MEP, Civil 3D, or Plant 3D 2026, or a project-selected compatible version.
- AutoCAD .NET managed assemblies from the local installation.
- Bundle deployment through an Autodesk ApplicationPlugins folder.

## Install

Create or copy the bundle to one of:

- `%APPDATA%/Autodesk/ApplicationPlugins/CableTrayRoute.AutoCADConnector.bundle`
- `%PROGRAMDATA%/Autodesk/ApplicationPlugins/CableTrayRoute.AutoCADConnector.bundle`

Update `PackageContents.xml` after building the DLL.

## Commands

- `ExportCableTrayRouteJson` collects model-space entities, block references, handles, ObjectIds, layers, dimensions, lengths, tags, and mapping hints into a CableTrayRoute connector JSON package.
- `ImportCableTrayRoutePreview` reads a return package, writes a local preview report, and does not create, update, or delete drawing entities.
- `ValidateCableTrayRoutePackage` performs local structural checks against the connector contract before handoff.
- `OpenCableTrayRouteBridge` opens the local exchange folder and documents the expected bridge URL.

All commands are review-only. `OpenCableTrayRouteBridge` documents the file/local-HTTP bridge target (`http://localhost:41731/cabletrayroute/autocad-bridge`) for future desktop automation. Add project-specific drawing updates only after validating round-trip packages in CableTrayRoute.

## CI and build notes

CableTrayRoute CI validates JSON contracts, source text, and bundle manifests only. It does not reference or compile Autodesk DLLs. Build this project locally on a workstation with AutoCAD installed, then copy the compiled DLL into the bundle path referenced by `PackageContents.xml`.

AVEVA and SmartPlant native SDK bridges are not included in this AutoCAD starter. They remain separate deferred integrations.
