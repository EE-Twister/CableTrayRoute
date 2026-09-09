# Route Quantity and Cost Assurance

## Purpose and classification

Route Quantity and Cost Assurance creates reproducible quantity and conceptual-cost evidence from saved routing results. Its overall engineering classification is **Screening only**. The output supports qualified commercial review; it is not a bid, issued estimate, field takeoff, or licensed-engineer approval.

## Quantity basis

For each successful route, the ledger records:

- route length multiplied by physical run count as cable-run feet;
- cable-run feet multiplied by conductor count as conductor feet;
- installed tray, conduit, and ductbank length deduplicated by schedule identity;
- field-route cable footage, geometric direction changes, and saved pull setups; and
- tray support count using project spacing when supplied, otherwise a visibly disclosed 10 ft screening spacing.

The scheduled length is the installed-raceway basis when it is positive. Otherwise, the maximum length selected by any routed cable is used. Summing shared-raceway segment length across cables is retained as audit context but is never treated as installed quantity.

Blocking quantity checks cover missing routes, route/segment length mismatch, missing cable or raceway schedule records, and missing positive raceway length. The deterministic quantity signature changes when a normalized quantity, unit, or basis changes.

## Cost evidence

The estimator uses the route ledger to include routed cables and uniquely used trays, conduits, and ductbanks. Cable quantities retain physical-run multiplicity; cable material extension additionally retains conductor footage. Every costable cable, tray, and conduit ledger row must have a matching line item with reconciled quantity. Every routed tray with a calculated support count also requires a separate support-assembly cost line.

Routed ductbanks reuse `analysis/ductbankBom.mjs`. The retained assembly evidence includes conduit and coupling footage/counts, end fittings, spacers, pull rope, warning tape, station-based structures and bends when available, and calculated civil volumes. The cost layer does not invent mixed-unit labor productivity: each BOM identity has a deterministic `construction` material-price key and matching `labor_unit_hours` key. A governed `civilInstall` crew rate extends those hours.

Cost assurance also checks project-input fingerprint; pricing source and date; governed material, labor, and productivity coverage; fitting material and installation productivity; catalog-number price alignment when a catalog part is selected; documented non-neutral escalation; finite nonnegative inputs; positive prices; and material-plus-labor extension reconciliation.

Built-in allowances deliberately block the assurance state. New support and civil categories have no asserted built-in prices. Ductbank assurance additionally blocks on missing cover/depth, conduit placement, outside-diameter data, incomplete route profile, missing BOM lines, or any other BOM warning. Catalog identity gaps are warnings when the schedule has no catalog number; when a catalog number is present, a price keyed only by generic size blocks exact-product price assurance. Access, demolition, freight, taxes, contractor markups, dewatering, rock excavation, protective-system design, and field conditions remain scope items for qualified review.

## Persistence and handoff

`settings.costEstimateArtifact` stores the input fingerprint, pricing metadata, line items, quantity ledger, blockers, and deterministic quantity/cost signatures. The Project Report exposes those fields. Lifecycle packages snapshot the cost artifact and procurement register, preventing a later live-project edit from silently changing released evidence.

If a saved estimate predates assurance or its fingerprint differs from current project inputs, Project Report readiness is blocked until the estimate is regenerated. Procurement Schedule displays the same route-quantity signature and deduplicated ledger for cross-checking, while its cable-reel calculation remains the purchasing-specific source for ordered cable length and waste.

## Validation boundaries

Automated tests cover shared-raceway deduplication, parallel runs, conductor footage, route/segment mismatch, missing schedule records, support quantities, fitting labor, BOM-derived ductbank rows, mixed-unit material/labor extensions, incomplete civil inputs, catalog-keyed pricing, line-item reconciliation, cost-signature sensitivity, stale artifacts, and lifecycle snapshot isolation. These tests validate software behavior and arithmetic contracts; they do not validate supplier pricing, constructability, means and methods, or field quantities.
