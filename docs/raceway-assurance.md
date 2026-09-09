# Raceway Assurance v2

Raceway Assurance is the issue-gate screening layer between saved routing results and route-dependent deliverables. It is intended to prevent a route from appearing complete when its saved geometry, project references, capacity evidence, or freshness cannot be reproduced.

It is not a field-constructability determination, licensed-engineer approval, or a substitute for the adopted code, manufacturer instructions, installation requirements, and qualified review.

## Route invariants

For each successful saved route, the assurance layer checks:

- the referenced cable exists and has only one saved successful result;
- every segment has finite XYZ start/end points and non-zero length;
- each recorded segment length reconciles with its XYZ geometry;
- adjacent segments are continuous within the configured tolerance;
- the first and last points reconcile with the cable-schedule endpoints in either orientation;
- saved total length equals the sum of segment lengths;
- each contained segment references an existing tray, conduit, or ductbank;
- every ductbank segment resolves to one scope-qualified internal conduit before capacity evidence is accepted;
- an explicit cable group is compatible with an explicit raceway group; and
- the saved route-result input fingerprint matches current project inputs.

Each route receives a deterministic eight-character signature over the cable tag, normalized segment type/raceway/geometry/length, total length, and field-route basis. Identical route evidence produces the same signature; changing that evidence changes the signature.

## Ductbank internal-conduit identity

Contained conduit identity is scoped as `ductbank:conduit`; conduit IDs are not assumed to be unique across different ductbanks. Resolution uses the following bounded evidence order:

1. an explicit ductbank and conduit on the route segment;
2. an explicit cable-schedule conduit assignment within the route segment's ductbank;
3. a unique route alias that identifies one scheduled conduit; or
4. the only scheduled conduit in a ductbank.

The resolver does not choose among multiple candidates. A parent-only ductbank segment with multiple internal conduits blocks issue readiness until the cable or route identifies one conduit. The same normalized identity is passed to Pull Cards and reported with its resolution basis.

## Field-route basis

A route containing field segments records or derives one of these bases:

- `equipment-to-raceway-transition`: field segments connect endpoints or transitions to a selected contained route under the saved routing constraints.
- `direct-field-path`: no contained raceway was selected; the result is a direct field path under the routing inputs and cost constraints and requires field review.

A route containing only tray/conduit segments reports `contained-route` in the project report. These explanations document the software decision; they do not establish installation feasibility.

## Capacity evidence

Actual non-field route assignments are grouped by raceway and evaluated with the shared fill helpers:

- trays use the selected NEC 2023 Article 392 multiconductor evaluator described in [Cable Fill Rules](cable_fill_rules.md);
- conduits use recognized internal area and the Chapter 9 cable-count screen; and
- a ductbank parent reference without a uniquely resolved internal conduit is incomplete evidence and blocks issue readiness.

The capacity ledger is maintained per scoped internal-conduit identity and lists its routed cable tags, assignment source, physical cable count, cable area, internal area, selected fill limit, and fill percentage. Duplicate child IDs in different ductbanks therefore remain separate checks.

An exceeded allowance or missing input is blocking. An out-of-scope tray arrangement does not receive an automatic pass.

## Issue and report behavior

The workflow core, Report Package Builder, and dashboard lifecycle-package release path use the same assurance result. Route results, pull cards, reports, report snapshots, print/PDF output, and release packages remain blocked when raceway-assurance blockers exist.

The routing report section includes route status, segment count, deterministic signature, resolved internal conduits and assignment bases, assurance state, field-route basis/explanation, route-specific issues, overall assurance counts, and the saved input fingerprint. Lifecycle packages retain route results, the current fingerprint, conduits, and ductbanks for historical review.

## Validation evidence and limitations

Automated tests cover deterministic signatures, stale/missing fingerprints, finite and continuous geometry, endpoint/length reconciliation, missing/incompatible raceways, field-route basis, tray incomplete/exceeded cases, conduit overfill, duplicate conduit IDs across ductbanks, explicit cable-to-conduit handoff, ambiguity blocking, and Pull Card propagation. A hand-calculated fixture checks a 0.500 in² cable in 2-inch PVC Schedule 40: `0.500 / 3.291 × 100 = 15.193%`.

Open work includes governed route-cost-breakdown evidence, single-conductor and other out-of-scope Article 392 arrangements, manufacturer-specific constraints, bend/pull-point geometry completeness, and qualified field constructability review.
