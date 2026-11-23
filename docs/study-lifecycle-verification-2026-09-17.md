# Study validity and freshness — September 17–18, 2026

Item 4 applies the corrected study-result behavior across the application:
missing inputs withhold affected results, changed inputs mark saved results
stale, and reports retain assumptions, warnings, and provenance. Verification
covers save, reopen, scenario switching, and export.

**Overall class: Screening only.** Freshness means that a result matches its
recorded inputs and calculation version. It is separate from numerical validity,
passing an engineering limit, and human approval.

## Scope and acceptance criteria

The initial navigation inventory contains 45 study routes. Six have no declared
saved-study output: Demand Schedule, International Cable Sizing, Equipment
Evaluation, Ground Grid, Auto-Size, and EMF. These still require accurate
current-page validity and export behavior. Embedded One-Line studies and other
workflow producers must use the same persisted-result rules.

Completion requires:

- Every study route has an explicit lifecycle treatment and coverage record.
- Invalid or missing required inputs cannot produce an evaluated zero or an
  apparent clean pass. An evaluated limit failure remains distinct from an
  unevaluated calculation. Partial results retain their row-level meaning.
- Saved results distinguish current, stale, and unknown provenance. Relevant
  project data, manual inputs, calculation options, upstream results, and
  calculation-version changes participate in that decision.
- Importing, reopening, switching scenarios, or editing result metadata does
  not turn an old result into a newly calculated result.
- An asynchronous calculation retains the inputs and scenario used when it
  started, even if the active project changes before it finishes.
- Historical results remain inspectable with their status; downstream studies
  cannot silently treat stale, invalid, or unknown results as current inputs.
- Reports and exports retain validity, freshness, assumptions, warnings,
  model limits, input provenance, and calculation time.
- Shared storage APIs preserve undo/redo and scenario isolation.

## Initial findings

The original shared banner inspected only the first study output and only at
page load. Unknown provenance used the same visual class as current results.
The bulk study setter created fresh provenance whenever a stored payload
changed, without distinguishing calculation from restoration or metadata edits.
Several report builders retained scalar quantities while dropping the context
needed to assess those quantities.

A direct report probe also reproduced an unsafe presentation: blank or null
arc-flash energy combined with `validity: unevaluated` could yield the statement
“Below 1.2 cal/cm² threshold.” Legacy voltage-drop rows could retain `PASS` and
contribute to an evaluated-cable count despite missing a result contract.
These are presentation/validity defects, distinct from the equations corrected
in item 3.

## Implementation and verification

**Item 4 is complete as of September 18, 2026.** The shared lifecycle API uses a
versioned sidecar in `settings.studyProvenance`, preserving the established
study result maps and arrays. Actual calculations capture their context before
execution and save their result together with that context. Bulk restoration or
metadata edits do not count as a new calculation.

The independent review covers:

- 20 pure lifecycle cases, including version omissions, result mutation,
  partial/unevaluated outputs, immutable snapshots, and evaluated limit failures.
- 19 storage cases, including input/settings changes, identical-result reruns,
  transitive dependencies, explicit manual sources, named save/reopen,
  export/import, scenario/project races, event atomicity, and retained metadata.
- Eighteen isolated Edge browser cases for the shared component, including input
  invalidation, unrelated study writes, dependency blocking, rerun recovery,
  and refusal to save orphan provenance without a named project. These also
  cover identical reruns after restoring original inputs and same-tab solver
  setting changes. Multi-study cases verify that edits affect the corresponding
  result scope and that rerunning a sibling study cannot freshen another result.
  Export cases force a stale control back to enabled and verify that its handler
  still cannot issue a download.
- Three canonical-server cases checking that browser saves remain current in
  the server's project projection and become stale after a source edit.
- Seven One-Line controller cases using the real data store with controlled
  solver responses, including overlay normalization, project switches,
  mid-run edits, and the newly calculated short-circuit dependency.
- Eight report/export cases, including missing arc-flash values, legacy
  voltage-drop pass claims, precomputed current assessments, metadata retention,
  and dependency-blocked exports.
- Six duty-validation cases using actual store assessments, including an
  eligible empty violation list, changed TCC settings, changed short-circuit
  inputs, and explicit withholding of stale or legacy no-violation results.

All 81 of the above independent checks passed. The extended storage review found
and verified corrections for changed valid upstream results and explicitly
selected dependencies outside the default registry. Both now invalidate their
dependents correctly. The final compiled-page inventory loaded all 45 study
routes without page errors or missing declared controls. A separate compiled
entrypoint inventory confirmed the shared lifecycle controller in all 45
routes. These inventories establish route and initialization coverage; they
do not substitute for behavioral acceptance of every control on every page.

The September 18 production build passed, including unchanged bundle budgets.
The required `npm test` run passed all 378 Node test files. The final isolated
browser check passed all 18 lifecycle cases. A built-page regression verified
that Bus Duct refreshes a linked short-circuit value from 22.4 kA to 44.8 kA
before saving an eligible new run. The generated page-contract audit reports
zero actionable failures and 93 conservative warnings.

The final full Edge and Firefox functional suite passed all 940 tests in
10.6 minutes, with two workers and no retries. Earlier diagnostic runs exposed
the corrections listed below; the final passing run used the completed build
and corrected fixtures. No unresolved implementation or acceptance failure
remains within this item's scope.

### Corrections exercised during acceptance

- Linked sizing forms refresh project values before calculation while retaining
  explicit manual overrides. Lost sources clear previously linked values,
  including after reopening a saved project.
- Load Flow displays unsaved local results and persistence errors without
  treating those results as exportable saved evidence.
- Equipment Evaluation, Demand Schedule, and Ground Grid invalidate affected
  page results and exports after source edits.
- Shared export guards reject stale or unqualified results even if a page
  controller re-enables its button after rendering.
- Harmonics, Motor Start, Load Flow, and Contingency initialize the same shared
  controller directly in their lightweight entrypoints. A compiled-bundle
  inventory exposed their missing initialization during browser acceptance.
- Frequency Scan validates required source and bank fields, tracks bank-row
  additions/removals, and restores saved input values with the saved chart.
- Imported Frequency Scan and Transient Stability sources allow manual input
  completion but require reimport after changes to their recorded source.
- IEC 60909 historical review exports retain row validity, freshness, warnings,
  and provenance instead of presenting old quantities as current results.
- Validation qualifies TCC duty and reliability results, including empty
  violation lists. Changed TCC settings or short-circuit results stale the
  dependent duty cache.
- Settings-menu project actions initialize the project manager when needed,
  retaining New, Save, and Load behavior after startup bundle reduction.

The local baseline, route inventory, diagnostic scripts, and verification
artifacts are under `output/study-lifecycle-2026-09-17/`.

### Final acceptance record

| Check | Result | Local evidence |
| --- | --- | --- |
| `npm test` | Passed all 378 Node test files | `node-acceptance-latest.log` |
| `npm run build` | Passed, including unchanged bundle budgets and HTML asset checks | `build-fifth.log` |
| `npm run lint` | Passed ESLint, architecture, module-cycle, and CSS checks | `lint-latest.log` |
| Full Playwright suite, Edge and Firefox, two workers, no retries | All 940 tests passed in 10.6 minutes | `browser-final.log` |
| Independent lifecycle review | 81 checks passed across core, storage, reports, server projection, One-Line, duty validation, and shared browser behavior | `*-acceptance.log`, `component-final.log` |
| Compiled study-page inventory | 45 routes loaded without page errors or missing declared controls | `built-routes-final.log` |
| Compiled lifecycle initialization | All 45 entrypoints include the shared controller | `built-lifecycle-init-review.json` |
| Linked-input browser regression | Updated and saved 44.8 kA after the linked source changed from 22.4 kA; result eligible | `linked-browser-final.log` |
| Page-contract audit | Zero actionable failures; 93 conservative static-analysis warnings | `docs/page-contract-audit.md` |

The full functional browser command is:

```text
npx playwright test --config playwright.config.cjs --workers=2 --retries=0 --reporter=line
```

The browser lane uses the configured Firefox and Microsoft Edge projects. The
separate visual-baseline lane is outside this lifecycle acceptance scope. This
verification does not expand the calculation models' documented applicability
or promote screening results or protective-device records to approved use.

## Route inventory

This inventory records the treatment required for each study page. It is a scope
check, not evidence that every page has passed its behavioral acceptance checks.

| Study page | Saved result keys / treatment |
| --- | --- |
| `demandschedule.html` | Current-page calculation and export validation |
| `intlCableSize.html` | Current-page calculation and export validation |
| `iec60287.html` | `iec60287` |
| `cablethermalenv.html` | `cableThermalEnvironment` |
| `tcc.html` | `shortCircuit`, `tcc`, and context-qualified `duty` cache |
| `harmonics.html` | `harmonics`, `harmonicNetwork`, `frequencyScan` |
| `capacitorbank.html` | `capacitorBank` |
| `frequencyscan.html` | `frequencyScan` |
| `voltageflicker.html` | `voltageFlicker` |
| `busdust.html` | `busDuctSizing` |
| `sustainability.html` | `sustainabilityFootprint` |
| `battery.html` | `batterySizing` |
| `generatorsizing.html` | `generatorSizing` |
| `ibr.html` | `ibr` |
| `derinterconnect.html` | `derInterconnect` |
| `motorStart.html` | `motorStart` |
| `loadFlow.html` | `loadFlow` |
| `quasidynamic.html` | `quasiDynamic` |
| `optimalpowerflow.html` | `optimalPowerFlow` |
| `probabilisticloadflow.html` | `probabilisticLoadFlow` |
| `sagtension.html` | `sagTension` |
| `substationlayout.html` | `substationLayout` |
| `voltagestability.html` | `voltageStability` |
| `shortCircuit.html` | `shortCircuit` |
| `iec60909.html` | `iec60909` |
| `arcFlash.html` | `arcFlash` |
| `dcshortcircuit.html` | `dcShortCircuit` |
| `differentialprotection.html` | `differentialProtection` |
| `equipmentevaluation.html` | Current-page calculation and export validation |
| `bessHazard.html` | `bessHazard` |
| `hazareaclassification.html` | `hazAreaClassification` |
| `insulationcoordination.html` | `insulationCoordination` |
| `lighting.html` | `lighting` |
| `groundgrid.html` | Current-page calculation and export validation |
| `lightningprotection.html` | `lightningProtection` |
| `cathodicprotection.html` | `cathodicProtection` |
| `dissimilarmetals.html` | `dissimilarMetals` |
| `autosize.html` | Current-page calculation and export validation |
| `heattracesizing.html` | `heatTraceSizing`, `heatTraceSizingCircuits` |
| `reliability.html` | `reliability` |
| `emf.html` | Current-page calculation and export validation |
| `transientstability.html` | `transientStability` |
| `contingency.html` | `contingency` |
| `voltagedropstudy.html` | `voltageDropStudy` |
| `cybercompliance.html` | `cyberCompliance` |
