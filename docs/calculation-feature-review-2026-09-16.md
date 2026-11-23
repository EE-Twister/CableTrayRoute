# Calculation accuracy, feature breadth, and documentation review

The later [routing and core workflow verification](routing-workflow-verification-2026-09-17.md) records the follow-up to the browser routing issue identified below.

Reviewed **2026-09-16, America/Chicago** (verification artifacts use **2026-09-17 UTC**). This review covers the current working tree, including the earlier uncommitted corrections, based on commit `39f00686d863a5ef51f43a9fe6f188fc279883e2`. Luna performed bounded independent fault-calculation, feature, and documentation reviews; the orchestrator reviewed the source, reran the important numerical reproductions independently, and checked the documentation changes.

**Overall class: Screening only.** The application has broad functionality and useful tested calculations, but this review found material calculation defects beyond the previously accepted corrections. This document preserves the findings and evidence as reproduced on September 16. Subsequent C1–C10 fixes and their verification are recorded in [Calculation correction verification](calculation-correction-verification-2026-09-17.md). The original review changed documentation only; the follow-up changes application code and regression tests.

## Findings as originally reproduced

### C1 — High: thermal fault-current calculation can return NaN

**Evidence:** [thermalMFactor](../analysis/iec60909.mjs#L130), result construction [at line 423](../analysis/iec60909.mjs#L423).

For X/R = 0.5, 50 Hz, and a 1 s fault, the exponential product overflows and produces `m = NaN`, followed by `Ith = NaN`. JSON serialization converts that value to `null`. The algebraically equivalent stable expression, `tau/(2T) * -expm1(-2T/tau)`, gives **0.0007957747**. At κ = 2 the existing guard returns zero, although the limit of the implemented expression is one. These are confirmed numerical defects; the precise IEC thermal approximation still needs authoritative clause-level verification.

**Impact:** thermal-duty results can disappear or be understated at numerical boundaries. The low-X/R overflow occurs at finite, ordinary input values, not only an ideal infinite-X/R limit.

**Correction:** use stable exponential evaluation, handle both endpoint limits correctly, reject invalid inputs, and withhold non-finite results throughout display/save/export. Independently validate the physical thermal model before treating the numerical repair as standards validation.

**Tests:** both existing IEC 60909 test files pass. They do not cover these low-X/R and κ → 2 cases.

### C2 — High: line-to-line faults ignore the supplied negative-sequence impedance

**Evidence:** [analysis/iec60909.mjs:387](../analysis/iec60909.mjs#L387); the adapter supplies `z2` [here](../analysis/shortCircuit.mjs#L1283).

The engine always calculates `I_LL = sqrt(3)/2 * I_3phase`. The general bolted-fault sequence-network calculation is `c * U_LL / |Z1 + Z2|`; the shortcut requires Z2 = Z1. At 11 kV, c = 1.1, Z1 = 0.02 + j0.20 Ω and Z2 = 0.05 + j0.10 Ω, the engine returns **30.10 kA** rather than **39.2783 kA**, an understatement of **23.4%**.

**Impact:** material fault-duty error for accepted unequal sequence inputs. This is established by independent sequence-network arithmetic, without claiming a completed IEC clause audit.

**Correction:** use the supplied complex sequence impedances and test equal/unequal cases through the adapter and exported result. Existing tests use equal sequences and pass despite the defect.

### C3 — High: two-phase-to-earth result is not a physical phase or earth-return current

**Evidence:** [IEC calculation](../analysis/iec60909.mjs#L395), [ANSI calculation](../analysis/shortCircuit.mjs#L1306), [project-report consumer](../analysis/projectReport.mjs#L509).

Both paths label `3 * |I1|` as `doubleLineGroundKA`. For a bolted B/C-to-earth fault, independently imposing `V0 = V1 = V2` and `Ia = I0 + I1 + I2 = 0` gives `I0 = -I1 * Z2/(Z2+Z0)` and `I2 = -I1 * Z0/(Z2+Z0)`. Earth-return current is `|3I0|`; phase currents require the sequence-to-phase transform.

At 11 kV, c = 1.1 and Z1 = Z2 = Z0 = 0.02 + j0.20 Ω, each faulted phase and the earth return are **34.7563 kA**; the engine returns **69.51 kA**. With the unequal inputs from C2 and Z0 = 0.10 + j0.30 Ω, it returns **74.68 kA**, while the two phases are **37.6070/39.8838 kA** and the earth return is **19.5446 kA**.

**Impact:** even the equal-sequence case is materially wrong; the field's intended quantity is also ambiguous. The dedicated IEC page omits this field, but other consumers, including project reports, retain it.

**Correction:** define separate physical phase and residual-current outputs, compute them with complex arithmetic, and update consumers and documentation consistently. Confirm naming against the adopted standard. Current tests do not detect this error.

### C4 — High: missing fault impedance becomes a numeric result without its warning in the dedicated output

**Evidence:** [fallback](../analysis/shortCircuit.mjs#L1213), [IEC table](../iec60909.js#L59), [exports](../iec60909.js#L122).

A lone 11 kV bus with no source/impedance data produces **4,939,804.31 kA** three-phase current using R = X = 0.000001 Ω. The adapter attaches an impedance warning, but the dedicated IEC table, CSV, and PDF omit that warning and its provenance.

**Impact:** an incomplete network becomes an apparently usable duty result. An unusually large number is not a substitute for an incomplete-result state.

**Correction:** withhold affected currents when required source/impedance data is missing; carry validity, missing inputs, assumptions, and provenance into saved and exported results. Add an actual missing-input UI/export acceptance case. Fully specified unit fixtures currently pass.

### C5 — High: capacitor selector recommends a bank that cannot reach the target power factor

**Evidence:** [catalog fallback](../analysis/capacitorBank.mjs#L194), [selection/warnings](../analysis/capacitorBank.mjs#L269), [recommendation display](../capacitorbank.js#L141).

A 10,000 kW load improving from PF 0.70 to 0.95 needs **6,915.2 kvar**. The tool recommends its maximum **2,400 kvar** bank with no warning for the reproduced 1,000 MVA source. That bank reaches only **PF 0.7884**, not 0.95. The UI accepts this load size.

**Basis:** independent reactive-power triangle arithmetic, consistent with [Schneider's power-factor correction equation](https://www.electrical-installation.org/enwiki/Theoretical_principles_to_improve_power_factor).

**Correction:** return no adequate catalog selection above range, show required compensation and achieved PF for any proposed bank, and offer explicit engineered staging/custom sizing. Add just-below/at/above-catalog tests. Nominal capacitor tests pass; they do not protect this selection boundary.

### C6 — High: UPS selector silently caps the suggested rating below demand

**Evidence:** [upsKvaRequired](../analysis/batterySizing.mjs#L260), [energy-screen display](../battery.js#L456), [manufacturer-duty-cycle display](../battery.js#L582).

For a 1,000 kW peak at PF 0.90, the calculation correctly requires **1,111.11 kVA**, then suggests **1,000 kVA**, the catalog maximum. At the stated PF that represents only **900 kW**. There is no UPS-specific inadequate-selection flag. Existing screening warnings qualify the overall tool but do not explain this contradiction. The separate battery-energy catalog already has an overflow warning; it does not cover the UPS rating.

**Basis:** apparent power = real power / PF; [Eaton's sizing guidance](https://www.eaton.com/us/en-us/products/backup-power-ups-surge-it-power-distribution/backup-power-ups/ups-sizing-guide.html) requires UPS capacity to cover the connected load.

**Correction:** expose UPS catalog overflow separately, withhold an adequate-size recommendation, and carry the state through both sizing methods and outputs. Add boundary tests. Current nominal tests pass.

### C7 — Medium: overloaded busway is returned as adequate

**Evidence:** [analysis/busDuctSizing.mjs:533](../analysis/busDuctSizing.mjs#L533), [display](../busdust.js#L165).

A 6,000 A load receives a 5,000 A busway at **120% utilization**, but `selectedBusway.adequate` is `true`. The comparison checks whether the selected rating is within the catalog rather than whether derated capacity meets demand. The visible utilization warning mitigates the UI risk, but the structured result contradicts it.

**Correction:** base adequacy on final derated ampacity versus requested load and distinguish an exhausted catalog. Existing helper tests cover overflow; the full-study result overrides that correct helper status without an integration test detecting it.

### C8 — Medium: invalid burial geometry returns non-finite ampacity without an error

**Evidence:** [burial expression](../analysis/iec60287.mjs#L260), [result validation](../analysis/iec60287.mjs#L456), [form](../iec60287.html#L119), [submit/read/save](../iec60287.js#L159).

For 240 mm², three cores, 2.2 mm insulation, and 1 mm burial depth, estimated cable OD is 53.3 mm. The square root in the soil resistance expression has a negative argument. `calcAmpacity` returns `I_rated = NaN` and `warnings = []`. The form uses `novalidate`; its submit handler checks insulation and ambient temperature but not this geometry, then persists the returned result.

**Correction:** require finite positive physical inputs and valid cable/conduit burial geometry; reject non-finite intermediate/final results before saving or rendering. Existing thermal tests pass but omit the invalid-geometry case.

### C9 — Medium: benchmark runner can pass missing data, and some tolerances only test broad plausibility

**Evidence:** [coercion](../analysis/benchmarkRunner.mjs#L48), [voltage-drop checks](../analysis/benchmarkLibrary.mjs#L274).

A missing boolean result passes a check expecting `false`; a `null` numeric result passes a zero-valued check because of coercion. Independently constructed review fixtures reproduce both false passes. In addition, `VDROP-001` accepts 0–3% and `VDROP-002` accepts 3–21% for their numeric checks. These can test category behavior but cannot substantiate close numerical accuracy.

**Correction:** require an existing property of the correct finite type; reject empty/missing results. Separate classification fixtures from numerical benchmarks and give exact independently derived expectations justified tolerances. All 19 current benchmarks pass, which does not detect these runner/tolerance weaknesses.

### C10 — Medium: dedicated IEC results do not preserve a complete output/freshness contract

**Evidence:** [save](../iec60909.js#L113), [CSV/PDF](../iec60909.js#L122), [declared handoff](../src/pageContracts.js#L922).

The standalone page saves raw results without an input fingerprint and omits the returned two-phase-earth quantity from its table and exports. C4 separately covers the more consequential loss of missing-input warnings. The shared result contract added in the earlier work covers reviewed ampacity/sizing/voltage-drop paths; it was not a migration of every study.

**Correction:** extend the contract to this page and verify a change-input/reopen/export journey that detects stale results, retains the physical quantity definitions from C3, and preserves provenance. Current pure calculation tests do not exercise this contract.

## Model limits and evidence gaps

These are distinct from the reproducible defects above.

| Priority | Area | Current limit and required next evidence |
| --- | --- | --- |
| Medium | IEC 60287 thermal model | [Implementation](../analysis/iec60287.mjs#L126) uses approximate proximity/geometry, fixed multicore bedding and air-gap terms, fixed armour loss, zero sheath loss, and a small grouping-factor table. It is not an arbitrary cable-construction/bonding/mutual-heating solver. Its evidence record is explicitly `screening_fixture` with incomplete source provenance. The guide's broader claims were corrected. Obtain exact construction data and independent manufacturer/standard cases across installation types. |
| Medium | Validation coverage | The current generated manifest inventories 167 production analysis files, including helpers/UI modules; 5 files map to published evidence (3.0%), and 162 do not. This is a file-based evidence metric, not the fraction of 167 independent solvers that work. There are 14 documented fixtures and 19 executable benchmark entries. Expand primary-source evidence first for fault/protection, cable thermal, network, and grounding calculations. |
| Medium, provisional | Near-generator thermal/current basis | `n = (Ib/Ik3)^2` uses contact-separation delay instead of integrating AC decay over the thermal interval. Generator rated current and remote fault current can also be on different transformer voltage bases. Independent generator-transformer/time-domain cases and licensed-text review are needed; this review does not assert a verified IEC clause violation for these hypotheses. |

The official [IEC 60287-1-1 scope](https://webstore.iec.ch/en/publication/68118) describes steady-state rating, and [IEC 60287-2-1](https://webstore.iec.ch/en/publication/68134) covers thermal resistance. Their scope does not establish that this application's approximations implement every method. IEC 60909 remains version-pinned to 2016; its [2016 catalogue entry](https://webstore.iec.ch/en/publication/24100) and [2026 edition](https://webstore.iec.ch/en/publication/68454) must be distinguished. A full licensed-text equation/edition-delta review was not completed.

## Feature breadth and the most useful next improvements

Inventory: **96 non-404 source HTML pages**, **90 navigation routes** (35 Workflow, 45 Studies, 1 Home, 2 Library, 7 Support), **80 Workflow/Studies contracts**, **356 discovered Node test files**, and **40 Playwright spec files**. Counts describe implementation surfaces, not verified engineering capability.

| Area | Existing breadth | Most useful improvement |
| --- | --- | --- |
| Core project workflow | Equipment → loads → one-line → cable schedule → raceways → fill/routing → studies → deliverables; explicit reconciliation and canonical records | **High, carried forward:** resolve browser routing integration. Prior acceptance reproduced an unexpected error/zero route rows even though a direct model run routed 30/30 sample cables. This was not rerun in a browser in this review and remains unresolved, as recorded in the [acceptance report](correction-verification-2026-09-14.md). |
| Persistence and scenarios | Recovery, complete scenario backups, undo/redo, local/server saves, import/export | Preserve the accepted recovery behavior while extending study freshness and validity checks. The previous 17-item acceptance is not revoked by this fresh review; these are additional findings. |
| Studies and protection | Load flow, fault current, arc flash, TCC, motor start, power quality, DER, cable thermal and equipment sizing | **High:** correct C1–C6 and expand known-answer evidence before adding further study names. Carry validity/provenance through every result consumer. |
| Contracts and integrations | All 80 Workflow/Studies routes have documented handoffs; static audit reports zero actionable failures | **Medium:** prove runtime handoffs with representative end-to-end journeys. The audit still reports 46 routes with declared inputs not statically read, 54 with indirect inputs, and 85 warnings. Static declarations are not runtime acceptance. |
| Optimal power flow | [Economic dispatch](../analysis/optimalPowerFlow.mjs#L20), unit limits, costs, flat percentage losses | **Medium:** retain the economic-dispatch scope in UI/report language. Full network constraints, reactive/voltage optimization and security-constrained dispatch require additional models and benchmarks. |
| Probabilistic load flow | Repeated load-flow scenarios and voltage/loss statistics | **Medium:** [system-wide multipliers](../analysis/probabilisticLoadFlow.mjs#L332) do not represent per-bus distributions/correlations. Add those only with reproducibility and convergence accounting. |
| Physical design studies | Lightning screening, substation arrangement, overhead sag/tension, structural checks | **Medium:** deepen the existing scopes where needed: full lightning risk components/multi-mast coverage, bay/access/multi-row layouts, and inclined-span/creep/vibration behavior. Current tools and historical gap notes acknowledge substantial screening boundaries. |
| Construction and operations | BOM, pricing books, procurement, pull/spool documents, lifecycle/report packages, telemetry adapters | **Medium:** validate exported values against their source study and visible status. Native CAD/BIM plugins, live commercial pricing and plant-protocol/historian infrastructure remain separate integration work; file interchange/browser telemetry do not establish those capabilities. |

The application would improve more from reliable core journeys and deeper evidence for its existing studies than from increasing the page count. This review did not refresh competitor product catalogs or claim parity with proprietary engineering suites.

## Calculation checks that passed

| Calculation chain | Independent or existing evidence | Result and scope |
| --- | --- | --- |
| Power-factor correction | Independent power triangle, 100 kW, PF 0.8 → 0.95 | 42.1 kvar versus 42.131589 kvar, within the tool's 0.1 kvar rounding; catalog overflow remains C5. |
| UPS apparent power | 525 W / 0.7 PF | 0.75 kVA exactly; selection overflow remains C6. |
| Busway voltage drop | Separate single-/three-phase AC arithmetic | 6.4000 V and 5.5426 V; within 0.0001 V of independent values. Adequacy flag remains C7. |
| Balanced load flow | Four independently solved two-bus quadratics including leading reactive power | Converged; voltage magnitudes match within 1e-6 pu. Existing IEEE-case and unbalanced tests also pass; this is not an all-topology validation. |
| Generator site correction | 250 kW load at 5,000 ft and 50 °C | Required nameplate rises to 321.1 kW; adverse-site direction remains corrected. Manufacturer factor accuracy was not independently certified. |
| Arc flash, grounding, fault, tray/conduit, voltage-drop and structural paths | Existing focused suites, including recorded IEEE 1584 fixtures and independent analytical evidence tests | Pass in their covered cases. New fault/selection/invalid-input cases are outside that coverage. |

Verification performed this review:

- `node output/application-review-2026-09-17/calculation-probes.mjs`: **8/8 nominal numeric comparisons pass**; separate boundary probes reproduce C1–C9 as applicable. Root independently reproduced Luna's principal fault findings.
- `runAllBenchmarks()`: **19/19 pass**.
- **37/37 focused Node test files pass**. The exact files, exits, and per-file logs are recorded in `output/application-review-2026-09-17/focused-tests.json`.
- Documentation source/diff review, **111 local Markdown link targets**, and `git diff --check`: pass.

The review script, JSON results, logs, and Luna's detailed fault review are local ignored artifacts in `output/application-review-2026-09-17/`. No full browser suite or new application build was run for this documentation-only change. Previous full-test/build/browser outcomes, including unresolved broader browser failures, are in the prior acceptance report and are not represented as fresh results here.

## Original documentation reconciled

- [README](../README.md): correct build-helper filename, qualified routing/fill language, recovery/result-contract/current-review links.
- [API reference](api-reference.md): cookie and legacy Bearer authentication, CSRF on both mutation paths, corrected examples and route-group rate limiting.
- [Competitor feature analysis](../COMPETITOR_FEATURE_ANALYSIS.md): historical versus current status, removed obsolete unimplemented-gap summary, distinguished software scope from deferred external integrations.
- [Original website audit](../AUDIT_WEBSITE_GAPS.md) and [September 13 application review](application-review-2026-09-13.md): identified historical findings and linked subsequent acceptance/current review.
- [Validation coverage](validation-evidence-coverage.md): current counts and accurate denominator/fixture definitions.
- [Calculation accuracy history](calculation-accuracy-review.md): replaced blanket correctness/full-implementation framing with scoped historical checks and open-finding notice.
- [IEC 60287 guide](iec60287.md): disclosed model approximations and invalid-geometry defect, removed unsupported general applicability/table attribution, corrected links and the soil-measurement reference. [IEEE 442](https://ieeexplore.ieee.org/document/8353815) covers measurements; [IEC 60287-3-2](https://webstore.iec.ch/en/publication/1279) concerns economic cable-size optimization.
- [IEC 60909 guide](iec-60909.md): current defect notice, unequal-sequence distinctions, thermal-model qualification, corrected κ table arithmetic, and dimensionally consistent I²t comparison.
- [Engineering references](standards.md) and [project workflow](project-workflow.md): distinguished reference/workflow completeness from engineering validation.
- [Battery/UPS](battery-sizing.md), [capacitor bank](capacitor-bank.md), and [busway](bus-duct-sizing.md) guides: exposed the specific open selection/status defects at the point of use.
- The tracked IEC 60909 and engineering-reference HTML documentation pages received the corresponding review notices and affected formula/reference corrections.

Historical findings were retained. At the original review date, documentation distinguished accepted earlier fixes, newly open defects, and unverified model claims. Consult the subsequent correction verification for current acceptance status.

## Original minimum next actions

1. Correct C1–C6 with independent numerical fixtures, including saved results and exports; fix C7–C10 in the same affected workflows.
2. Reconcile physical fault-current definitions and obtain authoritative evidence for thermal/sequence and manufacturer selection models.
3. Complete the routing browser journey and representative study input-change/export journeys.
4. Expand sourced validation coverage and make study scope/validity consistent across UI, API, saved state, and reports.

Project-specific standards editions, manufacturer data, topology, and intended issued use were not supplied. This is a repository-level technical review, not professional approval or authorization to issue calculation results for a particular installation.
