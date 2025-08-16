# Tray ID Convention

Conduits imported from the raceway schedule now use a composite tray identifier. If a conduit belongs to a ductbank, its tray ID is built from the ductbank tag and the conduit identifier joined by a hyphen:

```
<tray_id> = <ductbank_id>-<conduit_id>
```

For example, conduit `1` in ductbank `DB-A` becomes tray ID `DB-A-1`.

Use this composite ID when specifying manual paths in the Cable Schedule. Enter multiple tray IDs separated by `>` (e.g., `DB-A-1>TRAY-2`). The same IDs are listed in the Manual Path column's dropdown helper.

Standalone trays keep their existing `tray_id` values.
