# BIM Coordination

Use **Raceway Schedule → CAD / BIM → BIM Coordination** to import an IFC or Revit JSON file as a read-only coordination snapshot. Importing never overwrites the tray, conduit, or other project schedules.

The comparison matches tray and conduit routes by BIM GUID first, then route ID. It reports matched, geometry-changed, schedule-only, and BIM-only records, plus grouped quantity deltas. Revit JSON snapshots also retain imported electrical equipment and tray-support objects (hangers, brackets, and supports) as BIM-only review targets. They can be selected when creating an issue but do not create or modify schedule records.

Use the coordination dialog to create project-backed BCF-like issues, exchange them as JSON, or export the current difference list as CSV. This is a browser-native coordination workflow, not a replacement for a native Revit/AutoCAD plug-in or a full BCF 2.x package viewer.
