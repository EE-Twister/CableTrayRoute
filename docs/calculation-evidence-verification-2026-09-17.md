# Independent calculation evidence — September 17, 2026

Item 3 strengthens the evidence behind fault/protection, generator–transformer,
cable thermal, and grounding calculations. Luna implemented the cases and
corrections; the orchestrator reviewed the derivations, source claims, application
integration, and verification results.

**Overall class: Screening only.** The cases establish agreement within their
recorded assumptions and tolerances. They do not establish complete standards
implementation or project-specific engineering approval.

## Findings and corrections

### Transformer voltage bases

A 10 MVA, 13.8 kV synchronous generator feeding a 480 V bus through a transformer
exposed two problems in `analysis/shortCircuit.mjs`: upstream ohmic impedance was
added without referring it across the transformer, and the generator rated
current remained on the generator-side voltage base when calculating the
near-generator ratio. The original result was 0.08 kA with a ratio of 0.195,
instead of approximately 53.53 kA and 4.45 under the fixture's stated simplified
correction assumptions.

The correction applies `Z_out = Z_in × (U_out/U_in)²`; both currents in the
generator ratio must use the same winding-voltage basis. Schneider Electric's
[short-circuit calculation guide](https://www.electrical-installation.org/enwiki/3-phase_short-circuit_current_(Isc)_at_any_point_within_a_LV_installation)
describes the corresponding source and transformer impedance calculation at
the LV terminals. This source supports the voltage-base arithmetic; it does
not establish the applicability of the application's generator correction model
to a power-station unit.

The existing generator–transformer limitation remains: power-station-unit
`K_S`/`K_SO` corrections and validated time-domain generator thermal decay are
not implemented. A passing voltage-referral case does not remove that boundary.

### Evidence records

The former IEC short-circuit and cable-rating records described inputs and
expected values different from their executable benchmarks. Those records now
match the actual cases, with automated parity checks for the
input values, units, output expectations, tolerances, and source information.

The old grounding record's claimed IEEE 80 Annex B worked-example provenance
could not be substantiated by the available source record. Such a record must
remain a screening fixture rather than count as independently published
evidence. The earlier Nexans handbook example attribution likewise cannot be
used as proof of the cable-rating result.

### Ground-grid effective conductor lengths

Independent source review found that the ground-grid engine used the same total
length for mesh and step voltage and included rod length in the horizontal-grid
density factor. In the no-rod test case, the old step voltage was 310.484 V,
below the 398.243 V tolerable value. Using the effective step length gives
413.979 V, changing the result to a failed step-voltage check.

The inspected basis is the original **IEEE 80-2000**, printed pages 93–94,
Equations (85), (91), and (93), available in a
[government-hosted copy](https://www.armada.mil.co/sites/default/files/normograma_arc/mantenimiento1/IEEE%2080.pdf).
It distinguishes horizontal conductor length, individual rod length, and total
rod length. The step effective length is `0.75 × Lc + 0.85 × LR`; grid density
uses horizontal length only. The correction and benchmark must identify this
actually inspected edition; this review does not claim a complete licensed
2013-edition clause audit.

The resistance equation was also inspected at printed page 65 (PDF page 73),
Equation (52). The grounding documentation now distinguishes that verified
equation basis from previously unsubstantiated Annex B references and numerical
uncertainty claims for irregular grids.

## Evidence added

| Executable case | What it checks | Evidence boundary |
| --- | --- | --- |
| `FAULT-EATON-X1-1500KVA` | 57.279 kA published transformer-terminal fault case | Eaton worked value; no motor contribution or complete ANSI equipment duty |
| `FAULT-IEC-UNEQUAL-SEQUENCE` | Three-phase, line-to-line, line-to-ground, and peak current | Independent sequence-network arithmetic; licensed IEC clause mapping provisional |
| `PROTECTION-SC-SMU20-25E` | Actual S&C duplicate-current points and interpolation | Manufacturer curve geometry; no device promotion or total-clearing validation |
| `FAULT-GENERATOR-TRANSFORMER-LV-BASE` | Generator source impedance and rated current on one voltage base | Independent radial-network calculation with stated correction approximations |
| `TGE-THERM-001` | Copper DC resistance at 20 °C and 85 °C | Prysmian published values; resistance component only |
| `TGE-THERM-002` | Direct-burial current rating and reverse temperature check | Independent unrounded heat balance; simplified cable construction |
| `TGE-THERM-003` | Direct-burial and tray heat-rejection branches | Independent heat balances; fixed convection and homogeneous soil assumptions |
| `TGE-GROUND-001` | Grid resistance with SI inputs | Independent Sverak equation evaluation |
| `TGE-GROUND-002` | Rod-aware mesh/step voltage, touch/step limits, and resistance | EIT geometry with explicitly assumed study current/diameter; independently calculated outputs |

The live suite grows from **19 to 28 cases**. The catalogue grows from **14 to
23 fixtures**; these are separate inventories. After removing the unsupported
old grounding claim, **7 fixtures** qualify as published evidence and map to
**6 of 167 production analysis modules (3.6%)**. Fixture infrastructure is
excluded from that denominator. This is component-level evidence coverage,
not the percentage of the application proven correct.

The Validation page and Trust Center retain inputs, units, source locators,
derivations, assumptions, output tolerances, and limits. Small resistance values
retain sufficient significant digits for inspection. The original S&C fixture
also uses actual manufacturer points rather than synthetic intermediate values.

## Verification record

- `npm run build`: passed, including bundle budgets and HTML asset checks.
- `npm run audit:page-contracts`: passed for all 80 routes.
- `npm test`: passed all 364 discovered Node test files.
- `npm run lint`: passed, including architecture, module-cycle, and CSS checks.
- The live benchmark suite passed **28/28**, including all nine new cases.
- The orchestrator's separate numerical check passed for generator step-down,
  step-up, rescaled voltage bases, the prefault-voltage override, and the
  no-rod grounding case that must fail its step-voltage limit.
- Full Edge acceptance passed **455/455**, with two workers and zero retries.
- Final full Firefox acceptance passed **455/455**, with two workers, zero
  retries, zero skipped tests, and failure tracing enabled. The final Edge
  evidence-page checks passed **24/24** after the citation-only update.
- The initial combined run passed 909/910 checks. Its one Firefox timeout was
  in the pre-existing project-recovery journey; cleanup obscured the stalled
  operation. The unchanged journey passed an isolated trace-enabled run in
  12.1 seconds. This does not establish a root cause, and neither its timeout
  nor its assertions were relaxed. It then passed in 7.1 seconds within the
  clean full Firefox rerun. The initial log and diagnostic trace are retained;
  the timeout was not reproduced and is not represented as a repaired defect.
- `git diff --check`: passed.

Local logs and the independent calculation record are under
`output/calculation-evidence-2026-09-17/`. The generated evidence manifest confirms
the 167-module, 23-fixture, seven-published-fixture inventory stated above.

The full browser record is `browser.json` (including the clean Edge run and
initial Firefox timeout), followed by `firefox-final.json` and
`edge-final-evidence.json`. Final build, Node, and lint results are recorded in
`build-final.log`, `node-final.log`, and `lint-final.log` respectively. The final
browser runs report no skipped tests, retries, flaky classifications, or runner
errors. A pass is a bounded verification result, not a guarantee of future
browser timing stability.

## Remaining boundaries

- Recalculate previously saved fault and grounding studies. Existing saved
  numbers are not recomputed merely by loading the updated application.
- Manufacturer resistance or fuse-curve points validate the identified quantity
  and configuration, not every calculation consuming the data.
- Independently evaluated equations remain distinct from outputs published in
  a worked example. Catalogue pages alone do not verify licensed clauses.
- Simplified cable geometry, proximity loss, soil, and free-air heat rejection
  require project-specific review and manufacturer construction data.
- Ground-grid analytical checks do not replace soil measurements, current-split
  assessment, or verification against the adopted IEEE 80 method.

The next evidence work should include complete independently solved network
cases, generator-unit correction cases, manufacturer cable-construction cases,
and traceability through saved studies and reports.
