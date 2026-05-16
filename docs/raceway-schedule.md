# Raceway Schedule

The Raceway Schedule manages ductbanks, cable trays, and standalone conduits.

## Entry workflow

- Use **Sample** to load a working set of raceways.
- Use **Add Ductbank**, **Add Tray**, or **Add Conduit** to enter the common fields in a guided form.
- Ductbank conduits are created inside ductbank rows. Standalone conduits remain in the Conduit Schedule.
- Tray and conduit rows include **Material** so procurement, BIM export, and downstream BOM outputs can distinguish steel, aluminum, PVC, stainless steel, and fiberglass raceways.
- Use **Batch Edit** from a table's **More** menu to apply one field value to the visible filtered rows or every row. Ductbanks can batch edit either ductbank rows or the nested conduit rows.
- The top summary shows total raceways, ductbanks, trays, conduits, validation issues, assigned raceways, missing IDs, missing geometry, and unused raceways.
- The next-action strip points to the highest-value repair or continuation step, such as fixing IDs, completing geometry, returning to Cable Schedule for assignments, or continuing into fill checks.

## Views and filters

Use the **View** menu to switch between Basic Entry, Geometry, Fill / Grouping, BIM Export, and Full Detail. The choice is saved with the project settings.

Quick filters help isolate rows that need attention:

- Missing Geometry
- Duplicate IDs
- Unused
- Assigned
- Ductbank Conduits
- Standalone Conduits

## Validation

The page validates missing IDs, duplicate IDs, missing or zero-length geometry, invalid tray dimensions, invalid slot-group JSON, and illegal conduit type / trade-size combinations.

## Field View QR Targets

Tray hardware outputs include a Field View URL for each tray row. The QR payload
for a tray is `fieldview.html#tray=TRAY_ID`, so scanning a tray tag opens the
mobile tray card instead of the full desktop Raceway Schedule.

## Import behavior

- Tray and conduit XLSX imports open a mapping and preview step before data is applied.
- Ductbank XLSX imports now preview ductbank and nested conduit creates, updates, conflicts, and unchanged rows before applying.
- Import mode defaults to **Merge with existing rows** so matching raceway IDs can fill blank fields without deleting existing rows.
- Conflicting non-empty values are surfaced in the preview and the existing schedule value is preserved. Use **Replace current schedule** only when the spreadsheet should become the authoritative schedule.
