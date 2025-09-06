# Interoperability

This project exposes several import and export helpers to simplify
integration with other design tools.

## Report Bundles

`reports/exportAll.mjs` can assemble a ZIP archive containing:

- A consolidated PDF report generated from a Handlebars template.
- CSV files for equipment, panel, cable schedules and study results.
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
