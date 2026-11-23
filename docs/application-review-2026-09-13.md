# Application review — September 13, 2026

Reviewed commit `39f00686d863a5ef51f43a9fe6f188fc279883e2`. The working tree was clean at the start. This is a fresh review after the September 9–10 corrections, with emphasis on project recovery, calculation input handling, study adapters, and everyday workflow. No application code was changed.

The strongest next investment is reliable project recovery and explicit calculation validity. Passing tests currently coexist with reproducible failures in both areas.

**Status note (2026-09-16):** The correction-verification acceptance record is maintained in [docs/correction-verification-2026-09-14.md](correction-verification-2026-09-14.md). Follow-up implementation and current calculation review are tracked separately in [docs/calculation-feature-review-2026-09-16.md](calculation-feature-review-2026-09-16.md); the findings below remain the historical September 13 baseline.

## Bugs and errors, in delivery priority

### 1. High — server-synced local copies cannot be reopened through the normal snapshot loader

**Evidence:** [src/projectManager.js:69](C:/Users/Derek/OneDrive/Documents/GitHub/CableTrayRoute/src/projectManager.js:69), [src/projectSnapshot.js:36](C:/Users/Derek/OneDrive/Documents/GitHub/CableTrayRoute/src/projectSnapshot.js:36), [dataStore.mjs:1240](C:/Users/Derek/OneDrive/Documents/GitHub/CableTrayRoute/dataStore.mjs:1240).

Server synchronization adds `__serverSync` to the saved local record. The import adapter removes `__meta` but leaves this new metadata field. The strict interchange schema then rejects the saved record.

**Reproduced:** save a named project, add exactly the metadata written by server synchronization, then call `loadProject('Synced')`. It returns `false` with `Project import is invalid: /__serverSync is not a recognized project field`.

**Impact:** a local recovery copy becomes unusable through this loader after syncing. A successful online load can mask the problem; the offline/server-unavailable fallback is particularly affected. This is not evidence that the underlying stored data was deleted.

**Fix and acceptance:** separate application metadata from the interchange document, or explicitly strip permitted envelope metadata when importing. Test online save/load followed by offline reopen, account switching, rename, and recovery without contacting the server. Existing concurrency tests cover revisions across reloads but miss this local-import boundary.

### 2. High — a project backup preserves scenario names but omits inactive scenario data

**Evidence:** [dataStore.mjs:1408](C:/Users/Derek/OneDrive/Documents/GitHub/CableTrayRoute/dataStore.mjs:1408), [dataStore.mjs:1433](C:/Users/Derek/OneDrive/Documents/GitHub/CableTrayRoute/dataStore.mjs:1433), [dataStore.mjs:1554](C:/Users/Derek/OneDrive/Documents/GitHub/CableTrayRoute/dataStore.mjs:1554).

`exportProject()` serializes only the selected scenario's collections while its metadata lists every scenario. Import restores that registry and writes only the exported scenario's data. The same exporter is used by project saves.

**Reproduced:** create `base` with cable `BASE-ONLY` and `future` with `FUTURE-ONLY`. Export while `future` is active, then import into clean storage. Both scenario names return, and `future` contains its cable, but `base` is empty.

**Impact:** a project file is not a complete backup of a multi-scenario project. Importing back into the original browser can conceal the omission because its old scenario keys still exist.

**Fix and acceptance:** export every scenario's collections and settings under a versioned project envelope. If scenario-only exports are intentional, label and offer them separately from complete project backups. Test round trips in clean storage with distinct cables, equipment, one-line diagrams, and study results in at least two scenarios. Existing rollback tests do not establish complete backup coverage.

### 3. High — ampacity silently stops derating above the last supported ambient-temperature row

**Evidence:** [sizing.js:36](C:/Users/Derek/OneDrive/Documents/GitHub/CableTrayRoute/sizing.js:36), [codes/necTables.js:43](C:/Users/Derek/OneDrive/Documents/GitHub/CableTrayRoute/codes/necTables.js:43).

The temperature lookup initializes its selection to the final table row and keeps that row when the requested temperature exceeds the table. The supplied NEC correction table stops at 50°C.

**Reproduced:** a copper #10 AWG conductor using the 75°C column returns **26.25 A** at ambient temperatures of **50, 75, 100, and 150°C**, without an unsupported-temperature indication. These are implementation outputs, not independently approved ratings.

**Impact:** out-of-range conditions produce plausible positive ampacities and can influence conductor recommendations. The output does not disclose that the calculation has stopped responding to temperature.

**Fix and acceptance:** validate the model's ambient/rating range and return an explicit unevaluated result outside it, or extend the table using verified applicable source data. Exercise the last supported row, the next temperature band, and ambient temperatures at/above the selected conductor rating. Ambient correction is a stated requirement of the [Schneider Electric ampacity reference](https://productinfo.se.com/na-std-ref/viewer/5c0fee4b347bdf0001de4d55/5c0fee5b347bdf0001de4d6b/r/ConductorAmpacityBasedOnThe2017Nati-F20AB318); that older-edition reference provides context, not verification of the application's entire NEC data set.

### 4. High — sizing can report no violation when a requested voltage-drop constraint was never evaluated

**Evidence:** [sizing.js:107](C:/Users/Derek/OneDrive/Documents/GitHub/CableTrayRoute/sizing.js:107).

The solver rejects a candidate only when `vd > maxVoltageDrop`. When voltage drop returns `null`, JavaScript's comparison is false, so sizing accepts the candidate and returns `violation: null`.

**Reproduced:** 20 A, a 1,000 ft run, and a 3% maximum drop with the supply voltage omitted returns **#14 AWG**, **25 A**, `voltageDrop: null`, and `violation: null`.

**Impact:** an ampacity-only selection can look like a successful solution to both constraints. The missing input is not carried into the recommendation's validity state.

**Fix and acceptance:** require a finite, evaluated drop when a drop constraint is requested. Return missing-input details and distinguish an ampacity-only preliminary result. Cover missing/invalid voltage, current, length, phase count, and unsupported models. Existing nominal sizing/calculation tests do not catch this result-state contradiction.

### 5. High — feeder-path results depend on cable row order when more than one upstream feed exists

**Evidence:** [analysis/voltageDropStudy.mjs:214](C:/Users/Derek/OneDrive/Documents/GitHub/CableTrayRoute/analysis/voltageDropStudy.mjs:214).

Path construction picks the first unvisited cable arriving at the current origin. It does not reject an ambiguous feed, model switch states, or evaluate alternate paths.

**Reproduced:** two feeders arrive at `BUS`; their modeled drops are 1% and 5%. A branch leaving `BUS` drops 1%. Changing only the order of the two feeder rows changes the branch's combined result from **2%, pass** to **6%, fail**.

**Impact:** equivalent data sets give different engineering conclusions. Multiple sources, duplicate endpoints, and cyclic networks need an explicit topology policy; choosing the first row is not one.

**Fix and acceptance:** for the supported radial model, reject multiple energized parents and cycles with a clear diagnostic. Alternatively, implement explicit operating configurations and report each valid path. Permuting rows must not change results; unsupported topology must remain unevaluated. Current combined-path coverage exercises a simple unambiguous chain.

### 6. Medium — the voltage-drop API consumes load-flow results that explicitly failed to converge

**Evidence:** [server.mjs:2070](C:/Users/Derek/OneDrive/Documents/GitHub/CableTrayRoute/server.mjs:2070), [analysis/voltageDropStudy.mjs:78](C:/Users/Derek/OneDrive/Documents/GitHub/CableTrayRoute/analysis/voltageDropStudy.mjs:78), compared with [voltagedropstudy.js:43](C:/Users/Derek/OneDrive/Documents/GitHub/CableTrayRoute/voltagedropstudy.js:43).

The browser page uses saved load flow only when `converged === true`. The API passes saved load flow to the pure study without the same check, and that study accepts its bus values.

**Reproduced:** a cable with missing current and voltage, plus saved `loadFlow: { converged: false, buses: [...] }`, returns HTTP 200 with **100% evaluation coverage**, current and voltage attributed to Load Flow, and a numerical conductor recommendation. The explicit fixture infers 20 A and 120 V and reports 4% drop.

**Impact:** API clients can receive an evaluated study from inputs the page would exclude.

**Fix and acceptance:** move source-validity checks into the shared input resolver. Exclude nonconverged and stale studies, then use a valid Load List fallback or report missing inputs. Compare browser and API outcomes for failed, stale, missing, and valid load-flow cases.

### 7. Medium — supported array-form one-line projects produce empty study API results

**Evidence:** [server.mjs:1986](C:/Users/Derek/OneDrive/Documents/GitHub/CableTrayRoute/server.mjs:1986), [schemas/project.schema.json:66](C:/Users/Derek/OneDrive/Documents/GitHub/CableTrayRoute/schemas/project.schema.json:66), [dataStore.mjs:1577](C:/Users/Derek/OneDrive/Documents/GitHub/CableTrayRoute/dataStore.mjs:1577).

The project schema/importer support both `oneLine: { sheets: [...] }` and `oneLine: [...]`. The short-circuit and motor-start API adapter sends either shape directly to `setOneLine` without normalizing arrays.

**Reproduced:** the object-form fixture returns bus and motor results. Saving identical sheets in the supported array form makes both endpoints return HTTP 200 with empty result objects.

**Impact:** valid legacy/interchange projects appear to have no study equipment. A successful HTTP status obscures the adapter failure.

**Fix and acceptance:** normalize both supported shapes before solving and pass explicit project inputs to the engines. Assert exact result IDs/counts and numerical equality across shapes. The existing REST tests use an empty one-line fixture and assert response-field presence, so empty studies pass.

### 8. Medium — the study recommends a branch change that cannot satisfy its current path allowance

**Evidence:** [analysis/voltageDropStudy.mjs:295](C:/Users/Derek/OneDrive/Documents/GitHub/CableTrayRoute/analysis/voltageDropStudy.mjs:295).

The remaining path allowance is clamped to at least 0.1%, even when upstream drop already consumes the complete limit.

**Reproduced on an unambiguous radial path:** a 5% feeder and 1% branch total 6%. The branch recommendation is 1/0 AWG with an expected 0.1% drop. Applying that recommendation alone yields **5.1%, still failing the 5% limit**.

**Impact:** a user can accept a suggested correction that cannot achieve its stated remaining-path target. Coordinated upstream changes may help, but that dependency is not represented by the branch suggestion.

**Fix and acceptance:** withhold a standalone downstream recommendation when the remaining allowance is zero/negative, and identify the upstream circuit requiring attention. If offering a coordinated set of changes, evaluate and present the complete set before writeback. Every advertised corrective recommendation should pass its target when applied under its stated assumptions.

### 9. Medium — a bundled sample cable type is blank in the schedule's selector

**Evidence:** [samples/project-workflow-core.json:442](C:/Users/Derek/OneDrive/Documents/GitHub/CableTrayRoute/samples/project-workflow-core.json:442), [src/cable-schedule/scheduleConfig.js:15](C:/Users/Derek/OneDrive/Documents/GitHub/CableTrayRoute/src/cable-schedule/scheduleConfig.js:15), [tableUtils.mjs:1333](C:/Users/Derek/OneDrive/Documents/GitHub/CableTrayRoute/tableUtils.mjs:1333), [cableschedule.js:2196](C:/Users/Derek/OneDrive/Documents/GitHub/CableTrayRoute/cableschedule.js:2196).

The sample's `CBL-VFD-PMP-102` has type `VFD Power`, but the selector offers only Power, Control, Signal, Data, and Fiber.

**Browser observation:** loading the guided core sample through ordinary URLs yields 14 cable rows; the VFD cable's type selector is blank. Source tracing shows single-select rendering assigns the unavailable value, and schedule persistence merges values read back from those controls over stored fields. The blank display was verified in the browser; the subsequent overwrite consequence was traced in code rather than verified by a downloaded round trip.

**Fix and acceptance:** normalize recognized aliases while preserving the detailed cable classification, and retain unknown imported values as visible options/validation warnings. Loading a sample, editing an unrelated field, saving, and exporting must not discard its cable type or other unfamiliar enum values.

## Improvements that would make the application substantially better

| Priority | Improvement | Concrete acceptance target |
| --- | --- | --- |
| High | Treat project recovery as a first-class workflow | Complete multi-scenario backups; offline reopen; visible last successful local/cloud save; restore preview showing counts and validation errors; transactional save/rename/import behavior. |
| High | Introduce one structured calculation-result contract | Every consumer receives value, units, validity, input sources, assumptions, model limits, warnings, and input fingerprint. An unevaluated constraint must never look like a clean result. |
| High | Normalize and validate projects once at each boundary | UI imports, saved records, server APIs, workers, and reports consume the same canonical shape. Test legacy migrations and unknown enum preservation through a full round trip. |
| High | Replace the remaining server global-storage adapters | Short-circuit and motor-start engines receive immutable project inputs. Add overlapping requests for distinct projects and verify exact result identity. The current `withAnalysisStore` swaps process-global storage and awaits an import; this review does not claim a demonstrated cross-user disclosure. |
| High | Test outcomes across the complete user journey | Add ordinary-browser create → edit → save → close/reopen → export → clean import → study → report cases. Include multi-scenario and offline recovery. Prioritize content and invariants over headings, response fields, and copied formulas. |
| Medium | Give cable rows more of the initial viewport | In the inspected approximately 1265 × 712 view, table group headers started around y=650 and no complete data row was visible. Consolidate duplicate workflow/sample navigation and the large handoff panel; keep guidance expandable and aim for several editable rows before scrolling. |
| Medium | Make project identity and next actions explicit | The header displays “Local” while the full project name is in its accessible description. Keep the project name visible, distinguish local save from server sync, and replace checklist labels such as “Go to equipmentlist” with “Open Equipment List.” |
| Medium | Separate engineering records from table controls | Use stable IDs and a canonical row model; derive controls from it instead of reconstructing the project from visible inputs. This reduces hidden-field, enum, sorting, and alias regressions. Continue extracting persistence/calculation boundaries from large controllers. |

## Suggested delivery order

1. **Protect recoverability:** findings 1–2, including clean-browser and offline acceptance.
2. **Prevent misleading engineering conclusions:** findings 3–6, with explicit validity and topology states.
3. **Make supported data consistent everywhere:** findings 7–9 and canonical boundary normalization.
4. **Improve daily efficiency:** compact workspace, visible project identity, clearer next actions, and consistent recovery/status feedback.

## Verification and limits

- `npm test` passed: **349 Node test files**. These failures were found with additional focused probes, not by changing existing test expectations.
- `npm run lint` passed, including architecture, cycle, and CSS checks.
- Executed isolated calculation, HTTP, saved-record, recommendation-application, and multi-scenario round-trip probes. Scripts and logs are in `output/application-review-2026-09-13/`.
- Walked the live application on an isolated localhost origin: home → sample gallery → guided core sample → cable schedule, without E2E bypass flags. Inspected the accessibility tree and schedule screenshot.
- Did not modify application code, rerun the build, or run the full Playwright/Firefox suites in this review. No live cloud account was changed; Supabase rename/save behavior was not newly validated.
- The earlier correction report remains evidence for its stated tested scope, but it did not cover the offline metadata-import failure or complete multi-scenario backups found here.

Overall engineering class: **Screening only**, limited to the reviewed voltage-drop and sizing interfaces. This pass checked input/model boundaries and cross-interface behavior, not every solver, complete standards tables, protective-device readiness, or installation compliance.

| Engineering topic | Basis and evidence | Assessment |
| --- | --- | --- |
| Voltage-drop fixtures | Repository conductor model; independent arithmetic gives 1% for the stated 25 ft, #10 copper, 20 A, 120 V, single-phase, unity-PF fixture | Suitable for detecting topology/order and recommendation-state errors; not a full Table 9 audit |
| Ambient correction | Repository table range and boundary probes; manufacturer reference confirms correction is required away from the reference ambient | Out-of-range behavior is defective; applicable edition/table verification is required before extending the model |
| Load-flow handoff | Documented converged-source requirement, browser guard, and direct/API probes | API/shared resolver validity differs from the page |
| Study API shape handling | Supported schema/import shapes and paired HTTP fixtures | Adapter inconsistency reproduced; short-circuit and motor-start equations were not independently re-audited |

Before using these calculations for issued engineering work, a qualified reviewer needs complete installation inputs, applicable source tables and assumptions, supported topology, and independently verified benchmark evidence. Automated test counts do not establish that readiness.
