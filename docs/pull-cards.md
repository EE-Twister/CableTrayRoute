# Pull Cards

## Purpose

The Pull Cards page groups routed cables by cable type and shared route so field
crews can install each pull as a coordinated work package. Each pull card includes
the cable bundle, route steps, combined cable weight, estimated pull tension, and
sidewall pressure.

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

Existing pull-tension totals are unchanged. The page also computes a segment-level
trace so each route segment can show incoming tension, outgoing tension, and
sidewall pressure where bend data is available.
