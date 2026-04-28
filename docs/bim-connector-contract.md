# BIM/CAD Connector Contract

CableTrayRoute does not ship a native Revit, AutoCAD, AVEVA, or SmartPlant plug-in. The connector contract is the browser-local exchange format those tools can target later through a desktop add-in, script, or export adapter.

## Contract

Connector packages are JSON-safe records with `version: "bim-connector-contract-v1"`. The stable top-level fields are:

- `version`
- `connectorType`: `revit`, `autocad`, or `generic`
- `sourceApplication`
- `sourceVersion`
- `projectId`
- `scenario`
- `createdAt`
- `elements`
- `quantities`
- `issues`
- `propertySets`
- `mappingHints`
- `warnings`
- `assumptions`

Element rows reuse the BIM Coordination fields:

- `guid`
- `sourceId`
- `elementType`
- `tag`
- `name`
- `level`
- `area`
- `system`
- `dimensions`
- `lengthFt`
- `quantity`
- `mappedProjectId`

Each element should include at least one stable identifier: `guid`, `sourceId`, `id`, or `tag`. Native add-ins should prefer real BIM GUIDs or authoring-tool unique IDs.

## Reference Fixtures

Reference packages live under `examples/bim-connectors/`:

- `project-state.json`: CableTrayRoute project-state fixture used for validation previews.
- `revit-return-package.json`: Revit-style connector return package.
- `autocad-return-package.json`: AutoCAD-style connector return package using source IDs.
- `generic-return-package.json`: Generic/IFC-style connector return package.

These fixtures are intentionally small. They are examples of the exchange contract, not exports from Autodesk or plant-design SDKs.

## Validator

Run the validator with Node:

```bash
node tools/bim-connector-validator.mjs examples/bim-connectors/revit-return-package.json --project-state examples/bim-connectors/project-state.json --pretty
```

Compare a returned package against a previous connector package:

```bash
node tools/bim-connector-validator.mjs examples/bim-connectors/revit-return-package.json --previous examples/bim-connectors/generic-return-package.json --project-state examples/bim-connectors/project-state.json --pretty
```

Write a validation report:

```bash
node tools/bim-connector-validator.mjs examples/bim-connectors/autocad-return-package.json --project-state examples/bim-connectors/project-state.json --out connector-validation-report.json --pretty
```

The validator returns exit code `1` when the connector package has validation errors. Use `--no-fail` when producing a report from a known-bad package during development.

## Review-Only Import

Connector import preview is intentionally review-only:

- Accepted BIM rows can be added to BIM Coordination after user review.
- Rejected rows are reported but not written.
- Imported issues become local BCF-style issue records only after acceptance.
- Quantity and mapping deltas are advisory; schedules, routes, equipment, and authoring models are not mutated automatically.

## Native Add-In Expectations

A future Revit or AutoCAD adapter should:

- Preserve stable IDs across exports and imports.
- Populate `mappingHints` with project IDs or tags when known.
- Include quantity rows grouped by element type, system, voltage class, level, and area.
- Return open issue records with stable issue IDs.
- Keep any tool-specific metadata in `propertySets` or `sourceProperties`, not in new top-level fields.

The deterministic schema descriptor is exported as `BIM_CONNECTOR_PACKAGE_SCHEMA` from `analysis/bimConnectorContract.mjs`.
