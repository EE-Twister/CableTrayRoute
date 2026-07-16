# Calculation Accuracy Review

Review of the engineering calculation modules for formula/numerical errors and
for clarity of the inputs and assumptions each calculation makes. Findings are
grouped into **corrected errors** (output was wrong) and **clarified
assumptions** (output unchanged, but a simplification/limitation is now
documented so users are not misled).

## Corrected errors

| Module | Issue | Fix |
| --- | --- | --- |
| `analysis/groundGrid.mjs` | `Kii` corner-weighting factor was **inverted** vs IEEE 80-2013 Eq. 82 (returned `1` for grids without rods and `1/(2n)^(2/n)` for grids with rods — backwards). This skewed the mesh factor Km and therefore the mesh voltage Em used for the touch-voltage safety check. | `Kii = hasRods ? 1 : 1/(2n)^(2/n)` |
| `analysis/harmonics.js` | IEEE 519 **voltage THD limit table was wrong**: 69–161 kV was checked against 8 % (should be 2.5 %), > 161 kV against 12 % (should be 1.5 %), and < 1 kV was not distinguished from MV. The high-voltage limits were far too lenient — a 138 kV bus would pass at 8 % when the standard requires 2.5 %. | IEEE 519-2022 Table 1: ≤1 kV → 8 %, ≤69 kV → 5 %, ≤161 kV → 2.5 %, > 161 kV → 1.5 % (test copy corrected too). |
| `analysis/seismicBracing.mjs` | Vertical seismic force applied the importance factor `Ip` in the bracing-required branch (`0.2·SDS·Ip·Wp`) but not in the no-bracing branch. ASCE 7 §12.4.2.2 defines `Ev = 0.2·SDS·D` with **no Ip**. | Both branches now use `0.2·SDS·Wp`. |
| `cabletrayfill.js` | NEC Table 392.22(A) **Column 2 ladder-tray allowable fill areas for 30″ and 36″ trays were wrong** (32.5 / 39.0 in², breaking the linear width × 7/6 progression), producing false "exceeds allowable" warnings. | 30″ → 35.0 in², 36″ → 42.0 in² (both lookup tables). |
| `conduitfill.js` | The per-row **Count column was collected but ignored** — fill area and the 1/2/over-2 conductor fill limit (NEC Chapter 9 Table 1) were based on the number of table rows, not the number of conductors. A row with Count = 3 was treated as one conductor. | Each row is expanded into `count` conductors before area, limit selection, packing, and jam-ratio checks. |
| `analysis/arcFlash.mjs` and `analysis/dcShortCircuit.mjs` | Calculated incident energy was incorrectly converted into task-based PPE categories, including a non-existent "Category 5." The incident-energy and PPE-category-table methods are separate NFPA 70E selection methods. | Calculations now report the incident-energy method and a conservatively rounded-up minimum arc rating; they do not assign a PPE category. |
| `analysis/dcShortCircuit.mjs` | The DC model used a nonstandard `2π`/calorie-factor expression, a fixed enclosure multiplier, and counted a one-way cable resistance only once. | Uses the Ammerman open-air `Earc/(4πd²)` and LV-switchgear enclosure `kEarc/(a²+d²)` equations, converts units explicitly, and uses `Rb + 2Rc(one-way) + Rbus`. |
| `analysis/loadCombinations.mjs` | The seismic stability combination applied vertical earthquake load as `0.9D + Ev`, losing the downward/uplift sign reversal. | LC-S2 now uses `0.9D − Ev`, and the envelope retains minimum and maximum-absolute vertical demand for uplift checks. |
| `analysis/capacitorBank.mjs` | 7th-harmonic detuning rationale text said "shift resonance below h=5" (copy/paste from the 5th-harmonic branch). | Corrected to "below h=7". |
| `analysis/supportSpan.mjs` and `analysis/productConfig.mjs` | NEMA traditional load classes were decoded incorrectly (for example, `12A` was treated as 12 lb/ft at 12 ft). In the traditional designation, the number is the span in feet and A/B/C represents 50/75/100 lb/ft. | Replaced the class tables with the 8/12/16/20 ft × 50/75/100 lb/ft combinations. Product selection now checks both required span and actual cable weight without cubic load reinterpretation. |
| `analysis/busDuctSizing.mjs` | Single-phase voltage drop applied a two-conductor loop and then an extra `√3`, overstating the drop by `√3`. | Single-phase now uses `2 I L (R cosφ + X sinφ)`; three-phase retains `√3 I L (R cosφ + X sinφ)`. |
| `analysis/motorStartCalc.mjs` | Soft-starter input current was scaled by applied voltage squared. The square-law relationship applies to motor torque; supply current during voltage ramp is approximately proportional to voltage for the model used here. | Soft-starter current now scales as `I = I_LR × V_pu`; torque remains proportional to `V_pu²`. |
| `analysis/windLoad.mjs` | NEMA tray capacity was scaled linearly with inverse span. For the stated L/100 deflection model, allowable uniform load scales with `1/L³`; the linear rule overstated capacity at spans longer than the class reference span. | Capacity normalization now uses `w_actual-span = w_rated × (L_rated/L_actual)³`, and the class table includes all 8/12/16/20 A/B/C combinations. |

| `analysis/generatorSizing.mjs` | Altitude and ambient-temperature factors were multiplied into the load, which reduced the recommended nameplate rating at adverse sites. The built-in size selector also returned 2,000 kW even when the requirement exceeded that catalog ceiling, and NFPA 110 Type was described as a runtime/application class. | Required nameplate kW now divides site load and motor-step demand by the combined available-capacity factor. Above-range requirements return no selected size and a warning. NFPA 110 Type is limited to restoration time; runtime is identified as a separate Class/project requirement. |
| `analysis/harmonics.js` and downstream report/coach consumers | Capacitor kVAR was used as if it were susceptance in siemens, making the shunt model 1,000 times too large. The calculation also inferred fundamental current without power factor and downstream UI/report logic presented a single-source screen as IEEE 519 compliance. | Capacitor susceptance now uses `B = kvar × 1000 / V_LL²`, source impedance is derived from three-phase short-circuit MVA with explicit X/R scaling, and current uses direct amperes or three-phase kW/voltage/power factor. Missing bus voltage or short-circuit MVA withholds VTHD. Results and recommendations are explicitly screening-only pending PCC aggregation and TDD evaluation. |
| `analysis/voltageStability.mjs` | Q injection was clamped at zero net reactive load, flattening the Q-V sweep once injection exceeded the original demand. Sequential Newton-Raphson nonconvergence was labeled as a physical collapse/nose and converted into unsupported MW/MVAR stability margins. | Q injection can now produce net capacitive bus demand. Solver nonconvergence is reported only as a numerical boundary; physical P-V nose and reactive margins are withheld pending continuation power flow. UI, chart accessibility labels, contracts, and documentation use the same semantics. |
| `analysis/insulationCoordination.mjs` | Protective margin was calculated from derived required withstand (`Ucw`) divided by arrester residual voltage, so selecting a higher BIL/SIL did not change the reported coordination margin. | Protective margin now uses the selected equipment withstand: `(selected BIL or SIL / arrester residual − 1) × 100`. The deterministic calculation remains a preliminary screen and identifies IEC 60071-2:2023 review and manufacturer insulation/arrester data as required for final coordination. |

## Major rework: full standard implementations

| Module | What was done |
| --- | --- |
| `analysis/arcFlash.mjs` + new `analysis/ieee1584.mjs` | Replaced the previous IEEE 1584-2002-style heuristic with a **faithful IEEE 1584-2018 implementation**: the full coefficient tables (Tables 1–7), the intermediate average arcing current, the arcing-current variation correction factor, the enclosure-size correction (equivalent enclosure size + Table 7 polynomials), the voltage interpolation between the 600/2700/14 300 V models, and the incident-energy and arc-flash-boundary equations. `runArcFlash` now evaluates **both the maximum (full) and minimum (reduced) arcing-current scenarios** — each with its clearing time determined at the arcing current, not the bolted fault — and reports the worst-case energy, as the standard requires. Validated to the standard's **Annex D.1 (MV) and D.2 (LV) worked examples** in `tests/ieee1584.test.mjs` (I_arc, E, and AFB all within rounding). Out-of-range inputs are flagged. The TCC arc-flash limit-curve overlay and the `ieee1584-arc-flash` validation benchmark were updated to the 2018 model. |
| `src/voltageDrop.js` + new `src/necTable9.mjs` | Voltage drop now uses the **full AC formula** `Vd = factor·I·L·(R·cosθ + X·sinθ)` with **NEC Chapter 9 Table 9 AC resistance and reactance** (75 °C, magnetic vs non-magnetic conduit) and the **load power factor** (`cable.power_factor`, default 0.9). Reactance is no longer neglected, so the result is correct for low-PF and large-conductor circuits. Falls back to temperature-corrected DC resistance (X = 0) when a size is not tabulated. Validated against a hand calculation in `tests/voltageDropReactance.test.mjs`. |

## Clarified assumptions (no numeric change)

| Module | Assumption now documented |
| --- | --- |
| `analysis/arcFlash.mjs` | Input defaults (electrode config VCB/VOA, gap 25 mm, working distance 455 mm, 508 mm cube enclosure, 0.48 kV, 0.2 s clearing time) are listed in the docstring and surfaced per-result when an input is missing. |
| `analysis/seismicBracing.mjs` & `analysis/seismicWindCombined.mjs` | The component-force equation is the **ASCE 7-16 §13.3.1 form** (`Fp = 0.4·ap·SDS·Wp·(1+2z/h)/(Rp/Ip)`); the revised ASCE 7-22 §13.3.1 equation (Hf, Rμ, Car, Rpo) is **not** implemented. The 12 ft / 40 ft brace spacings are NEMA VE 2 guidance values, not literal ASCE 7 limits. SDC E/F are derived from conservative SD1 thresholds as a stand-in for the §11.6 `S1 ≥ 0.75` rule, because the tool collects SD1 but not S1. |
| `src/voltageDrop.js` | Power factor defaults to 0.9 lagging when `cable.power_factor` is absent; conduit material defaults to non-magnetic (PVC/aluminum) for the Table 9 column selection. |

## Verified correct (audited, no change needed)

`analysis/iec60909.mjs` (c-factors, κ, K_T, ip, Ik1/Ik2/Ik3),
`analysis/dcShortCircuit.mjs` (Stokes-Oppenlander arc voltage and corrected Ammerman/Wilkins energy-density models),
`analysis/iec60287.mjs` (ampacity, thermal resistances, dielectric loss),
`analysis/windLoad.mjs` (`qz = 0.00256·Kz·Kzt·Ke·V²`, Kz profile),
`analysis/structuralLoadCombinations.mjs` / `loadCombinations.mjs` (ASCE 7 §2.3/§2.4 combos),
`analysis/supportSpan.mjs` (5wL⁴/384EI span scaling after the class-table correction),
`analysis/cableFaultBracing.mjs` (single- and three-phase electromagnetic force),
`analysis/conduitFill.mjs` (NEC Chapter 9 fill limits — correctly multiplies by conductor count),
`analysis/intlCableSize.mjs` (IEC/AS-NZS ampacity tables and correction factors),
`analysis/motorStartCalc.mjs` (FLA and reduced-voltage starter currents after the soft-starter correction),
and the grounding tolerable touch/step voltage equations in `groundGrid.mjs`.
