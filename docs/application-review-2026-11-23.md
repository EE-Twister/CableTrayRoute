# Application review — November 23, 2026 (UI/UX and reporting accuracy)

Reviewed commit `e4da1f678fa65d50e966876f1cbb84870c304193`. The working tree contained only two unrelated untracked files. No application code was changed in this review.

**Status (same day):** R1–R7 have since been corrected. The findings below are kept as the baseline.

- **R1:** DRC-03 counts current-carrying conductors per cable under 392.80(A)(1)(a), uses the full Table 310.15(C)(1) factors, and reads the schedule's `est_load`.
- **R2:** arc-flash boundary and working-distance units are normalized on import and in `migrateProject`. The sample stores millimetres. A boundary implausibly inside the working distance is treated as invalid on the page, on labels, and in the report.
- **R3, R4:** Load Flow and Motor Starting read the saved engine shapes.
- **R5:** a shared compartment-aware evaluator, `evaluateTrayFillWithCompartments`, now feeds the Raceway Schedule, the report, the submittal, raceway assurance, and DRC-01. Raceways that cannot be evaluated show as **incomplete**, not 0 % "ok". The Raceway Schedule KPI now counts ductbank conduits.
- **R6:** report heat-trace branches are re-assessed for freshness before totalling.
- **R7:** withheld report rows lose their verdict, reliability cut sets are withheld with their study, and voltage-drop rows are gated on their own result. Arc Flash chart bars and headline cards show readiness instead of "Pass" when a result is not current and label-ready. The Short Circuit and Load Flow page charts now follow the same rule: a stale result, or a Short Circuit location with missing required inputs, shows a "Stale" or "Incomplete" badge and a reason instead of Pass/Review/Fail, and the headline cards drop their verdict colour.

R8–R11 were then corrected:

- **R8:** a numeric legacy `voltage` fills a blank `operating_voltage` on import, project load, and `migrateProject`, without overwriting or deleting anything. The Cable Schedule KPI uses the step header's schedule-ready definition and reports missing operating voltage separately. The report shows Rated (V) and Operating (V) columns.
- **R9:** report numbers keep up to six significant figures and use exponent notation below 1e-4.
- **R10:**
  - Sustainability, TCC, Hazardous Area, Insulation Coordination and Egress Lighting now build real report sections.
  - The Cable Schedule section uses tags, counts "routed" from saved route results, and flags schedule/route length mismatches.
  - The Routing Summary prints readable columns and keeps signatures in the XLSX.
  - Garbled characters were fixed in the report, Submittal, Catalog Browser and Trust Center.
  - XLSX header objects and the arc-flash PPE column now export.
- **R11:**
  - The Cost Estimate section states whether the estimate matches current inputs.
  - CTI rows print "No trip" below a device's curve instead of a clamped time.
  - Load Flow losses within numerical tolerance print as 0.

Still open from R8–R11:

- ~~A stricter third schedule-ready definition remains in the Cable Schedule readiness panel.~~ Fixed: `isCableScheduleReady` in `analysis/scheduleWorkflow.mjs` is the one definition (length must be a positive number), and `workflowStatus.js` delegates to it.
- ~~Auto-Coordinate's `checkCoordination` treats an upstream device below pickup as unevaluated.~~ Fixed: it now uses `evaluateOperatingTime` and the shared `instantaneousCeiling`, like the CTI report.
- The TCC report section carries pair data only; device settings are not included.

E1–E8 were then corrected:

- **E1:** Export All builds its zip without Node's `Buffer`, so it downloads in the browser. Failures show a dialog. Array results become rows, `_` keys are skipped, and headers are the union across rows.
- **E2:** table XLSX export and import keep 0.
- **E3:** the tray CSV writes all 15 columns, and every Optimal Route CSV uses `csvCell` quoting with formula guards. Import strips the guard again.
- **E4:** the Cost Estimate workbook is built from the run-time snapshot, and export is refused, with the changed inputs named, until the estimate is rerun. Money and quantity cells are numbers.
- **E5:** route BOM raceway quantities count each raceway once; per-cable usage is a separate sheet without cost.
- **E6:** the Short Circuit PDF keeps per-bus validity, warnings and required inputs, and reports success only after the PDF is generated.
- **E7:** labels print exact kV, never "N ft 12 in", and literal `$`. Approach boundaries follow NFPA 70E-2024 Table 130.4(E)(a); the earlier values were wrong above 750 V.
- **E8:**
  - Route exports label lengths "(ft)".
  - The Panel Schedule XLSX keeps "—", leaves kW out of the kVA column, and sanitizes sheet names.
  - The arc-flash CSV/PDF has units in its headers, a UTF-8 BOM, and follows the page scope.
  - Tray Fill's Excel export adds a Fill Analysis sheet.

The panel's Phase Load (VA) kW fallback was fixed: a kW-only AC load is divided by its power factor (unity when none is given) instead of being read as VA.

U1–U5 were then addressed:

- **U1:** 63 previously undefined colour variables are now defined, so they follow each theme. `npm run lint:css` fails on any undefined `var()`. The report preview always renders as a light page, and the dark-on-dark summary headings and dark primary buttons are fixed. The axe pass now also runs in dark mode and covers the report builder, sample gallery, Arc Flash and Short Circuit. The remaining dark-mode contrast failures on 10 pages were then fixed: teal *text* uses now take `--color-heading-accent` (lighter in dark mode, darker inside the light report preview), hard-coded blues and greys use theme tokens, and unstyled links use the theme link colour. The axe spec passes in light and dark on all 14 pages with no exclusions.
- **U2:** the header chip shrinks with an ellipsis, so no page scrolls sideways at any width from 320 to 1,920 px.
- **U3:** the step bar and sample-workflow bar merge into one band, the toolbar is one row (Add Cable is primary, Quick Add moved into its menu), and the first cable row is at about y = 453 instead of 562 at 1009 × 596.
- **U4:** the empty workspace shows one identity block and three actions; a saved project shows one card and one Open Step. A project that is unsaved and has never been saved still shows the Create/Open/Sample prompt beside Open Step and Save.
- **U5:** Tray Fill opens on a project tray (handed-over tray, then `?tray=`, then the first tray with cables); **New blank tray** and `?blank=1` open manual entry.

Still open: the home page for an unsaved, never-saved project.

**Scope:** what a user sees, what the issued report says, and what the export files contain.

- The live application was walked on `localhost` using the bundled **Project Workflow Core** sample. Pages covered: home, sample gallery, cable schedule, raceway schedule, tray fill, short circuit, arc flash, workflow dashboard, one-line, and the Report Package Builder.
- Two bounded code audits ran in parallel, one on the project report and report package, one on per-page exports. Their probes drove the real modules in Node and, for exports, the built pages in Edge.
- High-severity items from those audits were re-run or re-traced before inclusion.

Earlier reviews ([2026-09-13](application-review-2026-09-13.md), [2026-09-16](calculation-feature-review-2026-09-16.md)) cover calculation-engine defects. None of the findings below appear in them, except U3, which is marked as still present.

Each finding is tagged with how it was established:
- **Browser** — observed in the running application.
- **Node** — reproduced with a probe against repository modules.
- **Edge probe** — reproduced by scripted download in Edge against the built pages.
- **Code** — traced in source without an executed repro.

---

## Part 1 — Engineering output that is wrong or misleading

### R1. High — DRC-03 applies tray-wide conductor derating to multiconductor cables (Browser, Code)

**Evidence:** [analysis/designRuleChecker.mjs:58](../analysis/designRuleChecker.mjs#L58), [:657](../analysis/designRuleChecker.mjs#L657), [:666](../analysis/designRuleChecker.mjs#L666).

The rule adds up the conductors of every power cable in the tray and applies the Table 310.15(C)(1) adjustment factor to each cable. NEC 392.80(A)(1)(a) limits these adjustment factors to multiconductor cables with more than three current-carrying conductors, counted per cable rather than per tray ([ECM summary](https://www.ecmag.com/magazine/articles/article-detail/ampacity-calculations-cable-tray-installations-can-be-tricky-part-2)).

The sample report prints *"Tray bundling derating applied: 380 A aggregate → 190.0 A (factor 0.5, 17 current-carrying conductors)"* for a 3/C 500 kcmil feeder in a ladder tray.

**Related defects:**
- The factor table ends at 0.40 above 30 conductors, but Table 310.15(C)(1) continues to 0.35 for 41 and more.
- The load comparison reads `design_current ?? load_amps`, but the Cable Schedule column is `est_load` ([scheduleConfig.js:167](../src/cable-schedule/scheduleConfig.js#L167)). Only cables written by workflow automation carry `load_amps` ([workflowAutomation.mjs:471](../analysis/workflowAutomation.mjs#L471)). For loads entered in the schedule, the over-ampacity ERROR therefore never runs, and the rule emits only the INFO messages.
- The derating error is conservative: it understates ampacity. The skipped load check is the part that can let a real overload pass unflagged.

**Fix:**
- Count current-carrying conductors per cable, and adjust only cables with more than three.
- Read the schedule's load field.
- Complete the factor table.
- Test three cases: a 3/C cable in a crowded tray gets no adjustment; a 4/C cable with four current-carrying conductors gets 0.80; a schedule load above ampacity raises an ERROR.

### R2. High — arc-flash boundaries stored in inches are shown as millimetres (Browser, Code)

**Evidence:** [samples/project-workflow-core.json:1675](../samples/project-workflow-core.json#L1675), [src/components/resultViz.mjs:154](../src/components/resultViz.mjs#L154), [analysis/projectReport.mjs:1519](../analysis/projectReport.mjs#L1519).

The sample stores `"boundary": 42, "boundaryUnit": "in"` and `"workingDistanceIn": 18`, but nothing reads `boundaryUnit`. The Arc Flash page shows *"SWBD-101 3.80 cal/cm² · Arc-flash boundary 42 mm"*. The boundary should be about 1,070 mm, so it is understated about 25 times.

The report's column is hard-coded "Boundary (mm)", with no unit normalization behind it. The report section for this stale sample was not opened before the re-run replaced it; after the re-run, the section is correctly withheld.

The values are also physically impossible as shown. At more than 1.2 cal/cm² at the working distance (457 mm), the boundary has to lie beyond that working distance.

A fresh **Run Study** gives plausible millimetre output (9.15 cal/cm², 1,622 mm), so the engine is not the problem.

The sample also contradicts itself: it lists a minimum arc rating of "≥ 8.00" for 2.1 cal/cm², while the chart labels the same row "PPE Cat 1".

**Fix:**
- Regenerate the sample's results with the engine.
- Normalize unit fields in `migrateProject`.
- Treat any result whose boundary is shorter than its working distance while energy exceeds 1.2 cal/cm² as invalid.

### R3. High — Load Flow section of the project report is blank (Browser, Node)

**Evidence:** [analysis/projectReport.mjs:682](../analysis/projectReport.mjs#L682) reads `voltagePu`, `voltageKv`, `angleDeg`, `loadKW` and `data.branches`. The solver saves `Vm`, `Va`, `voltageKV`, `Pd`, `Qd` and `lines` ([analysis/loadFlow.js:694](../analysis/loadFlow.js#L694), [:937](../analysis/loadFlow.js#L937)).

**In the browser:** after running Load Flow on the sample, the report labels the section *"Current saved result · Validity: evaluated · Freshness: current · Eligibility: eligible"*. Every bus cell then prints "—", and the buses are listed by internal id (`comp-swbd-101`) rather than tag.

**In a Node probe:** a two-bus `runLoadFlow` result gives the same blank cells, no Branch Flows table, and a blank XLSX LoadFlow-Buses sheet ([src/projectreport.js:722](../src/projectreport.js#L722)).

**Fix:** map the solver's field names and its `lines` array, and pin the mapping with a test that feeds real `runLoadFlow` output through the report.

### R4. High — Motor Starting section lists object keys instead of motors (Node, Code)

**Evidence:** [analysis/projectReport.mjs:757](../analysis/projectReport.mjs#L757). The Motor Starting page saves `{runAt, method, criteria, cases, results:[…], …demand}` ([analysis/motorStart.js:263](../analysis/motorStart.js#L263)). The report iterates the top-level keys, so the probe prints rows named `runAt`, `method`, `results` and so on, all "—", instead of each motor's inrush and voltage sag.

This was not confirmed in the browser: the sample's motors lack Thevenin impedance and inertia, so the study would not run.

`reports/exportAll.mjs` flattens objects the same way, so Export All CSVs are affected too (E1, E6). Results saved from the one-line's own button use a map shape and render correctly.

**Fix:** use `data.results` when it is an array, as [reports/reporting.mjs:177](../reports/reporting.mjs#L177) already does.

### R5. High — tray fill gives different answers on different pages, and unevaluable raceways are reported as 0 % "ok" (Browser, Node)

**Evidence:** [analysis/trayFill.mjs:189](../analysis/trayFill.mjs#L189) has no slot or compartment handling. It is used by the Raceway Schedule KPI ([scheduleSummary.mjs:43](../src/components/scheduleSummary.mjs#L43)) and the project report ([projectReport.mjs:123](../analysis/projectReport.mjs#L123)).

For TR-PWR-101 (24 in ladder, two 12 in compartments):

| Where | Value shown | Basis |
| --- | --- | --- |
| Tray Fill page, zone results | Zone 1 stackable **27.5 %**, Zone 2 2.7 % | Geometric per-zone packing, not the NEC allowance |
| Tray Fill page, Article 392 check | Per compartment | NEC 392.22(A) per 12 in compartment; Zone 1 governs at **17.5 %** (recomputed during the fix) |
| Tray Fill gauge, labelled "Current fill" | **7.6 %** | Geometric packing density, not a code limit |
| Raceway Schedule KPI | **16 % of allowance**, Pass | Whole tray |
| Project report, Raceway Fill | **15.5 %**, "ok" | Whole tray |

*Correction (same day):* the first draft of this table treated 27.5 % as the per-compartment NEC figure. It is the page's geometric zone fill. The governing compartment's NEC 392.22(A) utilization is 17.5 %, so the whole-tray understatement is 15.5 % versus 17.5 %. The direction of the finding is unchanged.

**Contradiction in the same report:** Raceway Fill marks TR-PWR-101 "ok", while DRC-01 says compartmented fill for that tray is incomplete.

**When `evaluateTrayFill` cannot evaluate a raceway** (for example single-conductor cables or a missing OD), the report falls back to `cableFillIn2`. That fallback reads only `od` (the schedule field is `cable_od`) and `route_preference` (not `raceway_ids`), so it reports fill 0, 0 % and "ok", and the summary counts "0 over limit".

**Conduits:** a 1 in EMT with two of three cables missing OD reports 22.7 % "ok". The true fill cannot be known without those diameters; if they match the third cable it would be about 68 % against a 40 % limit. The `missingAreaCables` list is never shown.

**Fix:**
- Move compartment evaluation into `trayFill.mjs` and use it on all surfaces.
- Report the governing compartment.
- Render unevaluable raceways as "Incomplete — <reason>" rather than "ok", and remove the `od`-only fallback.
- Relabel the gauge as packing density.
- Rename the report's "Area (in²)" column to "Allowable area (in²)", since it holds the 392.22(A) allowance (25.48 = 28 − 1.2 × 2.1).

### R6. High — Heat Trace report section counts stale branches in its totals (Node)

**Evidence:** [analysis/projectReport.mjs:231](../analysis/projectReport.mjs#L231) never runs `assessHeatTraceCase`, so the withholding in `heatTraceReport.mjs` never triggers.

For a case whose inputs changed after calculation:
- the Heat Trace page shows "invalid / stale, 0 kW";
- the report shows "withinLimit, 1 eligible branch, 1.2 kW, 5.83 A".

**Fix:** assess each case before summarizing, as `heattracesizing.js` does.

### R7. High — "Pass" and "stable" verdicts appear beside withheld or stale results (Browser, Node)

- **Arc Flash page.** The page shows *"Saved results are stale"* and *"Label eligible 0"*, yet the chart gives every location a green ✓ Pass. `arcFlashBarRows` ([resultViz.mjs:143](../src/components/resultViz.mjs#L143)) looks only at the PPE category.
- **Report rows.** `status` survives withholding in `decorateStudyRows` ([analysis/studyResultContext.mjs:474](../analysis/studyResultContext.mjs#L474)):
  - a stale transient-stability row still says "stable" while every number is "—";
  - stale voltage-drop rows still show pass or fail beside a withheld drop.
- **Reliability cut sets** are printed for a stale study whose rows and summary are withheld ([projectReport.mjs:870](../analysis/projectReport.mjs#L870)).
- **Voltage-drop gating** uses the combined-path contract. A branch evaluated at 4.21 % (fail) is therefore labelled "not evaluated" when its feeder lacks current, while the study summary counts it as one failure.

**Fix:**
- Pass readiness into every chart row builder and report decorator.
- A non-ready row shows "Not evaluated — <reason>", never a verdict.
- Gate each individual drop on its own contract.

### R8. Medium — one cable is both "complete" and "missing voltage" depending on the page (Browser, Code)

Sample cables carry `voltage: "480"` and `cable_rating: 600`, but no `operating_voltage`. The `voltage → operating_voltage` alias exists only for spreadsheet header import ([cableschedule.js:2912](../cableschedule.js#L2912)).

| Surface | What it says |
| --- | --- |
| Cable Schedule, Operating Voltage column | Blank for all 14 rows |
| Cable Schedule KPI ([scheduleSummary.mjs:19](../src/components/scheduleSummary.mjs#L19)) | *"14 Missing length or voltage"* |
| Workflow step header | *"14 schedule-ready"* (its check omits voltage) |
| Project report | *"Issue-ready fields complete."* Its "Voltage" column prints 600/1000, because [projectReport.mjs:98](../analysis/projectReport.mjs#L98) falls back through `voltage_rating`, `cable_rating`, `operating_voltage`, `voltage`, mixing insulation rating with system voltage |

**Fix:**
- Normalize `voltage` in `migrateProject`.
- Split the report column into "Rated (V)" and "Operating (V)".
- Use one readiness definition across the KPI, the step header and the report.

### R9. Medium — report number formatting changes conclusions (Node)

`fmt` is `toLocaleString()` ([projectReport.mjs:1243](../analysis/projectReport.mjs#L1243)), which keeps at most three decimals.

| Real value | Printed |
| --- | --- |
| 0.9496 pu | "0.95" (reads as just inside the 0.95 pu band) |
| Violation probability 0.0004 | "0" |
| Cut-set probability 9e-5 | "0" |
| Availability 99.99991 % | "100" |

The HTML and print output are affected; XLSX and JSON keep the raw values.

**Fix:** format to significant figures, with exponent notation for small probabilities.

### R10. Medium — issued report sections are mislabeled, missing or unreadable (Browser, Node, Code)

- **Placeholder sections.** Sustainability, Hazardous Area, Egress Lighting, Insulation Coordination and TCC Settings are marked available when the project holds data for them ([reportPackage.mjs:191](../analysis/reportPackage.mjs#L191)). No builder produces them, so they print *"This section is not available from the current project data."* Confirmed in the browser for TCC Settings Manifest, which the builder lists as having content for the sample.
- **Mixed identifiers.**
  - The Cable Schedule section prints internal ids such as `cbl-swbd-mcc-101` (`c.id || c.tag`, [projectReport.mjs:93](../analysis/projectReport.mjs#L93)).
  - Routing and DRC print tags such as `CBL-SWBD-MCC-101`.
- **"Routed" means "has an assignment".** The status is based on route preference or raceway ids ([projectReport.mjs:101](../analysis/projectReport.mjs#L101)), not on saved route results.
- **Lengths are not reconciled.** CBL-MCC-PMP-101 is 95 ft in Cable Schedule and 101.51 ft in Routing Summary.
- **Raw field names as headings.** Routing Summary uses internal keys (`routeSignature`, `conduitAssignmentBasis`, …) as headings and prints hashes.
- **Garbled characters.** Mojibake "â€”" and "Â·" appears in nine places in advanced-study sections ([projectReport.mjs:981](../analysis/projectReport.mjs#L981) and others).
- **Blank XLSX columns.**
  - The cyber-compliance sheet emits object headers and empty cells ([reportPackage.mjs:381](../analysis/reportPackage.mjs#L381)).
  - The arc-flash sheet's `ppeCategory` column is always empty because rows carry `ppeSelection` ([src/projectreport.js:720](../src/projectreport.js#L720)).

### R11. Low — smaller reporting inaccuracies (Browser, Node, Code)

- **Conduit count.** The Raceway Schedule KPI says "0 Conduits" while the same page lists 10 ductbank conduits ([scheduleSummary.mjs:91](../src/components/scheduleSummary.mjs#L91)).
- **Cost Estimate freshness.** The report prints saved totals and their input fingerprint but never compares it with the current project, as Routing does ([src/projectreport.js:527](../src/projectreport.js#L527)).
- **CTI trip times.** The report prints a 300 s trip time for a device whose curve starts above the fault current. `interpolateTime` clamps instead of returning "no trip" ([analysis/tccAutoCoord.mjs:49](../analysis/tccAutoCoord.mjs#L49)).
- **Negative losses.** The Load Flow page reports *"Loss -0.01 kW"* for the sample. That is solver round-off; values within tolerance of zero should print as 0.

---

## Part 2 — Export files

### E1. High — One-Line "Export All Reports" crashes and nothing downloads (Edge probe, Code)

[reports/exportAll.mjs:207](../reports/exportAll.mjs#L207) builds the zip with Node's `Buffer`. `oneline.html` loads `./oneline.js` unbundled, so the browser throws *"Buffer is not defined"*. The click handler has no catch, so the user gets no message. `tests/exportAllReports.test.cjs` runs only in Node, which hides the failure.

Once fixed, the contents also need repair ([exportAll.mjs:117](../reports/exportAll.mjs#L117)):
- array results flatten to `[object Object]`;
- `_meta` keys become data rows;
- headers come only from the first row's keys.

**Fix:** build the zip with `Uint8Array` and a `Blob`, catch and report errors, union headers across rows, and add a browser test.

### E2. High — Raceway Schedule and Equipment List XLSX turn every zero into a blank (Edge probe, Code)

[tableUtils.mjs:2037](../tableUtils.mjs#L2037) writes `row[c.key] || ''`, and import at [:2056](../tableUtils.mjs#L2056) does the same. A tray from (0,0,10) to (20,0,10) exports as `["TR-ORIGIN","","",10,20,"",10]`, so coordinates on an axis are lost from backups and handoffs.

**Fix:** use `?? ''` in both places. The Cable Schedule's own exporter already does this.

### E3. High — Optimal Route "Export Trays CSV" shifts columns (Edge probe, Code)

The header has 15 columns ([app.mjs:422](../app.mjs#L422)), but each row writes 13 values ([app.mjs:1729](../app.mjs#L1729)): `num_slots` and `slot_groups` are missing. For tray ENTRY-HV:
- `num_slots` holds "HV";
- `slot_groups` holds "STR";
- `allowed_cable_group` and `shape` are empty.

Re-importing the file silently drops the HV segregation. All three `app.mjs` CSV writers ([:1726](../app.mjs#L1726), [:1783](../app.mjs#L1783), [:2412](../app.mjs#L2412)) join raw values with commas, with no quoting or formula neutralization.

**Fix:** write both fields, and use `csvCell` from `utils/csv.mjs`.

### E4. Medium — Cost Estimate XLSX does not match the displayed estimate (Edge probe)

Export re-reads the live inputs ([costestimate.js:590](../costestimate.js#L590)). After a run showing $3,566 at 15 % contingency, changing contingency to 30 % without rerunning exports "Grand Total 4031". That total combines 30 % contingency with line items priced at the old material factor.

Money and quantity cells are also `toFixed` strings, so Excel stores them as text and `SUM` returns 0.

**Fix:** export from the run-time snapshot, and write numeric cells.

### E5. Medium — Route BOM counts raceway length once per cable (Node)

With five cables in one 100 ft tray, [resultsExport.mjs:92](../resultsExport.mjs#L92) gives a Raceways sheet of 500 ft, 500 lb and $2,500. The Cost Estimate ledger gives 100 ft for the same routes.

**Fix:** deduplicate by raceway id, reusing `buildRouteQuantityLedger`. Alternatively, relabel the sheet as usage and drop the cost column.

### E6. Medium-Low — Short-circuit PDF drops per-bus warnings and required inputs (Node)

[studies/shortCircuit.js:198](../studies/shortCircuit.js#L198) spreads each bus result and then overwrites `warnings`, `validity` and `provenance` with study-level values:
- MCC-2's "not evaluated — inputs incomplete" warning becomes an empty cell;
- a fully evaluated bus prints validity "unevaluated";
- `requiredInputs` is never exported;
- the function returns success before the async PDF resolves, so the status can read "exported" when nothing was written.

### E7. Medium-Low — arc-flash label text formatting (Node)

[reports/arcFlashReport.mjs:31](../reports/arcFlashReport.mjs#L31) and [:40](../reports/arcFlashReport.mjs#L40):
- 12,470 V prints as "12.5 kV".
- A 914 mm working distance prints as "2 ft 12 in", because feet are floored before inches are rounded.
- `labels.mjs` substitutes with a string replacement, so "PNL-$$1" prints as "PNL-$1".

Hazard values round to nearest, and the error is negligible (≤0.005 cal/cm², ≤0.05 in).

**Needs confirmation:** the restricted approach boundaries at [analysis/arcFlash.mjs:133](../analysis/arcFlash.mjs#L133) (432 mm for 751 V–15 kV) appear to differ from the NFPA 70E approach-boundary table (0.7 m / 2 ft 2 in for that range), and the higher rows look shifted. Verify against the adopted edition before changing them.

### E8. Low — export units and minor issues (Node, Code)

- **Route data units.** `route_data.csv` and `.xlsx` write feet under unitless headers, even in metric mode where the screen shows metres ([app.mjs:2408](../app.mjs#L2408)).
- **Panel schedule XLSX** ([exportPanelSchedule.js:120](../exportPanelSchedule.js#L120)):
  - a literal U+FFFD replacement character;
  - kW values exported under the "Demand (kVA)" header;
  - an uncaught failure for panel ids that are not valid sheet names.
- **Arc-flash CSV** has no units in its headers, ignores the page's scope selector, and writes no UTF-8 BOM, so "cal/cm²" may garble in Excel.
- **Tray Fill "Export Excel"** contains only inputs, with no fill %, limit or status, although the page tour calls it the fill analysis.

---

## Part 3 — UI/UX

### U1. High — dark mode makes key text invisible (Browser, Node)

Dark mode follows the OS setting. Several shared components then draw a hard-coded light background under dark mode's near-white text. Each case below was confirmed by screenshot, using solid `rgb()` colours.

| Element | Where | Contrast |
| --- | --- | --- |
| Study result summary (*"9 location(s) calculated…"*), `.study-result-summary` | Short Circuit, Arc Flash, other study pages | 1.02:1 |
| Export HTML, Export JSON and Save Snapshot buttons; preset buttons; "Presets" and "Rev" headers | Report Package Builder | 1.03–1.1:1 |
| Report preview cover lines (client, engineer, date) and contents numbering | Report Package Builder | invisible |
| "Downstream handoff…" text and the **Run Fill Check** button | Cable Schedule | 1.01:1 |
| Guided checklist step titles | Sample Gallery | 1.05:1 |
| Tag filter chips | Sample Gallery | ~1:1 |
| `<summary>` headings (*"Method & Assumptions"*, *"About This Tool"*) | most pages | 1.55:1 |

**Main contributor:** a scan of `style.css`, `src/styles/*.css` and the root HTML files found **67 custom properties used but never defined** (342 uses). Properties set through `setProperty` in root or `src/` scripts were excluded. **25 of them fall back to near-white colours** (relative luminance above 0.8; 108 uses). Examples:
- `--surface-2`, 23 uses;
- `--color-surface-alt`, 17 uses;
- `--surface-1`, 13 uses;
- `--surface-subtle`, used by `.study-result-summary` ([forms.css:930](../src/styles/forms.css#L930));
- `--color-warning-bg`.

Only `.study-result-summary` and the report-builder controls were traced to a specific token. The dark-on-dark `<summary>` headings have a different cause: an explicit dark text colour.

**Why CI misses it:** the axe suite forces the light scheme ([a11y.spec.ts:36](../playwright-tests/a11y.spec.ts#L36)). It also does not cover the Report Package Builder, Sample Gallery, Arc Flash or Short Circuit pages.

**Fix:**
- Define the tokens for both themes in `tokens.css`.
- Make `scripts/checkCssArchitecture.mjs` fail on any `var(--x)` with no definition.
- Add a dark-scheme axe lane that includes these pages.
- Always render the report preview as a light "paper" surface with explicit text colours.

### U2. Medium — header overflows horizontally between about 1,024 and 1,100 px (Browser)

At 1,024 and 1,100 px wide the header needs about 1,093 px. Every page checked gains a horizontal scrollbar, and the account avatar and search button are clipped. There is no overflow at 768 px (collapsed navigation) or 1,280 px. Collapse the header earlier, or let the project-name chip truncate.

### U3. Medium — the cable table still starts below the fold (Browser; still present from 2026-09-13)

In a ~1,009 × 596 px pane the first cable row starts at about y = 570. Above it sit:
- two stacked workflow bands (the step bar and the sample-workflow bar);
- the page header and the KPI strip;
- a two-line toolbar with duplicate add buttons (Quick Add and Add Cable) and Save/Load buttons beside a header that already reads "Saved";
- the guidance panel.

### U4. Medium — the home page repeats information and actions (Browser)

- The project identity and record counts appear twice.
- There are about ten calls to action. "Browse Samples" and "Try a Sample Project" go to the same place.
- "Save Current Project" is offered for an empty workspace.
- The header reads "Untitled · No project · Not saved yet", three labels for one state.

Show one identity block and one primary action per state.

### U5. Low — Tray Fill opens on a blank tray when the project has trays (Browser)

With three project trays available, the page opens on a blank 12 in tray. Pre-select the first tray, or the tray passed from the Raceway Schedule, and show its governing result first.

---

## Recommended delivery order

1. **Remove misleading engineering output:** R2, R7, R5 and R1. R2, R5 and R7 show a safer or more compliant picture than the data supports. R1 publishes wrong ampacities and skips the load check for schedule-entered loads.
2. **Make issued documents complete:** R3, R4, R6, E1, E2 and E3. These are blank or broken sections, crashes, and data lost on export or re-import.
3. **Use one definition per quantity:** R8, R9, E4 and E5, through shared normalization in `migrateProject` and shared readiness and fill evaluators.
4. **Fix dark mode systemically:** the U1 tokens, lint rule and dark-scheme axe lane. Then U2–U5 and the remaining Low items.

Most Part 1 defects share one gap: tests pin each module's output shape, but not what a downstream consumer reads. One contract test per study would have caught R3, R4, R6 and E1: feed the real engine output through the page, the report, and every exporter, and assert the same numbers and statuses come out.

## Verification and limits

- **Browser walk.** `node server.mjs` on `localhost:3000`, using the desktop app's built-in browser.
  - Pane about 1,009 × 596 px, plus checks at 768, 1,100 and 1,280 px.
  - Dark scheme by default; the light-scheme comparison on the Report Package Builder was clean.
  - Running Arc Flash and Load Flow replaced the sample's saved results for those studies in that browser's local storage only.
- **Single dataset.** Only the bundled Project Workflow Core sample was used. Findings that depend on sample content (R2, R8) also identify the code paths that let the bad data through.
- **Contrast method.** Contrast was taken from computed `rgb()` styles on solid backgrounds and confirmed by screenshot. `color(srgb …)` values, gradients and translucent layers were excluded.
- **Audit probes.** Probes and download captures are in the session scratchpad, not the repository.
  - I re-ran the probes for R3, R4, R5, R6 and the R7 report-row cases myself.
  - I code-traced E1, E2 and E3; the Edge downloads were the audit agent's.
  - E4–E8 and the R9–R11 Node items rest on the agents' probes and were spot-checked against the cited lines only.
- **Overlap with earlier reviews.** The earlier reviews in `docs/` were searched for `392.80`, `DRC-03`, `boundaryUnit` and tray compartments; none were found.
- **Not reviewed:** glTF, IFC, Revit and DXF exporters; `renderReportHTML`, which the UI does not call.
- **Not run:** `npm test`, `npm run build` and Playwright, because no application code changed.
- **Code citations.** NEC and NFPA 70E references come from secondary sources. Confirm them against the adopted editions before implementing R1 and the E7 note.
