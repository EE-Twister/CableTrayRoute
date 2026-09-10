# Correction verification — September 9–10, 2026

This follow-up checks the corrections against the reproduced defects in
`application-review-2026-09-09.md` and the remaining gaps in
`implementation-verification-2026-09-09.md`. A Luna subagent implemented the
corrections. The parent reviewer inspected the changes, added independent
regressions, and returned failed cases to Luna for correction.

## Verification status

The reproduced defects and follow-up correction gaps below are corrected within
the tested scope. Final verification completed September 10. The broader roadmap
remains open as described below.

| Check | Final result |
| --- | --- |
| `npm test` | Passed: 349 Node test files, including calculation provenance, server concurrency, canonical API inputs, normalization, scoped rollback, and per-tab storage tests. |
| `npm run build` | Completed all stages, including bundle budgets, asset copying, the validation manifest, and HTML asset audit. The project-manager bundle is newer than the final deletion fix. |
| `npm run lint` | Passed, including architecture/cycle and CSS checks. |
| Affected Playwright suites in Edge | 148 passed in the final combined run; the remaining case passed in an isolated rerun. All 16 new correction regressions passed in the combined run. |
| Independent calculation/HTTP probes | All 14 passed, including the hand-derived single-phase and parallel fixtures, actual report/API equality, twelve concurrent saves, compression negotiation, and byte ranges. |
| Generated page-contract audit and `git diff --check` | Passed. |

The Playwright command was:

```powershell
npx playwright test --config playwright.config.cjs playwright-tests/review-corrections.spec.js playwright-tests/workflow-smoke.spec.js playwright-tests/cableschedule.spec.js --project=msedge --workers=2 --reporter=line
```

The combined run exited nonzero because Edge closed before creating a context
for `delete all clears table`; this was a setup failure before its application
assertions. The case then passed using `--workers=1 --grep "delete all clears
table"`. This is not a clean combined-suite pass. The full repository Playwright
suite and Firefox were not run. The Supabase deletion workflow used the existing
mocked endpoint; no live cloud account was modified or validated.

Final logs are under `output/application-review-2026-09-09/`:
`correction-node-final.log`, `correction-build-final.log`,
`correction-lint-final.log`, `correction-browser-final-pass.log`,
`correction-browser-isolated-final.log`, and
`correction-independent-final.log`. The browser log filename does not override
the combined-run failure described above.

## Coverage against the findings

| Finding | Implemented behavior and acceptance evidence |
| --- | --- |
| Concurrent project saves | Saves are serialized per project. Existing HTTP projects require a base revision. Per-tab revisions survive reload/navigation and are scoped to account/project. Independent HTTP checks confirm one winner among twelve writes using the same base. Browser tests exercise stale-save rejection in shared-storage tabs and separate browser contexts. |
| Guided sample import | Project identity is established before collection writes. Collection and one-line checks detect incomplete imports. Scoped snapshots restore project data, scenarios, saved copies, history, and URL after failure while preserving unrelated preferences/authentication. All ten guided samples are checked on ordinary URLs and after reload. |
| Modal/table/report consistency | Selected-cable results are kept separate from sizing recommendations. The modal retains hidden phase metadata and uses the shared solver. Browser checks cover size and parallel-count changes plus save/reload; a separate regression covers editing and clearing canonical resistance overrides. |
| Parallel runs | Shared voltage drop divides current by a validated positive integer run count. Sizing uses required ampacity per run. Independent one/two/three-run calculations and invalid-count checks cover the model. |
| Unsupported conductor units | Metric and malformed conductor tokens cannot fall through to an unrelated AWG resistance. Study evaluation and provenance identify unsupported models. |
| Conduit material | Nonmagnetic and rigid-aluminum descriptions resolve to the nonmagnetic model; independent comparisons verify equality with PVC. |
| Voltage-drop API | The endpoint passes saved cables, loads, and canonical `settings.studyResults.loadFlow` directly to the solver. Independent checks compare API results with explicit and inferred-input fixtures. This endpoint no longer swaps process-global storage. |
| Static compression | Standard streaming compression handles encoding negotiation and cache variation. Independent checks decode gzip, reject `gzip;q=0`, check identity variation, and verify an uncompressed 206 byte range. |

## Scope and remaining roadmap

The review also caught and returned three implementation regressions to Luna:
hidden phase data lost on modal opening, an old resistance alias surviving an
edit/clear action, and an undefined variable in revision cleanup after project
deletion. Browser acceptance checks cover these paths. The saved-sample reopen
path received the same rollback protection as fresh sample creation.

These corrections address the reproduced defects and the follow-up verification
gaps. They do not complete every broader improvement proposed in the original
review. Remaining work includes a complete create/import/edit/study/export
acceptance journey, a structured result contract across all calculators,
removal of global storage adapters from other server studies, more compact
workspaces, consistently visible project identity, and further controller
extraction. The cable sizing display was extracted into a focused module, but
that is not a comprehensive controller refactor.

Overall engineering class: **Screening only**, limited to the reviewed
voltage-drop chain. Independent numerical fixtures check the equation and
consumer consistency; this pass does not independently validate the full
Table 9 transcription or installation-specific applicability. Resistance
overrides assume zero reactance and remain fixed when conductor size changes.
Sizing ampacity is per run under the equal-sharing model. Qualified engineering
review still requires applicable source data and installation assumptions.
