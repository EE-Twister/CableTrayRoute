# CableTrayRoute
Designed to find the optimal cable route for your cable.

## New Feature: Rebalance Tray Fill

After running the standard routing process, click **Rebalance Tray Fill** to
automatically reroute cables in trays that exceed the allowed fill percentage.
The script tries alternative paths for those cables until each tray is back
under its limit. A progress bar now displays the rerouting progress so you can
see the operation working.

## New Feature: Cable Tag Input

You can now specify a **Cable Tag** when routing cables. Use the text field in the
"Cable Specifications" section to assign a tag for a single cable. In batch mode
the tag can be edited for each cable in the table.

## New Feature: Allowed Cable Group

Cable trays and cables now include an **Allowed Cable Group** property. During routing, a cable will only use trays whose allowed group matches the cable's group. This helps ensure voltage-rated cables are routed appropriately.

## New Feature: Manual Batch Cable Entry

When batch mode is selected, you can now use the **Add Cable to List** button to
add a cable using the current values from the Cable Specifications and Route
Points fields. After filling in the details, click **Add Cable to List** and the
cable will appear in the table for batch routing. Each row in the table allows
you to edit not only the cable tag, but also the diameter and the start/end
coordinates for that cable.

## New Feature: In-App Help Modal

Click **Site Help** in the settings menu to open a help dialog without leaving
the page. The modal highlights key functions like cable tagging and allowed
cable groups, explains how to import or export CSV files, and references the
NEC 40% fill guideline used for tray capacity calculations.

## Updates

- Default *Tray Proximity Threshold* is now **72 in**.
- Each cable row in batch mode includes **Duplicate** and **Delete** controls.
- Tray utilization tables show **Available Space** to two decimal places.
- CSV export flattens the breakdown so each segment is a separate row.
- CSV export no longer includes the **Status** column.
- Route data download now generates an **XLSX** file with an additional
  worksheet mapping trays to the cables routed through them.
- The **Tray Cable Map** worksheet now also lists the tray's **Allowed Cable Group**.
- The XLSX export includes a **Shared Field Routes** worksheet showing
  potential field runs shared between cables.
- Start and end tags are displayed in the 3D view (duplicates shown once).
- Cable specification fields are now located in the **Cable Routing Options** panel.
- Manual tray entry now has a single **Import Trays CSV** button. Clicking it opens a file dialog and loads trays immediately after you choose a file.
- Cable Routing Options now has **Import Cables CSV** and **Export Cables CSV** buttons for managing the cable list.
- New **Shared Field Route Cost Multiplier** input lets successive cables reuse existing field runs at a reduced cost.
- The **Cables to Route** table now includes a **Cable Type** drop-down (Power, Control, Signal) and a **Weight (lbs/ft)** column.
- A new **Conductors** column lets you specify the number of conductors for each cable.
- A new **Conductor Size** column lets you choose an AWG or kcmil size for each cable.

## Tray Fill Visualization

The repository now includes `cabletrayfill.html`, a standalone page that draws
a cross-sectional view of a cable tray. After calculating routes, click
**Download Route Data (XLSX)** and then **Open Tray Fill Tool** to launch the
viewer. Import the exported `route_data.xlsx` file to display the tray fill
diagram with the cables placed according to their properties.

## Import and Export Guide

### Tray CSV Format
A tray CSV used for import must include the following headers:

```
tray_id,start_x,start_y,start_z,end_x,end_y,end_z,width,height,current_fill,allowed_cable_group
```

All coordinates are in **feet**. Width and height are in **inches** and `current_fill` is the occupied area in square inches. A sample file is available at `examples/trays_template.csv`.

### Cable CSV Format
Cables can be imported with these column headers:

```
tag,start_tag,end_tag,cable_type,conductors,conductor_size,diameter,weight,allowed_cable_group,start_x,start_y,start_z,end_x,end_y,end_z
```

Start and end coordinates use **feet**. Diameter is in **inches** and weight is in **lbs/ft**. See `examples/cables_template.csv` for a template.

Exported routing results are written to `route_data.xlsx`. Load this file in `cabletrayfill.html` to view tray utilization.

## Ductbank Analysis

`ductbankroute.html` analyzes underground ductbanks. You can manually enter each conduit and cable or import them from CSV files. Example formats are available at `examples/ductbank_template.csv` and `examples/cables_ductbank.csv`. The **Thermal Analysis** tool overlays a heat map showing estimated earth temperatures. Use **Download Ductbank Data** for an XLSX report, **Export Ductbank Conduits** and **Export Ductbank Cables** for CSVs, or **Export Image** to save the drawing. Ductbank data is saved between sessions; select **Delete Saved Data** from the settings menu to clear it.

## Clearing Saved Sessions
The application stores your trays, cables and theme preference in browser storage. Open the settings menu (⚙) and click **Delete Saved Data** to clear this information.
