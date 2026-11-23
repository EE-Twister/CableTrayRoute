# Validation Evidence Coverage

## Purpose

This application distinguishes automated regression protection from independently sourced validation evidence. A passing unit, integration, or browser test demonstrates that implemented behavior remains stable; it does not by itself demonstrate agreement with a published worked example, manufacturer data, an independent solver, or a governing standard.

The build-generated `dist/validationManifest.json` inventories production modules under `analysis/` and reports both totals separately. Test files, the benchmark runner/library, and fixture definitions under `analysis/benchmarks/` are excluded from the analysis-module denominator.

## Evidence classes

The machine-readable definitions live in `data/validationBenchmarks.json`.

| Evidence class | Counts as published evidence | Intended meaning |
| --- | --- | --- |
| `published_worked_example` | Yes | Expected outputs appear in an identified published worked example. |
| `manufacturer_data` | Yes | Expected values or source geometry are published by the equipment manufacturer. |
| `recognized_test_case` | Yes | A public industry/research case is paired with identified independent solver results. |
| `independent_analytical` | No | A separate derivation checks the implementation, but the expected output is not independently published. |
| `cross_tool_comparison` | No | Another tool was used, but the source record is not yet sufficient for promotion. |
| `screening_fixture` | No | Regression or plausibility evidence only. |

## Current build baseline

After the September 18 cable thermal tranche, the generated manifest reports:

- 172 production analysis files;
- 25 documented fixtures;
- 7 fixtures that qualify as published evidence;
- 6 mapped modules (3.5%);
- 166 files without published evidence.

The 172-file denominator includes analysis helpers and UI-facing modules; it does not represent 172 independent calculation solvers. The executable benchmark library contains 30 entries, while 25 fixtures are documented here; those are separate counts and should not be conflated. The September 17 tranche added nine entries to each inventory and removed the old grounding fixture's unsupported published-evidence classification. The cable thermal tranche adds two cross-tool comparisons without increasing the published-evidence count.

These counts are generated from the worktree and may change as modules are added, moved, or mapped. The validation page displays the generated values rather than a hand-maintained claim.

The [September 17 correction verification](calculation-correction-verification-2026-09-17.md)
adds independent numerical/boundary regression cases for fault currents, equipment
selection, and invalid thermal inputs. Benchmark comparisons now require actual
finite numeric values or booleans; missing/coerced values cannot pass. The two
voltage-drop fixtures use explicit PF/conduit inputs and tighter independent
expectations. These improvements do not increase the published-evidence count or
turn a screening fixture into a standards validation.

## Evidence added in this tranche

The [September 17 independent calculation evidence verification](calculation-evidence-verification-2026-09-17.md)
records the item 3 follow-up. Its executable fixtures cover transformer fault
current, unequal sequence impedances, protective-curve boundaries and
interpolation, generator–transformer voltage referral, conductor resistance,
simplified thermal heat balances, and ground-grid resistance and voltage limits.
Each new case records inputs, units, expected outputs, tolerance rationale,
source location, derivation, and applicability limits. The validation page and
Trust Center expose these records, and contract tests detect disagreement
between the documented and executable definitions.

The old IEEE 80 grounding fixture is now classified as screening evidence
because its claimed Annex B provenance could not be substantiated. Newly
evaluated ground-grid equations remain independent analytical evidence; they
do not inherit that old published-example claim. Published manufacturer
resistance values validate the resistance component only, not complete cable
ampacity or installation suitability.

### S&C SMU-20 25E time-current geometry

S&C TCC 153-2 publishes the 25E minimum-melting source curve. The executable `TCC-SC-001` benchmark verifies that `analysis/timeCurrentCurve.mjs` retains the 28-point vertical segment at 49.5972 A and selects 32.1639 s for the lower/minimum-melting boundary. The 602.961 s maximum source-point value is also retained.

This evidence validates source-geometry handling only. It does not promote the device record for production calculations, establish coordination settings, validate a clearing curve, or authorize arc-flash clearing-time use.

Primary source: [S&C TCC 153-2 spreadsheet](https://www.sandc.com/globalassets/sac-electric/documents/public---documents/sales-manual-library---external-view/tcc-number-153-2.xlsx)

### ABB/Baldor FPM2555TS motor current

ABB publishes 100 hp, 460 V, 0.85 power factor, 94.1% efficiency, 117 A full-load current, and 680 A starting current for the FPM2555TS motor. The executable `MSTART-ABB-001` benchmark checks the three-phase horsepower-to-current calculation in `analysis/motorStartCalc.mjs` against the published full-load value and verifies propagation of the published starting-current ratio.

This evidence does not validate source-impedance voltage sag, acceleration time, load torque, starter transitions, or a project-specific motor-starting study.

Primary source: [ABB/Baldor FPM2555TS performance data](https://library.e.abb.com/public/ad9edd95b42f44ddac04b5e6ee921429/FPM2555TS.pdf)

### Eaton transformer-terminal fault current

`FAULT-EATON-X1-1500KVA` checks the 57.279 kA value published for Eaton's
System A, Fault X1, using 1,500 kVA, 480 V, 3.5% transformer impedance, and the
example's explicit 0.9 impedance allowance. The fixture converts those inputs
to an equivalent impedance and checks the production fault calculation. Its
0.01 kA tolerance accounts for the source and application rounding. Motor
contribution and complete ANSI equipment duty are outside this case.

Primary source: [Eaton electrical formulas, printed page 238](https://www.eaton.com/content/dam/eaton/products/electrical-circuit-protection/fuses/solution-center/bus-ele-tech-lib-electrical-formulas.pdf).

### Prysmian conductor resistance

`TGE-THERM-001` checks the published 95 mm² copper DC resistance values at
20 °C and 85 °C, including Ω/km-to-Ω/m conversion and temperature correction.
The absolute tolerance is half the published table's 0.001 Ω/km resolution.
This maps published component evidence to `analysis/iec60287.mjs`; it does
not validate that module's complete ampacity, proximity-loss, or installation
models.

Primary source: [Prysmian Marine Cable Catalogue](https://no.prysmiangroup.com/sites/default/files/atoms/files/Marine%20Cable%20Catalogue_%20North%20Europe_web_2.pdf).

## Next evidence priorities

The September 18 [cable thermal tranche](cable-thermal-verification-2026-09-18.md)
adds `CABLE-THERMAL-001` and `CABLE-THERMAL-002`, mapped to the detailed
direct-burial thermal model. Their expected current and intermediate thermal
resistances come from Cableizer's public TB 880 Case 0 reports. These are
classified as `cross_tool_comparison` in the evidence ledger and do not increase
the published-evidence count. The source catalogue's descriptive
`published_cross_tool_reference` tag identifies where the data came from; it
does not promote the ledger classification.

The comparisons use supplied AC resistance, dielectric loss and sheath loss
factors; they exercise the thermal circuit only. Three additional Eland cable
records remain source-only because the datasheet does not fully specify
construction and bonding. They are not executable thermal-validation fixtures.

The next benchmark tranche should prioritize consequence and model complexity rather than page count:

1. Short-circuit and protection: independently published IEC 60909 and ANSI/IEEE worked cases, breaker asymmetry/duty, relay curves, and transformer/generator contributions.
2. Cable thermal and raceway studies: accessible manufacturer or standards worked examples for IEC 60287, duct-bank mutual heating, conduit fill, tray fill, and environmental derating.
3. Network studies: recognized solved cases for load flow, motor starting voltage recovery, transient stability, harmonics, and optimal power flow with the independent solver/version recorded.
4. Grounding and safety: independently reproducible IEEE 80 cases, soil-model cases, touch/step limits, and arc-flash cases across voltage and electrode configurations.
5. Reports and orchestration: trace each published numerical case through input normalization, study execution, persisted results, and exported report values.

Promotion requires a primary source or a fully recorded independent solver comparison, stated inputs and units, expected values and tolerances, executable linkage, implementation-module mapping, and explicit limitations.

## Engineering boundary

This evidence is technical verification support. It is not licensed-engineer approval, standards certification, AHJ acceptance, or authorization to use results without project-specific engineering review.
