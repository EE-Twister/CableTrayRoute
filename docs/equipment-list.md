# Equipment List Workflow

The Equipment List is the first project workflow step. It can still be used as a standalone equipment schedule, but integrated projects use equipment tags as references for loads, one-line components, panels, cables, and reports.

## Entry And Review

- Use **Add Equipment** for a focused form with tag, voltage, category, arrangement, lineup, manufacturer, model, phases, and notes.
- Use **Load Starter Equipment** to seed a realistic switchboard, MCC, transformer, panel, and process equipment set.
- Summary cards track total equipment, missing tags, duplicate tags, missing voltage, missing manufacturer, and assigned arrangements.
- Empty projects show primary actions for adding equipment, importing equipment, or loading starter equipment.
- Right-click an equipment row (or press Shift+F10 while the row is focused) and choose **View on One-Line**. The action is kept out of the tag cell so every row remains compact and editable.

## Bulk Updates

Select rows and use the bulk actions to update category, arrangement, or lineup through modals. This avoids prompt-based edits and makes the affected row count visible before applying the change.

## Import Behavior

CSV, XLSX, and XML imports show a mapping preview before applying data. After mapping, the import preview shows replace and merge counts. Merge matches existing records by `ref`, `id`, or `tag` and does not delete rows that are absent from the import.

Stored project text is checked for common UTF-8 mojibake during migration. Older sample descriptions containing sequences such as `â€”` are repaired when the project is opened.

## Workflow Navigation

Use the workflow navigation to return to the Dashboard or Home, continue to Load List, or jump to One-Line when the equipment basis is ready for diagram work.
