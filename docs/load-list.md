# Load List Workflow

The Load List page is designed for fast load entry first, with deeper engineering, demand, and procurement fields available through view presets.

## Basic Entry

- Use **Add Load** to open the focused load entry form.
- Use **Sample** to seed starter loads for motors, lighting, receptacles, HVAC, and UPS examples.
- Use **Basic Entry** view for the common fields needed to define and review loads.
- Required readiness fields are Source, kW, Voltage, Power Factor, and Phases.

## Views

- **Basic Entry** keeps source, tag, description, electrical basics, circuit, and calculated values visible.
- **Electrical** focuses on voltage, kW, power factor, phases, kVA, and current.
- **Demand** focuses on load factor, demand factor, and demand kW/kVA.
- **Procurement** focuses on manufacturer, model, quantity, type, and notes.
- **Full Detail** shows all available columns.

## Batch Editing

- Select load rows with the row checkboxes and use **Batch** to apply shared source, load type, voltage, phases, duty, or demand factor values.

## Import And Export

- **Import CSV** opens a mapping step when headers are present so non-native column names can be matched to Load List fields.
- **Import JSON** accepts native load data and can also map non-native object keys.
- **Export CSV**, **Export JSON**, and **Copy Table** include calculated kVA, current, demand kVA, and demand kW.

## Downstream Workflow

- Summary cards show total loads, connected kW, demand kVA, missing electrical fields, missing source values, and high-demand loads.
- The source summary groups totals by Source / Panel.
- Use **Demand**, **Panel**, and **One-Line** actions to continue into demand scheduling, panel assignment, and one-line work.
