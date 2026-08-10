# Load List Workflow

The Load List page is designed for fast load entry first, with deeper engineering, demand, and procurement fields available through view presets.

## Basic Entry

- A new project shows the guided empty state without creating or displaying an unsaved placeholder row. The editable table appears after a load is added, imported, or loaded from the starter set.
- Use **Add Load** to open the focused load entry form.
- Use **Sample** to seed starter loads for motors, lighting, receptacles, HVAC, and UPS examples.
- Use **Basic Entry** view for the common fields needed to define and review loads.
- Enter optional motor nameplate horsepower in **HP**. HP is stored separately from kW and is not derived from it.
- **MCC Unit Type** uses the same choices as the MCC page: Main-MLO, Main-Breaker, Starter, VFD, Breaker, Feeder, Space, and Spare. Leave it on **Auto** to infer the MCC unit from Load Type.
- For starter units, use **Starter Type** to select FVNR, FVR, Soft Starter, Wye-Delta, Part-Winding, Two-Speed, Reduced Voltage Autotransformer, or Other. The field is disabled and cleared for non-starter units.
- Required readiness fields are Source, kW, Voltage, Power Factor, and Phases.

## Views

- **Basic Entry** keeps source, tag, description, electrical basics, circuit, and calculated values visible.
- **Electrical** focuses on voltage, kW, motor HP, power factor, phases, kVA, and current.
- **Demand** places demand factor and calculated demand kW/kVA immediately after source and tag so its defining values are visible without horizontal hunting.
- **Procurement** focuses on manufacturer, model, quantity, type, and notes.
- **Full Detail** shows all available columns.
- On narrow screens, the active view is rendered as editable row cards rather than a desktop-width grid. Secondary workflow shortcuts collapse so the first load record stays close to the top of the page.

## Batch Editing

- Select load rows with the row checkboxes and use **Batch** to apply shared source, load type, MCC unit type, starter type, voltage, phases, duty, or demand factor values.

## Import And Export

- **Import CSV** opens a mapping step when headers are present so non-native column names can be matched to Load List fields.
- **Import JSON** accepts native load data and can also map non-native object keys.
- Imports show replace and merge counts before changes are applied. Merge matches by `ref`, `id`, `tag`, or description and does not delete existing rows absent from the import.
- **Export CSV**, **Export JSON**, and **Copy Table** preserve HP, MCC unit type, and starter type, and include calculated kVA, current, demand kVA, and demand kW.

## Downstream Workflow

- Summary cards show total loads, connected kW, demand kVA, missing electrical fields, missing source values, and high-demand loads.
- Source / Panel fields suggest Equipment List tags when equipment records are available.
- Validation groups blockers by missing source, kW, voltage, power factor, and phases.
- The source summary groups totals by Source / Panel.
- When a load is sourced from an MCC, an explicit MCC Unit Type overrides the unit inferred from Load Type during lineup generation. For starter units, explicit HP, voltage, phases, and starter method can support a preliminary NEMA starter-size estimate when the MCC lineup is built or refreshed. Supported FVNR starters then receive a conservative generic bucket-height allowance from the estimated NEMA size. Explicit imported bucket dimensions take precedence, and other starter constructions remain unassigned. These are screening estimates, not procurement selections.
- Use the next-action strip to continue to One-Line once loads are complete, or continue directly to Cable Schedule when the project path does not need a diagram first.
