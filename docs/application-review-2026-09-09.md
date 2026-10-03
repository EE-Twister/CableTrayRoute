# CableTrayRoute application review — September 9, 2026

Reviewed checkout: `c64551a1`. Application source was left unchanged. This report records eight defects and seven improvement priorities.

The highest-value work is protecting saved work, repairing first-use sample loading, and making voltage-drop results consistent across the editor, studies, and API. The application already has extensive automated checks, workflow guidance, and engineering provenance mechanisms; the findings below show where those mechanisms do not yet cover actual user behavior.

## Defects, ordered by priority

### 1. High — concurrent project saves silently lose successful updates

**Evidence:** [server.mjs:202](C:/Users/Derek/OneDrive/Documents/GitHub/CableTrayRoute/server.mjs:202), [server.mjs:231](C:/Users/Derek/OneDrive/Documents/GitHub/CableTrayRoute/server.mjs:231).

The version comparison and write are separate asynchronous operations. Concurrent requests can all read the same version, pass the comparison, and overwrite each other's work. Revision filenames use `Date.now()`, so multiple writes within one millisecond can also target the same file.

**Reproduced:** Created an isolated temporary server and project `{ seed: true }`. Sent 12 concurrent merge patches, each adding a different field and using the same `baseVersion`. All 12 returned HTTP 200. The final project contained only `seed` and `field11`. Eleven responses shared the same revision ID.

**Impact:** Multiple tabs, collaborators, or overlapping saves can lose edits while reporting success. Revision history may not retain every acknowledged save.

**Correction:** Make version comparison, merge, persistence, and cache update one serialized transaction per project. Use collision-resistant revisions and atomic file replacement, or database transactions if supporting multiple server processes. Review the analogous cloud-library save implementation at lines 322–351.

**Acceptance check:** With 12 concurrent updates based on one version, one succeeds and the remaining stale writes receive conflicts, unless an explicitly implemented merge policy preserves all updates. No two distinct committed revisions share an ID. The current passing suite did not detect the reproduced failure.

### 2. High — the first guided sample can report success while dropping its schedules

**Evidence:** [src/sampleGallery.js:292](C:/Users/Derek/OneDrive/Documents/GitHub/CableTrayRoute/src/sampleGallery.js:292), [dataStore.mjs:299](C:/Users/Derek/OneDrive/Documents/GitHub/CableTrayRoute/dataStore.mjs:299), [dataStore.mjs:1567](C:/Users/Derek/OneDrive/Documents/GitHub/CableTrayRoute/dataStore.mjs:1567).

The sample calls `importProject(payload)` before assigning its project name. The data-store guard rejects named-project collection writes in an unnamed workspace. Import does not propagate those setter failures and still returns success.

**Reproduced in the browser:** Opened a fresh local origin without `?e2e`, selected Browse Samples, and started Project Workflow Core. The URL changed to the sample name and a “Loaded” toast appeared, but an unexpected Create New Project dialog also opened. After cancelling that dialog and following the cable-schedule checklist link, the page showed **0 TOTAL CABLES** and **No cables yet**.

**Impact:** The primary onboarding demonstration fails for a new user and can save a partial sample as if it were complete. Import success is not reliable when collection writes are rejected.

**Correction:** Establish the destination project context before import and apply the import atomically. Propagate rejected writes, roll back partial imports, and verify imported collection counts before displaying success or saving a sample copy.

**Acceptance check:** From a fresh browser context and ordinary production URL, start every guided sample and inspect its equipment, loads, cables, and one-line. No unexpected project-name prompt; imported counts match the fixture. Existing sample smoke coverage uses `?e2e=1`; [dataStore.mjs:284](C:/Users/Derek/OneDrive/Documents/GitHub/CableTrayRoute/dataStore.mjs:284) bypasses this guard in that mode.

### 3. High — the cable editor uses a different, dimensionally ambiguous voltage-drop calculation

**Evidence:** [cableschedule.js:318](C:/Users/Derek/OneDrive/Documents/GitHub/CableTrayRoute/cableschedule.js:318), [src/cable-schedule/scheduleConfig.js:175](C:/Users/Derek/OneDrive/Documents/GitHub/CableTrayRoute/src/cable-schedule/scheduleConfig.js:175), [src/voltageDrop.js:59](C:/Users/Derek/OneDrive/Documents/GitHub/CableTrayRoute/src/voltageDrop.js:59).

The editor labels its input **Impedance (Ω)** and computes `length × current × impedance / voltage × 100`. Length is in feet, so the labeled dimensions do not produce volts. The editor does not take phase or power factor into account. The study uses the separate AC resistance/reactance calculation with phase and power factor.

**Impact:** A saved cable-row percentage can disagree with the study for the same circuit. Entering total circuit impedance multiplies by length again; entering per-length impedance requires an undocumented unit convention. This affects any cable whose modal voltage-drop automation is used.

**Correction:** Delegate the editor to the shared calculation. For impedance overrides, distinguish total circuit ohms from resistance/reactance per unit length. Show phase, power factor, length basis, parallel count, and calculation provenance alongside the result.

**Acceptance check:** One independently calculated circuit produces the same unrounded result in the editor, study, API, and report. Test single- and three-phase circuits and total-ohm/per-length overrides. The current suite passes without enforcing this cross-interface equality.

**Basis:** Dimensional analysis and the manufacturer's AC voltage-drop equation, including phase coefficient, resistance, reactance, power factor, and parallel conductors, in the [ABB Electrical Installation Handbook, printed page 57 / PDF page 60](https://library.e.abb.com/public/561a28a17753c444c125714f00360967/1SDC010001D0204.pdf#page=60).

### 4. High — voltage-drop studies ignore parallel runs

**Evidence:** [src/voltageDrop.js:32](C:/Users/Derek/OneDrive/Documents/GitHub/CableTrayRoute/src/voltageDrop.js:32), [analysis/voltageDropStudy.mjs:158](C:/Users/Derek/OneDrive/Documents/GitHub/CableTrayRoute/analysis/voltageDropStudy.mjs:158), [src/cable-schedule/scheduleConfig.js:166](C:/Users/Derek/OneDrive/Documents/GitHub/CableTrayRoute/src/cable-schedule/scheduleConfig.js:166).

The schedule supports `parallel_count`, but the voltage-drop calculation applies total `est_load` to a single conductor impedance regardless of that count.

**Reproduced:** For 500 kcmil copper, 480 V, 100 A total, 500 ft, three-phase, PF 0.85, `evaluateCable` returned **0.7847367%** for one, two, and three parallel runs. For the model's equal-length, equal-sharing parallel assumption, the two-run value should be approximately **0.3923684%**.

**Impact:** Parallel feeders can be falsely flagged for excessive voltage drop and receive unnecessarily large conductor recommendations. The error scales with parallel count under the equal-sharing model.

**Correction:** Define current explicitly as total circuit current, validate a positive integer parallel count, and apply the corresponding equivalent impedance/current division. Document limitations for unequal lengths or sharing. Use the same count semantics in sizing recommendations and every consumer.

**Acceptance check:** Independent one/two/three-run fixtures and a case that crosses a pass/fail threshold. Existing voltage-drop tests did not detect this behavior. Engineering basis: the parallel-conductor term in the [ABB handbook equation](https://library.e.abb.com/public/561a28a17753c444c125714f00360967/1SDC010001D0204.pdf#page=60).

### 5. High — metric conductor sizes are silently interpreted as AWG/kcmil tokens

**Evidence:** [src/necTable9.mjs:54](C:/Users/Derek/OneDrive/Documents/GitHub/CableTrayRoute/src/necTable9.mjs:54).

Size normalization extracts the first number and discards its unit. **`10 mm2` and `10 AWG` produce exactly the same Table 9 resistance/reactance.** Both were checked directly. Metric sizes whose numbers match a table key can therefore produce plausible numeric results for a different conductor.

**Impact:** Imported or programmatically supplied metric sizes can receive materially incorrect voltage-drop results. This is a normalization defect; this review does not assert that every UI dropdown offers metric entry.

**Correction:** Parse size and unit together. Use a separately sourced metric model, or explicitly mark metric inputs unsupported in this AWG/kcmil evaluator. Reject malformed compound descriptions rather than guessing the first number.

**Acceptance check:** `10 mm²`, `10 mm2`, `10 AWG`, `500 kcmil`, and ambiguous multi-conductor descriptions resolve to the correct distinct models or an explicit unsupported state. Current size-normalization tests cover AWG/kcmil spelling variations but not this distinction. The mismatch follows directly from the implementation's documented AWG/kcmil scope; no inaccessible NEC clause is inferred.

### 6. Medium — “nonmagnetic” conduit selects magnetic-conduit impedance

**Evidence:** [src/necTable9.mjs:65](C:/Users/Derek/OneDrive/Documents/GitHub/CableTrayRoute/src/necTable9.mjs:65).

The regex includes `magnetic` as a substring, so `nonmagnetic` and `non-magnetic` match it. The generic `rigid` alternative also needs material-aware handling.

**Reproduced:** For 500 kcmil copper, `nonmagnetic` returned R = 0.0001049869 Ω/m and X = 0.0001574803 Ω/m; `PVC` returned R = 0.0000885827 Ω/m and X = 0.0001279528 Ω/m.

**Impact:** Imported material descriptions can select the wrong impedance column. This affects descriptive strings; the test does not establish that the normal dropdown emits these strings.

**Correction:** Normalize known materials to an enum, handle explicit nonmagnetic descriptions before magnetic ones, and flag ambiguous values.

**Acceptance check:** PVC, aluminum, fiberglass, nonmagnetic, steel, EMT, and rigid-material descriptions resolve consistently. Existing tests compare steel with PVC and miss the negative-word match. Basis is the module's own documented magnetic/nonmagnetic distinction.

### 7. High — the voltage-drop REST endpoint ignores the project's cables

**Evidence:** [server.mjs:2048](C:/Users/Derek/OneDrive/Documents/GitHub/CableTrayRoute/server.mjs:2048), [analysis/voltageDropStudy.mjs:281](C:/Users/Derek/OneDrive/Documents/GitHub/CableTrayRoute/analysis/voltageDropStudy.mjs:281).

The endpoint loads the project, then calls `runVoltageDropStudy()` with no arguments. That function defaults to an empty cable array. Installing a temporary one-line data store does not supply its cable argument.

**Reproduced:** Saved a project containing a valid 500 kcmil, 480 V, 100 A, 500 ft cable. The study endpoint returned HTTP 200 with `results: []`, `summary.total: 0`, and `warnings: []`.

**Impact:** API clients receive an apparently successful empty study for populated projects.

**Correction:** Pass normalized project cables, loads, and applicable load-flow data explicitly. Distinguish an empty project from an adapter failure. Prefer pure request-scoped calculation inputs over swapping process-global `localStorage`.

**Acceptance check:** API and direct/browser evaluation of the same saved fixture return matching row counts, cable IDs, provenance, and numeric results. [tests/restApi.test.mjs:181](C:/Users/Derek/OneDrive/Documents/GitHub/CableTrayRoute/tests/restApi.test.mjs:181) currently verifies response status and field presence, so it accepts an empty result.

### 8. Medium — Express static assets bypass the advertised gzip behavior

**Evidence:** [server.mjs:1108](C:/Users/Derek/OneDrive/Documents/GitHub/CableTrayRoute/server.mjs:1108), [server.mjs:1159](C:/Users/Derek/OneDrive/Documents/GitHub/CableTrayRoute/server.mjs:1159).

Compression wraps `res.send`, while `express.static` streams files through a different path.

**Reproduced:** Requested `/style.css` with `Accept-Encoding: gzip` from the application's Express server. It returned HTTP 200, Content-Length **137,938 bytes**, and no Content-Encoding header.

**Impact:** Self-hosted users without compression at a reverse proxy download uncompressed static assets despite the README's compression claim. This observation does not establish the behavior of Cloudflare or another deployment proxy.

**Correction:** Use stream-aware compression before static middleware or precompressed assets/reverse-proxy compression, and test real static responses. Express documents its supported approach in the [compression middleware reference](https://expressjs.com/en/resources/middleware/compression/).

**Acceptance check:** A large CSS/JS response is compressed when gzip is accepted, remains readable when it is not, and has correct cache variation. The existing passing checks did not detect the observed static-file behavior.

## Improvements that would materially improve the application

These are implementation priorities, not additional claims of reproduced defects.

| Priority | Improvement | Concrete outcome / acceptance target |
| --- | --- | --- |
| High | Test real production workflows without behavioral bypasses | Keep a fresh-browser acceptance path with no `?e2e` flag: create/import/sample → edit → reload → study → export. Assert data contents, not just headings or HTTP 200. Retain specialized test hooks only for narrower tests. |
| High | Establish a shared calculation-result contract | All entry points return value, units, evaluated/unsupported status, assumptions, input fingerprint, warnings, and evidence. Add cross-interface equality fixtures. Unknown sizes should not be represented by a bare numeric zero; the current study does withhold evaluation for zero drop, and that safeguard should extend to every caller. |
| High | Make import and save outcomes transactional and visible | Show records accepted/rejected, last successful local save, last successful server save, pending changes, and conflict recovery. Preserve a recoverable pre-import snapshot. Never show a generic success toast after partial writes. |
| High | Remove process-global state from server calculation adapters | `withAnalysisStore` changes `globalThis.localStorage`, while imported project-storage modules have shared caches. Pass immutable project snapshots directly to solvers; verify separate users/projects concurrently. This is an isolation risk requiring a dedicated test, not a demonstrated cross-user disclosure in this review. |
| Medium | Put the editable workspace higher on the page | In the inspected approximately 1265 × 712 viewport, cable-table headers began around y=650 after global navigation, workflow navigation, sample guidance, heading, toolbar, counters, and another action panel. Collapse guidance after completion, combine duplicate next-step controls, and preserve more space for rows. Verify keyboard access and smaller viewports. |
| Medium | Make project identity and next actions explicit | The header's save-state control has the project name in its accessible description but mostly displays a status such as “Local.” Keep the name visible and separate local/cloud status. Use labels such as “Equipment List” instead of generated page filenames in sample checklist links. |
| Medium | Continue extracting large controllers around domain boundaries | The architecture checker still budgets roughly 13,000 lines for `oneline.js`, 5,200 for `ductbankroute.js`, and 3,200 for `cableschedule.js`. Prioritize calculation, persistence, and import boundaries where duplicated logic causes observable errors; maintain one shared implementation per domain rule. |

## Suggested delivery order

1. **Protect work and repair onboarding:** defects 1 and 2; add concurrency and fresh-browser regression tests.
2. **Make voltage drop consistent:** defects 3–7; one normalized model and independent cross-interface fixtures.
3. **Improve everyday usability and delivery speed:** defect 8, more visible project/save state, and a more compact schedule workspace.
4. **Strengthen the engineering platform:** request-scoped server calculations, structured result contracts, and incremental controller extraction.

These are work packages, not calendar estimates. Avoid adding more specialist calculators before the first two packages are reliable.

## Verification performed

- `npm test` — passed; runner discovered **347 Node test files**.
- `npm run build` — passed, including catalog validation, bundling, bundle budgets, asset generation, and HTML asset audit.
- `npm run lint` — passed, including JavaScript, architecture boundaries/cycles, and CSS architecture checks.
- `npx playwright test --config playwright.config.cjs playwright-tests/workflow-smoke.spec.js --project=msedge --workers=2 --reporter=line` — **121 passed**.
- Manual browser walkthrough on an isolated local Express origin: home → sample gallery → first guided sample → cable schedule, without E2E flags.
- Direct numerical probes for parallel counts, metric/AWG normalization, unknown size handling, and magnetic/nonmagnetic descriptions.
- Temporary-server HTTP probes for concurrent saves, populated-project voltage-drop API output, and static CSS compression.

The entire Playwright suite and Firefox project were not run. The CLI browser package was unavailable in the offline npm cache; manual inspection used the connected browser instead. Test/build/lint logs are saved under `output/application-review-2026-09-09/`.

## Engineering assessment and limits

**Overall class: Screening only**, for the reviewed voltage-drop calculation chain. This is not a classification of every solver in the application and is not professional engineering approval.

| Topic | Implementation / evidence | Review status |
| --- | --- | --- |
| Nominal AC voltage drop | Shared R/X implementation; independent 500 kcmil fixture yields 3.766736 V / 0.7847367%; manufacturer's general equation checked | Nominal fixture consistent; parallel handling requires correction |
| Editor calculation | Separate scalar-impedance formula with Ω label and ft length | Inconsistent units and entry-point behavior |
| Conductor/material normalization | AWG/kcmil token extraction and conduit regex | Reproduced unit loss and wrong material-column selection |
| API handoff | Saved project → endpoint → empty default cable array | Reproduced loss of calculation inputs |
| NEC table data and installation applicability | Repository Table 9 transcription and documented scope | Full table transcription and governing installation-specific applicability were not independently re-audited |

No jurisdiction, adopted edition, installation configuration, or intended issued use was supplied. The review therefore checks software behavior and one bounded engineering chain; it does not establish code compliance, protective-device readiness, or the correctness of every specialist calculation. Supabase deployment, live cloud accounts, full security penetration testing, and large-project performance benchmarking were outside this pass.

Before qualified engineering review of voltage-drop deliverables, correct the identified calculation/normalization defects, verify primary-source table data and installation assumptions, and demonstrate identical results and provenance across the editor, study, API, and exported report.

## Status update — 2026-10-03

Re-checked against the current tree: defects 3–7 (shared editor voltage-drop calculation, parallel runs, metric size handling, nonmagnetic conduit, REST study inputs), the serialized project save queue, and transactional sample import are already addressed in source. Static gzip (defect 8) uses `compression` middleware; verify against real static responses in a deployed environment.

Newly completed: native `window.confirm` / `window.prompt` dialogs in project deletion, workflow packages, scenarios, cable library/typicals, custom components, equipment presets, and report format selection now use the shared `confirmModal` / `promptModal` helpers in `src/components/modal.js` (focus-trapped, keyboard accessible, consistent styling).

Still open: core-versus-advanced navigation split, per-step readiness checklists, and a more compact table-first schedule layout.
