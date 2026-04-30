-- CableTrayRoute AVEVA E3D / PDMS connector pseudo-command template
-- This file documents the intended JSON handoff shape only.
-- Implement with the project-approved AVEVA SDK/PML environment outside CI.

!!CableTrayRouteContractVersion = 'bim-connector-contract-v1'
!!CableTrayRouteConnectorType = 'aveva'

-- ExportCableTrayRouteJson:
--   Collect equipment, tray, conduit, support, and cable objects.
--   Preserve stable DBREF/name/source identifiers in sourceId.
--   Write connector JSON with elements, quantities, propertySets, mappingHints, issues, warnings, assumptions.

-- ImportCableTrayRoutePreview:
--   Read a CableTrayRoute connector package.
--   Validate version, connectorType, stable IDs, categories, and quantities.
--   Present proposed rows for discipline review.
--   Do not mutate the AVEVA model in V1.

-- ValidateCableTrayRoutePackage:
--   Check the JSON package against the connector contract before handoff.

-- OpenCableTrayRouteBridge:
--   Open or document the project-selected file exchange folder / local bridge notes.
