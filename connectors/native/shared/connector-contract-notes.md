# Connector Contract Notes

Native connector starter projects exchange JSON files with CableTrayRoute. They do not call a CableTrayRoute server and they do not mutate schedules automatically.

Recommended command flow:

1. Export a connector JSON package from CableTrayRoute BIM Coordination.
2. Run `ValidateCableTrayRoutePackage` in the desktop add-in.
3. Run `ImportCableTrayRoutePreview` to show accepted/rejected rows.
4. Authoring model updates, if any, remain project-specific extension code.
5. Export a return package for CableTrayRoute preview and acceptance.

The connector contract requires stable element identifiers such as Revit `UniqueId`, IFC `GlobalId`, AutoCAD handle/object id, or a project-controlled tag.
