# Pull Cards

## Purpose

The Pull Cards page groups routed cables by cable type and shared route so field
crews can install each pull as a coordinated work package. Each pull card includes
the cable bundle, route steps, combined cable weight, estimated pull tension, and
sidewall pressure.

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

## Tension Trace

Existing pull-tension totals are unchanged. The page also computes a segment-level
trace so each route segment can show incoming tension, outgoing tension, and
sidewall pressure where bend data is available.
