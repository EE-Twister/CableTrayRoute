# Performance contracts

The application enforces elapsed-time budgets for five engineering workflows:

| Metric | Workload | Budget |
| --- | --- | ---: |
| `ctr.startup` | Navigation start through page readiness | 1,500 ms |
| `ctr.project-import` | Import and persist `samples/project-workflow-core.json` | 1,500 ms |
| `ctr.oneline-render` | Atomically render a deterministic 1,000-component One-Line | 300 ms |
| `ctr.tcc-plot` | Plot eight selected protective devices | 300 ms |
| `ctr.routing-recalculation` | Route the deterministic 200-cable large-facility sample and render the results | 1,000 ms |

The study engines also enforce a Node-level large-network contract that is independent of browser painting:

| Metric | Workload | Budget |
| --- | --- | ---: |
| `large-radial-load-flow` | Convert and solve one common utility, 1,000 downstream buses, and 2,000 attached devices | 2,000 ms |
| `large-radial-harmonics` | Calculate source, bus, branch, and PCC spectra for the same 1,001-bus/2,000-device radial system | 1,000 ms and < 2 MiB serialized result |

`tests/loadflow/largeRadialPerformance.test.mjs` enforces both the elapsed-time budget and numerical equivalence to the Newton-Raphson solver. Large balanced radial networks with one slack bus, PQ buses, one voltage base, non-zero series impedances, and no taps or shunts use a backward/forward-sweep solver. Meshed networks, PV buses, IBR Volt-VAR controls, transformers with taps or multiple voltage bases, shunts, and smaller cases retain Newton-Raphson. The radial path does not allocate the dense admittance or Jacobian matrices. The reference Node run on August 4, 2026 reduced the exact 1,001-bus/2,000-device workload from about 12,002 ms to 34 ms; an independent full-study fixture measured 46 ms.

Elapsed time alone can hide degrading interaction latency or retained memory. The same run therefore enforces repeated-operation profiles:

| Profile | Workload | Total | Longest task | Heap growth | DOM growth | Storage reads |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `startup:oneline` | Cold navigation through the explicit canvas-ready beacon | 750 ms | 250 ms | 16 MiB | 2,500 elements | 80 |
| `one-line-interactions` | Toggle the grid six times on the 1,000-component drawing | 1,200 ms | 150 ms | 12 MiB | 100 elements | 80 |
| `repeated-project-loads` | Alternately import six revisions in one session | 1,500 ms | 150 ms | 12 MiB | 100 elements | 300 |
| `study-runs` | Replot the warmed eight-device TCC study five times | 1,500 ms | 150 ms | 16 MiB | 100 elements | 150 |
| `routing-recalculation` | Recalculate 200 routes after an initial completed run | 1,500 ms | 80 ms | 4 MiB | 100 elements | 250 |
| `routing-recalculation-steady-state` | Recalculate the same 200 routes for a third complete render cycle | 1,500 ms | 80 ms | 1 MiB | 100 elements | 250 |

Run `npm run perf:browser` to measure all five workflows and fail when a required metric is missing or exceeds its budget. The machine-readable report is written to `output/playwright/performance/performance-report.json`. On Windows the runner uses installed Microsoft Edge; other platforms use Playwright Chromium. Set `CTR_PLAYWRIGHT_CHANNEL` to override the browser channel. `npm run perf:summary` converts the report into the same compact Markdown table published in the CI job summary. CI downloads the latest successful base-branch performance artifact and passes it as `--baseline`, adding duration and retained-heap deltas to every pull-request summary. If no prior artifact exists, the contract still runs and reports the baseline as unavailable.

Use `npm run perf:browser:report` only for diagnostic measurement. It writes the same report but does not fail on a budget overrun. Missing browser infrastructure or a failed workload still exits non-zero.

The browser exposes recorded measurements in `window.__CTR_PERFORMANCE__.measurements` and dispatches `ctr:performance-measure` for diagnostic tooling. Budgets and their evaluator live in `src/performance/performanceContracts.js`; production measurement helpers live in `src/performance/performanceMetrics.js`. Protective-device delivery also records `ctr.protective-device-index-load` and `ctr.protective-device-shard-load` so catalog metadata and selected-curve hydration can be profiled independently.

The report includes navigation milestones, slow resources, long tasks, DOM mutation volume, retained element growth, JavaScript heap growth, storage reads by key, and undo-history growth. Both elapsed-time and repeated-operation profiles are merge thresholds. Heap values use Chromium's precise memory counters and force garbage collection before the workload baseline and after the workload result; the collection pauses are excluded from the workload duration. Routing snapshots also wait for two rendered frames so released Three.js render lists and replaced geometry are measured after the viewer has consumed the new scene. The second route cycle exposes replacement cost; the third cycle is the steady-state leak contract. This measures retained growth within one warmed page rather than transient allocation or startup cost. Route-specific startup contracts additionally cover Short Circuit, IEC 60909, Arc Flash, TCC, Harmonics, Load Flow, Motor Start, Contingency, Transient Stability, and Library Manager. They enforce page-ready time, reject the legacy or calculation monolith on browser startup, and limit script fan-out, eager catalog requests, and shard hydration. Short Circuit, IEC 60909, and Arc Flash are capped at two startup scripts: their route bundle plus shared JSON patch. TCC is capped at four: its route bundle, D3, PDF.js, and shared JSON patch. Harmonics and Motor Start are capped at two: their route bundle plus D3. Library Manager is capped at two: its route bundle plus the independently cached XLSX vendor runtime. Load Flow and Contingency are capped at one application script each. Transient Stability is capped at three: its route bundle, build-managed Plotly, and shared JSON patch. The contract definitions and evaluator live in `src/performance/routeStartupContracts.js`, and their results are included in the same machine-readable performance report.

The reference Edge run on August 4, 2026 produced these retained-growth results. These are evidence for the budgets, not portable promises for every machine; the contract thresholds above are the enforced values.

| Profile | Duration | Longest task | Heap growth | DOM growth | Storage reads |
| --- | ---: | ---: | ---: | ---: | ---: |
| `startup:oneline` | 283 ms | 0 ms | 9.6 MiB | 1,719 | 14 |
| `one-line-interactions` | 28 ms | 0 ms | 0.0 MiB | 0 | 0 |
| `repeated-project-loads` | 52 ms | 0 ms | 0.7 MiB | 0 | 0 |
| `study-runs` | 211 ms | 0 ms | 0.3 MiB | 0 | 0 |
| `routing-recalculation` | 534 ms | 59 ms | 3.7 MiB | 0 | 0 |
| `routing-recalculation-steady-state` | 701 ms | 61 ms | 0.1 MiB | 0 | 0 |

Startup uses the native system-font stack so readiness does not depend on an external font stylesheet. The TCC picker and Library Manager start from the versioned packed locator in `data/protectiveDeviceIndex.json`, while One-Line waits to load that locator until component properties need protection choices. The locator is capped below 1 MB and carries only search, grouping, readiness, and shard-location fields. Full records are distributed across 64 deterministic shards under `data/protectiveDeviceCatalog/` and fetched only for selected or project-referenced devices. Browser Short Circuit, IEC 60909, Arc Flash, One-Line, TCC, Equipment Evaluation, and full Dashboard calculations hydrate those referenced IDs and inject the resulting records into their synchronous engines. Node and test execution retain `data/protectiveDeviceCalculations.mjs` as a runtime-only fallback; it is not statically included in browser bundles. See [Protective-device delivery architecture](protective-device-delivery-architecture.md) for the artifact boundaries and rationale.

Run `npm run build:protective-device-catalog` after editing the canonical `data/protectiveDevices.json`; the normal build runs this generator automatically. The build also runs `npm run check:bundle-budgets`, which caps Workflow Dashboard, Equipment Evaluation, and TCC at 1 MB; Short Circuit, IEC 60909, Arc Flash, and Transient Stability at 650 KB; Load Flow and Contingency at 325 KB; Motor Start at 225 KB; and Harmonics and Library Manager at 200 KB. These routes are delivered through consolidated production entries rather than browser-visible source graphs; see [Production module delivery architecture](study-module-delivery-architecture.md) for the request boundaries and rationale.

Large-project runtime work now follows these additional rules:

- Project and remote-snapshot loads are one persistence/undo mutation instead of one full-project clone and write per section. Loading a project does not create One-Line edit revisions.
- Scenario storage primes a shared positive and negative read-through cache once, rescans only when storage length changes, and invalidates entries on cross-tab storage events. Initial project and legacy hydration reuse that scan instead of rereading each key. Identical writes stop before persistence, undo capture, and project-change notification. Project-input fingerprints and normalized linked One-Line views are reused until an input schedule changes. Cold One-Line storage reads consequently fell from 519 to 14, and five warmed TCC reruns perform no storage reads instead of 320.
- Undo and redo history retain at most 50 patches and target an 8 MiB history budget (the newest patch is retained even if it alone exceeds the byte target). Browser performance measurements retain only the newest 200 samples.
- One-Line normalizes its equipment, panel, load, and cable collections once per render, indexes both component obstacles and label-collision candidates spatially, constructs the next SVG layer off-DOM, and swaps it in atomically. Its deterministic workload now contains 1,000 components and renders in 264 ms on the reference machine under the unchanged 300 ms budget. Grid visibility changes do not rebuild an unchanged drawing. Palette and template tooling waits for a rendered frame/idle time unless the user interacts with it first.
- Routing indexes the base graph's nodes by raceway once, collects all rejected nodes for a cable, and prunes the copied graph in one pass. The former path rescanned every graph node for every raceway and every edge map for every rejected node; removing that repeated work reduced the reference worker time from about 1,715 ms to 259 ms. Repeated field geometry is also deduplicated before shared-segment searches, and shared-route analysis runs in the worker. Repeated result cycles retain unchanged Three.js raceway and facility geometry, rebuilding only the selected route overlay, while the completion pipeline yields between table rendering, derived summaries, and viewer work. Result rows paint in 40-row frames, detail rows and formatted segment breakdowns are created only when opened or exported, and one delegated handler replaces listeners on every row. Derived route segments and session-only routing payloads bypass undo capture, and completed worker payloads release their large arrays. The routing contracts now cap the visible metric at 1,000 ms, profiles at 1,500 ms with no task over 80 ms, replacement heap at 4 MiB, and steady-state heap at 1 MiB.
- Page-specific initializers verify their required controls before attaching or injecting UI. This prevents the Motor Start initializer from adding its project-input panel to mobile One-Line pages.
