# Cable Schedule Workflow

The Cable Schedule page is optimized for fast entry first, with deeper routing and engineering fields available when needed.

## Basic Entry

- Use **Add Cable** to open the focused cable entry form.
- Use **Quick Add** to enter several cables at once with tag, termination, cable type, conductor size, length, and raceway fields.
- Use **Tag Settings** to define the automatic cable numbering pattern used by Add Cable and Quick Add.
- The default **Basic Entry** view shows identification, terminations, cable construction, electrical entry, and notes.
- Cable construction now includes **EGC Size** and **EGC Material**, and electrical entry includes **OCPD Rating (A)** plus **Terminal Temp (C)** for selected NEC 110.14(C), 240.4, and 250.122 screening in the Design Rule Checker.
- Advanced routing coordinates, manufacturer details, and calculated fields remain available through **View Preset**.

## Cable Typicals

- Use **Cable Library** to manage reusable cable constructions.
- Use **Load Starter Types** in the Cable Library to seed common saved cable types such as 600V Power, Control Cable, Instrument Pair, Ethernet, and Fiber.
- When adding a cable, select a typical to prefill construction fields, then enter the project-specific tag, terminations, raceway, and length.
- Use **Apply Typical** to update selected existing rows.

## Readiness

- The readiness panel summarizes total cables, schedule-ready cables, routing-ready cables, missing schedule fields, missing raceway assignments, duplicate tags, and the latest local change.
- A cable is **schedule-ready** when Tag, From/To, Conductor Size, and Length are complete.
- A cable is **routing-ready** when it is schedule-ready and also has a Raceway, Raceway ID(s), Route Preference, manual path, tray, conduit, or ductbank assignment.
- Fill and routing pages use routing-ready cables. Studies and reporting can still use schedule-ready cable records when raceway assignment is not required.
- Tag, From Tag, To Tag, and Actions stay visible while scrolling across the wide schedule.

## Validation

- Required schedule fields are Tag, From/To, Conductor Size, and Length.
- Raceway assignment is required for routing-ready status, but the schedule can be saved while routing assignments are still in progress.
- When Conductor Size and OCPD Rating are both entered for a power cable, Design Rule Checker screens selected NEC 240.4(D), 240.6(A), and terminal-temperature ampacity issues. Blank Terminal Temp lets the checker infer 60 C through 100 A equipment and 75 C above 100 A; enter the actual equipment termination rating when known.
- When EGC Size and OCPD Rating are both entered for a power cable, Design Rule Checker screens the selected copper EGC size against NEC 250.122. Non-copper EGC materials are flagged for manual verification rather than checked against the copper sizing breakpoints.
- When Raceway ID(s) point to a conduit record and cable OD or area is entered, Design Rule Checker screens selected NEC Chapter 9 Table 1 conduit fill limits. Missing conduit type/trade size or cable OD is reported as a data-quality warning.
- Missing required fields are highlighted after the field is touched, or when saving/exporting.
- Save and export show a summary when required fields are incomplete.

## Batch Editing

- Select rows with the row checkboxes and use **Batch Edit** to apply shared raceways, cable type, operating voltage, From Tag, or To Tag.
- Batch edits update the row Last Modified value and are recorded in the local change log.

## Import, Export, and Print

- XLSX import opens a mapping and preview step so spreadsheet headers can be matched to Cable Schedule fields before rows are imported.
- Import mode defaults to **Merge with existing rows**. Matching cable tags update blank fields, conflicting non-empty values are shown in the preview and preserved, and unmatched existing rows are not deleted unless **Replace current schedule** is selected.
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
