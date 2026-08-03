# Production module delivery architecture

## Purpose

Engineering study pages and Library Manager depend on the shared shell, project persistence, workflow status, calculation or validation models, and page-specific UI. Loading those files as a browser-visible source-module graph creates many small requests, repeated module discovery, and duplicate initialization paths. It also makes startup performance depend on the number of internal files rather than on an intentional delivery contract.

Short Circuit, IEC 60909, Arc Flash, TCC, Harmonics, Load Flow, Motor Start, Contingency, Transient Stability, and Library Manager therefore use production entry bundles. Source remains decomposed for maintainability; Rollup collapses each route's application dependencies into one minified entry for delivery.

## Route entries

| Route | Source entry | Production entry | Required external scripts |
| --- | --- | --- | --- |
| Short Circuit | `src/shortCircuit.js` | `dist/shortCircuit.js` | `dist/vendor/fast-json-patch.mjs` |
| IEC 60909 | `src/iec60909.js` | `dist/iec60909.js` | `dist/vendor/fast-json-patch.mjs` |
| Arc Flash | `src/arcFlash.js` | `dist/arcFlash.js` | `dist/vendor/fast-json-patch.mjs` |
| TCC | `src/tcc.js` | `dist/tcc.js` | D3, PDF.js, and `dist/vendor/fast-json-patch.mjs` |
| Harmonics | `src/harmonics.js` | `dist/harmonics.js` | D3 |
| Load Flow | `src/loadFlow.js` | `dist/loadFlow.js` | None |
| Motor Start | `src/motorStart.js` | `dist/motorStart.js` | D3 |
| Contingency | `src/contingency.js` | `dist/contingency.js` | None |
| Transient Stability | `src/transientstability.js` | `dist/transientstability.js` | Plotly and `dist/vendor/fast-json-patch.mjs` |
| Library Manager | `src/library.js` | `dist/library.js` | `dist/vendor/xlsx.full.min.js` |

Each source entry owns the complete route startup graph: shared site behavior, project controls, workflow status, study logic, and route-specific panels. HTML must reference the production entry and must not also load `dataStore.mjs`, `projectManager.js`, or page calculation modules directly. That rule avoids downloading and initializing multiple copies of the same stateful modules.

D3 remains separate on TCC, Harmonics, and Motor Start; PDF.js remains separate on TCC; and Plotly remains separate on Transient Stability because they are stable vendor assets with independent cache lifetimes. `fast-json-patch` remains shared because project persistence resolves it through the generated vendor asset. The 952 KB XLSX runtime remains separate on Library Manager so its independent cache lifetime does not inflate the application entry or force a vendor re-download when Library code changes. These requests are intentional and are included in the route budgets rather than hidden from measurement.

Library Manager retains its page-local UI controller in `library.html`, but that controller imports one compiled dependency facade. The facade owns navigation, storage, modal, authentication, validation, governance, catalog-loading, and CDN-fallback dependencies. This keeps the existing behavior while preventing the HTML from exposing the internal source graph.

Harmonics uses the same facade pattern for its page-local unbalanced-analysis and frequency-scan controllers. Both controllers import storage and calculation functions from `dist/harmonics.js`; that entry also owns project controls, the initial balanced calculation, and the Engineer Review panel. This removes duplicate `dataStore`, calculation, and approval graphs without coupling the two UI controllers together.

The embedded frequency scan persists its report handoff under the canonical `studyResults.frequencyScan` key. `migrateProject` converts the older `settings.studyResults.freqScan` alias whenever a project is loaded, so existing resonance results remain available while new saves and report consumers share one key. This normalization stays in the central project migration path rather than page-specific storage code.

Load Flow, Motor Start, and Contingency use complete source entries rather than HTML-local facades. Each entry imports the shared project controls, the route calculation/controller, and the Engineer Review panel exactly once. Their HTML pages now declare only the production entry, plus D3 on Motor Start. This preserves the source modules and page behavior while removing browser-visible storage, reporting, project-integration, and approval dependency waterfalls.

Transient Stability also owns its dirty-state and project-control dependencies through its production entry. Its Plotly dependency now uses the build-managed local vendor asset instead of a public CDN. This removes an external-network wait from the critical path, keeps the study available under the production Content Security Policy, and reduces startup from five scripts to three intentional requests.

## Measured improvement

Before consolidation, Arc Flash initiated 30 JavaScript module requests, Load Flow initiated 17, Short Circuit initiated 13, Harmonics initiated 12, IEC 60909 initiated 10, and Library Manager initiated 18. Arc Flash, Short Circuit, IEC 60909, Harmonics, and Library Manager now require two scripts each: the route bundle plus the route's intentional shared vendor asset. TCC requires four scripts. Load Flow and Contingency require one application script each, Motor Start requires its application bundle plus D3, and Transient Stability requires its application bundle, local Plotly, and shared JSON patch. The Transient Stability route previously required five scripts and waited about 3.6 seconds for its external Plotly request; the final local route measured 852.3 ms and is protected by a 1.5-second ceiling.

The reduction removes source-tree request waterfalls while preserving code separation. It also removes redundant top-level `dataStore` and project-manager execution from the affected HTML pages.

## Build and runtime contracts

`rollup.config.cjs` declares the route entries and keeps each build self-contained with `inlineDynamicImports`. `scripts/checkBundleBudgets.mjs` rejects oversized protected bundles:

| Bundle | Maximum bytes |
| --- | ---: |
| `shortCircuit.js` | 650,000 |
| `iec60909.js` | 650,000 |
| `arcFlash.js` | 650,000 |
| `tcc.js` | 1,000,000 |
| `library.js` | 200,000 |
| `harmonics.js` | 200,000 |
| `loadFlow.js` | 325,000 |
| `motorStart.js` | 225,000 |
| `contingency.js` | 325,000 |
| `transientstability.js` | 650,000 |

`src/performance/routeStartupContracts.js` independently enforces browser-observed script counts, readiness time, catalog requests, shard requests, and rejection of the legacy catalog monoliths. Bundle size and request count are separate contracts: a route must satisfy both.

TCC also revealed a delivery invariant for `conductorPropertiesData.mjs`: browser data uses a static ESM import. A top-level dynamic import can be reordered behind top-level await when Rollup inlines it, leaving the namespace uninitialized. Node retains its JSON-file loading branch, while browser bundling receives the same data through a statically ordered module dependency.

## Maintenance workflow

When adding a dependency to one of these routes:

1. Import it from the route source entry or a module reachable from that entry.
2. Do not add a second source-module script tag to the HTML page.
3. Run `npm run build` and confirm the protected bundle remains within its byte budget.
4. Run `npm run perf:browser` and confirm the startup script count and catalog policy remain within contract.
5. Run the affected Playwright study scenarios and inspect the real browser console.

Increase a budget only when a documented user-facing capability requires it and the new cost has been measured. Internal file decomposition by itself is not a reason to increase browser request budgets.
