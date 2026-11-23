# September 13 review — implementation acceptance

The browser results below are a historical record. The later [routing and core workflow verification](routing-workflow-verification-2026-09-17.md) tracks the routing follow-up separately.

Scope: the nine defects and eight High/Medium improvements in `application-review-2026-09-13.md`, starting from commit `39f00686d863a5ef51f43a9fe6f188fc279883e2`. Verification updated September 16, 2026.

Luna implemented the changes. The orchestrator independently reviewed code, repeated the original reproductions, tested additional boundaries, and returned failed checks for correction. Implementation alone did not close an item.

All 17 original High/Medium items are accepted within the reviewed scope below. This is not a claim that the entire application's browser suite passes; remaining broader-suite findings are listed separately.

## Acceptance checklist

| ID | Priority | Original item | Verified outcome |
| --- | --- | --- | --- |
| B1 | High | Synced local snapshot metadata blocks reopening | Saved-record envelope metadata is removed before interchange validation. Direct synced-copy import and ordinary HTTP save/reopen/offline recovery pass. |
| B2 | High | Inactive scenarios missing from backups | Export includes every scenario. Clean-storage round trips preserve distinct cables, equipment, one-line diagrams, studies, collections, and custom settings. |
| B3 | High | Unsupported ambient yields positive ampacity | Last supported boundary remains evaluated; temperatures outside the supplied table range return an explicit unevaluated result. No standards tables were extended. |
| B4 | High | Unevaluated voltage-drop constraint appears satisfied | Missing, malformed, non-finite, and unsupported inputs cannot produce a clean constrained recommendation. Consumers distinguish installed results from candidate results. |
| B5 | High | Ambiguous feeder paths depend on row order | Immediate and ancestor ambiguity, row permutations, and cycles produce consistent unsupported-topology diagnostics and suppress affected recommendations. |
| B6 | Medium | API consumes failed load flow | Shared resolver rejects failed, missing-provenance, and stale load flow. A real saved converged result is usable, then excluded after project inputs change. |
| B7 | Medium | Array one-line API produces empty studies | Object/array forms produce identical numeric results and exact expected bus/motor identities for two distinct projects. |
| B8 | Medium | Impossible downstream recommendation | Exhausted upstream allowance withholds a standalone branch recommendation; applying eligible recommendations passes their stated targets. |
| B9 | Medium | Imported cable classifications render blank or disappear | Unknown imported options remain visible in table and modal and survive unrelated edits, reload, stable-ID operations, save, and export. |
| I1 | High | First-class recovery | Complete backups, validated per-scenario previews, local/cloud timestamps, and rollback are implemented. Independent injected save, rename, authoritative-write, and derived-write failures preserve previous backups. Local, session, and memory before-images are restored separately. |
| I2 | High | Shared structured calculation result | Reviewed ampacity, sizing, and voltage-drop paths carry value, units, validity, sources, assumptions, limits, warnings, and input fingerprint. UI, sizing CSV, and project reports preserve validity. The ordinary browser journey parses downloaded voltage-drop CSV, report JSON, and report XLSX and checks exact values and provenance. |
| I3 | High | Canonical validated boundaries | Legacy aliases and supported shapes normalize at imports, saved records, APIs, workers, and reports. Malformed fields and scenario IDs fail before mutation; unknown cable fields survive. Actual worker/fallback results agree for four supported forms. Multi-scenario import restores the exact active canonical projection without inactive settings leaking into it; one undo/redo restores the complete transaction. Legacy collaboration artifacts survive persisted reload. |
| I4 | High | Remove server global-storage adapters | Study engines receive explicit project data; 24 overlapping requests retain exact project identities and numeric results without process-global storage swaps. |
| I5 | High | Complete browser journey outcome coverage | Ordinary HTTP create, two-scenario import, edit, real authenticated save, close/reopen, offline load, export, clean import, study, and parsed CSV/JSON/XLSX assertions pass against the final production build. The long journey has a scoped 90-second test limit. |
| I6 | Medium | Several editable rows in initial viewport | Independently verified the guided 14-cable sample at 1280 × 720: first three rows end at y=586.46, 640.85, and 695.25. Duplicate navigation is consolidated and detailed guidance is expandable. |
| I7 | Medium | Visible identity and clear next actions | Live browser shows the project name and successful local-save timestamp; accessible details distinguish local and cloud saves. Checklist links use labels such as Open Equipment List. |
| I8 | Medium | Canonical records independent of table controls | Stable row IDs and canonical records preserve hidden fields and unfamiliar enums through sorting, retagging, modal edits, duplication, save, and export. Starter equipment merges preserve IDs and correctly handle retags and distinct explicit identities. |

## Independent evidence

Reproduction scripts and logs are under `output/application-review-2026-09-13/` (local verification artifacts, ignored by Git):

- `orchestrator-acceptance.mjs`: 38 passing groups for original defects, topology, boundary inputs, multi-scenario content, rejected imports, and remote snapshot restoration.
- `orchestrator-api-acceptance.mjs`: 10 passing groups for exact identities, numeric shape parity, overlapping requests, and actual saved load-flow freshness.
- `orchestrator-contract-acceptance.mjs`: 19 passing groups for malformed/non-finite inputs, constraint states, fingerprints, canonical previews, and report validity.
- `orchestrator-worker-acceptance.mjs`: four frozen-input shapes produce matching actual worker and fallback results.
- `orchestrator-save-failure.mjs`, `orchestrator-rename-acceptance.mjs`, and `orchestrator-import-failure.mjs`: injected persistence failures preserve durable backups and prior state; successful rename retains current unsaved edits.
- `orchestrator-storage-sources.mjs`: distinct local/session/cache values survive restoration, and a local backend rejection does not prevent session or memory restoration.
- `orchestrator-canonical-scenario.mjs` and `orchestrator-legacy-remote.mjs`: exact active scenario contents, inactive-setting isolation, durable canonical state, single undo/redo, and legacy collaboration saved reload. These checks are also represented by the tracked `tests/scenarioRemoteRecovery.test.mjs` regression.
- Ordinary browser inspection confirms the real guided sample viewport, visible identity/save status, readable checklist labels, and imported VFD classifications.

The journey exposed an additional voltage-drop CSV bug: array rows were passed to an exporter expecting named fields, creating an empty data row. The fix maps named fields and appends result validity and provenance columns. The report page also needed its SheetJS dependency for the XLSX download. Acceptance reads actual downloaded files rather than only checking download events: the fixture produces 4% / 4.8 V drop, fails its 3% limit, and recommends #8 AWG with 2.6% predicted drop.

Final review also exposed canonical state being left on the last inactive scenario and legacy remote artifacts being lost on reload. Both were returned to Luna for correction and independently retested. The mobile header's minimum width caused page overflow; the corrected responsive width passes mobile cable-schedule, conduit-bend, spool-sheet, and workflow-shell checks.

## Regression verification

- `npm test`: passed all 356 Node test files (`orchestrator-node-final-accepted.log`, exit 0).
- `npm run lint`: passed, including architecture, cycles, and CSS checks (`orchestrator-lint-final-tests.log`, exit 0). Final browser test files also pass Node syntax checks, the added Node regression passes lint, and `git diff --check` passes.
- `npm run build`: passed for the accepted product source (`orchestrator-build-final-accepted.log`, exit 0). The official validation-manifest generator was rerun after adding the tracked recovery regression.
- Independent final calculation/API/contract/worker probes passed (`orchestrator-acceptance-final`, `orchestrator-api-final`, `orchestrator-contract-final`, and `orchestrator-worker-final` logs, exit 0).
- Initial affected Edge run: 151/154 passed (`orchestrator-edge-final-accepted.log`). One case lost its browser context before application navigation, and two exceeded their 30-second total test limits. All three subsequently passed in the final focused runs described here.
- Final cable-schedule Edge suite: **14/14 passed** (`orchestrator-cable-verified.log`, exit 0), including the real 14-row guided sample viewport and parsed Full Schedule XLSX contents after sorting, retagging, modal editing, duplication, saving, and reloading. The harness now uses an isolated HTTP server. Export/import tests consume the download and clear the file chooser before teardown; this resolved the repeatable subsequent browser-context failure. Earlier file-URL/copy/stream failures remain in the logs and are not counted as passes.
- Mobile and recovery follow-up: 4/5 passed (`orchestrator-edge-final-followup.log`), including the complete CSV/JSON/XLSX journey. The broader sample handoff now passes canonical project preservation through equipment, load list, one-line, cable schedule, raceway, and routing pages; it subsequently fails the routing review-mode assertion after recalculation.
- Broader Edge run: 421 passed, 26 failed (`orchestrator-edge-completion.log`). It is not a passing full-suite result. Details below distinguish confirmed fixes from remaining failures.
- Firefox verification could not reach application navigation: `browserContext.newPage` fails with an internal `_page` error. No Firefox pass is claimed.

## Broader-suite follow-up findings

The broader run included cases outside the original 17 items. The following results must not be represented as a clean whole-application test pass:

- Confirmed regressions corrected in this work: mobile header overflow and active canonical project loss after a multi-scenario import. Targeted follow-ups verify the corrected behavior.
- Existing accessibility failures in the home, routing, one-line, TCC, and cathodic-protection pages. The implicated markup/style lines were compared with the reviewed commit and were unchanged.
- The Trust Center test expects 16 benchmark results while the existing library supplies 19.
- Four visual cases have no Windows/Edge reference snapshots. Generated candidate images were not accepted as new baselines.
- Several cases lost an Edge browser/context before application navigation. The cable-suite teardown problem and delete-all case now pass; unrelated launch failures were not all rerun.
- Broader routing, unnamed-project fixtures, and palette expectations need follow-up. The sample handoff currently reaches a routing review-mode assertion after its data-preservation checks pass; its complete downstream sequence is not claimed as verified. Separate routing sample tests display an unexpected error and produce no visible routes despite a direct solver probe succeeding for 30/30 sample cables. The routing entry-point source is unchanged, but that alone does not exclude an interaction with shared code; the browser failure remains unresolved.

## Limits

Overall engineering class remains **Screening only**, limited to the reviewed calculation chains and adapter behavior. These corrections do not establish a full standards-table audit, protective-device approval, installation compliance, or professional engineering approval. Local HTTP authentication and sync were exercised with isolated test data; live Supabase/cloud-account behavior was not newly validated. No code was committed, pushed, or deployed.
