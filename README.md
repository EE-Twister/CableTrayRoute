# CableTrayRoute
Designed to find the optimal cable route for your cable.

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
