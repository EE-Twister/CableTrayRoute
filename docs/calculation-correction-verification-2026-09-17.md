# Calculation correction verification

This follow-up addresses findings **C1–C10** from the [September 16 calculation and feature review](calculation-feature-review-2026-09-16.md). Verification artifacts use September 17 UTC. Luna implemented the corrections; the orchestrator independently checked formulas, boundary cases, consumers, and regression outcomes in the shared working tree based on `39f00686d863a5ef51f43a9fe6f188fc279883e2`.

**Overall class: Screening only.** Correcting these software defects does not validate every topology, certify agreement with an adopted standards edition, or supply missing manufacturer evidence. The earlier review remains a historical record of the defects as reproduced.

**Acceptance status: C1–C10 corrected and verified within the stated scope.** The original feature-depth proposals and evidence limitations remain separate from these ten reproducible defects.

## Acceptance evidence

| Finding | Corrected behavior | Independent acceptance basis |
| --- | --- | --- |
| C1 | Stable thermal exponential and correct endpoint limits; invalid duration/frequency withheld | X/R 0.1–1,000 at 50/60 Hz, independent time-constant expression; X/R 0.5, 50 Hz, 1 s gives m = 0.0007957747; κ endpoints give 0 and 1 |
| C2 | Line-to-line faults use complex Z1 + Z2 | Unequal 11 kV example gives 39.28 kA after output rounding |
| C3 | Separate B/C phase and earth-residual currents in ANSI and IEC; compatibility field is max(B,C) | Independent sequence-to-phase transform gives 37.61 / 39.88 / 19.54 kA for the unequal-sequence example; equal-sequence case gives 34.76 kA |
| C4 | Missing/invalid required impedance yields null currents and incomplete/unevaluated status | Both methods tested with an isolated 11 kV bus; output contract checks cover missing-input details |
| C5 | Capacitor catalog overflow yields no selected bank or resonance result | 6,915.2 kvar requirement exceeds the 2,400 kvar catalog; at/below/above limit cases |
| C6 | UPS catalog overflow separately marks no adequate selection in both sizing methods | 1,000 kW at PF 0.9 requires 1,111.11 kVA; no 1,000 kVA recommendation |
| C7 | Busway adequacy requires final derated ampacity to cover demand | 6,000 A / 5,000 A and adverse-temperature cases are inadequate; 5,000 A nominal case remains adequate |
| C8 | Invalid thermal inputs/geometry rejected before saving | 1 mm burial, non-finite inputs, invalid core count/method, and impossible conduit geometry rejected; valid baseline remains finite |
| C9 | Benchmarks require present, finite numeric values or actual booleans; invalid check definitions fail | Missing/null/string/non-finite/coerced values cannot pass; independent voltage-drop expectations tightened to 0.9118% and 14.0764% |
| C10 | Saved IEC options, validity, provenance, timestamps, and freshness accompany physical result quantities | Browser and report acceptance results are recorded below |

## Verification record

The independent acceptance harness, logs, CSVs, PDFs, and screenshots are in the ignored local directory `output/calculation-corrections-2026-09-17/`.

- Independent calculation and boundary harness: **46/46 checks passed** (`acceptance.mjs`, `acceptance.json`). The fault-current reference arithmetic is separate from the application's helper implementations.
- `npm test`: **360/360 discovered Node test files passed**. Existing obsolete 2LG expectations were replaced with physical phase/earth currents. The API isolation fixture now explicitly expects missing motor fault-network data to remain incomplete while retaining numeric results for its supplied bus network.
- `npm run build`: passed, including catalog validation, bundle budgets, asset checks, and validation-manifest generation. No protective-device promotion or catalog-data change was made.
- `npm run lint`: passed, including architecture/cycle and stylesheet checks.
- New MS Edge browser suites: **7/7 passed** in `calculation-selection-corrections.spec.js` and `iec60909-corrections.spec.js`. They cover catalog overflow and legacy reloads; invalid burial/blank/zero rejection; saved IEC options; project/option freshness; metadata filtering; invalid-option preservation; and parsed CSV/PDF downloads.
- Existing affected-study MS Edge checks: **15/15 passed** across `studyPages.spec.js`, `projectIntegration.spec.js`, and `validation.spec.js`, selected with `Battery|battery|Bus|bus|IEC|Trust|benchmark|thermal`.
- Trust Center browser check: **1/1 passed**, with all **19/19** executable benchmarks passing. The old 16-entry browser expectation was reconciled to the existing 19-entry library.
- PDF verification: the focused PDF test extracts a three-page long-content report; the orchestrator also rendered and visually inspected the exported report. Numeric fields, blank unavailable currents, warnings, options, provenance, fingerprints, continued headers, and page numbers remain readable.
- Documentation link targets and `git diff --check`: passed. The original review, README, study guides, engineering references, historical accuracy review, and competitor-feature qualifications point to the current correction status.

**Browser limitation:** two Firefox study-page checks fail while creating a browser page with `Cannot read properties of undefined (reading '_page')`, before application code runs. Firefox acceptance is therefore unverified in this environment. This work does not claim a fresh pass of the entire repository-wide browser suite or closure of unrelated browser findings from earlier reviews.

## Remaining model and evidence limits

- The thermal `m+n` method remains a screening approximation. Near-generator `n=(Ib/I″k)²` is not a time-domain thermal integration; numerical repair alone does not establish thermal-duty accuracy for that case.
- IEC 60909-0:2026 adoption and licensed-text clause reconciliation remain outside this correction tranche.
- IEC 60287 still uses the simplified cable geometry/loss/grouping models documented in its guide. Invalid-input rejection does not expand that scope.
- Out-of-catalog equipment requires an engineered or manufacturer-specific selection. No custom equipment rating is inferred from the missing catalog entry.
- Previously documented feature-depth, validation-source coverage, and unrelated browser issues remain separate follow-up work. The routing integration follow-up is recorded in [Routing and core workflow verification](routing-workflow-verification-2026-09-17.md).
