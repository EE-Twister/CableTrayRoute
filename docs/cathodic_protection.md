# Cathodic Protection (CP) Sizing — Inputs, Equations, and Limits

**Page:** `cathodicprotection.html`  
**Module:** `cathodicprotection.js`

This guide documents the engineering basis used by the Cathodic Protection sizing tool for buried metallic structures.

## Page Workflow

The page presents the sizing tool before its supporting engineering workspace:

1. Describe the asset and environment.
2. Define exposure and current demand.
3. Configure either a galvanic anode system or an ICCP rectifier/groundbed source and run the calculation.

Protection-criteria evidence and interference inputs are optional collapsed sections. Field evidence is excluded by default and criteria remain **Not evaluated** until the user explicitly enables the evidence workflow and enters project measurements. The layout canvas, standards mapping, compliance audit, and design history are grouped under **Advanced workspace and engineering reference** so they remain available without competing with the core sizing workflow.

After calculation, galvanic results lead with required current, minimum anode mass, and predicted life. ICCP results instead lead with required current, required rectifier current/voltage, and source headroom. Comparison, interference, sensitivity, profile, and calculation details remain directly accessible without expanding every supporting table.

The form is also retained as a working draft. If inputs change after a run, the saved results are visibly marked **Results out of date**, the primary action changes to **Recalculate Updated Inputs**, and the user can either run the revised case or restore the last calculated inputs. Reloading the page restores the uncalculated draft and its stale-result warning. While a calculation is running, the action is disabled so rapid repeat clicks cannot create duplicate history entries.

## Inputs and Units

Changing the project unit preference converts every CP field that carries a physical Imperial/Metric value, including area, pipe dimensions, anode geometry, installed mass, and interference geometry. Result mass, area, distance tables, and chart distance axes use the selected display system. Switching back preserves the underlying physical values, so a unit preference change does not alter the calculated engineering result.

The core form shows only inputs used by the selected coating, surface-area, current-density, and CP-source methods. Optional interference geometry fields appear only when the selected relationship or source makes them relevant. When validation fails, the affected input is highlighted, associated with the inline error message, brought into view, and focused for correction.

| Input | Symbol | Units | Notes |
| --- | --- | --- | --- |
| Asset type | — | categorical | `pipe`, `tank`, or `other`; selects base current-density table row. |
| Soil resistivity | ρ | Ω·m | Used for current-density adjustment (`< 50`, `50–200`, `> 200` Ω·m bands). |
| Soil pH | pH | — | Used to apply an acidic/alkaline adjustment outside nominal neutral range. |
| Moisture category | — | categorical | `low`, `moderate`, or `high`; selects base current-density table column. |
| Coating demand model | — | categorical | `fixed`, `degradation-curve`, or `segment-condition`; selects exposed-area treatment. |
| Fixed coating factor | f<sub>cb</sub> | fraction | Used in `fixed` mode. |
| Degradation initial/end factors | f<sub>0</sub>, f<sub>EOL</sub> | fraction | Used in `degradation-curve` mode with exponent shape. |
| Segment condition factors | f<sub>seg,i</sub> | fraction list | Used in `segment-condition` mode for localized condition variation. |
| Surface area | A<sub>surf</sub> | m² | Total structure surface area used for CP demand calculation. |
| Current density mode | — | categorical | `table` (auto-selected) or `manual`. |
| Manual current density | i<sub>manual</sub> | mA/m² | Used only when mode=`manual`. |
| Modeled reference potential | V<sub>model</sub> | mV vs CSE | Design assumption used only to generate route profiles; it is not field acceptance evidence. |
| Anode capacity | C<sub>a</sub> | Ah/kg | Net ampere-hour capacity basis for selected anode alloy/system. |
| Anode utilization | u | fraction | Fraction of theoretical anode capacity considered usable. |
| Design factor | F<sub>d</sub> | fraction | Reliability/engineering margin factor used in mass/life equations. |
| Availability factor | F<sub>avail</sub> | fraction | System uptime factor; required current is divided by this factor. |
| Target design life | L<sub>target</sub> | years | Converted internally to hours (`years × 8760`). |
| Installed anode mass | M<sub>inst</sub> | kg | Used for predicted-life calculation. |
| Anode count / spacing / offset / burial | — | count, m | Drives the distribution model and the editable layout canvas. |
| Rectifier rated current / voltage | I<sub>rated</sub>, V<sub>rated</sub> | A, V | ICCP-only source ratings checked against preliminary requirements. |
| Groundbed circuit resistance | R<sub>gb</sub> | Ω | ICCP-only circuit resistance used for the voltage requirement. |
| Cable and polarization allowance | V<sub>allow</sub> | V | ICCP-only voltage allowance added to the groundbed drop. |
| ICCP reserve factor | F<sub>reserve</sub> | fraction | ICCP-only factor applied to required structure current before capacity checks. |
| Foreign-structure relationship | — | categorical | `none`, `crossing`, `parallel`, or `shared-corridor`; enables geometry-dependent risk scoring. |
| Interference source | — | categorical | Identifies foreign ICCP, DC traction, HVDC, industrial DC, or an unknown source. |
| Minimum structure separation | d<sub>sep</sub> | m | Scores close-proximity risk only when an interaction geometry is identified. |
| Parallel exposure length | L<sub>parallel</sub> | m | Scores route exposure for parallel and shared-corridor relationships. |
| Crossing angle | θ | degrees | Scores shallow crossing angles when relationship=`crossing`. |
| Potential gradient | G | mV/m | Adds measured or assumed design-stage gradient risk. |
| Bonding strategy | — | categorical | Records monitoring, test-bond, or controlled-drainage strategy and applies the documented scoring credit. |
| Iteration note | — | text | Optional rationale stored with each saved input-to-outcome design-history entry. |

The following field-measurement inputs are disabled until **Use field-measurement evidence in this preliminary evaluation** is selected:

| Test method | — | categorical | `instant-off`, `on-potential`, or `coupon`; defines correction path for acceptance checks. |
| Measurement context | — | categorical | Captures environment at test location (`native-soil`, `casing`, `foreign-interference`, etc.). |
| Reference electrode location | — | categorical | Records whether reference placement is local, remote, coupon lead, or unknown. |
| IR-drop compensation method | — | categorical | Documents compensation source (`instant-off`, `coupon`, `calculated`, `none`, `unknown`). |
| Measured IR-drop magnitude | ΔV<sub>IR</sub> | mV | Used to normalize ON-potential readings when provided. |
| Coupon depolarization shift | ΔV<sub>coupon</sub> | mV | Used for coupon-based normalization and polarization substitution when needed. |

## Equations Used

### 1) Current density selection

When `table` mode is selected, the tool determines:

- A base current density from asset type + moisture category table (mA/m²), then applies:
  - Resistivity factor = `1.2` for `ρ < 50` Ω·m, `1.0` for `50–200` Ω·m, `0.85` for `ρ > 200` Ω·m.
  - pH factor = `1.15` for `pH < 5.5` or `pH > 9`, else `1.0`.


i<sub>design</sub> = i<sub>base</sub> × F<sub>ρ</sub> × F<sub>pH</sub>

Then convert mA/m² to A/m²:

i<sub>design,A</sub> = i<sub>design</sub> / 1000

### 2) Exposed area (coating models)

- **Fixed factor:** `A_exposed = A_surf × f_cb`
- **Degradation curve:** computes life-averaged factor from `f0`, `fEOL`, and exponent `k`, then applies `A_exposed = A_surf × f_effective`.
- **Segment condition:** computes segment factors `f_seg,i`, averages to `f_effective`, then applies `A_exposed = A_surf × f_effective`.

### 3) Required current

I<sub>area</sub> = A<sub>exposed</sub> × i<sub>design,A</sub>

The distribution model applies the global attenuation factor before availability adjustment:

I<sub>distribution</sub> = I<sub>area</sub> × F<sub>distribution</sub>

I<sub>required</sub> = I<sub>distribution</sub> / F<sub>avail</sub>

### 4) Required anode mass for target life

Design hours:

H = L<sub>target</sub> × 8760

Required mass:

M<sub>req</sub> = (I<sub>adj</sub> × H) / (C<sub>a</sub> × u × F<sub>d</sub>)

### 5) Predicted life for installed mass

L<sub>pred</sub> = (M<sub>inst</sub> × C<sub>a</sub> × u × F<sub>d</sub>) / (I<sub>adj</sub> × 8760)

### 6) Safety margin outputs

- Safety margin (years) = `L_pred − L_target`
- Safety margin (%) = `(L_pred − L_target) / L_target × 100`

### 7) ICCP rectifier and groundbed source sizing

For ICCP systems, galvanic mass and predicted-life equations are not evaluated. The source requirement is:

- `I_rectifier,required = I_required × F_reserve`
- `V_rectifier,required = (I_rectifier,required × R_gb) + V_allow`
- Current headroom = `I_rated − I_rectifier,required`
- Voltage headroom = `V_rated − V_rectifier,required`

The preliminary ICCP source passes only when both headroom values are zero or greater.

### 8) Sensitivity and design-review scenarios

- Sensitivity now uses coating uncertainty bands (`low`, `base`, `high`) derived from the selected coating model.
- Galvanic scenarios report mass, predicted life, and life margin. ICCP scenarios report required rectifier current/voltage and current/voltage headroom.
- Worst-case segment demand is reported using local segment attenuation and condition factor weighting to expose localized current peaks.


### 9) Measurement correction and criteria normalization

Acceptance checks evaluate **corrected** values and retain raw values in output only after field evidence is explicitly enabled:

- For `on-potential` tests with supplied IR drop: `V_corrected = V_raw + |ΔV_IR|`
- For `coupon` tests with supplied depolarization: `V_corrected = V_raw + |ΔV_coupon|`
- For coupon workflows with missing explicit polarization shift, the shift defaults to `|ΔV_coupon|`

When required metadata is missing (unknown context/location, no compensation value for ON/coupon methods, or compensation explicitly set to `none`), the study reports validation warnings so acceptance decisions can be reviewed with caution. In addition, `on-potential` requires `ΔV_IR > 0` and `coupon` requires `ΔV_coupon > 0` at validation time so default/zero correction values cannot be treated as corrected evidence.

### 10) Design-stage interference screening

The interference assessment combines legacy categorical screening with explicit route and source inputs:

- Relationship weights: crossing `+2`, parallel `+4`, shared corridor `+6`.
- Source weights: foreign ICCP `+3`, DC traction `+5`, HVDC `+6`, industrial DC `+3`, unknown source `+2`.
- Separation: `< 3 m` adds `+4`; `3–10 m` adds `+2`. Separation is ignored when no interaction geometry is identified.
- Parallel exposure: `> 0 m` adds `+1`, `≥ 250 m` adds `+2`, and `≥ 1000 m` adds `+4`; this applies only to parallel/shared-corridor geometry.
- Crossing angle: `≤ 30°` adds `+3` and `31–60°` adds `+1` for crossing geometry.
- Potential gradient: `> 0 mV/m` adds `+1`, `≥ 2 mV/m` adds `+3`, and `≥ 5 mV/m` adds `+5`.
- Bonding credit: test-bond provision subtracts `1`; controlled drainage subtracts `3`.

The total is bounded at zero. Scores below `6` are low, `6–12` are medium, and `13+` are high. Results identify the leading positive drivers and the minimum mitigation profile.

## Desktop Results, Baselines, and Design History

- **Primary outcomes:** Galvanic cases show required current, minimum mass, and predicted life. ICCP cases show required current, required rectifier output, and available source headroom.
- **Modeled route coverage:** A prominent base-profile check reports how many modeled potential, current-demand, and distribution points fall outside the chart thresholds. This is intentionally reported separately from entered field-measurement criteria evidence.
- **Supporting results:** Interference is visible as a scored design check; sensitivity, complete factor breakdowns, distribution profiles, input factors, and segment distribution are collapsed by default.
- **Sensitivity status:** Galvanic scenarios report **Preliminary margin met** or **Review required**. These screening labels do not constitute design approval.
- **Results navigation:** Selecting Sensitivity, Profiles, or Calculation details opens the target disclosure, scrolls it into view, and moves keyboard focus to its heading.
- **Distribution profiles:** Scenario color swatches, distinct line patterns, labeled thresholds, pass circles, failure diamonds, and an expandable data table make the charts usable without relying on color or pointer inspection. Distance axes follow the selected units, and each data table includes only the scenarios currently enabled in the chart controls.
- **Locked comparison baseline:** **Save current as baseline** stores Configuration B with the active CP study. Later runs retain that baseline and show current, source-capacity/life, risk, and criteria deltas against it.
- **Design history:** Up to 20 iterations are retained. Each entry records the note, changed design fields, and source-appropriate sizing/interference outcomes.
- **Calculation basis:** One card-based source maps each formula or design assumption to affected outputs, standards references, checks, deliverables, and assumptions.

## Assumptions and Limits

- Intended for preliminary CP sizing and scoping studies, not detailed final design.
- Current-density table values are generalized and should be project-calibrated with owner/asset historical data when available.
- Coating breakdown factor is a dominant uncertainty; select conservatively for life-cycle projections.
- Temperature correction, current-distribution nonuniformity, shielding, stray-current effects, and attenuation modeling are not explicitly solved in this simplified workflow.
- pH and resistivity effects are represented via bounded multipliers, not full electrochemical kinetics.
- Validation requires positive numeric values for major scalar inputs and enforces `0 < coating factor ≤ 1`, `0 ≤ pH ≤ 14`.

## Standards References

The in-app standards basis references:

- **AMPP SP21424** — current demand selection workflow basis.
- **NACE SP0169** — external corrosion control and CP criteria basis.
- **ISO 15589-1** — cathodic protection design basis for buried/immersed pipelines.
- **DNV-RP-B401** — anode design/capacity and utilization guidance.

> Note: The built-in profile deliberately marks every standards edition as **not configured**. The tool uses the named standards only as preliminary design-basis references for equation form and parameter framing. Project-specific compliance requires selecting, recording, and approving the exact adopted edition and jurisdictional requirements before issue.

## Compliance Tracking

The CP study now includes a standards profile and auditable compliance status model:

- **Target references:** A machine-readable profile records the adopted standards set (AMPP/NACE/ISO/DNV references and organization-selected editions).
- **Mandatory vs optional checks:** Required checks are explicitly keyed and rendered in the **Compliance Status** panel as `pass`, `fail`, or `not-run`.
- **Required deliverables:** The profile flags required deliverables for design basis, calculations, commissioning checks, and monitoring plan.
- **Audit trail:** Every run appends a compliance snapshot under study storage (`studyResults.cathodicProtection.complianceHistory`) so historical status changes can be reviewed.
- **Provisional state handling:** Compliance is marked **provisional** until commissioning checklist evidence is complete for required tests, monitoring intervals, and corrective-action trigger thresholds.

## Verification Plan and Report Export Structure

The results output now includes a dedicated **Verification and Commissioning Plan** section and a persisted export payload:

- **Required commissioning tests:** Derived from the selected protection criteria requirements.
- **Monitoring intervals:** Derived from verification date scheduling and mitigation profile details.
- **Corrective-action thresholds:** Explicit trigger statements for failed criteria, unresolved interference risk, or life-margin shortfall.
- **Completion checklist fields:** Captured through the Study Approval panel with `completedBy`, `completedAt`, and `evidence` for:
  - required commissioning tests
  - monitoring intervals
  - corrective-action trigger thresholds

Study output now stores `studyResults.cathodicProtection.reportExport` with:

- `designBasis` payload (standards profile + calculation basis mapping)
- `verificationPlan` payload (commissioning tests, monitoring intervals, thresholds, completion state)
- `payloads.json` and `payloads.pdf` section metadata for downstream exporters.

The results header provides **Download report data (JSON)**, which saves the persisted JSON report package directly from the active calculated study.

## Layout Canvas and Persisted Geometry

The CP page now includes a **Layout Canvas** panel for visual placement and review of key CP objects:

- **Structure segments** are rendered as four labeled line segments.
- **Anodes** are rendered as draggable markers with optional wiring leads.
- **Measurement points** include draggable test points and a draggable reference electrode marker.
- **Spacing annotations** display anode spacing dimensions directly in the canvas.
- **Layer controls** can toggle structure, anodes, wiring, and measurement visibility.
- **Zoom/pan controls** support interactive navigation (`Zoom +`, `Zoom -`, `Fit View`, `Reset Layout`).
- New layouts open in a readable route window rather than shrinking the entire long route into a single thin line. **Fit View** remains available when the full-route overview is preferred.
- The canvas status explicitly distinguishes the readable route window from the full-route fit and reports the current zoom level.
- Single-click selection updates the element properties panel; the empty state reports segment, anode, and test-point counts.

Bi-directional synchronization behavior:

- Form values (`number-of-anodes`, `anode-spacing`, `anode-distance-to-structure`, `test-point-count`, `reference-electrode-location`) drive the initial and refreshed canvas geometry.
- Dragging anodes updates spacing and distance form fields.
- Dragging the reference electrode updates `reference-electrode-location`.

Persistence behavior:

- Layout state is stored under `studyResults.cathodicProtection.cpLayout` using the existing study storage flow.
- Saved layouts restore viewport, layer visibility, and marker positions when reopening the CP page.


## QA Tolerances and Acceptance Thresholds

To keep QA and engineering evaluations consistent, CP automated checks use the following deterministic tolerances and acceptance thresholds:

### Numeric tolerances (fixture regression)

- Design current density: ±0.001 mA/m²
- Required current: ±0.0001 A
- Minimum anode mass: ±0.001 kg
- Predicted life: ±0.01 years
- Distribution attenuation/effectiveness factors: ±0.001

These tolerances are validated using deterministic fixtures under `tests/cp/fixtures/`:

- `baseline-sizing.fixture.json`
- `high-resistivity-soil.fixture.json`
- `high-interference-risk.fixture.json`
- `geometry-attenuation-edge.fixture.json`

### Criteria acceptance thresholds

- Field criteria are `not-run` until evidence is explicitly enabled.
- Corrected instant-off potential passes when `≤ -850 mV (CSE)`.
- Corrected polarization shift passes when `≥ 100 mV`.
- Test-point coverage passes only when `passingTestPointCount === testPointCount`.

### Compliance matrix transition expectations

The CP workflow compliance matrix should transition as follows:

1. **Before analysis**: all required checks are `not-run`.
2. **Passing study run**: all required checks become `pass`.
3. **Failing study run**: one or more required checks become `fail` while independent checks can remain `pass`.

This transition is validated by the end-to-end CP workflow test in `tests/cp/complianceWorkflow.e2e.test.mjs`.

## Revision Notes

- **2026-07-29:** Added a distinct ICCP rectifier/groundbed workflow, explicit opt-in for field evidence, source-specific validation/results/sensitivity, conditional interference inputs, selected-unit result formatting, and accessible threshold-labeled profile charts with non-color line/marker differentiation and data tables.
- **2026-07-29:** Improved the desktop CP workflow with semantic dark-theme surfaces, a constrained primary CTA, three outcome-first KPI cards, persistent comparison baselines, compact design history, a readable default canvas viewport, quantitative interference geometry/source scoring, and a consolidated calculation-basis view. Added focused unit and Playwright coverage.
- **2026-07-28:** Reworked the page into a tool-first three-step workflow, added a denser desktop input grid, and moved evidence, interference, layout, compliance, formulas, and decision history into progressive-disclosure sections.
- **2026-04-16:** Fixed CP Layout Canvas zoom/pan viewport clamping so zoomed views can pan across the full drawable area without clipping lower grid/components, and increased max zoom for closer inspection.
- **2026-04-16:** Added CP Layout Canvas panel with draggable structure/anode/measurement objects, layer toggles, zoom/pan controls, bi-directional form syncing, and persisted layout geometry (`studyResults.cathodicProtection.cpLayout`).
- **2026-04-16:** Added commissioning-plan results section, checklist completion fields in the Study Approval panel (`who/when/evidence`), provisional compliance gating until evidence completion, and persisted report export payloads for JSON/PDF workflows.
- **2026-04-16:** Added measurement metadata inputs (test method/context/reference location), implemented correction-aware criteria normalization, separated raw vs corrected acceptance outputs, and added metadata sufficiency warnings in results.
- **2026-04-16:** Added standards profile configuration, machine-readable required-check keys in CP basis mapping, compliance status panel, and persisted compliance history snapshots.
- **2026-04-16:** Replaced single coating factor with selectable coating models (fixed / degradation curve / segment condition), added coating uncertainty sensitivity bands, and surfaced design-review scenario comparison with worst-case segment demand.
- **2026-04-15:** Initial documentation page added for CP sizing inputs, equations, assumptions/limits, references, and consistency guidance between required-mass and predicted-life relations.
