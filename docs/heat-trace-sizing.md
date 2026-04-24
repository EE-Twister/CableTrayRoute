# Heat Trace Sizing

This note summarizes a practical hand-calculation workflow for electric heat tracing of process and utility piping. Use it as a preliminary design aid before final vendor selection and detailed thermal modeling.

## Calculation model and limits

A steady-state line-loss approach is used to estimate required heat output per linear foot of pipe:

\[
q_{\text{req}} = U_{\text{overall}} \times A_{\text{surface}} \times \Delta T \times M_{\text{env}} \times M_{\text{design}}
\]

Where:

- \(q_{\text{req}}\): required tracing power (W/ft)
- \(U_{\text{overall}}\): overall heat-transfer coefficient through insulation and external film
- \(A_{\text{surface}}\): exposed outer area per foot of run
- \(\Delta T\): maintain temperature minus minimum ambient design temperature
- \(M_{\text{env}}\): environment class multiplier
- \(M_{\text{design}}\): design margin multiplier

Typical scope limits for this simplified method:

- Intended for **steady-state maintain** duty, not rapid warm-up/startup transients.
- Assumes continuous insulation, nominally dry conditions, and no major thermal bridges except where explicitly added.
- Uses equivalent-length screening allowances for valves, supports, flanges, instrument taps, and custom heat sinks.
- Not a substitute for project-specific code compliance, hazardous area design, or manufacturer trace-circuit limits.

## Parallel trace runs and component allowances

The calculator distinguishes **required heat load** from **installed connected load**:

- Required heat load remains the calculated heat loss for the straight pipe run and is retained as `totalCircuitWatts` for compatibility.
- Installed connected load is based on selected cable W/ft, parallel trace run count, and effective trace length.
- Effective trace length equals straight pipe length plus component equivalent-length allowances.

The installed-load screening formulas are:

\[
\text{installed W/ft} = \text{selected cable W/ft} \times \text{trace run count}
\]

\[
\text{effective length} = \text{pipe length} + \sum(\text{component quantity} \times \text{equivalent ft each})
\]

\[
\text{installed W} = \text{installed W/ft} \times \text{effective length}
\]

Built-in equivalent-length defaults are:

| Component | Default equivalent length |
| --- | ---: |
| Valve | 5 ft each |
| Flange pair | 2 ft each |
| Pipe support | 1 ft each |
| Instrument tap | 2 ft each |
| Custom | 0 ft each |

These allowances are screening assumptions. Replace them with project details, valve/flange geometry, insulation kits, manufacturer installation standards, and owner specifications before final design. Multiple runs over the same pipe are also screening inputs; final designs may split runs across circuits based on startup current, cable-family maximum length, controller limits, or installation spacing rules.

## Pipe material assumptions and correction factors

Pipe wall conductivity has secondary influence compared with insulation, but material assumptions still affect conservatism at high temperature or large diameters.

Use baseline carbon steel line-loss values unless project standards require otherwise, then apply a material correction factor:

| Pipe material | Suggested factor \(F_{\text{mat}}\) | Notes |
| --- | ---: | --- |
| Carbon steel | 1.00 | Baseline for most utility/process runs |
| Stainless steel | 1.02 | Slightly higher conservatism for lower conductivity |
| Copper | 0.98 | Higher conductivity; may slightly reduce local gradients |
| Plastic/composite | 1.05-1.15 | Validate temperature limits and support spacing |

Apply as:

\[
q_{\text{req,mat}} = q_{\text{req}} \times F_{\text{mat}}
\]

If heat trace is controlled by thermostats or line-sensing controllers, verify both **minimum output at design cold** and **maximum sheath/jacket temperature** at reduced load.

## Insulation type assumptions

Insulation thermal conductivity is a first-order driver of line losses. The calculator supports common insulation materials with representative conductivity values:

| Insulation type | Conductivity \(k\) (W/m·K) | Practical note |
| --- | ---: | --- |
| Closed cell foam | 0.028 | Lower heat dissipation; common for freeze protection and moisture resistance |
| Mineral wool | 0.040 | Common process piping baseline; good high-temperature performance |
| Fiberglass | 0.042 | Similar to mineral wool for many preliminary studies |
| Calcium silicate | 0.060 | Higher conductivity; often used where compressive strength is needed |
| Aerogel blanket | 0.021 | Premium low-loss insulation for constrained space/high performance |

These are screening-level values. Use project or manufacturer data sheets for final design and hot-service verification.

## Environment classes and multipliers

Use environment multipliers to account for exposure severity beyond nominal still-air assumptions.

| Environment class | Description | Multiplier \(M_{\text{env}}\) |
| --- | --- | ---: |
| E1 | Indoor, sheltered, no washdown | 1.00 |
| E2 | Outdoor, low wind, weather-protected | 1.10 |
| E3 | Outdoor, wind-exposed process areas | 1.20 |
| E4 | High wind/coastal or frequent wetting | 1.30 |
| E5 | Severe cyclic wet/freezing service | 1.40 |

Project teams may replace these with corporate or site climatology factors. Keep one documented source of truth for consistency across all line classes. For outdoor runs, include measured or design wind speed (including values above 20 mph) to avoid understating convective losses.

## Example hand-check calculation

Given:

- 2 in NPS carbon steel pipe, 1 ft calculation length
- Maintain temperature: 50 °C (122 °F)
- Minimum ambient: -10 °C (14 °F)
- Insulated OD area per foot: \(A_{\text{surface}} = 0.86\,\text{ft}^2/\text{ft}\)
- Overall U-value estimate: \(U_{\text{overall}} = 0.55\,\text{W}/(\text{ft}^2\cdot\!^\circ\text{F})\)
- Environment class E3: \(M_{\text{env}} = 1.20\)
- Design margin: \(M_{\text{design}} = 1.15\)
- Material factor (carbon steel): \(F_{\text{mat}} = 1.00\)

Step 1: Temperature difference

\[
\Delta T = 122 - 14 = 108\,^\circ\text{F}
\]

Step 2: Base line loss

\[
q_{\text{base}} = U \times A \times \Delta T
= 0.55 \times 0.86 \times 108
= 51.1\,\text{W/ft}
\]

Step 3: Apply environment and design margin

\[
q_{\text{req}} = 51.1 \times 1.20 \times 1.15
= 70.5\,\text{W/ft}
\]

Step 4: Apply material factor

\[
q_{\text{req,mat}} = 70.5 \times 1.00 = 70.5\,\text{W/ft}
\]

Preliminary selection would therefore target the next available trace-circuit capacity at or above **70.5 W/ft**, then confirm circuit length, breaker sizing, controller strategy, and startup behavior.

## Notes on standards references and design margins

- IEEE 515 is commonly used as a design framework for electrical resistance heat tracing systems, including system architecture, control philosophy, and installation considerations.
- Treat this document as context support only; always use the latest adopted edition in your jurisdiction or client specification.
- Typical design margins for early sizing are often 10-25%, depending on data quality, climatic uncertainty, and criticality.
- When freeze protection is safety- or production-critical, use a structured margin policy (environment + uncertainty + aging) rather than a single arbitrary adder.
- Final design should reconcile process maintain temperature, insulation specification, power availability, hazardous area constraints, and manufacturer-specific cable output curves.

## Heat trace cable type

The calculator includes a **Heat trace cable type** input so the branch schedule and report clearly state the selection basis:

| Cable type | Screening use | Final verification focus |
| --- | --- | --- |
| Self-regulating | Default for many freeze-protection and maintain-temperature applications | Temperature-dependent output curve, startup current, max circuit length |
| Constant wattage | Fixed-output branch screening | Controller strategy, sheath temperature, over-temperature protection |
| Power-limiting / zone | Industrial branch screening where zone-style cable is expected | Zone length, startup current, manufacturer output tables |
| Mineral insulated | Specialty or high-temperature branch screening | Resistance design, bend radius, terminations, sheath temperature |

In this release, cable type changes the recorded basis and warning language; it does not replace manufacturer-specific output curves. The selected W/ft remains a screening-level standard rating that must be reconciled with the cable family, voltage, exposure, startup behavior, and maximum circuit length during final design.

## Heat Trace dashboard sections and interpretation

The Heat Trace Sizing workspace is organized into five dashboard sections so reviewers can move from quick screening to traceable assumptions without leaving the page:

1. **Overview**
   - High-level KPI cards: base heat loss, required heat input, recommended watt density, and circuit length check.
   - Current assumptions snapshot for ambient, maintain, insulation, and selected multipliers.
   - The system overview image includes numbered callouts for pipe wall, insulation, heat trace cable, and ambient exposure to match the legend below the image.
2. **Heat Loss**
   - Step-by-step thermal-resistance breakdown (insulation + external film) and resulting base W/ft (or W/m).
   - Displays which assumptions dominate the loss so users can quickly identify leverage points.
3. **Branch Circuit**
   - Defines the heat-trace branch/load circuit from the controller or heat-trace panel output to the traced run.
   - Shows cable type, selected cable density, parallel run count, installed connected watts, required heat load, branch voltage, estimated branch current, effective trace length, maximum allowable circuit length, utilization status, and warnings.
   - Excludes upstream feeder, transformer, panel bus, and breaker coordination sizing; use the branch load outputs as inputs to those separate studies.
4. **Temperature Profile**
   - Charted maintain-to-ambient gradient view used as a screening visualization for thermal headroom.
   - Intended to show relative behavior across the configured range; not a transient startup model.
5. **Report**
   - Generates a printable HTML calculation sheet and JSON report package for the active run and saved heat-trace branches.
   - Includes active inputs, thermal resistance terms, heat-loss components, cable selection basis, branch schedule, warnings, assumptions, and engineer review status.
6. **Sensitivity**
   - Baseline-delta explorer for insulation thickness, ambient temperature, wind speed, maintain temperature, and safety margin.
   - Ranks single-change recommendations and exposes quick-apply controls.

The sidebar also includes an **Assumptions** tab for the simplified sizing method and a **Pipe / Circuit List** for building a branch schedule. Use **Add Current Branch** to store the active form values, **Edit** to load and update a saved case, **Duplicate** to copy an existing case for a similar run, and **Remove** to delete a case from the schedule. Saved branches are independent in this release; panel/source grouping is intentionally left out of scope.

Saved branch cases are normalized for reporting with:

- branch id and name,
- unit system and original inputs,
- sizing result, heat trace cable type, and selected W/ft,
- trace run count, component equivalent-length allowances, effective length, installed connected watts, required heat load, and estimated load amps,
- created/updated timestamps,
- branch status and warnings.

The unified Project Report also adds a **Heat Trace Branch Circuit Schedule** section whenever heat trace results or saved branches exist in the project studies.

## New analysis outputs

In addition to the required W/ft calculation, the dashboard now exposes screening outputs that support design review discussions:

- **Thermal resistance terms:** `insulationKmPerW`, `externalKmPerW`, `totalKmPerW`
- **Applied multipliers/factors:** `environmentMultiplier`, `materialFactor`, `safetyFactor`
- **Sizing diagnostics:** cable utilization %, available margin vs recommended cable, and circuit-length pass/fail indicators
- **Installed-load screening:** `traceRunCount`, `componentAllowanceLengthFt`, `effectiveTraceLengthFt`, `installedWPerFt`, `installedTotalWatts`, `installedLoadAmps`, and `coverageRatio`
- **Profile context:** plotted maintain/ambient relationship to highlight low-headroom scenarios

These outputs are intentionally transparent so engineering teams can replicate the arithmetic in hand checks and quickly identify whether a change is driven by environment, insulation, or design margin assumptions.

## Recommendation insight generation logic

Recommendation insights in the Sensitivity section are generated from one-step perturbation analysis around the saved baseline:

1. Hold all other inputs constant.
2. Apply a bounded change to one driver (for example, +insulation thickness or -ambient severity).
3. Recompute required heat input.
4. Rank actions by absolute reduction in required output and by practical applicability.

**Quick Apply** actions copy the recommended single change back into the active form controls and trigger a full recalculation so users can continue iterative screening from the suggested case.

Use **Use Current Inputs as Baseline** whenever assumptions change materially and you want future deltas to compare against the new operating point.

## Scope and final verification

This dashboard is intended for **screening-level design** and option comparison. It does not replace final vendor engineering.

Before procurement or IFC issue, perform vendor/manufacturer verification for:

- cable output curves across expected operating and startup conditions,
- maximum circuit length and breaker/control compatibility,
- sheath/jacket temperature limits,
- hazardous area and installation code compliance,
- project-specific insulation and weather exposure details.
