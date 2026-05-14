# Prefabrication Spool Sheets

The Prefabrication Spool Sheets page turns Raceway Schedule tray segments into workshop spool assemblies. It uses tray start/end coordinates, tray width, elevation, and the current spool parameters to show how each input changes the grouping result before the printable tables are generated.

## Live Preview

The preview updates when any spool parameter changes:

- **Standard section length** changes the straight-section count and the section cut stack in the selected-spool inspector.
- **Grouping grid cell size** changes the plan grid cells used to combine nearby tray segments.
- **Elevation band** changes which trays are treated as the same fabrication level.
- **Max segments per spool** splits groups that exceed the handling limit.
- **Hardware assumptions** update splice plate pairs, cable tray clamp kits, grounding jumpers, expansion fittings, field-cut allowance, and spare hardware quantities.
- **Shipping length and handling weight targets** flag spools that may need smaller shop breaks.

The SVG preview shows tray segments colored by spool. Selecting a spool in the visual or generated summary table updates the inspector with tray IDs, width, run length, section cuts, bracket count, estimated tray weight, and cable assignments.

The isometric preview supports navigation without leaving the page. Use the view controls to zoom in, zoom out, rotate left or right in 90-degree steps, enable Orbit mode for drag rotation, fit the view, or isolate the selected spool. Users can drag the preview to pan when Orbit mode is off, drag to orbit the view when Orbit mode is on, use the mouse wheel to zoom around the pointer, and use keyboard focus on the preview for `+`, `-`, `[`, `]`, `O`, `0`, arrow-key pan, and `I` isolate shortcuts.

View preset buttons provide Home, Plan, Front, Right, and Selected-spool focus states. These are preview-orientation aids for the projected SVG visual; the source calculations still use the tray coordinates from the Raceway Schedule.

## Hardware and Shop Package

The selected-spool inspector and shop package panel show how non-tray hardware is counted:

- **Splice plate pairs** are based on straight-section joints created by the standard section length.
- **Cable tray clamp kits** are based on support bracket count multiplied by the clamp kits per support assumption.
- **Grounding jumpers** are based on section joints multiplied by the grounding jumpers per joint assumption.
- **Expansion fittings** are counted by the configured interval in feet.
- **Field-cut allowance** adds length to the spool material length.
- **Hardware spare** rounds up splice plates, clamps, grounding jumpers, and expansion fittings.

Constraint notes appear when a spool exceeds the configured shipping length target, exceeds the configured handling weight target, reaches the max segment count, or has no field-cut allowance.

## Generated Output

The live preview is separate from the printable/exportable output. Click **Generate Spool Sheets** to commit the current preview into the spool summary table and per-spool detail sections. If inputs change after generation, the page marks the output as pending so users regenerate before printing or exporting.

After generation, **Export to Excel (XLSX)** downloads a real `.xlsx` workbook named `spool-sheets-YYYY-MM-DD.xlsx` with spool summary, hardware BOM, assumptions, constraints, and per-spool cable detail sheets.

The visual export buttons download the current preview as either SVG or PNG. The exported image reflects the current selected spool, rotation, zoom, pan, and isolate state.

## Reference Basis

The page uses standards and product literature as context rather than as a prescribed spool-generation standard. NEMA BI-50016-2024 (formerly NEMA VE 2) supports cable tray installation and support context. BICSI TDMM 15th edition Chapter 6 supports ICT horizontal distribution pathway context. BIMForum LOD Specification and Trimble SysQue literature support the LOD 400 fabrication-modeling context. The grid-cell, elevation-band, and max-segment grouping rules are CableTrayRoute planning heuristics and should be checked against project fabrication, transport, and installation constraints.

## Data Requirements

Tray material totals are calculated from the active Raceway Schedule. Tray rows auto-save as they are edited, so newly added Raceway Schedule trays are available to the Spool Sheets preview after leaving the edited cell or navigating to the page. Exact drawing requires each tray to have:

- `start_x`, `start_y`, `start_z`
- `end_x`, `end_y`, `end_z`
- `inside_width`

Cables are assigned to a spool when their `route_preference` matches a tray ID in that spool.

## Procurement Schedule

The Procurement Schedule tab visualizes reel utilization for routed cables with known `total_length` values. It groups by conductor specification, applies the cable allowance used by the schedule, and shows reel utilization bars, offcut, and cut-length rows before XLSX export.
