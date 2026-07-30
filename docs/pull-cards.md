# Pull Cards

## Purpose

The Pull Cards page groups routed cables by cable type and shared route so field
crews can install each pull as a coordinated work package. Each pull card includes
the cable bundle, route steps, combined cable weight, estimated pull tension, and
sidewall pressure.

## Cable Data Coverage

Pull Cards maps Cable Schedule's canonical `cable_od` field before imported
outside-diameter aliases. Cable weight accepts `weight_lb_ft`, `weight`,
`weight_lbs_ft`, `weightLbsPerFt`, and `cable_weight_lb_ft`.

Missing values are not silently replaced with zero:

- A missing cable weight suppresses the tension result and creates a coverage
  warning.
- A missing cable outside diameter suppresses bundle-area and supported jam
  checks.
- Missing pulling-tension or sidewall-pressure limits leave the calculated
  demand visible but mark the corresponding check as **not evaluated**.
- A route cable without a matching Cable Schedule record is identified in the
  pull's warning list.

The Pull Summary reports how many pull groups still require input.

## Per-Pull Engineering Inputs

Open a pull and use **Pull Engineering Inputs** to edit the following values for
that pull:

| Input | Use |
|---|---|
| Friction coefficient | Straight-run and capstan friction calculation |
| Allowable tension | Pull-level pass/fail screening limit |
| Allowable sidewall pressure | Bend sidewall-pressure screening limit |
| Default bend radius and angle | Applied to bend-type route segments |
| Conduit inside diameter | Three-cable jam-ratio screening |
| Incoming tension | Tension entering the first route segment |
| Pull direction | Auto, route start-to-end, or route end-to-start |

Auto direction calculates both forward and reverse segment order and selects the
lower maximum screening tension. The detail view and XLSX export retain both
direction results, the selected direction, engineering assumptions, limits,
statuses, jam result, and input warnings.

Jam-ratio screening is intentionally limited to three physical cables whose
outside diameters are within 10% of one another. Ratios from 2.8 through 3.2 are
flagged for detailed engineering review. Other bundle configurations are marked
not applicable rather than given a misleading result.

## Saved Pull-Plan Artifact

**Save Pull Plan to Project** and **Apply & Save Pull Plan** write a versioned
`pullPlanArtifact` through the shared data-store/project-storage APIs. Each pull
uses a stable ID derived from its cable tags and route, so assumptions survive
pull-table re-sorting and renumbering. The artifact includes:

- Per-pull cable tags and route steps
- Engineering assumptions and direction comparison
- Tension, sidewall-pressure, and jam results
- Pass/fail/not-evaluated statuses
- Input-coverage warnings

Because it is project-backed, the artifact participates in the project's normal
scenario, undo/redo, import, and export behavior. Pull Cards does not write
directly to browser `localStorage`.

## Mobile Field View

Pull card field links open `fieldview.html` with the selected cable in a
phone-sized read-only layout. The QR payload for each cable is the Field View URL,
for example `fieldview.html#cable=CABLE-001`. When users open Field View from a
desktop computer without a QR target, the page shows the same mobile card layout
inside a phone preview using sample cable data.

QR codes are reserved for field-identifiable objects: individual cable tags on
pull cards and individual tray IDs on tray tags or tray hardware BOM rows. Summary
rows, study pages, settings, dashboards, and other desktop-only workflows should
not receive QR codes unless they resolve to one specific field object.

## Exact 3D Route Visuals

Route exports now include start and end coordinates for each segment:

| Column | Description |
|---|---|
| start_x, start_y, start_z | Segment start coordinate in feet |
| end_x, end_y, end_z | Segment end coordinate in feet |

When those columns are present, Pull Cards renders a code-native SVG isometric view
for the selected pull. The overview panel above the pull table follows the selected
row, and the pull-card detail view shows a larger route visual with the segment
tension trace.

If imported data does not contain coordinates, the page still builds the pull table
and pull cards, but the visual panel shows a coordinate-missing state. Re-export
`route_data.xlsx` or `route_data.csv` from Optimal Route and import the newer file
to get exact 3D route geometry.

## Project Workflow Handoff

Optimal Route saves the latest routing batch as project-level `latestRouteResults`.
The Pull Cards page reads that saved output before looking at the current session
cache, then shows a readiness strip with routed cable count, pull group count, and
missing route-result warnings. **Load Route Results** uses that project output, so
users do not need to import a workbook when they are following the integrated
workflow.

Standalone use is still supported. Import `route_data.xlsx` or `route_data.csv`
when the project store does not contain route results or when the field package
comes from an external routing run.

## Tension Trace

The page computes a segment-level trace so each route segment can show incoming
tension, outgoing tension, and sidewall pressure where bend data is available.
The trace reflects the selected direction and current per-pull assumptions.
