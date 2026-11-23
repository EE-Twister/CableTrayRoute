# Browser acceptance verification — 2026-09-17

Priority item 2 is complete for local Windows acceptance: both supported browser suites, the visual lane, build, Node tests, and lint checks pass. This follow-up establishes a clean, repeatable browser acceptance run after the calculation and routing corrections. It preserves the application changes verified in [the routing workflow report](routing-workflow-verification-2026-09-17.md).

## Initial evidence

- Edge: 440 passed, 17 failed across 457 checks. Failures covered accessibility, stale project fixtures, unfinished downloads, ambiguous locators, an outdated palette expectation, and visual tests running with the wrong configuration.
- Firefox initially failed before page creation because the restricted execution host blocked its content process. Running with normal browser-process permissions resolved startup without disabling Firefox's content sandbox.
- A subsequent complete Firefox discovery run reached 447 passed and 6 failed across 453 functional checks. The four visual checks are now isolated in the dedicated visual configuration. Remaining discovery failures were the field-observation fixture, Data Manager persistence fixture, recovery readiness, palette context-menu interaction, protective-device heading locator, and palette default expectation.

## Acceptance requirements

Completion requires a fresh build, the full Node suite, lint and architecture checks, every functional check in both supported browsers, reviewed visual baselines, and repeated checks of the formerly failing interactions. Discovery runs above are diagnostic evidence, not final acceptance results.

Use [test lanes](test-lanes.md) for the CI mapping and [browser troubleshooting](browser-troubleshooting.md) for Firefox launch diagnostics. Local logs and JSON results are retained under `output/browser-acceptance-2026-09-17/`.

## Validation record

Local verification used Windows and Playwright 1.56.1. All 906 functional browser checks passed with retries disabled, no skipped cases, and no flaky results. Luna implemented the corrections; the orchestrator reviewed the changes, returned issues for correction, and independently ran the verification below.

| Gate | Result | Local evidence file |
| --- | --- | --- |
| Production build | Passed, including bundle budgets and asset-reference checks | `build-verified-retry.log` |
| Page-contract audit | Refreshed for all 80 routes | `page-contract-verified.log` |
| Full Node suite | All 361 discovered test files passed | `node-verified.log` |
| Lint and architecture checks | Passed; no budget increases | `lint-ready.log` |
| Full Edge functional suite | 453/453 passed; no skipped or flaky cases | `edge-verified.json` |
| Full Firefox functional suite | 453/453 passed; no skipped or flaky cases | `firefox-ready.json` |
| Windows Edge visual comparisons | 4/4 passed | `visual-verified.log` |
| Backend-unavailable recovery | 6/6 passed: three runs per browser | `recovery-repeat.json` |
| Cathodic Protection after contrast and readiness corrections | 36/36 passed: six cases, three times per browser | `cp-readiness-repeat.json` |

The first final-build attempt encountered a transient Windows file-access error while rewriting `iec60909.html`. A subsequent read/write-open check succeeded, and the complete build then passed. Tests were started after the successful build. The CI configuration was reviewed and corrected locally; hosted Ubuntu and Windows CI jobs were not dispatched in this task.

## Verified corrections

- Home next-action text, selected-device labels, and Cathodic Protection's sizing-input label have stronger contrast, including explicit dark-theme colors. The palette filters have readable dark-theme states. Routing legend and review labels now have valid ARIA roles. Repeated full runs caught a 4.33:1 Cathodic Protection label contrast failure that earlier focused checks missed; the final correction changes that label's colors without weakening its accessibility assertions.
- Accessibility checks use an explicit light theme and reduced-motion preference, wait for page readiness and fonts, then allow two render frames before scanning. Cathodic Protection also uses a bounded assertion for full body opacity: a runtime probe observed its initial fade at partial opacity, which explains lighter composited text during an early scan. The separate dark-form workflow still exercises the theme switch. Global animation-completion waits were removed after they hung on Firefox. No accessibility rules were disabled and no blanket production transition overrides were retained.
- The One-Line palette context menu uses viewport positioning, matching its pointer coordinates after scrolling. Its acceptance case opens it with a real right-click and activates the favorite action through physical mouse input.
- Named-project fixtures exercise the actual save gate. Data Manager checks read through the data store and verify an edited label after reload, with fixture seeding limited to the first load. Recovery registers load-event waits before imports and backend-unavailable project loading trigger a reload, then waits for the new document's store. The recovery case blocks project-server requests and verifies that the local saved data remains available; application assets must still load. Fully disconnected navigation can show the offline fallback page, as described in [project recovery](project-recovery.md).
- Export tests wait for completed downloads and inspect their content. That review exposed blank CSV rows in Scenario Comparison and One-Line Data Manager; both callers now supply the keyed row objects required by the CSV writer.
- Script-request budget checks use a shared HTTP fixture, preserving their exact request assertions across Firefox and Edge. The full functional configuration excludes only the visual spec, which has its own required Windows Edge lane and snapshot directory.
- Only the Cable Schedule visual baseline was updated after review. Its intended collapsed guidance section brings all three sample rows into view. The other three baselines remain unchanged.

## Reproducing acceptance

Run the build before tests; do not overlap it with browser runs because it replaces shared assets. On Windows with the configured Edge and Playwright Firefox installations:

```sh
npm run build
npm run audit:page-contracts
npm test
npm run lint
npx playwright test --project=msedge --project=firefox --workers=2 --retries=0
npm run visual:regression -- --workers=1 --retries=0
```

Firefox needs normal permission to create its content processes. See the troubleshooting document if the execution host prevents page creation. The visual command intentionally requires Windows Edge; functional CI uses Firefox and Edge on Ubuntu, and the separate visual CI job uses Windows.
