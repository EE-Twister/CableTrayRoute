# Front-End Architecture Boundaries

The largest browser entry points are orchestration layers. New domain, state, and rendering behavior should be implemented in focused modules and imported by the entry point.

## Current boundaries

| Entrypoint | Extracted responsibility | Production module |
| --- | --- | --- |
| `oneline.js` | Protection-zone domain model | `src/one-line/protectionZones.mjs` |
| `oneline.js` | Protection-zone panel rendering and interaction binding | `src/one-line/protectionZonePanel.mjs` |
| `analysis/tcc.js` | Custom-curve validation, normalization, and catalog adaptation | `analysis/tcc/customCurveModel.mjs` |
| `analysis/tcc.js` | View options, formatting, and legend layout | `analysis/tcc/viewModel.mjs` |
| `app.mjs` | Routing workspace state initialization | `src/routing/routingState.mjs` |
| `app.mjs` | Route-review domain summaries and recommendations | `src/routing/routeReviewModel.mjs` |
| `app.mjs` | Route-review markup and KPI rendering | `src/routing/routeReviewView.mjs` |
| `app.mjs` | Shared HTML escaping and safe-link validation | `src/htmlSafety.mjs` |

Entrypoints retain page lifecycle orchestration and interaction callbacks. Extracted modules must not reach into entrypoint-local state; state and dependencies are passed explicitly.

## Quality gate

Run `npm run lint:architecture` to enforce:

- ratcheted maximum line counts for `oneline.js`, `analysis/tcc.js`, and `app.mjs`;
- required imports for the module boundaries listed above;
- size ceilings for the extracted modules, preventing a monolith from merely moving to a new file.

The architecture check is part of `npm run lint`. When an entrypoint needs new behavior, add it to an appropriate focused module. If an entrypoint shrinks further, lower its budget in `scripts/checkArchitectureBoundaries.mjs`; do not raise a budget simply to accommodate new code.
