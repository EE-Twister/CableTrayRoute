# Front-End Architecture Boundaries

The largest browser entry points are orchestration layers. New domain, state, and rendering behavior should be implemented in focused modules and imported by the entry point.

## Current boundaries

| Entrypoint | Extracted responsibility | Production module |
| --- | --- | --- |
| `oneline.js` | Protection-zone domain model | `src/one-line/protectionZones.mjs` |
| `oneline.js` | Protection-zone panel rendering and interaction binding | `src/one-line/protectionZonePanel.mjs` |
| `oneline.js` | Per-render performance timing and schedule collection caching | `src/one-line/renderPerformance.js`, `src/one-line/scheduleCollectionCache.js` |
| `oneline.js` | Diagram data, attributes, geometry, property metadata, datablocks, harmonics, sheet links, and study inputs | `src/one-line/*Model.mjs`, `src/one-line/componentAttributes.mjs`, `src/one-line/componentGeometry.mjs`, `src/one-line/datablockLayout.mjs`, `src/one-line/harmonicProfiles.mjs`, `src/one-line/sheetLinks.mjs` |
| `oneline.js` | Connection routing and SVG rendering | `src/one-line/connectionRouting.mjs`, `src/one-line/connectionRenderController.mjs`, `src/one-line/componentNodeRenderController.mjs` |
| `oneline.js` | Property, palette, telemetry, study, sheet, file, event, and history orchestration | `src/one-line/*Controller.mjs`, `src/one-line/propertyDetailView.mjs` |
| `oneline.js` | Compact protective-device catalog loading | `src/protectiveDevices/catalogLoader.mjs` |
| `analysis/tcc.js` | Custom-curve validation, normalization, and catalog adaptation | `analysis/tcc/customCurveModel.mjs` |
| `analysis/tcc.js` | View options, formatting, and legend layout | `analysis/tcc/viewModel.mjs` |
| `analysis/tcc.js` | Plot range collection and axis-domain calculation | `analysis/tcc/plotDomainModel.mjs` |
| `analysis/tcc.js` | Catalog selection defaults and preservation | `analysis/tcc/catalogSelectionModel.mjs` |
| `analysis/tcc.js` | Equipment constraints, overlays, annotations, settings, and persistence snapshots | `analysis/tcc/*Model.mjs` |
| `analysis/tcc.js` | Chart rendering, curve editing, device selection, component browsing, and One-Line previews | `analysis/tcc/chartRenderer.mjs`, `analysis/tcc/*View.mjs`, `analysis/tcc/*Modal.mjs` |
| `analysis/tcc.js` | Protective-device metadata and selected-record hydration | `src/protectiveDevices/catalogLoader.mjs`, `src/protectiveDevices/tccCatalogHydrator.mjs` |
| `app.mjs` | Routing workspace state initialization | `src/routing/routingState.mjs` |
| `app.mjs` | Route-review domain summaries and recommendations | `src/routing/routeReviewModel.mjs` |
| `app.mjs` | Route-review markup and KPI rendering | `src/routing/routeReviewView.mjs` |
| `app.mjs` | Lazy route-detail markup and interaction binding | `src/routing/routeDetailView.mjs` |
| `app.mjs` | Frame-bounded incremental table insertion | `src/components/incrementalDom.js` |
| `app.mjs` | Shared HTML escaping and safe-link validation | `src/htmlSafety.mjs` |
| `app.mjs` | Raceway sizing and containment recommendations | `src/routing/racewaySizingModel.mjs` |
| `app.mjs` | Project adaptation, readiness, sample construction, and route-scene models | `src/routing/routingProjectAdapter.mjs`, `src/routing/routingReadinessModel.mjs`, `src/routing/routingSamples.mjs`, `src/routing/routeVisualizationModel.mjs` |
| `app.mjs` | Plotly scene, pull-review, and manual-entry views | `src/routing/plotlyRouteScene.mjs`, `src/routing/pullReviewView.mjs`, `src/routing/manualEntryView.mjs` |
| `ductbankroute.js` | Ductbank interchange adapter | `src/ductbankProjectAdapter.mjs` |
| `ductbankroute.js` | Thermal constants and pure calculation primitives | `src/ductbank-route/thermalPrimitives.js` |
| `ductbankroute.js` | Injected ductbank ampacity and conductor-temperature model | `src/ductbank-route/ampacityModel.js` |
| `cableschedule.js` | Spreadsheet I/O and print rendering | `src/cable-schedule/io.js`, `src/cable-schedule/printReport.js` |
| `cableschedule.js` | Raceway and panel selector option model | `src/cable-schedule/optionModel.js` |
| `cableschedule.js` | Template normalization, tag parsing, and schedule configuration | `src/cable-schedule/templateModel.js`, `src/cable-schedule/tagModel.js`, `src/cable-schedule/scheduleConfig.js` |
| `cathodicprotection.js` | Distribution, criteria, interference, and coating models | `src/studies/cp/*.js` |
| `cathodicprotection.js` | Sizing formulas, validation, profile construction, and sensitivity engine | `src/studies/cp/analysisEngine.js` |
| `src/panelSchedule.js` | Panel identity, cloning, and selector model | `src/panel-schedule/panelModel.js` |
| `src/panelSchedule.js` | Phase, pole, and breaker-span model | `src/panel-schedule/phaseModel.js` |
| `src/panelSchedule.js` | Breaker layout and phase-load calculations | `src/panel-schedule/breakerLayoutModel.js`, `src/panel-schedule/phaseLoadModel.js` |
| `site.js` | Canonical project hashing, compression, and share-link codec | `src/projectFileCodec.js` |
| `site.js` | Homepage workflow summary model and autosave scheduler | `src/homepageSummary.js`, `src/autoSaveScheduler.js` |
| `dissimilarmetals.js` | Galvanic compatibility calculation, report, worker dispatch, and fallback contract | `analysis/dissimilarMetalsModel.mjs` |

Entrypoints retain page lifecycle orchestration and interaction callbacks. Extracted modules must not reach into entrypoint-local state; state and dependencies are passed explicitly.

## Ratcheted entrypoint sizes

The original line counts are immutable baselines. The current budgets equal the frozen post-extraction counts, so growth fails the architecture check and later reductions must lower the budget in the same change.

| Entrypoint | Original baseline | Current budget | Reduction |
| --- | ---: | ---: | ---: |
| `oneline.js` | 20,852 | 13,175 | 36.8% |
| `analysis/tcc.js` | 11,308 | 4,306 | 61.9% |
| `app.mjs` | 6,734 | 4,453 | 33.9% |
| `ductbankroute.js` | 5,377 | 5,230 | 2.7% |
| `cableschedule.js` | 3,644 | 3,266 | 10.4% |
| `cathodicprotection.js` | 3,401 | 2,764 | 18.7% |
| `src/panelSchedule.js` | 3,234 | 2,725 | 15.7% |
| `site.js` | 2,974 | 2,825 | 5.0% |

## Dependency direction

Production dependencies flow in one direction:

`page entrypoint -> controller/view adapter -> DOM-free model`

Workers and synchronous fallbacks import the same DOM-free model. A worker, client, or model must not import its page entrypoint. DOM-free modules receive project readers, persistence callbacks, and runtime configuration explicitly instead of importing `dataStore.mjs`, `projectStorage.js`, or browser globals.

View and controller modules may use injected or global DOM APIs, but they are not classified as DOM-free and have their own size ceilings. This includes One-Line node/connection/property/event renderers, TCC charts/builders/modals, cable-schedule print rendering, and other browser adapters. DOM-free classification is reserved for modules inspected for browser globals, DOM construction, animation-frame APIs, and direct project-storage dependencies.

Canonical project mutations remain behind `dataStore.mjs` and `projectStorage.js`. Entrypoints or persistence controllers may call those APIs; domain models accept values and callbacks. This preserves project namespace, undo/redo diffs, migration, and legacy derived-storage synchronization instead of introducing a second persistence path.

The standalone `projectManager` production bundle uses `src/projectManagerEntry.js` to compose persistent navigation and project actions as sibling dependencies. This prevents either subsystem from importing the other while retaining the same `dist/projectManager.js` browser contract.

The production graph must remain cycle-free. Pages and workers may depend on shared leaf models, but leaf models never import the page, worker client, or a storage-owning controller. `npm run check:cycles` checks both static imports and literal dynamic imports.

## Engineering-use boundary

Architecture extraction does not upgrade the engineering authority of a calculation. The ductbank ampacity model, cathodic-protection analysis engine, TCC screening curves/default constraints, routing recommendations, and dissimilar-metals model retain their documented assumptions and intended-use limits. They support screening and preliminary comparison only unless separate governing-source evidence, installation inputs, benchmark validation, and qualified human review establish a narrower higher-readiness scope. A passing architecture or unit test is not code-compliance, settings approval, field acceptance, or licensed-engineer approval.

## Quality gate

Run `npm run lint:architecture` to enforce:

- ratcheted maximum line counts for the eight protected entrypoints;
- required imports for the module boundaries listed above;
- size ceilings for extracted models and large cohesive views/controllers, preventing a monolith from merely moving to a new file;
- DOM and persistence isolation for declared model modules;
- a zero-cycle production module graph, including static and literal dynamic imports.

The architecture check is part of `npm run lint`. When an entrypoint needs new behavior, add it to an appropriate focused module. If an entrypoint shrinks further, lower its budget in `scripts/checkArchitectureBoundaries.mjs` in the same change; do not raise a budget simply to accommodate new code. Run `npm run check:cycles` directly when changing imports or worker boundaries.
