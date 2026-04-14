# Next Features Acceptance Plan: Cost Estimator + EMF Analysis

This document upgrades existing Playwright smoke checks into stronger acceptance targets for:

- `costestimate.html`
- `emf.html`

Source smoke coverage reference: `playwright-tests/nextFeatures.spec.js` under describe blocks **"Cost Estimator"** and **"EMF Analysis"**.

---

## 1) Primary User Journeys

### 1.1 Cost Estimator (`costestimate.html`)

#### Journey CE-01 — Baseline estimate with project data
1. User opens Cost Estimator page.
2. User keeps default contingency at 15%.
3. User clicks **Generate Estimate**.
4. System reads cable/tray/conduit data from project stores/studies.
5. System renders:
   - category summary table,
   - line-item detail table,
   - subtotal, contingency amount, and grand total.

**Acceptance goal:** deterministic totals produced from known fixture data and formula outputs.

#### Journey CE-02 — Pricing override and contingency sensitivity
1. User expands **Price Overrides**.
2. User enters labor overrides and/or fitting price.
3. User changes contingency from default to another valid value (e.g., 0%, 25%, 100%).
4. User runs estimate.
5. System reflects override impact in material/labor subtotals and contingency row label/value.

**Acceptance goal:** verify formula deltas and rounding behavior (currency displayed as whole dollars).

#### Journey CE-03 — Empty-data graceful guidance
1. User opens page with no project schedule data.
2. User clicks **Generate Estimate**.
3. System shows user guidance text instead of empty table/crash.

**Acceptance goal:** ensure meaningful empty-state message and no uncaught exception.

#### Journey CE-04 — Export readiness and guardrails
1. User clicks **Export XLSX** before running estimate.
2. System blocks export with an informative modal.
3. User runs estimate then exports.
4. System emits workbook sheets (Summary + Line Items) with totals matching UI logic.

**Acceptance goal:** guardrail behavior before estimate and parity checks after estimate.

---

### 1.2 EMF Analysis (`emf.html`)

#### Journey EMF-01 — Standard field calculation at default geometry
1. User opens EMF page with default values.
2. User clicks **Calculate Field**.
3. System computes B_peak and B_rms using conductor array + Biot–Savart routines.
4. System renders field results and ICNIRP compliance rows.

**Acceptance goal:** numeric outputs stay within tight tolerance bands for canonical fixture inputs.

#### Journey EMF-02 — Compliance boundary validation
1. User selects frequency (50 or 60 Hz).
2. User enters current near pass/fail edge for 200 µT (general public) and 1000 µT (occupational).
3. User runs calculation.
4. System shows PASS/FAIL badges correctly for both rows.

**Acceptance goal:** label correctness at boundary and near-boundary points.

#### Journey EMF-03 — Field profile generation
1. User enters valid current.
2. User clicks **Field Profile (0–120 in)**.
3. System unhides profile container and renders distance curve + ICNIRP limit lines.

**Acceptance goal:** verify chart visibility and non-empty path output over expected domain.

#### Journey EMF-04 — Invalid input handling
1. User enters current <= 0.
2. User clicks **Calculate Field** or **Field Profile**.
3. System blocks calculation and shows modal input error.

**Acceptance goal:** specific error messaging, no stale/incorrect result card update.

---

## 2) Canonical Input Fixture Sets

> All fixture sets below are intended as stable acceptance fixtures for deterministic CI assertions.

## 2.1 Cost Estimator fixture sets

### CE-Normal-01 (mixed project data, default pricing)

**Inputs (project data fixture):**

- Cables:
  - `C-1`: size `4 AWG`, conductors `3`, length `100 ft`
  - `C-2`: size `2/0`, conductors `1`, length `250 ft`
- Trays:
  - `T-1`: width `12`, length `80 ft`, fittings `2`
- Conduits:
  - `CD-1`: trade size `2`, length `120 ft`
- Overrides: none
- Contingency: `15%`

**Expected deterministic outputs (from pricing + labor formulas):**

- Cable subtotal = **$2,486**
- Tray subtotal = **$980**
- Conduit subtotal = **$756**
- Grand subtotal (pre-contingency) = **$4,222**
- Contingency @ 15% = **$633** (display rounds from 633.3)
- Grand total incl. contingency = **$4,855** (display rounds from 4,855.3)

### CE-Boundary-01 (contingency floor)

**Inputs:** same project fixture as CE-Normal-01, contingency `0%`.

**Expected outputs:**

- Contingency row label shows `Contingency (0%)`
- Contingency amount = `$0`
- Grand total = pre-contingency subtotal

### CE-Boundary-02 (contingency ceiling in HTML constraints)

**Inputs:** same project fixture, contingency `100%`.

**Expected outputs:**

- Contingency row label shows `Contingency (100%)`
- Grand total = `2 × pre-contingency subtotal` (within display rounding)

### CE-Invalid-01 (empty schedules)

**Inputs:** no cables, trays, or conduits.

**Expected behavior:**

- Results region contains guidance text: _"No project data found..."_
- No result table rendered.

### CE-Invalid-02 (nonnumeric contingency)

**Inputs:** valid project fixture, contingency set to nonnumeric text via script/event injection.

**Expected behavior:**

- Logic falls back to 15% (default fallback path), not NaN propagation.
- Total row remains finite and displayed.

---

## 2.2 EMF fixture sets

### EMF-Normal-01 (default-like smoke fixture)

**Inputs:**

- frequency = `60 Hz`
- current = `100 A`
- cable sets = `1`
- tray width = `12 in`
- cable OD = `1.0 in`
- measurement distance = `36 in`

**Expected outputs/ranges:**

- B_rms displays approximately **1.970 µT**
- B_peak displays approximately **2.786 µT**
- ICNIRP Occupational: PASS
- ICNIRP General Public: PASS

### EMF-Boundary-01 (general-public threshold crossing)

Using same geometry and frequency as EMF-Normal-01, vary only current.

- At **~10,150 A** current, expected B_rms is near **200 µT** (boundary band)
- At **10,500 A**, expected General Public = FAIL, Occupational = PASS

### EMF-Boundary-02 (occupational threshold crossing)

Using same geometry and frequency:

- At **~50,750 A**, expected B_rms is near **1000 µT** (boundary band)
- Above this, both Occupational and General Public should be FAIL

### EMF-Invalid-01 (zero current)

**Inputs:** current = `0`.

**Expected behavior:**

- Modal title/message indicates input error.
- Message contains: _"Load current must be greater than zero."_
- Results card is not replaced with new computed values.

### EMF-Invalid-02 (negative current)

**Inputs:** current `< 0`.

**Expected behavior:** same as EMF-Invalid-01.

---

## 3) Numeric Assertion Policy (Pass/Fail Thresholds)

### 3.1 Cost Estimator numeric policy

Use **exact-value assertions on internal math** and **rounded-value assertions on UI text**:

- Internal totals (if asserting from JS objects / workbook numeric cells):
  - absolute tolerance: `±0.01`
- UI rendered currency (`fmt()` rounds to integer dollars):
  - assert displayed whole-dollar values exactly (string/number exact)

**Fail criteria:**

- Any category subtotal deviates beyond tolerance.
- Contingency row label percent mismatches configured input/fallback.
- Grand total not equal to subtotal + contingency within tolerance before rounding.

### 3.2 EMF numeric policy

Because EMF uses trigonometric scanning over 360 samples, use tolerance bands:

- B_rms canonical assertions: `±0.02 µT` for low-current fixtures (e.g., 100 A case)
- B_peak canonical assertions: `±0.03 µT` for low-current fixtures
- Boundary assertions near 200/1000 µT:
  - value tolerance band: `±1.0 µT`
  - compliance label must match side-of-threshold expectation

**Fail criteria:**

- Computed values outside tolerance bands.
- PASS/FAIL label inconsistent with calculated utilization and threshold.

---

## 4) Compliance Labels + Error Message Behavior

### 4.1 EMF compliance label contract

Acceptance tests must assert:

- Presence of both compliance rows:
  - `ICNIRP Occupational`
  - `ICNIRP General Public`
- Status badge values restricted to exactly `PASS` or `FAIL`
- Badge class semantics:
  - passing row uses `.result-ok`
  - failing row uses `.result-fail`

### 4.2 Error message behavior contract

#### Cost Estimator

- Empty data is a **soft guidance state** in `#results`, not a modal error.
- Export before estimate is a **modal warning/info** (`No Data` title path).

#### EMF

- Invalid current (<=0) is a **modal Input Error**, message text should be stable.
- Computational exception path (if induced) renders inline result-fail paragraph:
  - Prefix text: `Calculation error:`

---

## 5) Smoke-to-Acceptance Mapping (`nextFeatures.spec.js`)

This table maps each existing smoke test in the two targeted describe blocks to upgraded acceptance coverage.

| Existing smoke test (current) | Acceptance target (stronger) |
|---|---|
| Cost Estimator: page loads with heading | Keep as smoke gate; add schema check for default controls and initial helper text contract. |
| Cost Estimator: estimate button visible | Extend to click-flow with deterministic CE-Normal-01 fixture and exact total assertions. |
| Cost Estimator: contingency input default 15% | Extend to CE-Boundary-01/02 and fallback CE-Invalid-02 (nonnumeric => 15%). |
| Cost Estimator: estimate with no project shows informative message | Formalize CE-Invalid-01 expected message content and no-table assertion. |
| Cost Estimator: price override section is collapsible | Extend to Journey CE-02 with labor/fitting override impact on subtotal deltas. |
| Cost Estimator: labor rate inputs exist | Extend to numeric formula validation proving labor subtotal changes proportionally. |
| Cost Estimator: export xlsx button exists | Extend to CE-04 guardrail modal before run + workbook parity after run. |
| EMF Analysis: page loads with heading | Keep as smoke gate; add defaults contract (100 A, 1 cable set, 12 in, etc.). |
| EMF Analysis: required input fields visible | Extend to input domain checks (min/max attributes and negative-entry handling). |
| EMF Analysis: calculate/profile buttons visible | Extend to full Journey EMF-01 + EMF-03 behavior assertions. |
| EMF Analysis: calculates field and shows results | Upgrade to EMF-Normal-01 with B_rms/B_peak tolerance assertions + unit checks. |
| EMF Analysis: shows ICNIRP compliance status | Upgrade to EMF-Boundary-01 and EMF-Boundary-02 with row-level PASS/FAIL correctness. |
| EMF Analysis: field profile generates chart | Extend to path-nonempty assertion and visible ICNIRP limit-line labels. |
| EMF Analysis: frequency selector has 50/60 options | Extend to dual-run regression proving same thresholds with correct labeling for each frequency option. |
| EMF Analysis: shows error for zero current | Formalize EMF-Invalid-01 modal title/message and ensure stale result card not overwritten. |

---

## 6) Recommended Acceptance Test IDs

- `AT-CE-01`: Baseline deterministic estimate (CE-Normal-01)
- `AT-CE-02`: Contingency boundaries + fallback
- `AT-CE-03`: Empty-project guidance
- `AT-CE-04`: XLSX export guardrail + parity
- `AT-EMF-01`: Baseline numeric field check
- `AT-EMF-02`: ICNIRP boundary crossing labels
- `AT-EMF-03`: Profile chart domain render
- `AT-EMF-04`: Invalid-current modal contract

These IDs should be used as traceable links from future `playwright-tests/nextFeatures.spec.js` upgrades.


---

## 7) Workflow Documentation Snapshot (Post-Integration Tests)

The integration tests in `playwright-tests/nextFeatures.spec.js` now act as executable contracts. Keep user-facing docs aligned with the assumptions below so manual workflows and automated checks stay in sync.

### 7.1 Cost Estimator workflow contract

**Input assumptions**
- Project schedule data exists for at least one of: cable, tray, or conduit records.
- Contingency is treated as a percentage and expected in the UI range `0` to `100` (with fallback handling for malformed input).
- Pricing basis is either default RS Means values or an imported pricing book, with optional labor/fitting UI overrides taking precedence.

**Expected outputs**
- Category subtotals, pre-contingency subtotal, contingency amount, and grand total render deterministically for fixed fixture data.
- Currency displayed in the UI rounds to whole dollars while internal math/workbook values preserve cents precision.
- Empty-data runs show guidance text instead of an empty result table.

**Compliance interpretation**
- Cost Estimator compliance is interpreted as **calculation contract compliance** (formula correctness, rounding policy, and guardrail behavior), not regulatory code compliance.
- A passing integration test means totals and labels match fixture-derived expectations within defined tolerances.

**Export behavior**
- `Export XLSX` is blocked until an estimate has been generated (modal guardrail).
- After a successful estimate, exported workbook totals must match the same calculation path used by the UI summary and line items.
- Summary export includes pricing basis metadata for audit traceability.

### 7.2 EMF workflow contract

**Input assumptions**
- Current must be greater than zero; invalid values (`<= 0`) are rejected before computation.
- Frequency is selected from supported options (`50 Hz` or `60 Hz`).
- Geometry fields (cable sets, tray width, cable OD, and measurement distance) are valid numeric values in accepted UI domains.

**Expected outputs**
- `B_rms` and `B_peak` are shown with stable values for canonical fixtures and bounded tolerance checks.
- Compliance table always includes both rows (`ICNIRP Occupational`, `ICNIRP General Public`) and status badges constrained to `PASS`/`FAIL`.
- Field profile renders a non-empty curve over the expected distance domain when inputs are valid.

**Compliance interpretation**
- PASS/FAIL labels represent threshold comparison against ICNIRP reference levels used by the product (`200 µT` general public and `1000 µT` occupational in the tested workflow).
- Near-threshold validations should be interpreted with the numeric tolerance policy in Section 3.2 to account for sampling granularity.

**Export behavior**
- EMF workflow currently emphasizes on-screen analytical validation; no dedicated file export is required by the integration contract in this plan.
- If downstream reporting captures EMF results, values should be sourced from the same computed result state validated by `AT-EMF-*` scenarios.

### 7.3 Concise troubleshooting (validation-aligned)

| Symptom seen by user/test | Likely cause | Recommended fix |
|---|---|---|
| Cost estimate shows “No project data found...” | Empty cable/tray/conduit stores | Import/load project data first, then rerun **Generate Estimate**. |
| Contingency appears to ignore typed value | Input was nonnumeric or outside allowed handling path | Enter a numeric percent in the supported range; rerun and confirm row label reflects the chosen percent. |
| `Export XLSX` opens a warning and no file downloads | Estimate was not generated in current session/state | Run **Generate Estimate** successfully, then export. |
| EMF calculation opens Input Error modal | Load current is `0` or negative | Enter current `> 0` and rerun **Calculate Field** or **Field Profile**. |
| EMF compliance badge seems unexpected near limit | Value is near threshold and within tolerance band | Re-run with the same fixture, inspect computed `B_rms`, and compare against Section 3.2 boundary tolerance guidance. |
| Field profile area stays hidden/empty | Invalid numeric input prevented profile generation | Correct invalid fields (especially current), then run **Field Profile (0–120 in)** again. |


---

## 8) Phased Rollout Sequence and Merge Gates

Roll out acceptance expansion in the following **strict order**:

1. **Fixture/acceptance definition**
2. **Test-structure refactor**
3. **Cost Estimator deterministic integration tests**
4. **EMF deterministic integration tests**
5. **Export validation**
6. **CI lane split and docs updates**

### 8.1 Required merge gate for each phase

- A phase can be merged only when the suites affected by that phase are green in CI.
- The next phase cannot begin until the previous phase is merged and green.
- If a phase introduces intermittent failures, pause rollout and stabilize before continuing.

### 8.2 Suggested suite mapping by phase

| Phase | Minimum suites that must pass before merge |
|---|---|
| 1. Fixture/acceptance definition | `node tests/costEstimate.test.mjs`, `node tests/emf.test.mjs`, `node tests/resultsExporter.test.cjs` |
| 2. Test-structure refactor | `npm run e2e:next-features-integration` |
| 3. Cost Estimator deterministic integration tests | `npm run e2e:next-features-cost` |
| 4. EMF deterministic integration tests | `npm run e2e:next-features-emf` |
| 5. Export validation | `npm run e2e:next-features-export` |
| 6. CI lane split and docs updates | `npm run test:critical`, `npm run e2e:critical`, `npm test`, `npm run e2e` |

### 8.3 One-week flaky-test monitoring policy

After each phase merge, track flaky outcomes for **7 calendar days**.

- Record failures by test id, frequency, browser/project, and failure signature.
- Only tighten waits/selectors when instability is actually observed.
- Do not broaden timeouts preemptively across the full suite.
- Close each flaky item with the stabilizing change and a rerun link/evidence.
