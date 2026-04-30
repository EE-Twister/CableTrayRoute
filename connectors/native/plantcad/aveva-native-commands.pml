-- CableTrayRoute AVEVA E3D / PDMS functional native bridge template
-- CI-safe PML-style source. Adapt to the project-approved AVEVA SDK/PML environment.

!!CableTrayRouteContractVersion = 'bim-connector-contract-v1'
!!CableTrayRouteConnectorType = 'aveva'
!!CableTrayRouteExchangeFolder = '%PROJECT%/CableTrayRoute/PlantCadBridge'

define method .CableTrayRouteBridge.ExportCableTrayRouteJson()
  -- ExportCableTrayRouteJson
  -- Collect native DBREF, Name, Type, Zone, Site, System, Area, Level, dimensions, length, and quantity.
  -- Target classes include CableTray, Conduit, Equipment, Support, Cable, and GenericPlantObject.
  -- Write elements, quantities, propertySets, mappingHints, issues, warnings, and assumptions to connector JSON.
  -- Example selectors: collect all for CE where type eq 'CABLETRAY'; collect all equipment; collect all supports.
endmethod

define method .CableTrayRouteBridge.ValidateCableTrayRoutePackage(!jsonFile is STRING)
  -- ValidateCableTrayRoutePackage
  -- Check version, connectorType, duplicate DBREF/sourceId, malformed elements, unsupported categories, and issue rows.
  -- Return validation rows without model mutation.
endmethod

define method .CableTrayRouteBridge.ImportCableTrayRoutePreview(!jsonFile is STRING)
  -- ImportCableTrayRoutePreview
  -- Build accepted/rejected preview rows, quantity deltas, mapping deltas, and issue deltas.
  -- Do not create, delete, move, or modify AVEVA model objects in V1.
endmethod

define method .CableTrayRouteBridge.OpenCableTrayRouteBridge()
  -- OpenCableTrayRouteBridge
  -- Show the exchange folder, connector contract version, and CableTrayRoute bridge URL/readiness notes.
endmethod
