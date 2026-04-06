# Named Layer Management — One-Line Diagram

*Added: 2026-04-06 (Gap #51)*

---

## Overview

The one-line diagram editor supports **named layers** — a concept familiar from ETAP, EasyPower, and SKM PTW. Layers let engineers organize diagram components into named groups (e.g., *Protection Devices*, *Loads*, *Generation*) and independently toggle each group's visibility or lock state. This allows a single model to produce multiple presentation views without deleting or duplicating components.

---

## Core Concepts

| Term | Meaning |
|------|---------|
| **Layer** | A named category with `visible` and `locked` flags, belonging to one sheet |
| **Visible** | When `false`, all components on the layer are excluded from the rendered SVG |
| **Locked** | When `true`, components on the layer cannot be selected, moved, or deleted |
| **Active layer** | The layer new components are assigned to when dropped onto the canvas |
| **Default (unassigned)** | Components with no layer assignment — always visible and interactive |

---

## Data Model

### Sheet schema

Each sheet in the `oneLine` data store carries a `layers` array alongside `components`:

```json
{
  "name": "Sheet 1",
  "components": [ ... ],
  "connections": [ ... ],
  "layers": [
    { "id": "layer_1712345678901", "name": "Protection Devices", "visible": true, "locked": false },
    { "id": "layer_1712345678902", "name": "Loads",              "visible": true, "locked": false }
  ]
}
```

### Component property

Each component gains an optional `layer` string property holding the id of the layer it belongs to:

```json
{ "id": "n1", "type": "breaker", "subtype": "lv_cb", "layer": "layer_1712345678901", ... }
```

Components without a `layer` property (or with a layer id that no longer exists) are treated as **unassigned** — equivalent to a permanent "Default" layer that is always visible and never locked.

---

## UI Walkthrough

### Open the Layers panel

Click **Layers** in the toolbar's Edit group. The panel slides in on the right side of the canvas. Click it again (or the **×** close button) to collapse it.

### Add a layer

Click **+ Add Layer** in the panel toolbar. Enter a name in the prompt. The new layer appears in the list.

### Make a layer the active layer

Click a row in the layer list to select it as the **active layer** (highlighted in blue). Any component subsequently placed on the canvas will be automatically assigned to that layer.

Click the active row again, or click the *(Default)* row, to revert to unassigned placement.

### Toggle layer visibility

Click the **eye** button (👁 / 🚫) on a layer row. Hidden layers disappear from the SVG immediately — components are not deleted.

### Lock / unlock a layer

Click the **lock** button (🔓 / 🔒). Locked components have their pointer-events disabled and are rendered at reduced opacity. They cannot be selected, dragged, or deleted. Unlocking restores full interaction.

### Rename a layer

Double-click the layer name in the panel. An inline text field appears. Press **Enter** to confirm or **Escape** to cancel.

### Delete a layer

Click **✕** on the layer row. The layer is removed. All components that were assigned to it become unassigned (treated as Default).

### Assign selected components to a layer

1. Select one or more components on the canvas.
2. Open the layer panel, make sure the target layer is the active layer.
3. Use the context menu or the "Assign to layer" control in the Properties panel (when implemented).

Alternatively, make the layer active *before* placing new components.

---

## Undo / Redo

Layer **assignments** (changing which layer a component belongs to) are part of the undo/redo history — they are recorded via `pushHistory()`. Undoing reverses the assignment.

Layer **visibility and lock state** are *not* in the undo history — they are view preferences, like zoom level. Toggling visibility or lock does not add an entry to the History panel.

---

## Workflow Examples

### Protection-only view (presentation to utility / AHJ)

1. Create layers: *Protection Devices*, *Loads*, *Generation*, *Annotations*.
2. Assign breakers, relays, and fuses to *Protection Devices*; motors and loads to *Loads*, etc.
3. To produce a protection-only diagram: hide *Loads*, *Generation*, and *Annotations*.
4. Use **File → Export PDF** (or Export SVG) — only visible components are rendered.
5. Re-enable all layers to return to the full model.

### Load-flow review

Hide *Annotations* and *Voltage Labels* layers to reduce visual clutter while reviewing load-flow study results, then re-enable them for the final report export.

### Read-only reference

Lock the *Generation* layer during a switching study so the source configuration cannot be accidentally modified.

---

## Import / Export

Layers are included in the diagram JSON exported via **File → Export Diagram** and are restored on import. When importing a diagram without a `layers` field (created before this feature), the sheet loads with an empty layers array.

The `DIAGRAM_VERSION` constant was bumped from `2` to `3` to trigger an automatic migration that adds `layers: []` to any sheet missing the field.

---

## API / Storage

| Key | Type | Description |
|-----|------|-------------|
| `sheet.layers` | `OneLineLayer[]` | Array of layer objects for the sheet |
| `component.layer` | `string` (optional) | Id of the layer this component belongs to |

`OneLineLayer` shape:

```typescript
interface OneLineLayer {
  id: string;      // unique, generated as 'layer_' + Date.now()
  name: string;    // display name, not required to be unique
  visible: boolean;
  locked: boolean;
}
```

---

## Backward Compatibility

Existing projects load without change. Any sheet that lacks a `layers` array receives `layers: []` from `getOneLine()` in `dataStore.mjs`. Components without a `layer` property behave as unassigned (always visible, never locked).
