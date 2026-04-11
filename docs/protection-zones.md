# Protection Zones

Protection zones are color-coded regions overlaid on the one-line diagram that visually group
equipment bounded by their upstream and downstream protective devices. This makes selective
coordination immediately visible, especially on large multi-voltage diagrams where verifying
selectivity by inspection would otherwise be error-prone.

> **Competitive context:** ETAP 2024/2025, SKM PTW 9, and DIgSILENT PowerFactory all offer
> protection zone shading. CableTrayRoute now matches this capability natively in the browser
> with no licensing required (Gap #50).

---

## Opening the Protection Zones Panel

Click **Zones** in the toolbar (next to the **Layers** button) to open the Protection Zones
panel. The panel slides in on the right side of the canvas, alongside the Layers and Background
Image panels.

---

## Creating a Zone

1. Open the Protection Zones panel.
2. Click **+ Add Zone**. A new zone is created with an auto-generated name ("Zone 1", "Zone 2",
   …) and a color chosen from a built-in pastel palette.
3. Rename the zone by double-clicking its name in the panel and typing a new name, then pressing
   **Enter** (or **Escape** to cancel).

---

## Assigning Components to a Zone

1. In the Protection Zones panel, click the **±** button on the zone row you want to assign
   components to. The canvas enters **assignment mode**; a banner reading
   _"Click components to assign/unassign"_ appears in the panel toolbar.
2. Click any component on the canvas to toggle its membership in the zone.
   - A colored dot badge appears on each currently-assigned component.
   - Click an already-assigned component again to remove it from the zone.
3. When finished, click **Done** in the banner (or click the **✔** button on the zone row) to
   exit assignment mode.

> **Tip:** You can assign the same component to multiple zones. Each zone will render its own
> bounding rectangle, so overlapping zones are clearly visible.

---

## Displaying Zone Overlays

Zones are drawn automatically while the panel is open, but you can also toggle the overlay
independently:

- Check **Zones** in the **View** dropdown on the toolbar to show/hide zone overlays without
  opening the panel.
- Each zone is rendered as a translucent colored rectangle with a dashed border that encloses
  all assigned components plus a small padding margin.
- The zone name appears as a label directly above the rectangle in the same color.

Zone overlays are rendered **beneath** components and connections so they never obscure
equipment symbols or cable routes.

---

## Editing Zones

| Action | How |
|--------|-----|
| **Rename** | Double-click the zone name in the panel → type → Enter |
| **Change color** | Click the color swatch on the left of the zone row |
| **Hide/show** | Click the eye icon (👁 / 🚫) on the zone row |
| **Delete** | Click the ✕ button on the zone row |

Deleted zones are removed immediately and cannot be recovered via Undo (the components
themselves are unaffected).

---

## Data Schema

Protection zones are stored per sheet inside the project JSON under `sheets[n].protectionZones`:

```json
{
  "protectionZones": [
    {
      "id": "zone_1712345678901",
      "name": "Feeder A Zone",
      "color": "#e74c3c",
      "componentIds": ["n1", "n2", "n5"],
      "visible": true
    },
    {
      "id": "zone_1712345678902",
      "name": "Bus B Zone",
      "color": "#1abc9c",
      "componentIds": ["n3", "n4"],
      "visible": true
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier, format `zone_<timestamp>` |
| `name` | string | User-visible zone label |
| `color` | string | CSS hex color string |
| `componentIds` | string[] | IDs of one-line components assigned to this zone |
| `visible` | boolean | Whether the overlay is drawn |

The `protectionZones` key is omitted entirely from sheets that have no zones, keeping the
project file backward-compatible with older CableTrayRoute versions.

---

## Workflow Example: Feeder Protection Study

1. **Open a project** with a multi-feeder substation one-line diagram.
2. **Create zones** for each protection group:
   - "Zone 1 – Utility Feeder" → assign the utility source and the main breaker.
   - "Zone 2 – Bus A" → assign Bus A, all Bus A feeders, and the bus protection relay.
   - "Zone 3 – Motor Feeder MCC-A" → assign MCC-A incoming breaker and all motor starters.
3. **Enable Zones overlay** ("Zones" checkbox in View toolbar).
4. Each protection group is now shaded in a distinct color. You can immediately see whether
   any equipment is unassigned (not covered by any zone), or whether zones overlap in a way
   that suggests a coordination gap.
5. Cross-reference with the **TCC** study (Time-Current Curve) to verify that every zone
   boundary is covered by a coordinated protective device pair.
6. Export the one-line diagram (File → Export SVG / Export PDF) to include the zone overlay
   in engineering study submittals.
