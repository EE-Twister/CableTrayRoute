# Validation Evidence Coverage

## Purpose

This application distinguishes automated regression protection from independently sourced validation evidence. A passing unit, integration, or browser test demonstrates that implemented behavior remains stable; it does not by itself demonstrate agreement with a published worked example, manufacturer data, an independent solver, or a governing standard.

The build-generated `dist/validationManifest.json` inventories production modules under `analysis/` and reports both totals separately. Test files and the benchmark runner/library infrastructure are excluded from the analysis-module denominator.

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

As of 2026-08-12, the generated manifest reports:

- 157 production analysis modules;
- 13 documented fixtures;
- 5 fixtures that qualify as published evidence;
- 5 analysis modules mapped to published evidence (3.2%);
- 152 analysis modules without published evidence.

These counts are generated from the worktree and may change as modules are added, moved, or mapped. The validation page displays the generated values rather than a hand-maintained claim.

## Evidence added in this tranche

### S&C SMU-20 25E time-current geometry

S&C TCC 153-2 publishes the 25E minimum-melting source curve. The executable `TCC-SC-001` benchmark verifies that `analysis/timeCurrentCurve.mjs` retains the 28-point vertical segment at 49.5972 A and selects 32.1639 s for the lower/minimum-melting boundary. The 602.961 s maximum source-point value is also retained.

This evidence validates source-geometry handling only. It does not promote the device record for production calculations, establish coordination settings, validate a clearing curve, or authorize arc-flash clearing-time use.

Primary source: [S&C TCC 153-2 spreadsheet](https://www.sandc.com/globalassets/sac-electric/documents/public---documents/sales-manual-library---external-view/tcc-number-153-2.xlsx)

### ABB/Baldor FPM2555TS motor current

ABB publishes 100 hp, 460 V, 0.85 power factor, 94.1% efficiency, 117 A full-load current, and 680 A starting current for the FPM2555TS motor. The executable `MSTART-ABB-001` benchmark checks the three-phase horsepower-to-current calculation in `analysis/motorStartCalc.mjs` against the published full-load value and verifies propagation of the published starting-current ratio.

This evidence does not validate source-impedance voltage sag, acceleration time, load torque, starter transitions, or a project-specific motor-starting study.

Primary source: [ABB/Baldor FPM2555TS performance data](https://library.e.abb.com/public/ad9edd95b42f44ddac04b5e6ee921429/FPM2555TS.pdf)

## Next evidence priorities

The next benchmark tranche should prioritize consequence and model complexity rather than page count:

1. Short-circuit and protection: independently published IEC 60909 and ANSI/IEEE worked cases, breaker asymmetry/duty, relay curves, and transformer/generator contributions.
2. Cable thermal and raceway studies: accessible manufacturer or standards worked examples for IEC 60287, duct-bank mutual heating, conduit fill, tray fill, and environmental derating.
3. Network studies: recognized solved cases for load flow, motor starting voltage recovery, transient stability, harmonics, and optimal power flow with the independent solver/version recorded.
4. Grounding and safety: independently reproducible IEEE 80 cases, soil-model cases, touch/step limits, and arc-flash cases across voltage and electrode configurations.
5. Reports and orchestration: trace each published numerical case through input normalization, study execution, persisted results, and exported report values.

Promotion requires a primary source or a fully recorded independent solver comparison, stated inputs and units, expected values and tolerances, executable linkage, implementation-module mapping, and explicit limitations.

## Engineering boundary

This evidence is technical verification support. It is not licensed-engineer approval, standards certification, AHJ acceptance, or authorization to use results without project-specific engineering review.
