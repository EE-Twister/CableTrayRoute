# Performance contracts

The application enforces browser performance budgets for four engineering workflows:

| Metric | Workload | Budget |
| --- | --- | ---: |
| `ctr.startup` | Navigation start through page readiness | 1,500 ms |
| `ctr.project-import` | Import and persist `samples/project-workflow-core.json` | 1,500 ms |
| `ctr.oneline-render` | Render a deterministic 160-component One-Line | 300 ms |
| `ctr.routing-recalculation` | Route the deterministic 200-cable large-facility sample and render the results | 30,000 ms |

Run `npm run perf:browser` to measure all four workflows and fail when a required metric is missing or exceeds its budget. The machine-readable report is written to `output/playwright/performance/performance-report.json`. On Windows the runner uses installed Microsoft Edge; other platforms use Playwright Chromium. Set `CTR_PLAYWRIGHT_CHANNEL` to override the browser channel.

Use `npm run perf:browser:report` only for diagnostic measurement. It writes the same report but does not fail on a budget overrun. Missing browser infrastructure or a failed workload still exits non-zero.

The browser exposes recorded measurements in `window.__CTR_PERFORMANCE__.measurements` and dispatches `ctr:performance-measure` for diagnostic tooling. Budgets and their evaluator live in `src/performance/performanceContracts.js`; production measurement helpers live in `src/performance/performanceMetrics.js`. Protective-device delivery also records `ctr.protective-device-index-load` and `ctr.protective-device-shard-load` so catalog metadata and selected-curve hydration can be profiled independently.

The report also includes diagnostic profiles for navigation milestones, slow resources, long tasks, DOM mutation volume, retained element growth, and storage reads by key. The four workflow contracts remain merge thresholds. Route-specific startup contracts additionally cover Short Circuit, IEC 60909, Arc Flash, and Library Manager. They enforce page-ready time, reject the legacy or calculation monolith on browser startup, and limit eager catalog requests and shard hydration. The contract definitions and evaluator live in `src/performance/routeStartupContracts.js`, and their results are included in the same machine-readable performance report.

Startup uses the native system-font stack so readiness does not depend on an external font stylesheet. The TCC picker and Library Manager start from `data/protectiveDeviceIndex.json`, while One-Line waits to load that index until component properties need protection choices. Full curve records are distributed across 64 deterministic shards under `data/protectiveDeviceCatalog/` and fetched only for selected or project-referenced devices. Browser Short Circuit, IEC 60909, Arc Flash, One-Line, and TCC calculations hydrate those referenced IDs and inject the resulting records into the synchronous calculation engine. Node and test execution retain `data/protectiveDeviceCalculations.mjs` as a runtime-only fallback; it is not statically included in browser bundles. Workflow Dashboard and Equipment Evaluation load rating metadata only when those views need it.

Run `npm run build:protective-device-catalog` after editing the canonical `data/protectiveDevices.json`; the normal build runs this generator automatically. The build also runs `npm run check:bundle-budgets`, which caps Workflow Dashboard and Equipment Evaluation at 1 MB and Short Circuit and IEC 60909 at 650 KB. The other optimizations batch project import persistence, cache One-Line schedule collections for each render, paint large routing result tables in 40-row frames, and build hidden route-detail tables only when expanded.
