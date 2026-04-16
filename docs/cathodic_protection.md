# Cathodic Protection (CP) Sizing — Inputs, Equations, and Limits

**Page:** `cathodicprotection.html`  
**Module:** `cathodicprotection.js`

This guide documents the engineering basis used by the Cathodic Protection sizing tool for buried metallic structures.

## Inputs and Units

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
| Anode capacity | C<sub>a</sub> | Ah/kg | Net ampere-hour capacity basis for selected anode alloy/system. |
| Anode utilization | u | fraction | Fraction of theoretical anode capacity considered usable. |
| Design factor | F<sub>d</sub> | fraction | Reliability/engineering margin factor used in mass/life equations. |
| Availability factor | F<sub>avail</sub> | fraction | System uptime factor; required current is divided by this factor. |
| Target design life | L<sub>target</sub> | years | Converted internally to hours (`years × 8760`). |
| Installed anode mass | M<sub>inst</sub> | kg | Used for predicted-life calculation. |

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

I<sub>req</sub> = A<sub>exposed</sub> × i<sub>design,A</sub>

Availability-adjusted current used for sizing:

I<sub>adj</sub> = I<sub>req</sub> / F<sub>avail</sub>

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

### 7) Sensitivity and design-review scenarios

- Sensitivity now uses coating uncertainty bands (`low`, `base`, `high`) derived from the selected coating model.
- Scenario table includes per-scenario design-review status (`Approved` or `Review required`) from safety margin outcome.
- Worst-case segment demand is reported using local segment attenuation and condition factor weighting to expose localized current peaks.


### 8) Measurement correction and criteria normalization

Acceptance checks now evaluate **corrected** values and retain raw values in output:

- For `on-potential` tests with supplied IR drop: `V_corrected = V_raw + |ΔV_IR|`
- For `coupon` tests with supplied depolarization: `V_corrected = V_raw + |ΔV_coupon|`
- For coupon workflows with missing explicit polarization shift, the shift defaults to `|ΔV_coupon|`

When required metadata is missing (unknown context/location, no compensation value for ON/coupon methods, or compensation explicitly set to `none`), the study reports validation warnings so acceptance decisions can be reviewed with caution.

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

> Note: The tool uses these standards as design-basis references for equation form and parameter framing. Project-specific compliance still requires engineering sign-off against the exact edition and jurisdictional requirements.

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

## Layout Canvas and Persisted Geometry

The CP page now includes a **Layout Canvas** panel for visual placement and review of key CP objects:

- **Structure segments** are rendered as four labeled line segments.
- **Anodes** are rendered as draggable markers with optional wiring leads.
- **Measurement points** include draggable test points and a draggable reference electrode marker.
- **Spacing annotations** display anode spacing dimensions directly in the canvas.
- **Layer controls** can toggle structure, anodes, wiring, and measurement visibility.
- **Zoom/pan controls** support interactive navigation (`Zoom +`, `Zoom -`, `Fit View`, `Reset Layout`).

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

- **2026-04-16:** Added CP Layout Canvas panel with draggable structure/anode/measurement objects, layer toggles, zoom/pan controls, bi-directional form syncing, and persisted layout geometry (`studyResults.cathodicProtection.cpLayout`).
- **2026-04-16:** Added commissioning-plan results section, checklist completion fields in the Study Approval panel (`who/when/evidence`), provisional compliance gating until evidence completion, and persisted report export payloads for JSON/PDF workflows.
- **2026-04-16:** Added measurement metadata inputs (test method/context/reference location), implemented correction-aware criteria normalization, separated raw vs corrected acceptance outputs, and added metadata sufficiency warnings in results.
- **2026-04-16:** Added standards profile configuration, machine-readable required-check keys in CP basis mapping, compliance status panel, and persisted compliance history snapshots.
- **2026-04-16:** Replaced single coating factor with selectable coating models (fixed / degradation curve / segment condition), added coating uncertainty sensitivity bands, and surfaced design-review scenario comparison with worst-case segment demand.
- **2026-04-15:** Initial documentation page added for CP sizing inputs, equations, assumptions/limits, references, and consistency guidance between required-mass and predicted-life relations.
