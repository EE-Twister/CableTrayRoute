# Implementation verification — September 9, 2026

Compared the current working-tree implementation with `docs/application-review-2026-09-09.md`. This is a read-only application audit; only this report was added. The earlier claim that all items were completed was too broad. Several original reproductions are fixed, but their full acceptance criteria remain unmet.

## Remaining findings, ordered by consequence

### High — revision protection is lost during normal project loading

`src/projectManager.js:32` holds revisions in a module-local Map. Server loading records a revision at line 527, but both load flows immediately reload the page (lines 636 and 651). Subsequent saving therefore omits `baseVersion` (line 480). The server checks conflicts only when that value is supplied (`server.mjs:222`). Page navigation also discards the Map.

The serialized server transaction fixes the original same-base race, but normal browser saves can still overwrite newer work. An isolated HTTP probe sent two full saves without revisions; both returned 200. Persist the revision with the corresponding local project snapshot and account, and define explicit create versus update semantics. Test two browser contexts through load, reload, edit, and save. The new regression test only covers requests that explicitly supply a revision.

### High — metric sizes still become AWG-sized conductors through the fallback

`src/necTable9.mjs:59` rejects metric tokens, but `src/voltageDrop.js:59` then calls `dcResistance`. Its fallback uses `ampacity.mjs:37`, which extracts the first number and looks it up in the AWG area map.

Directly reproduced: both `10 mm2` and `10mm²` resolve to area 10,380 circular mils, the application's AWG 10 area. With 480 V, 100 A, 500 ft and PF 0.85, both return **18.634795%**, with `evaluated: true`. The study even labels this fallback as Table 9 AC R+X (`analysis/voltageDropStudy.mjs:203`). Reject unsupported units throughout the complete calculation chain or implement an explicitly sourced metric model. Current tests assert only rejection at the Table 9 lookup boundary, so they pass despite this defect.

### High — schedule, study, and report outputs are still inconsistent

`cableschedule.js:1875` hardcodes three phases in sizing highlighting; line 1889 replaces the row voltage-drop field with the recommended conductor's sizing result. That path omits the selected cable's PF, parallel count, and impedance override. `sizing.js:111` and `reports/sizingSummary.mjs:7` also export a recommendation's voltage drop alongside the selected conductor.

Directly reproduced using the report's `summarizeCable` function: a selected 500 kcmil copper cable, 480 V, 100 A, 500 ft, PF 0.85, three-phase, two parallel runs yields **0.392368%** in `evaluateCable`, while the sizing summary returns **3.439114%** and recommended size `#2 AWG`. A recommendation may legitimately have a different result, but it must be labeled separately and must not overwrite the installed cable's result. The modal now calls the shared function, but its change listeners also omit conductor size/material (`cableschedule.js:353`). Add cross-interface fixtures covering actual cable results and separately labeled recommendations.

### Medium — API cable handoff is repaired, but input normalization is incomplete

The endpoint now evaluates saved cables and passes the new nonempty-result regression. However, `server.mjs:2102` reads load-flow results from `data.studies` or `data.studyResults`, while the canonical export stores them at `data.settings.studyResults` (`dataStore.mjs:1431`). Projects relying on those saved study inputs are not covered by the new cable-only fixture. Normalize the canonical exported shape and compare API results against direct study results including inferred inputs.

The endpoint still uses `withAnalysisStore`, which changes process-global localStorage and awaits an import (`server.mjs:2017`). Removal of global state was not implemented. Cross-request isolation remains an unverified risk; this audit does not claim a reproduced cross-user disclosure.

### Medium — gzip works for static files but negotiation and caching remain incomplete

An isolated server probe confirmed `/style.css` returns readable gzip content when requested. It also returns gzip for `Accept-Encoding: gzip;q=0`, because `server.mjs:1136` checks only whether the token occurs. The identity response has no Vary header, whereas the gzip response does. Additionally, the replacement `res.write` buffers every accepted-gzip response and always returns true, and `gzipSync` blocks during compression. This does not preserve streaming/backpressure behavior.

Use established stream-aware compression with proper encoding negotiation and consistent cache variation. Test gzip disabled, identity, range requests, existing Vary values, and large responses. The current regression only asserts the gzip response header.

### Medium — material normalization and import failure handling remain partial

The explicit `nonmagnetic` case now matches PVC. However, `rigid aluminum` still matches the steel column (`src/necTable9.mjs:76`), reproduced with 500 kcmil copper. The original review explicitly included rigid-material descriptions in acceptance. Normalize material enums instead of generic substring matching.

Fresh sample loading now establishes project identity before import, and its ordinary-browser regression passes. Full transactional acceptance is not established: the false-import return at `src/sampleGallery.js:301` bypasses snapshot restoration, and post-import completeness checks compare only cable counts. Test cancellation/write failures, other collections, existing saved samples, and every guided sample before claiming atomic import completion.

## Original eight defects: outcome

| Original item | Verification outcome |
| --- | --- |
| 1. Concurrent saves | Same-base server race corrected; browser revision persistence still incomplete. |
| 2. First guided sample | Original fresh-workspace flow corrected and retested; full import transaction acceptance incomplete. |
| 3. Editor calculation consistency | Shared modal calculation added; table and sizing report consistency still fails. |
| 4. Parallel runs | Shared calculation corrected: one/two/three runs yield 0.784736738%, 0.392368369%, 0.261578913%; invalid 0 and 1.5 return null. Sizing consumers remain incomplete. |
| 5. Metric conductor sizes | Not corrected end to end; fallback still interprets metric numbers as AWG sizes. |
| 6. Nonmagnetic conduit | Exact negative-word defect corrected; rigid aluminum remains misclassified. |
| 7. REST endpoint ignores cables | Original empty result corrected; canonical load-flow handoff and request isolation incomplete. |
| 8. Static gzip | Original uncompressed static response corrected; negotiation, cache variation, and streaming gaps remain. |

## Original seven improvements: outcome

| Improvement | Outcome |
| --- | --- |
| Production workflows without bypasses | Partial: one fresh sample path added and passed; complete create/import/edit/reload/study/export acceptance not added. |
| Shared calculation-result contract | Incomplete: primitive numeric return, inaccurate fallback provenance, and divergent consumers remain. |
| Transactional, visible import/save outcomes | Partial: better conflict message and sample setup; revision persistence, complete rollback, and comprehensive save-state presentation remain. |
| Remove process-global server state | Not implemented; wrapper remains in use. |
| More compact editable workspace | No implementation addressing this priority in the reviewed diff. |
| Explicit project identity and next actions | No complete implementation; checklist still derives labels from page filenames. |
| Extract large controllers | No substantial domain extraction in this change. |

## Verification and engineering boundary

- Reran `node tests/applicationReviewRegressions.test.mjs`: passed. This confirms supplied-base concurrency handling, simple API cable handoff, and the narrow normalization/compression assertions, not all original acceptance criteria.
- Reran `npx playwright test --config playwright.config.cjs playwright-tests/workflow-smoke.spec.js --project=msedge --workers=1 --reporter=line --grep "guided sample import populates"`: one passed.
- Ran isolated temporary-server probes for gzip, gzip disabled, identity, and unversioned full saves.
- Ran direct calculation probes for metric inputs, conduit descriptors, invalid and one/two/three parallel counts, and study versus sizing-report output. The report probe supplied the repository conductor-properties JSON to the Node fetch path.
- Did not rerun the full Node suite, build, lint, or full Playwright suite in this read-only audit. Earlier passing results are not evidence that the newly identified cases pass.

Overall engineering class: **Screening only**, limited to the reviewed voltage-drop chain. Software execution and dimensional/input consistency form the basis of this verification. No new standards-compliance claim or full Table 9 transcription validation was performed. The nominal parallel fixture matches the original review's bounded benchmark; metric normalization, actual-versus-recommended output semantics, and accurate provenance remain unresolved.

Before closing the original work, correct the three high-priority gaps, normalize canonical API inputs, replace the compression implementation, and add regressions that assert the original acceptance outcomes rather than only intermediate function behavior. Installation-specific engineering approval remains outside this software review.
