# Modernization and optimization plan — November 25, 2026

This plan covers the build, runtime platform, code structure, persistence, correctness contracts, testing and CI, and performance of CableTrayRoute. It follows the November 23 review (`docs/application-review-2026-11-23.md`), whose findings R1–R11, E1–E8 and U1–U5 are now fixed.

Every item says what is wrong today and how that was measured, what to change, how big the change is, and how to tell it worked. The figures were measured on `main` at `44cd4d75` plus the merges up to #1830, on Windows with Node 24.

**Effort:** S is up to a day, M is a few days, L is a week or more.

## Phase 0 status

Done in the Phase 0 pull request:
- **B1:** every workflow runs Node 22, and `package.json` declares `"engines": { "node": ">=22" }`.
- **F1:** `test.yml` is removed. Its unique coverage now runs in `ci.yml`: the full unit suite as a `Full Unit Tests` job after the build, and the full Firefox and Edge Playwright suite (with one retry) in 4 shards in place of the critical-only lane. `ci.yml` already cancelled superseded runs and ran `push` only on `main`, `master` and `claude/**`. The visual regression job now starts after the build instead of waiting for E2E. `test.yml`'s `prettier --check` step was dropped because `.prettierignore` excludes every `.js` file, so it checked nothing.
- **F3:** inside a synced folder (OneDrive, Dropbox, iCloud Drive, Google Drive), Playwright writes test output to the OS temp folder; `PLAYWRIGHT_OUTPUT_DIR` overrides it. The specs that failed locally with EPERM on downloads now pass. #1832 fixed the local `modalHelperImports` failure. Firefox still has to be installed locally with `npx playwright install firefox`.
- **F4:** the One-Line startup check already took the median of 3 cold loads; it now takes 5.
- #1829 and #1831 are merged.

## 1. Where the application stands

| Area | Measured today |
| --- | --- |
| Source size | 86,656 lines of JavaScript in 100 root-level files, plus 92,452 in `analysis/`, 60,895 in `src/`, and 37,521 lines of CSS. |
| Largest files | `oneline.js` 12,494 lines (after #1831), `ductbankroute.js` 5,169, `app.mjs` 4,378, `analysis/tcc.js` 4,254, `cableschedule.js` 3,268, `equipmentarrangements.js` 2,909, `heattracesizing.js` 2,835, `server.mjs` 2,706, `projectStorage.js` 2,570, `dataStore.mjs` 2,369. |
| Pages | 99 hand-written HTML pages. 92 of them repeat the header and navigation markup. |
| Build | 93 separate Rollup builds, one per page, each with `inlineDynamicImports: true`. Nothing is shared between pages. |
| Bundle output | 53.7 MB of JavaScript across the 93 page bundles; the median bundle is 575 KB. `dataStore` and `projectStorage` are copied into 92 bundles, and jsPDF into 83. |
| Runtime | Node 20 in every workflow. Node 20 reached end of life in April 2026. Express 4, Rollup 3. |
| Persistence | Projects live in `localStorage` through `projectStorage.js`. The unit tests already hit `QuotaExceededError` with 2–5 MB projects (span evidence). |
| Type safety | 19 modules opt in to `// @ts-check` (#1824, #1829). `strict` is off. |
| Tests | 548 Node test files, 105 Playwright specs, axe accessibility checks in light and dark, Windows visual baselines, browser performance contracts. |
| CI | `ci.yml` takes about 10–12 minutes. `test.yml` repeats lint, build, unit tests and the full Playwright suite, runs on both `push` and `pull_request` (so twice per pull-request push), and takes 37–57 minutes. Neither workflow cancels superseded runs. |
| Local development | Playwright downloads fail with EPERM inside the OneDrive-synced folder, so several specs fail locally on `main`. Firefox is not installed for the current Playwright version. |

## 2. Principles

- **No big-bang rewrite.** Each item ships on its own pull request, behind the existing tests, and leaves the application working.
- **Ratchet, don't promise.** Line budgets, bundle budgets and the type-check list only move in one direction. Every item that improves a number also lowers its budget.
- **Measure before and after.** Each item has a success metric from section 1.
- **Keep the storage invariants.** Persistence changes go through `projectStorage.js`, `migrateProject`, `syncDerivedStorage`, and the undo/redo helpers, as `AGENTS.md` requires.

## 3. Workstreams

### A. Build and delivery (highest payoff)

**A1. One multi-entry build with shared chunks.** M, medium risk.
- **Problem:** each page bundles its own copy of the storage layer, the navigation, jsPDF and the study code. Moving between pages downloads and parses the same code again, and the service worker caches 93 large, overlapping files.
- **Change:** build all 93 entries in one Rollup build with code splitting (`output.dir`, `entryFileNames`/`chunkFileNames` with hashes), and drop `inlineDynamicImports`. Rewrite the `<script>` tags through the existing manifest step (`scripts/rewriteHtmlForManifest.cjs`).
- **Success:** total JavaScript well under half of today's 53.7 MB; a shared core chunk cached once; no page startup budget regresses.

**A2. Load heavy libraries on demand.** S–M, low risk.
- **Problem:** jsPDF is in 83 bundles and is loaded at page start, although only the export buttons use it. SheetJS is in 12 bundles. Plotly and three.js are page-specific.
- **Change:** move them to `import()` at the moment of export or render. `reports/reporting.mjs` already loads jsPDF through a dynamic import, but `inlineDynamicImports: true` folds that import back into every page bundle. So this item needs A1's code splitting, or a per-page `external` plus a separately built vendor file, to take effect.
- **Success:** jsPDF absent from startup requests on every page, checked by the performance contract.

**A3. Upgrade the bundler.** M, medium risk. Do this after A1.
- **Change:** move to Rollup 4, which is faster and needed for current plugins. Alternatively, evaluate Vite (Rollup 4 underneath) for the dev server and multi-page builds. Pick one and keep the 10-step `build` script as one entry (`scripts/build.mjs`).
- **Success:** a shorter `npm run build` and one build entry point.

**A4. Service worker from the build manifest.** S, low risk.
- **Change:** generate the precache list in `sw.js` from the asset manifest instead of a hand-kept list, and version the cache per build. This also removes the stale-bundle problem seen in the preview browser during this work.
- **Success:** no manual `CACHE_NAME` bumps; a new deploy is picked up on the next load.

### B. Runtime platform

**B1. Node 20 to Node 22 LTS.** S, low risk. **Do this first.**
- **Problem:** Node 20 is past end of life, and every workflow, deploy and local check pins it.
- **Change:** set `node-version: 22` in every workflow, add `"engines": { "node": ">=22" }`, and run the full suite.

**B2. Dependency refresh.** M, medium risk.
- **Change:**
  - Move Express 4 to 5, keeping the scrypt hashing, sessions, CSRF checks, `/ws/ticket`, rate limits and HTTPS enforcement listed in `AGENTS.md`.
  - Pin SheetJS to a published, checksummed version rather than a CDN tarball URL.
  - Review `pdfkit` 0.13 against `jspdf` and keep one PDF engine where possible.
  - Bump `@axe-core/playwright` and `ajv` (v6 to v8).
- **Success:** `npm audit` clean at moderate level, and one PDF engine.

### C. Code structure

**C1. Keep splitting the large entry files.** L, low risk per slice.
- **Status:** `oneline.js` has gone from 12,771 to 12,494 lines in three slices (#1825, #1830, #1831), each with tests and a lowered budget.
- **Next slices, smallest risk first:**
  - the `serializeState` and `ensureShapeDefaults` model code;
  - the validation markers;
  - `chooseCable` (652 lines, a modal that would become `src/one-line/cableChooserView.mjs`).
- **Then the other entry files:** apply the same pattern to `ductbankroute.js`, `app.mjs`, `analysis/tcc.js` and `cableschedule.js`.
- **Success:** each entry file under its budget, lowered every slice; target `oneline.js` under 8,000 lines.

**C2. One page shell.** M, medium risk.
- **Problem:** 92 pages repeat the header and navigation, so every navigation change touches 92 files and the copies drift.
- **Change:** generate the shared shell at build time from one template (the build already rewrites HTML), and keep each page's main content as its own file.
- **Success:** one navigation source, and pages that differ only in their content.

**C3. Move root-level UI logic under `src/`.** M, low risk.
- **Change:** `AGENTS.md` already asks for root entry points to delegate into `src/`. Move each page's code to `src/pages/<page>.js` behind a two-line root entry while doing C1.

### D. Data and persistence

**D1. IndexedDB behind `projectStorage.js`.** L, high risk.
- **Problem:** `localStorage` holds about 5–10 MB per origin, and large projects with span evidence or study history already exceed it in tests. Writes are also synchronous on the main thread.
- **Change:** keep the `projectStorage.js` API and move the project payload to IndexedDB, with `localStorage` keeping only small session keys. Extend `migrateProject` for the move. Keep undo/redo through `pushUndo`/`undoProjectChange`.
- **Success:** a 50 MB project saves and reloads, the quota warnings disappear, and the undo/redo tests pass unchanged.

**D2. Validate project files against a schema on import.** M, low risk.
- **Change:** `ajv` is already a dependency. Validate `.ctr.json` imports against a versioned schema and report field-level errors instead of failing partway through `migrateProject`.

### E. Correctness contracts

**E1. Type checking, continued.** M, low risk.
- **Change:** opt in `designRuleChecker.mjs` (give finding severity a literal union), `autoSize.mjs` and `arcFlash.mjs`, then the study producers (`analysis/shortCircuit.mjs`, `analysis/loadFlow.js`). Turn on `strictNullChecks` for the opted-in set once it is clean.
- **Success:** every module that produces or consumes a saved study result is type-checked.

**E2. One study-result status rule everywhere.** S–M, low risk.
- **Problem:** `isStudyResultCurrent` (#1826) covers the three study pages, but 18 files still compare `freshness` and `eligible` inline.
- **Change:** replace the inline checks that mean "current and eligible" with the helper, and leave the ones that mean something else with a comment.

### F. Testing and CI

**F1. One CI workflow, and cancel superseded runs.** S, low risk. **Quick win.**
- **Problem:** `test.yml` repeats everything `ci.yml` does, takes 37–57 minutes, and runs twice per pull-request push.
- **Change:**
  - Fold anything unique in `test.yml` (the Firefox and Edge Playwright projects with retry) into `ci.yml`, then delete `test.yml`.
  - Add `concurrency: { group: ${{ github.workflow }}-${{ github.ref }}, cancel-in-progress: true }`.
  - Run `push` only on `main`.
- **Success:** one required run of about 12–15 minutes per pull-request push.

**F2. Shard the Playwright suite.** S, low risk.
- **Change:** split the E2E job into 3–4 shards (`--shard=i/n`) with merged reports.
- **Success:** E2E wall time cut roughly by the shard count.

**F3. Make local runs reliable.** S, low risk.
- **Change:**
  - Write Playwright output and artifacts to the OS temp folder when the repository sits in a synced folder, which fixes the EPERM download failures.
  - Document installing Firefox with `npx playwright install firefox`.
  - Merge #1832, which already fixed the local `modalHelperImports` failure.
- **Success:** `npm test` and the Playwright suite pass locally on `main`.

**F4. Steadier performance contracts.** S, low risk.
- **Problem:** `startup:oneline` failed twice by under 10 ms against its 850 ms budget on shared runners, even though it already took the median of 3 cold loads.
- **Change:** take the median of 5, and keep the budget.

### G. Runtime performance

**G1. Measure, then fix the slowest pages.** M.
- **Change:** after A1 and A2, profile `designsynthesis` (1.8 MB bundle), `tcc` (992 KB) and `oneline`, and record startup and longest-task figures in the performance contracts.
- **Success:** every page starts within its budget with headroom, and no task over 200 ms on load.

**G2. Move more work off the main thread.** M.
- **Change:** `src/workers/` already has clients for cathodic protection, heat trace, ground grid and the one-line. Move routing recalculation (1.3–1.6 s on CI with a 255–335 ms longest task) and the long-running studies onto the same worker client pattern.

### H. Security and operations

**H1. Content Security Policy without inline script.** M.
- **Change:** `server.mjs` sends a CSP, but pages still carry inline `<script>` blocks (for example `index.html` line 567). Move them to modules so the CSP can drop `'unsafe-inline'` for scripts. Verify the current policy before changing it.

**H2. Error reporting.** S.
- **Change:** collect client errors (the `window.onerror` and unhandled-rejection paths already log to the console) through a small `/client-errors` endpoint with rate limiting, so production failures are visible.

## 4. Sequencing

| Phase | Items | Why in this order |
| --- | --- | --- |
| 0: quick wins (1–2 weeks) | B1 Node 22, F1 one CI workflow, F3 local reliability, F4 steadier perf checks, merge #1829, #1831 and #1832 | Removes an unsupported runtime, cuts CI time per push by about 40 minutes, and stops false local failures before larger work starts. |
| 1: delivery (2–4 weeks) | A1 shared chunks, A2 lazy heavy libraries, A4 manifest-driven service worker | The largest user-facing gain: much less JavaScript per page and faster page-to-page navigation. A1 comes first, because the existing dynamic imports only take effect once inlining is off. |
| 2: structure (ongoing, in slices) | C1 entry-file splits, C3 move logic under `src/`, E1 type checking, E2 status rule | Low-risk slices that can run between other work, each lowering a budget. |
| 3: platform (3–6 weeks) | A3 bundler upgrade, B2 dependency refresh, C2 page shell, F2 sharding | Easier after A1 has settled the build and C1 has shrunk the entry files. |
| 4: data (4–6 weeks) | D1 IndexedDB, D2 schema validation | The highest-risk change, saved for a codebase with typed, tested storage boundaries. |
| Alongside | G1/G2 performance, H1/H2 security and operations | Start once phase 1 lands, because the measurements depend on the new bundles. |

## 5. Targets

| Metric | Today | Target |
| --- | --- | --- |
| Total JavaScript built | 53.7 MB over 93 bundles | under 20 MB, with a shared core chunk |
| jsPDF loaded at page start | 83 pages | 0 pages |
| CI time per pull-request push | about 12 min plus a duplicate 37–57 min run | one run of about 12–15 min |
| `oneline.js` | 12,494 lines | under 8,000 lines |
| Type-checked modules | 19 | every study producer and consumer, with `strictNullChecks` |
| Node in CI | 20 (end of life) | 22 LTS |
| Largest saved project | quota errors at about 2–5 MB in tests | 50 MB saves and reloads |
| Local `npm test` on `main` | 1 failure (fixed by #1832) | 0 failures |

## 6. Risks

- **Shared chunks change caching and load order (A1).** Pages that rely on side effects at import time could initialise in a different order. Mitigate with the E2E suite, the performance contracts, and one page group at a time behind the manifest rewrite.
- **IndexedDB is asynchronous (D1).** `projectStorage.js` reads are synchronous today, so callers must move to an async load at page start. Mitigate by loading the project into memory once and keeping the synchronous API over the in-memory copy.
- **Dependency upgrades (B2).** Express 5 changes routing and error handling. Mitigate with the existing server tests and by changing one dependency per pull request.
- **Visual baselines.** The shell and bundle changes can move pixels, and baselines must be regenerated deliberately, not to clear a failing check.
