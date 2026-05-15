# Raceway Schedule

The Raceway Schedule manages ductbanks, cable trays, and standalone conduits.

## Entry workflow

- Use **Sample** to load a working set of raceways.
- Use **Add Ductbank**, **Add Tray**, or **Add Conduit** to enter the common fields in a guided form.
- Ductbank conduits are created inside ductbank rows. Standalone conduits remain in the Conduit Schedule.
- Tray and conduit rows include **Material** so procurement, BIM export, and downstream BOM outputs can distinguish steel, aluminum, PVC, stainless steel, and fiberglass raceways.
- Use **Batch Edit** from a table's **More** menu to apply one field value to the visible filtered rows or every row. Ductbanks can batch edit either ductbank rows or the nested conduit rows.
- The top summary shows total raceways, ductbanks, trays, conduits, validation issues, and raceways currently assigned to cables.

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
