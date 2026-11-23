# Equipment List Workflow

The Equipment List is the first project workflow step. It can still be used as a standalone equipment schedule, but integrated projects use equipment tags as references for loads, one-line components, panels, cables, and reports.

The page keeps the editable schedule in the primary viewport. Project context is condensed into a short header and status chips, starter data stays available in the main action row, and column customization, import/export, and bulk-edit commands are grouped into menus. The empty-state guide only appears when the schedule has no equipment records.

## Entry And Review

- Use **Add Equipment** for four core fields: tag, description, voltage, and category. A collapsed **More details** section includes arrangement, lineup, manufacturer, model, phases, electrical input kW, power factor, duty, power rating basis, and notes. Select **Save and add another** when entering several records in sequence.
- Use **Load Starter Equipment** to seed a realistic switchboard, MCC, transformer, panel, and process equipment set.
- Use **Core** for day-to-day tag, description, voltage, category, arrangement, lineup, and phase review. **Layout**, **Procurement**, and **Full** expose the corresponding specialist columns without forcing the full schedule into the default view.
- Summary cards track total equipment, missing tags, duplicate tags, missing voltage, missing manufacturer, and assigned arrangements.
- Empty projects show one focused start panel for adding equipment, importing an equipment list, or loading starter equipment. The populated-list toolbar, summary, filters, and empty table stay hidden until a record exists.
- Right-click an equipment row (or press Shift+F10 while the row is focused) and choose **View on One-Line**. The action is kept out of the tag cell so every row remains compact and editable.

## Bulk Updates

Select rows and use the bulk actions to update category, arrangement, or lineup through modals. This avoids prompt-based edits and makes the affected row count visible before applying the change.

## Import Behavior

CSV, XLSX, and XML imports show a mapping preview before applying data. After mapping, the import preview shows replace and merge counts. Merge matches existing records by `ref`, `id`, or `tag` and does not delete rows that are absent from the import.

Electrical input kW, power factor, duty, and power rating basis can be mapped during import and edited in the schedule. Enter electrical input kW rather than assuming a motor's mechanical output rating is electrical input. The [project equipment handoff](design-synthesis-project-equipment.md) explains the additional basis confirmations and design checks.

For motor screening, the full column view and **More details** include motor rated voltage, design full-load current and its reference, nameplate current, optional nameplate horsepower and frequency, locked-rotor current and power factor, starter type, and rotor type. The same fields can be mapped from imports. Supply these values from the applicable motor and design basis; design full-load current, nameplate current, and locked-rotor current have different uses and are not interchangeable. The current starting model supports explicit direct-on-line (`dol`) starting. These entries do not establish complete motor protection or enable motor Apply.

For selected equipment rows, **Bulk Edit → Use Motor Reference Data** offers two
explicit ABB Baldor 460 V, 60 Hz motor models: GNEM2332T (10 hp) and CCPX32446T
(40 hp). It copies the nameplate and typical starting values from the referenced
manufacturer packet and retains the source, page, and file hash in the motor
data reference field. Typical starting values are not guaranteed; choosing a
model is a preliminary design choice, not proof of an installed motor. A
conflicting existing field, unsupported circuit or equipment classification,
or nested motor record blocks the whole batch. The action does not set the
design FLC, design FLC reference, load kW, running power factor, rotor type,
source impedance, or installation basis by default. Supply and review those separately
before the equipment handoff and starting screen can run. A separate 40 hp
branch-breaker research candidate requires additional project inputs and checks;
selecting motor reference data alone does not establish an assembly fit.

The optional **Use typical 100%-rated-load operating kW and power factor**
checkbox uses the selected packet's 460 V, 60 Hz, 100%-load efficiency and
power factor: GNEM2332T 91.1% and 0.61; CCPX32446T 94.2% and 0.83. Electrical
input kW is horsepower × 0.7457 / efficiency, as described in the
[U.S. Department of Energy motor-load guide](https://www.energy.gov/sites/prod/files/2014/04/f15/10097517.pdf).
The picker previews the values and requires an explicit 460 or 480 V,
three-phase circuit. A supplied circuit frequency must be 60 Hz. This uses typical, not guaranteed, full-load performance;
continuous operation and constant electrical power at 480 V are screening
assumptions, not measured conditions. Existing contradictory operating inputs
block the whole batch. The saved reference binds the exact source, model, circuit,
ratings, and result; changed values require review again. It does not supply a
design FLC, verify installation, or complete motor protection.

For mixed motor projects, the full view and **More details** accept a motor
proposed instantaneous pickup. A number overrides the project-wide proposed
setting for that motor; `none` explicitly leaves it unset; blank inherits the
project setting. These are preliminary inputs, not verified installed settings.
The design screen checks the chosen value against the exact candidate breaker.

For the limited 40 hp / 70 A breaker research candidate, **Full** view,
**More details**, and import mapping also provide a motor-specific breaker
enclosure temperature and its reference. Enter a published table point from
40 through 70 °C in 5 °C steps with a nonblank reference. Blank fields inherit
the project basis; enter `none` in the temperature field and leave the reference
blank to explicitly suppress inheritance. The handoff blocks partial or
conflicting values, and the screen does not transfer this table to other motor
breaker candidates. These values do not verify installed conditions.

**Bulk Edit → Review Motor Design Current** can propose an explicitly reviewed
screening basis for 10 or 40 hp, 460 V, 60 Hz, three-phase, squirrel-cage DOL
motors on a 460/480 V circuit. Enter the motor nameplate current, horsepower,
frequency, voltage, rotor type and starter type first. The preview compares the
nameplate current to the corresponding historical 2017 table value (14 A at
10 hp; 52 A at 40 hp) and proposes the larger value as an application screening
policy. The source is linked and saved with the basis. This policy does not
establish compliance, suitability for special or low-speed motors, or complete
motor protection. The applicable edition and installation still need qualified
review. Existing independent current bases are never replaced. Changes to the
bound ratings invalidate the generated basis; rerun the review to refresh it,
or enter and document a separate basis. A conflicting or unsupported row blocks
the entire batch.

Stored project text is checked for common UTF-8 mojibake during migration. Older sample descriptions containing sequences such as `â€”` are repaired when the project is opened.

The Equipment List represents physical equipment, not cable relationship records. Cable **From** and **To** values remain in the Cable Schedule and are linked internally with stable IDs where a corresponding schedule entity exists. Sample imports no longer create synthetic “cable endpoint” equipment rows for free-form termination tags; sample validation reports unlinked terminations as warnings instead. Projects created from older samples show **Remove Generated Endpoint Rows** only when rows match the complete legacy-generated signature. The cleanup is user-confirmed and leaves cable termination data unchanged.

## Workflow Navigation

Use the workflow navigation to return to the Dashboard or Home, continue to Load List, or jump to One-Line when the equipment basis is ready for diagram work.
