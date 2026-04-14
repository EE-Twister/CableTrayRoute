# EMF Analysis Workflow and Validation Contract

## Overview

This guide documents user expectations for the EMF workflow (`emf.html`) after integration coverage is in place. It aligns field-calculation behavior with automated checks so operators and testers use the same acceptance criteria.

---

## Input Assumptions

- **Load current** must be greater than zero.
- **Frequency** is selected from supported mains options (`50 Hz` or `60 Hz`).
- Geometry inputs are valid numbers:
  - cable sets,
  - tray width (in),
  - cable outer diameter (in),
  - measurement distance (in).
- For deterministic comparisons, use fixed fixtures (same geometry/current/frequency each run).

---

## Expected Outputs

- **Calculate Field** returns both:
  - `B_rms` (µT),
  - `B_peak` (µT).
- Compliance section always includes both labels:
  - `ICNIRP Occupational`,
  - `ICNIRP General Public`.
- Status badges are constrained to `PASS` or `FAIL`.
- **Field Profile (0–120 in)** renders a non-empty profile curve when inputs are valid.

---

## Compliance Interpretation

- In this workflow, PASS/FAIL reflects threshold comparisons used by the application UI and tests:
  - **General Public:** 200 µT,
  - **Occupational:** 1000 µT.
- Near-threshold scenarios should be interpreted using tolerance bands from integration acceptance policy (to account for numeric sampling resolution).
- A PASS result does not replace formal site-specific engineering studies; it confirms behavior against the configured ICNIRP-style limits in the tool.

---

## Export Behavior

- The EMF workflow is primarily analytical/on-screen in the current integration contract.
- There is no dedicated EMF file export requirement in the targeted acceptance scenarios.
- If EMF data is captured in downstream reports, it should use the same computed result state shown in the UI.

---

## Troubleshooting (Common Validation Failures)

- **Input Error modal appears immediately**
  - Cause: current entered as `0` or negative.
  - Fix: set current to a value `> 0` and rerun.

- **Compliance badge unexpectedly flips near a limit**
  - Cause: value is close to a threshold where tolerance policy applies.
  - Fix: verify fixture inputs and compare measured `B_rms` against tolerance-aware boundary expectations.

- **Field profile stays hidden or empty**
  - Cause: one or more invalid numeric inputs blocked profile generation.
  - Fix: correct all numeric fields (especially current), then rerun **Field Profile (0–120 in)**.

- **Results look stale after a failed run**
  - Cause: validation blocked recalculation, so prior successful result remains visible.
  - Fix: resolve input errors and rerun calculation to refresh values.
