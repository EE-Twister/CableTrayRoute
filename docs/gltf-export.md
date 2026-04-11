# glTF 2.0 Export — Navisworks / BIM Platform Integration

## Overview

CableTrayRoute can export your cable tray layout as a **glTF 2.0 binary file (`.glb`)** — the open standard for 3D scenes supported by Autodesk Navisworks, BIM 360 / Autodesk Construction Cloud, Bentley iTwin, three.js, Babylon.js, and every major BIM coordination platform.

This closes the gap with MagiCAD 2026 and Bentley Raceway 2024/2025, which both export cable tray geometry to 3D BIM viewers for federated model review.

---

## When to Use

| Use case | Recommendation |
|----------|---------------|
| Navisworks federated model review | **glTF (.glb)** — rich 3D solid mesh geometry |
| Revit / AutoCAD MEP roundtrip | IFC 4.x (see interoperability guide) |
| BIM 360 / ACC model viewer | **glTF (.glb)** |
| Clash detection with architectural model | **glTF (.glb)** in Navisworks |
| COBie / asset handover data | IFC 4.x |

---

## Exporting from CableTrayRoute

1. Open **Optimal Cable Route** (`optimalRoute.html`).
2. Add cable trays and run routing (or load an existing project).
3. In the **3D Route Visualization** section, click **Export 3D Model (.glb)**.
4. The browser downloads `<project-name>.glb`.

The export includes:
- All cable tray segments as solid rectangular-prism meshes
- All routed cable paths as 3D polylines (if routing has been run)
- Fill heat-map coloring based on current tray utilization

---

## Exported Content

### Cable Tray Segments

Each cable tray record is exported as a **separate named glTF node** containing a solid box mesh. Diagonal (multi-axis) tray runs are automatically decomposed into axis-aligned sub-segments, matching the 3D visualization in the browser viewer.

**Per-node metadata** (visible in Navisworks Properties panel under `extras`):

| Field | Description |
|-------|-------------|
| `tray_id` | Tray identifier (e.g., `TRAY-MCC-01`) |
| `fill_pct` | Current fill percentage (0–100) |
| `width_in` | Inside width in inches |
| `height_in` | Tray depth / height in inches |
| `raceway_type` | `tray`, `conduit`, or `ductbank` |

### Fill Heat-Map Materials

Tray meshes are colored by utilization to match the browser heatmap view:

| Color | Fill range | glTF material name |
|-------|-----------|-------------------|
| Grey  | < 40%     | `fill_low`        |
| Yellow| 40–79%    | `fill_medium`     |
| Red   | ≥ 80%     | `fill_high`       |

All materials use **PBR Metallic-Roughness** with semi-transparent alpha blending (α = 0.9) so cable routes remain visible through the tray walls.

### Cable Routes

Routed cables are exported as **GL_LINES** primitives (mode 1) — a direct line from the cable's start coordinate to its end coordinate. The glTF material `cable_route` renders these in blue.

Per-cable node extras: `cable_id`, `from_tag`, `to_tag`.

---

## Importing into Autodesk Navisworks

1. Open Navisworks Manage or Simulate.
2. **File > Append** (or drag-and-drop) the `.glb` file.
3. The cable tray model appears as a new model in the Selection Tree under the project name.
4. Each tray is individually selectable; click **Properties** (Ctrl+1) to view the `extras` metadata.
5. Use **Clash Detective** to run interference checks against the architectural/structural model.

> **Note:** Navisworks uses Y-up orientation while CableTrayRoute uses Z-up. Navisworks automatically handles this when importing glTF — no manual rotation required.

---

## Importing into BIM 360 / Autodesk Construction Cloud

1. Navigate to your project in BIM 360 / ACC.
2. Upload the `.glb` file to the **Docs** module.
3. Open the file in **Model Viewer** — glTF 2.0 is natively supported.
4. Use the **Clash** or **Model Coordination** module to overlay with other disciplines.

---

## Importing into Other BIM Viewers

| Platform | Method |
|----------|--------|
| Bentley iTwin / ProjectWise | Upload `.glb`; iTwin Viewer supports glTF 2.0 natively |
| three.js / Babylon.js | `GLTFLoader` / `SceneLoader.Append` |
| Khronos glTF Validator | Drag-and-drop at https://github.khronos.org/glTF-Validator/ |
| Blender | File > Import > glTF 2.0 |

---

## Coordinate System

CableTrayRoute exports geometry in its native **Z-up, right-handed** coordinate system (X-East, Y-North, Z-Up). Linear units match the source data (typically **feet** for X/Y/Z positions; **inches** for `width_in` / `height_in`).

Most BIM tools — including Navisworks — detect the Z-up convention from the glTF `asset` metadata and apply the necessary axis rotation on import.

If you need to manually rotate the model: rotate −90° around the X-axis to convert from Z-up to Y-up.

---

## Limitations

- **No curved geometry**: Conduit bends and cable tray elbows/tees are represented as straight axis-aligned segments (matching the 3D viewer in the app).
- **No structural attachments**: Support hangers and brackets are not included in the glTF export (they are available in the Tray Hardware BOM report).
- **No IFC semantic data**: For BIM handover with full semantic properties (IfcCableCarrierSegment, COBie), use the **IFC 4.x export** alongside the glTF file.
- **Large projects**: Projects with > 1 000 trays may produce files > 5 MB. This is normal; all tested BIM viewers handle it without issue.

---

## Related Features

- **IFC 4.x Export** — `src/exporters/ifc4.mjs` — BIM semantic data for Revit/AutoCAD import
- **DXF Export** — `bimExport.mjs` — 2D plan view for AutoCAD
- **Pull Cards** — `analysis/pullCards.mjs` — PDF field documents with QR codes

---

## Standards Reference

| Standard | Description |
|----------|-------------|
| [glTF 2.0](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html) | Khronos Group — 3D transmission format spec |
| [GLB container](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#glb-file-format-specification) | Binary glTF packaging format |
| IFC4 | ISO 16739-1:2018 — see `docs/interoperability.md` |
