# One-Line Data Manager

The **One-Line Data Manager** is a tabular companion to the graphical One-Line editor. Use it to review and consistently update common component data across a project scenario.

## Review and filters

- Search component ID, tag, label, type, subtype, sheet, or layer.
- Filter to one sheet or component type.
- Export the currently displayed rows to CSV or XLSX for review or handoff.
- Use **Preview Spreadsheet Updates** to review an exported or compatible CSV/XLSX workbook before applying tabular updates back to the active One-Line.

## Controlled edits

Each row can update a component’s label, tag, rated voltage, rated current, layer, and position lock. Select rows to apply a shared rated voltage, rated current, layer, or lock state in one batch.

Every accepted edit is written through the One-Line project store, so the previous drawing state is retained by the existing One-Line revision history. The Data Manager does not create components, edit topology or connections, run studies, establish result freshness, or approve an engineering result.

Numerical ratings must be greater than zero. Clearing a layer through the batch control removes the layer assignment; it does not delete the layer or any component.

## Spreadsheet update review

CSV and XLSX updates match the current model by **Component ID**. The controlled imported columns are `Label`, `Tag`, `Rated Voltage (kV)`, `Rated Current (A)`, `Layer`, and `Position Locked`. The preview lists every field that would change and separately reports unmatched component IDs, duplicate IDs, and invalid values. Nothing is written until **Apply Reviewed Spreadsheet Updates** is selected.

XLSX exports use a `One-Line Data` worksheet. XLSX import prefers that worksheet when it is present, otherwise it reads the first worksheet. Workbooks are limited to 20 worksheets and 10,000 imported rows; all other worksheets are ignored. If the One-Line changes after previewing a file, the import preview is regenerated and must be reviewed again. This prevents applying a review based on an older model state.
