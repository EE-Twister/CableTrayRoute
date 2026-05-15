# Cable Schedule Workflow

The Cable Schedule page is optimized for fast entry first, with deeper routing and engineering fields available when needed.

## Basic Entry

- Use **Add Cable** to open the focused cable entry form.
- Use **Quick Add** to enter several cables at once with tag, termination, cable type, conductor size, length, and raceway fields.
- Use **Tag Settings** to define the automatic cable numbering pattern used by Add Cable and Quick Add.
- The default **Basic Entry** view shows identification, terminations, cable construction, electrical entry, and notes.
- Advanced routing coordinates, manufacturer details, and calculated fields remain available through **View Preset**.

## Cable Typicals

- Use **Cable Library** to manage reusable cable constructions.
- Use **Load Starter Types** in the Cable Library to seed common saved cable types such as 600V Power, Control Cable, Instrument Pair, Ethernet, and Fiber.
- When adding a cable, select a typical to prefill construction fields, then enter the project-specific tag, terminations, raceway, and length.
- Use **Apply Typical** to update selected existing rows.

## Readiness

- The readiness panel summarizes total cables, routing-ready cables, missing raceway assignments, missing conductor sizes, duplicate tags, and the latest local change.
- A cable is considered routing-ready when Tag, Conductor Size, Length, and Raceway(s) are complete.
- Tag, From Tag, To Tag, and Actions stay visible while scrolling across the wide schedule.

## Validation

- Required fields are Tag, Conductor Size, Length, and Raceway(s).
- Missing required fields are highlighted after the field is touched, or when saving/exporting.
- Save and export show a summary when required fields are incomplete.

## Batch Editing

- Select rows with the row checkboxes and use **Batch Edit** to apply shared raceways, cable type, operating voltage, From Tag, or To Tag.
- Batch edits update the row Last Modified value and are recorded in the local change log.

## Import, Export, and Print

- XLSX import opens a mapping step so spreadsheet headers can be matched to Cable Schedule fields before rows are imported.
- **Report Options** supports visible-column, full-schedule, routing-ready, and missing-data XLSX/print outputs.
- The print action creates a read-only report table so printed schedules do not depend on inline form controls.

## Row Actions

- **Edit** opens the full cable details form for an existing row.
- **Insert** adds a blank row below the current row for quick inline entry.
- **Copy** duplicates a row and assigns a unique tag when possible.
- **Delete** removes the row.

## Change Tracking

- Each row includes a read-only **Last Modified** field.
- **Change Log** shows recent local actions such as quick adds, imports, batch edits, typical application, sample loading, and saves.
