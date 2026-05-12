# Equipment Arrangements

The Equipment Arrangements tool (`equipmentarrangements.html`) provides a drag-and-drop layout canvas for planning electrical equipment in rooms.

## What it supports

- Adjustable room width and depth.
- Exterior wall types for north/south/east/west walls.
- Interior walls with configurable orientation, position, and length.
- Canvas drag wall tool that creates interior walls snapped to a 0.5 ft grid.
- Equipment placement from **Equipment List** records or a custom entry.
- Multiple named arrangements in one project, including layouts built from the Equipment List `Arrangement` field.
- **Build From List** groups assigned equipment records into separate arrangements and auto-places each group.
- **Auto Layout** can lay out custom one-off equipment already on the canvas, or load equipment assigned to the active empty arrangement.
- Lineup assignment, selection, and equal-spacing controls for switchgear/MCC rows or other grouped equipment.
- Dimension overlays for room size, selected equipment size, and selected equipment offsets.
- Named saved views that preserve zoom, selected equipment, dimension visibility, and elevation direction.
- Wall elevation views for the active arrangement, with selectable north/south/east/west projections and SVG download.
- Combined layout sheet SVG export with the current plan and elevation on one sheet.
- Adjustable equipment width/depth, facing direction, and voltage rating.
- Equipment height and base elevation fields for elevation drawings.
- Graphical movement of equipment blocks directly in the canvas.
- Wall type dropdowns for all exterior walls and interior walls (`Concrete`, `CMU`, `Gypsum`, `Fire Rated`, `Removable Panel`).

## Equipment List assignments

On the Equipment List page, use the `Arrangement` column to assign equipment to named layouts such as `MCC Room A` or `Outdoor Yard`. The bulk assignment control can apply the same arrangement name to selected rows. Equipment records also include width, depth, height, base elevation, and lineup fields so list-driven layouts can carry physical size and grouping information into the arrangement canvas.

When **Build From List** runs in Equipment Arrangements, each unique assignment becomes a list-driven arrangement. List-driven arrangements can be refreshed from the shared equipment list, while manual arrangements and one-off canvas layouts remain available for project-specific exceptions.

## Lineups, dimensions, and sheets

Use the lineup controls to assign the selected equipment to a named lineup, reselect that lineup later, and equal-space the items along their strongest horizontal or vertical run. The same lineup value syncs back to the Equipment List for shared project use.

Turn **Dimensions** on or off to show room dimensions and selected-equipment dimensions/offsets. Save a named view when a plan/elevation state should be reused for review or export. **Export Sheet SVG** creates a combined plan-plus-elevation sheet for the active arrangement.

## Elevation views

The Elevation View panel projects equipment from the active arrangement onto the selected wall. Equipment appears on the wall where it is physically placed, while the `Facing` direction continues to drive working-clearance direction. For free-standing equipment lineups in the middle of the room, select one or more equipment blocks on the plan and choose `Selected Equipment`; the view will create a centerline elevation using the selected equipment instead of a wall.

Height defaults to 7 ft when no height is supplied; a custom Equipment List column named `height`, `heightFt`, `equipmentHeight`, `elevationHeight`, or `enclosureHeight` can drive the rendered equipment height. The `z`, `baseElevation`, `baseElevationFt`, or `mountingHeight` field can drive the base elevation.

Doorways on the selected wall are shown in the elevation for coordination. Use **Download SVG** to export the current elevation view.

## NEC workspace highlighting

The tool draws a required working-space zone in front of each equipment item and marks violations in red when:

- The equipment footprint or workspace extends outside the room.
- Workspace intersects other equipment footprints.
- Workspace or equipment intersects interior walls.
- Access clearance is constrained near the room perimeter.

The sidebar lists the specific clearance reason for each flagged equipment item, and the same details appear in the equipment detail modal.

This screen is meant for early layout checks and collaboration during planning.
