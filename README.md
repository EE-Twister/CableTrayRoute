# CableTrayRoute
Designed to find the optimal cable route for your cable.

## New Feature: Cable Tag Input

You can now specify a **Cable Tag** when routing cables. Use the text field in the
"Cable Specifications" section to assign a tag for a single cable. In batch mode
the tag can be edited for each cable in the table.

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
- Start and end tags are displayed in the 3D view (duplicates shown once).
- Cable specification fields are now located in the **Cable Routing Options** panel.
- Manual tray entry now has a single **Import Trays CSV** button. Clicking it opens a file dialog and loads trays immediately after you choose a file.
