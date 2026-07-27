# Interoperability

This project exposes several import and export helpers to simplify
integration with other design tools.

## Report Bundles

`reports/exportAll.mjs` can assemble a ZIP archive containing:

- A consolidated PDF report generated from a Handlebars template.
- CSV files for equipment, panel, cable schedules (including cable- and busway-segment conductor metadata), and study results.
- Arc‑flash warning labels as individual SVG files.
- TCC plot metadata when available.

Use `exportAllReports()` from the one‑line editor to download `reports.zip`.

## One‑Line Diagram Exchange

The diagram editor can export basic CAD data:

- **DXF** – generated with `buildDXF()` and available via the **Export DXF**
  button.
- **DWG** – a lightweight placeholder produced from the same DXF data via the
  **Export DWG** button for quick sharing with DWG‑based tools.

## Equipment List Importers

Utility functions under `src/importers/equipment.js` provide very small CSV and
XML parsers. Each accepts an optional mapping object so columns or tags from
external tools can be matched to the field names used by the application's
`dataStore`.

```js
import { importEquipmentCSV, importEquipmentXML } from './src/importers/equipment.js';
```

These helpers return arrays of normalized equipment objects that can then be
passed to `dataStore.setEquipment()`.

## Manufacturer Catalog Metadata

Schedule and component rows can carry governed catalog fields:

- `manufacturer`
- `catalog_number` / `catalogNumber`
- `approved_part`
- `catalog_source`
- `catalog_last_verified`
- `datasheet_url`
- `bim_ref`
- `co2eKgPerUnit`
- `epdSource`
- `epdValidUntil`

Cost estimate line items, submittal preview/XLSX output, and Revit-compatible
JSON export preserve these fields so downstream estimating, procurement,
submittal, and BIM workflows can distinguish approved manufacturer parts from
generic or unreviewed placeholders. Approved rows must include source and
last-verified metadata.

The manufacturer catalog helper also calculates a catalog confidence status and
score from identity, approval, source/date, datasheet, BIM, standards/listing,
and EPD/CO2e evidence. Submittal XLSX exports include a **Catalog Traceability**
sheet with the confidence score, missing evidence list, datasheet URL, BIM
reference, standards, and EPD metadata for each schedule row.

`summarizeCatalogQuality(products, options)` rolls the same evidence up across a
whole catalog: totals by confidence status and approval status, the average
evidence score, the most common missing-evidence gaps, and how many rows carry
stale verification dates or expired EPDs.

## Manufacturer Catalog Management

The catalog browser mounted on the Tray Hardware BOM page (`src/catalogBrowser.js`)
merges `data/manufacturer_catalog.json` with the project's own catalog rows
(`settings.trayHardwareCatalogCustomProducts`) and manages the project rows:

- **Add / edit / remove.** Project rows can be edited in place or removed
  (remove requires a second confirming click). Base catalog rows are read-only,
  and the table's **Origin** column shows which is which. Edits and adds are
  keyed by governed identity (`manufacturer::catalogNumber`) through
  `upsertCatalogProduct` / `removeCatalogProduct`, so a project row cannot
  silently duplicate an existing catalog identity. Base identities are
  protected during catalog merges: a project row or import cannot replace a
  shipped row's approval, provenance, description, or commercial data.
- **Evidence fields.** The add/edit form captures the full governed set —
  approval authority, source, last-verified date, datasheet URL, standards, BIM
  family, EPD source/validity, and CO2e — so project rows can reach a
  **complete** catalog confidence status.
- **Filtering.** Rows can be filtered by category, manufacturer, material,
  approval status, catalog confidence status, origin, and free text. A summary
  above the table reports the confidence roll-up for the rows in view.
- **Import / export.** Imports accept CSV or XLSX using the template columns in
  `analysis/catalogImport.mjs`. Exports (`buildCatalogExportCsv`,
  `buildCatalogExportWorkbook`, and a JSON export of the filtered view) use the
  same column spec, so an exported catalog can be edited externally and
  re-imported without remapping headers. Imports may update an existing
  project-owned identity, but conflicts with protected base identities are
  blocked. Repeated manufacturer/catalog identities within one import file are
  also blocked instead of being silently collapsed.

Catalog matching is strict on the normalized manufacturer/catalog-number pair.
A matching catalog number from a different manufacturer does not inherit the
other manufacturer's approval. Governance dates must be real calendar dates in
`YYYY-MM-DD` form; impossible values such as `2026-02-31` are rejected.

### Catalog governance audit

`npm run audit:catalog` (`scripts/auditManufacturerCatalog.mjs`) runs the same
validation and confidence roll-up headlessly, so catalog data can be checked in
CI or before importing a vendor file:

```
node scripts/auditManufacturerCatalog.mjs [file] [--check] [--json] \
  [--min-score=<0-100>] [--min-complete=<0-1>] [--today=YYYY-MM-DD]
```

It accepts either a `{ products: [...] }` payload or a bare product array,
prints the confidence roll-up, ranked evidence gaps, and the lowest-confidence
rows, and with `--check` exits non-zero on schema errors or unmet thresholds.
The npm script uses `--check` with no thresholds, so it guards schema validity
without pinning the seed catalog's current evidence coverage.

The shipped seed rows in `data/manufacturer_catalog.json` are illustrative,
unreviewed placeholders. They are deliberately not approved and do not claim
manufacturer verification. Replace them with project rows backed by actual
manufacturer catalog numbers, datasheets, and the project's approval authority
before using the data for procurement, submittals, BIM, or estimates.
