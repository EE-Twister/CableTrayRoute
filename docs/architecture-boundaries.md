# Front-End Architecture Boundaries

The largest browser entry points are orchestration layers. New domain, state, and rendering behavior should be implemented in focused modules and imported by the entry point.

## Current boundaries

| Entrypoint | Extracted responsibility | Production module |
| --- | --- | --- |
| `oneline.js` | Protection-zone domain model | `src/one-line/protectionZones.mjs` |
| `oneline.js` | Protection-zone panel rendering and interaction binding | `src/one-line/protectionZonePanel.mjs` |
| `oneline.js` | Per-render performance timing and schedule collection caching | `src/one-line/renderPerformance.js`, `src/one-line/scheduleCollectionCache.js` |
| `oneline.js` | Compact protective-device catalog loading | `src/protectiveDevices/catalogLoader.mjs` |
| `analysis/tcc.js` | Custom-curve validation, normalization, and catalog adaptation | `analysis/tcc/customCurveModel.mjs` |
| `analysis/tcc.js` | View options, formatting, and legend layout | `analysis/tcc/viewModel.mjs` |
| `analysis/tcc.js` | Plot range collection and axis-domain calculation | `analysis/tcc/plotDomainModel.mjs` |
| `analysis/tcc.js` | Catalog selection defaults and preservation | `analysis/tcc/catalogSelectionModel.mjs` |
| `analysis/tcc.js` | Protective-device metadata and selected-record hydration | `src/protectiveDevices/catalogLoader.mjs`, `src/protectiveDevices/tccCatalogHydrator.mjs` |
| `app.mjs` | Routing workspace state initialization | `src/routing/routingState.mjs` |
| `app.mjs` | Route-review domain summaries and recommendations | `src/routing/routeReviewModel.mjs` |
| `app.mjs` | Route-review markup and KPI rendering | `src/routing/routeReviewView.mjs` |
| `app.mjs` | Lazy route-detail markup and interaction binding | `src/routing/routeDetailView.mjs` |
| `app.mjs` | Frame-bounded incremental table insertion | `src/components/incrementalDom.js` |
| `app.mjs` | Shared HTML escaping and safe-link validation | `src/htmlSafety.mjs` |
| `ductbankroute.js` | Ductbank interchange adapter | `src/ductbankProjectAdapter.mjs` |
| `ductbankroute.js` | Thermal constants and pure calculation primitives | `src/ductbank-route/thermalPrimitives.js` |
| `cableschedule.js` | Spreadsheet I/O and print rendering | `src/cable-schedule/io.js`, `src/cable-schedule/printReport.js` |
| `cableschedule.js` | Raceway and panel selector option model | `src/cable-schedule/optionModel.js` |
| `cathodicprotection.js` | Distribution, criteria, interference, and coating models | `src/studies/cp/*.js` |
| `src/panelSchedule.js` | Panel identity, cloning, and selector model | `src/panel-schedule/panelModel.js` |
| `src/panelSchedule.js` | Phase, pole, and breaker-span model | `src/panel-schedule/phaseModel.js` |
| `site.js` | Canonical project hashing, compression, and share-link codec | `src/projectFileCodec.js` |

Entrypoints retain page lifecycle orchestration and interaction callbacks. Extracted modules must not reach into entrypoint-local state; state and dependencies are passed explicitly.

## Quality gate

Run `npm run lint:architecture` to enforce:

- ratcheted maximum line counts for the eight protected entrypoints;
- required imports for the module boundaries listed above;
- size ceilings for the extracted modules, preventing a monolith from merely moving to a new file.

The architecture check is part of `npm run lint`. When an entrypoint needs new behavior, add it to an appropriate focused module. If an entrypoint shrinks further, lower its budget in `scripts/checkArchitectureBoundaries.mjs`; do not raise a budget simply to accommodate new code.
