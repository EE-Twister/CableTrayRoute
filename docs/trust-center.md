# Trust Center

The Trust Center verifies that CableTrayRoute calculation engines produce results consistent with published industry benchmarks derived from IEEE, IEC, NEC, and NFPA standards.

## Purpose

Engineering software is trusted when its outputs can be independently verified. The Trust Center addresses Gap #78 in the competitor analysis by providing:

- **Benchmark library** — canonical known-answer problems (KAPs) with analytically-derived expected values
- **Benchmark runner** — executes each KAP against the live calculation engine in the browser
- **Pass/fail reporting** — side-by-side comparison of actual vs. expected with % deviation and tolerance
- **Standard references** — each benchmark cites the governing standard and formula

## Accessing the Trust Center

Navigate to **Support → Trust Center** in the top navigation, or search for "Trust Center" in the command palette.

## Running Benchmarks

Click **Run All Benchmarks**. Each benchmark is run synchronously in the browser against the production code — no server request is made and no project data is modified.

Results are shown in a table. Click any row or its **Details** button to expand the individual checks.

## Benchmark Coverage

| ID | Study Type | Governing Standard | What It Verifies |
|----|-----------|-------------------|-----------------|
| EMF-001 | EMF Analysis | Biot-Savart law; IEC 62110:2009 | Magnetic flux density from a 100 A conductor at 1 m: B = µ₀I/(2πd) = 20.000 µT |
| EMF-002 | EMF Analysis | ICNIRP 2010; IEC 62110:2009 | Compliance at 150 µT: below both GP (200 µT) and occupational (1000 µT) limits |
| EMF-003 | EMF Analysis | ICNIRP 2010; IEC 62110:2009 | Compliance at 250 µT: GP limit exceeded, occupational limit not exceeded |
| BAT-001 | Battery / UPS Sizing | IEEE 485-2010 §4 | Duty-cycle energy: 10 kW×2 h + 5 kW×1 h = 25 kWh |
| BAT-002 | Battery / UPS Sizing | IEEE 485-2010 §5.2–5.4 | Li-ion design capacity at 25 °C, 10 % margin: 15.44 kWh |
| VDROP-001 | Voltage Drop | NEC 2023 Art. 210.19(A)(1) | #12 AWG Cu / 10 A / 30 ft → below 3 % limit, status = pass |
| VDROP-002 | Voltage Drop | NEC 2023 Art. 210.19(A)(1) | #14 AWG Cu / 20 A / 150 ft → above 3 % limit, status = warn or fail |

## Interpreting Results

- **✓ Pass** — the engine output matches the analytically-derived expected value within the stated tolerance.
- **✗ Fail** — the output deviates beyond tolerance. This indicates a potential regression in the calculation engine and should be investigated before relying on the affected study type for design decisions.

Tolerances account for IEEE 754 floating-point rounding. For example, EMF-001 allows ±0.01 µT on a 20 µT result (0.05 % relative error).

## Architecture

The Trust Center is implemented as three layers:

| File | Role |
|------|------|
| `analysis/benchmarkLibrary.mjs` | Benchmark definitions: inputs, expected outputs, tolerances, standard references |
| `analysis/benchmarkRunner.mjs` | Execution engine: calls `bm.run()`, evaluates checks, returns structured results |
| `trustcenter.js` | UI layer: renders summary card, results table, expandable detail panels |

The library and runner have no DOM access and are fully testable in Node.js (see `tests/trustcenter.test.mjs`).

## Adding New Benchmarks

Add an entry to the `BENCHMARKS` array in `analysis/benchmarkLibrary.mjs`:

```js
{
  id: 'ARC-001',
  label: 'IEEE 1584 incident energy — 480 V switchgear',
  studyType: 'Arc Flash',
  standardRef: 'IEEE 1584-2018 Table B.2',
  description: '480 V, 32 kA bolted fault, 18-inch working distance. Expected: 8.5 cal/cm².',
  run() {
    // call the relevant analysis function with known inputs
    return { energy_cal_cm2: runArcFlash({ voltage: 480, ... }).incidentEnergy };
  },
  checks: [
    {
      key: 'energy_cal_cm2',
      description: 'Incident energy (cal/cm²)',
      expectedVal: 8.5,
      tolerance: 0.5,
    },
  ],
},
```

Add a corresponding test case in `tests/trustcenter.test.mjs` following the existing pattern.
