# Routing and core workflow verification

Scope: item 1 from the next-priority review — resolve the remaining browser routing failure and verify the equipment-to-deliverables project journey. Luna implemented the fixes; the orchestrator reproduced failures, reviewed the changes, and checked the outcomes independently. Work is based on the existing working tree at `39f00686d863a5ef51f43a9fe6f188fc279883e2`.

## Corrections

- **Routing completion:** an unavailable optional voltage-drop result returned `null`, but the worker completion handler called `.toFixed()` on it. This interrupted both the 30-cable routing sample and the guided project's recalculation. Unavailable voltage drop now remains `null`; routing can finish when its own inputs are complete. The adapter accepts both `phase` and `phases` inputs.
- **Lock and reroute:** the route renderer is asynchronous. Locking a cable requested setup mode before the renderer finished, allowing it to switch back to review mode and hide Run Routing. Both the result-row lock and table lock/unlock handlers now await rendering before entering setup mode.
- **Route export data:** new results contain `route_segments`; the exporter expected a legacy `breakdown` and produced blank segment rows. CSV and workbook exports now support both shapes and preserve segment coordinates, identities, lengths, and cumulative lengths. Workbook download mechanics live in a browser helper under `src/routing/`.
- **BOM export:** the BOM also expected legacy segment and cable-name fields, leaving cable and raceway sheets empty for fresh results. It now accepts current and legacy records, prioritizes conduit identity when both conduit and tray IDs exist, and excludes field gaps from raceway materials. Cable lengths still include those gaps. The tray-support weight lookup also recognizes routing cable names.
- **Canonical cable preservation:** the routing controller previously wrote its internal cable projection over the Cable Schedule, removing canonical tags and coordinate fields. It now merges route-derived output into the current schedule by stable ID or an unambiguous compatible legacy alias. It retains engineering/custom fields and concurrent edits, accepts true new manual records, and does not recreate records deleted during the run.
- **Intentional cable edits:** explicit project-table edits translate only the changed field back to the canonical record through the storage API, including coordinates, names, and lock state. Deletion targets the matched record; duplication clears the copied identity. Built-in samples remain isolated. This closes a regression found during review of the initial derived-only merge.
- **Regression quality:** export tests read downloaded payloads, and the legacy Node exporter test now returns a failing process exit code when an assertion fails.

## Acceptance record

**Acceptance status: item 1 corrected and verified within this scope.** The local evidence directory is `output/routing-workflow-2026-09-17/` (ignored by Git).

- `npm test`: **361/361 discovered Node test files passed** (`node-complete.log`).
- `npm run build`: passed, including bundle budgets, copied assets, and validation-manifest generation (`build-complete.log`). The final run completed before the final tests, avoiding intermediate build files and a Windows file-lock failure seen during an earlier concurrent run.
- `npm run lint`: passed, including architecture, import-cycle, and stylesheet checks (`lint-acceptance-final.log`). The routing entry point remains within its existing size budget; no budget was raised.
- Selected MS Edge browser acceptance: **15/15 passed** (`browser-complete.log`): all eight `routing.spec.js` cases; the three conduit-import/routing/lock cases in `workflow.spec.js`; and core handoffs, navigation/freshness, intentional routing edits/sample isolation, and mobile workflow cases in `workflow-contract.spec.js`.
- Independent export acceptance: **5/5 passed** (`export-acceptance-final.log`, `export-acceptance.json`). Independent canonical editing/merge assertions also passed (`merge-acceptance-final.log`).
- Updated documentation: **70 local link targets checked with none missing** (`doc-links.log`); generated page-contract audit is current; `git diff --check` passed.

The acceptance journey covers the guided Project Workflow Core sample through Equipment List, Load List, One-Line, Cable Schedule, Raceway Schedule, tray/conduit fill, routing, load flow, short circuit, TCC, arc flash, DRC, dashboard/home, and report preview. Routing checks include fresh calculation, cache reuse, reload, canonical cable input preservation, result freshness, and downloaded CSV/XLSX/JSON/DXF and BOM contents. The BOM workbook contains raceway and cable records; its cable count and total cable length reconcile with all 14 calculated routes.

Independent export checks use a 3–4–5 segment plus a 12-foot segment to verify coordinates, field/tray classification, cumulative length, legacy compatibility, and non-mutation of saved results. A separate BOM case checks five feet of tray, seven feet of conduit, and a twelve-foot field gap: 24 feet of cable and only 12 feet of raceway usage. This verifies the existing route-usage aggregation; it does not establish a deduplicated installed-raceway procurement estimate.

Independent merge checks cover stable identities, legacy aliases, current edits, custom fields, new manual cables, deletion suppression, explicit coordinate/name edits, and sample isolation. Browser coverage separately verifies that edited diameter/start coordinate and lock state survive rerouting and reload while all other canonical cable inputs remain equal.

## Scope limits

The guided sample's report remains blocked for issue where its engineering/design-basis checks require review. Preview and route-data exports do not bypass those gates. This acceptance does not certify calculation methods, approve field installation, or establish a clean pass of the entire application's browser suite. The separate Firefox startup problem and broader browser/accessibility backlog are outside item 1.
