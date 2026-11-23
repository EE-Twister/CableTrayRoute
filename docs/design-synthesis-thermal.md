# Route thermal screening in design synthesis

Overall review class: **Screening only**. This is a tabulated ampacity check
for the generator's supported copper multicore MC cable construction. It does
not predict cable temperature or apply the detailed direct-burial model to a
different cable construction.

## Engineering basis

Eaton's [Cable Tray Manual](https://www.eaton.com/content/dam/eaton/products/support-systems/cable-management/ct-manual.pdf),
printed MAN-30 (PDF page 31), distinguishes multicore ampacity from single-core
tray rules. Multicore cables use the applicable conduit/cable table baseline,
with temperature correction. Counting every conductor in a tray as a single
bundle is inappropriate. The manual also describes a 0.95 multiplier for
continuous solid unventilated covering longer than six feet. Its following page
describes the separate single-conductor factors. This is an older explanatory
manual, not verification of a project's complete adopted code edition.

Southwire's [Power Cable Installation Guide](https://www.southwire.com/medias/Power-Cable-Installation-Guide-Southwire.pdf?context=bWFzdGVyfGluc3RhbGxhdGlvbi1tYW51YWxzfDUyNjUxMjd8YXBwbGljYXRpb24vcGRmfGluc3RhbGxhdGlvbi1tYW51YWxzL2hjNS9oY2QvODg4NzY3NjA3NjA2Mi5wZGZ8ZWQ4NzVkYjliNjZmZmQ5MDM5ODkxNzRiOGQ2MzE0NTA0ODk2ZDEwZGI3YzAxYTU4MzE1MmI2NWI1ZWIzOGQyMQ)
table 6-8, printed 6-31 (PDF page 86), reproduces a 30 C ambient table and its
corrections. The independent fixture uses 75 C copper ampacities of 420 A for
600 kcmil and 475 A for 750 kcmil. At 40 C, the 0.88 correction gives 369.6 A
and 418 A respectively. A 400 A protective selection therefore requires the
larger candidate. At 45 C, 475 × 0.82 = 389.5 A, so that candidate cannot
satisfy the same requirement. This published table is an older code
reproduction; matching these numbers does not establish full code compliance.

Both references were inspected on September 18, 2026. No manufacturer thermal
layer properties, loss factors, bonding arrangements, or engineering approval
were inferred from these tables.

## Installation assumptions

The workspace provides global ambient/grouping inputs and per-corridor
overrides. Blank overrides inherit global values; blank global ambient and
grouping inputs use 30 C and three respectively. Solid-cover length is optional.
The input representation is:

```json
{
  "criteria": {
    "ambientTempC": 30,
    "bundledConductors": 3,
    "thermal": { "method": "nec-table-screening", "solidCoverContinuousLengthFt": 0 }
  },
  "corridorEdge": {
    "id": "E01",
    "thermal": { "ambientTempC": 40, "solidCoverContinuousLengthFt": 8 }
  }
}
```

The `corridorEdge` example represents an entry in `corridors.edges`; keep its
existing endpoints and dimensions. The cover length describes a continuous
solid unventilated covered span, not a separate inferred length per edge. Enter
the applicable span on affected edges; the model does not infer continuity
across multiple short covered edges. A local zero overrides a global cover.
Unknown thermal fields and unsupported methods block generation.

Each cable carries `thermalAssessment`, including segment conditions,
adjustment factors, the limiting segment, and selected ampacity after the
terminal cap. The `routeThermalAmpacity` cable field records its adjusted table
ampacity before the terminal cap. The proposal check with the same name fails
when any generated circuit lacks a feasible selection. Changing conditions
invalidates the proposal and requires regeneration, which recalculates cable
dimensions, voltage drop, protective candidates, and raceway capacity. Apply
retains the evidence in canonical cable records and reports.

Corridor conditions must describe the actual installation. A conductor count
entered for grouping is an explicit project assumption, not the automatically
counted number of cables sharing a tray. MC catalog construction has three
phase conductors. Any larger grouping count needs a justified installation
basis; it does not change that cable construction.

The model must keep the conditions for each route segment together. Combining
the temperature of one segment with the grouping of another would create a
fictional installation. The most restrictive evaluated segment controls the
conductor. Terminal ampacity remains a separate cap. No short-segment exemption
or free-air spacing credit is taken.

Field attachments inherit global conditions and remain an explicit assumption.
They now receive separate [endpoint conduit proposals](design-synthesis-endpoints.md)
when dedicated EMT is selected; the thermal assessment alone does not establish
their physical installation. Burial, solar heating,
soil drying, detailed mutual heating, arbitrary bundle geometry, and transient
ratings need other supported models and construction evidence.

## Relationship to the detailed thermal study

The [detailed cable thermal model](cable-thermal-model.md) currently supports
single-core direct-burial constructions. Its published 132 kV reference data
cannot describe the selected low-voltage multicore MC cables. Connecting that
solver directly to these candidates would produce misleading results. A future
construction-aware integration needs matching cable layers and loss data,
installation support, and independent validation before it can drive selection.

## Verification

Verified on September 18, 2026:

- Independent fixture: the 30-load example's four 400 A feeders change from
  600 to 750 kcmil for corridor E01 at 40 C. The resulting ampacity is 418 A;
  combined path voltage drop passes. The sum of their cable diameters increases
  from 10.660 to 11.768 inches in the tray-capacity calculation using the
  archived PDF's updated 600 and 750 kcmil nominal diameters.
- At 45 C with the original corridors, selection and the thermal proposal check fail; Apply is disabled.
  Diagnostic exports remain available and explicitly retain `status: blocked`.
- Separate segment conditions, field/point fallback, the strict six-foot cover
  boundary, unsupported methods, and the multicore tray factor are checked.
- Canonical Apply preserves thermal evidence, undo/redo restores the exact
  project, regeneration survives a saved round trip, and the 50-load case still
  fits the 5 MiB storage acceptance budget.
- All 391 Node test files passed. The final build, lint, and `git diff --check`
  passed.
- All 19 Edge cases in the synthesis and workflow-contract suites passed,
  including the new control-to-report thermal case, clearing overrides,
  normal 30/50-load project journeys, and manual-edit protection. The rendered
  thermal evidence table was also inspected.

Subsequent routing acceptance adds a permitted cooler bypass around E01. The
first feeder then takes `BYPASS-A` and `BYPASS-B`, measuring
`50 + sqrt(60² + 50²) = 128.102496759 ft`, with a 600 kcmil conductor. At
40 C the shorter 60 ft E01 route remains feasible with 750 kcmil and is
preferred. Closing the bypass at 45 C still blocks the feeder. See
[routing verification](design-synthesis-routing.md) for the selection method,
protection interaction, and regression evidence.

Logs and browser artifacts are under
`output/design-synthesis-thermal-2026-09-18/`. This extends the bounded
preliminary workflow; it does not complete the full industrial-design goal.
