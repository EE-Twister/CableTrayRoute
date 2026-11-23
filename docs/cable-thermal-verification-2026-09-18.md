# Cable thermal implementation verification — 2026-09-18

Status: implementation and scoped acceptance verification complete. Overall engineering class:
**Screening only**. This record covers item 5's cable thermal scope, with root
reviewing Luna's implementation and independently checking public source data.

## Evidence and calculation basis

| Topic | Evidence | Scope |
| --- | --- | --- |
| Radial layers and touching trefoil | Cableizer public TB 880 Case 0 reports, software 51cac, May 14, 2025 | Two thermal-only cross-tool comparisons with supplied electrical losses |
| Spaced cable heating | Geometric image-source equations and independent matrix values | Analytic check; no claim of published spaced-circuit validation |
| Manufacturer records | Eland N2XSY 12/20 kV datasheet, sizes 95/240/630 mm² | Source-only records with explicit missing inputs |
| Legacy load-profile behavior | Dimensional analysis and independent RC step response | Lumped screening model; not IEC 60853 validation |

The [thermal model guide](cable-thermal-model.md) links the primary sources and
records equations, units, restrictions, and sourcing gaps. PDF hashes and page
locations are retained in `data/cableThermalReferenceProfiles.json`. The source
PDFs were downloaded for local inspection; selected source pages were visually
checked against extracted values. The original paid CIGRE brochure was not
accessed, and the manufacturer's missing geometry was not invented.

## Independently calculated reference values

Using full-precision logarithms, published dimensions and fixed losses:

| Quantity | Both-end bonding | Single-point bonding |
| --- | ---: | ---: |
| T1, K·m/W | 0.4198714890 | 0.4198714890 |
| Base T3, K·m/W | 0.0541996092 | 0.0541996092 |
| Effective T4, K·m/W | 1.5946928925 | 1.5946928925 |
| Calculated current, A | 821.7741475 | 886.1732606 |
| Published current, A | 821.78 | 886.18 |
| Conductor temperature at calculated current, °C | 90 | 90 |

Expected values come from the published reports and a separate arithmetic
derivation, rather than generation by the production solver. Losses are inputs
to these comparisons, not independently verified electromagnetic outputs.

## Corrections and review findings

- Added explicit radial construction and formation geometry instead of inferring
  dimensions in the new detailed path.
- Retained the single-point reference's eddy-current sheath losses.
- Corrected conductor, sheath and surface heat balances; dielectric heat is
  counted once and applied across the appropriate layers.
- Corrected the legacy load-profile model's hard-coded effective three-core
  behavior, volumetric heat-capacity units (a factor of 1,000), and core-count
  scaling of the lumped time constant.
- Added input and geometry bounds, source provenance, a separate study lifecycle,
  and explicit screening scope.

## Acceptance results

The independent source/hash, heat-balance, phase-temperature ordering and
sensitivity check passed **181 assertions**. The reference result is reproduced
to better than 0.01 A for both public examples.

- `npm test`: all **379 discovered Node test files** passed.
- `npm run build`: passed, including protected bundle budgets and HTML assets.
- `npm run lint`: passed, including architecture, cycle and CSS limits.
- Evidence and lifecycle contract tests passed; the generated page-contract
  documentation was refreshed to include the new study output.
- Initial focused Edge/Firefox suite: **28/28 passed**, covering the new thermal
  page and existing calculation-selection workflows, without retries.
- The rendered desktop thermal panel was visually inspected.
- Full Edge/Firefox regression: **954 cases executed**, with **952 passing**.
  The two failures were the existing Trust Center assertion expecting 28
  executable benchmarks rather than the expanded 30. Both browsers showed
  all 30 live benchmarks passing; the obsolete assertions were corrected and
  extended to check each new thermal benchmark's inputs and source details.
- After those test corrections and the final CSV/lifecycle changes, all
  **38 affected browser cases passed** in Edge and Firefox, using two workers
  and zero retries. This includes the previously failing Trust Center cases,
  all four thermal formations, saved customized inputs, scenario changes,
  layer changes, invalid inputs, CSV values/provenance, and independent legacy
  versus detailed study freshness.
- Independent CSV parsing verified unique field names, evaluated/current state,
  the calculation revision, timestamp, input fingerprint, scenario provenance,
  numeric current, and conductor temperatures. The final `npm test`, build,
  and lint runs also passed after the last production changes.

The final browser command was:

```text
npx playwright test --config playwright.config.cjs playwright-tests/cableThermalDetailed.spec.js playwright-tests/calculation-selection-corrections.spec.js playwright-tests/advancedStudies.desktop.spec.js --workers=2 --retries=0
```

There are no unresolved failures from these acceptance checks. The full suite
and final affected-suite rerun are recorded separately rather than described
as one uninterrupted all-green run.

The build inventory reports 172 production analysis modules, 25 documented
fixtures, and 30 executable benchmark entries. Published evidence remains seven
fixtures mapped to six modules (3.5%); the two new thermal cases retain
`cross_tool_comparison` classification. These counts distinguish executable
regression coverage from independently published validation.

Local command logs, independent arithmetic checks and browser artifacts are in
`output/cable-thermal-2026-09-18/`. Intermediate failing runs were retained; the
final acceptance entries above refer to the subsequent corrected runs.
Final logs are `build-acceptance.log`, `node-tests-acceptance.log`,
`lint-acceptance.log`, and `acceptance-browser.log`; the full-suite record is
`full-browser.log`.

## Residual limits

Published comparisons cover one reference cable construction in touching trefoil
with two supplied loss-factor sets. They do not establish full IEC 60287
conformance or validate arbitrary site geometry. The manufacturer data cannot
yet support a complete thermal model. No human engineering approval or
calculation-ready certification has been recorded.
