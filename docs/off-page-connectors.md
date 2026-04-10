# Off-Page Connectors (Cross-Sheet References)

*Added: 2026-04-10 (Gap #48)*

---

## Overview

Large electrical systems cannot always be represented on a single drawing sheet. Professional SLD
tools (ETAP, EasyPower, SKM PTW) use **off-page connector** symbols — flag-shaped terminals that
mark where a circuit continues on a different sheet. CableTrayRoute provides the same capability
via **Sheet Link Out** and **Sheet Link In** component types.

Without off-page connectors, every sheet must represent a fully self-contained electrical
subsystem. With them, a main switchboard can be drawn on Sheet 1 while its downstream MCC feeder
continues on Sheet 2, with navigation between the two by double-clicking the connector symbols.

---

## Core Concepts

| Term | Meaning |
|---|---|
| **Sheet Link Out** (`link_source`) | Marks where a circuit leaves this sheet. Renders a right-facing icon with a `→ <target>` badge. |
| **Sheet Link In** (`link_target`) | Marks where the same circuit enters another sheet. Renders a left-facing icon with a `← <source>` badge. |
| **`link_id`** | A user-defined string that ties a source connector to its target (e.g. `FEEDER-MCC1`). Must be identical on both connectors. |
| **`linked_sheet`** | The **name** of the partner sheet (e.g. `Sheet 2`). Set to the *other* sheet's name on each connector. |

---

## Data Model

Each connector is stored as a standard diagram component with `type: "sheet_link"`:

**Sheet Link Out (`link_source`)**
```json
{
  "id": "n1712345678901",
  "type": "sheet_link",
  "subtype": "link_source",
  "label": "FEEDER-MCC1",
  "x": 420, "y": 160,
  "props": {
    "link_id": "FEEDER-MCC1",
    "linked_sheet": "Sheet 2",
    "notes": ""
  },
  "ports": [{ "x": 80, "y": 20 }]
}
```

**Sheet Link In (`link_target`)**
```json
{
  "id": "n1712345679002",
  "type": "sheet_link",
  "subtype": "link_target",
  "label": "FEEDER-MCC1",
  "x": 100, "y": 160,
  "props": {
    "link_id": "FEEDER-MCC1",
    "linked_sheet": "Sheet 1",
    "notes": ""
  },
  "ports": [{ "x": 0, "y": 20 }]
}
```

---

## UI Walkthrough

### Placing a Sheet Link Out

1. Open the one-line diagram editor (`oneline.html`).
2. Expand the **Links** palette category in the component panel.
3. Drag **Sheet Link Out** onto the canvas at the point where the circuit leaves the sheet.
4. In the **Properties** panel, set:
   - **`link_id`** — a unique identifier shared by both connectors (e.g. `FEEDER-MCC1`).
   - **`linked_sheet`** — the name of the destination sheet (e.g. `Sheet 2`).
5. A blue arrow badge (`→ Sheet 2`) appears below the connector icon confirming the target.

### Placing the matching Sheet Link In

1. Switch to the destination sheet (Sheet 2) using the sheet tabs at the bottom of the canvas.
2. Drag **Sheet Link In** onto the canvas where the feeder enters.
3. Set **`link_id`** to the same value as the source (e.g. `FEEDER-MCC1`).
4. Set **`linked_sheet`** to the source sheet name (e.g. `Sheet 1`).
5. A blue arrow badge (`← Sheet 1`) confirms the return reference.

### Connecting wires

Connect the single port of each connector to the nearest bus or cable just like any other
component. Sheet Link Out has its port on the right edge (x=80); Sheet Link In has its port on
the left edge (x=0).

---

## Navigation Behavior

**Double-clicking** any sheet link connector triggers navigation:

1. `navigateToLinkedSheet(comp)` resolves the target sheet index by matching `linked_sheet` to
   a sheet name in the `sheets[]` array.
2. If the `link_id` is set, `findPairedConnector()` locates the partner component on the target
   sheet even if the sheet name has not been set yet.
3. `loadSheet(targetIdx)` switches the active sheet, saving the current state first.
4. The paired connector is **selected** and highlighted with an orange pulsing outline
   (`find-highlight` CSS class) for 3 seconds, making it easy to spot on large diagrams.

Single-clicking a sheet link connector selects it normally for property editing.

---

## Orphan Handling

If navigation cannot resolve the target, a toast message appears and no navigation occurs:

| Condition | Toast message |
|---|---|
| `linked_sheet` names a sheet that does not exist | `Sheet link target "<name>" not found` |
| `linked_sheet` is blank and no partner found via `link_id` | `Sheet link target "(unset)" not found` |
| `linked_sheet` refers to the current (active) sheet | `Sheet link points to current sheet` |

---

## Validation

The **Validate** button (or `Ctrl+Shift+V`) checks all sheet link components on the active
sheet for three conditions:

| Rule | Message |
|---|---|
| `link_id` is blank | `Sheet link has no link_id` |
| `linked_sheet` is blank | `Sheet link has no target sheet set` |
| No partner component with the same `link_id` found on any sheet | `No matching paired connector for link_id "…"` |

Sheet link components are **excluded** from the generic "Unconnected component" warning because
they are designed to connect to only one wire (they terminate a feeder crossing a sheet boundary).

---

## Undo / Redo

Placing, deleting, and moving sheet link components participates fully in the diagram undo/redo
history via `pushHistory()`. Property edits — setting `link_id` or `linked_sheet` in the
Properties panel — go through the standard property-change handler which calls `save()`.

---

## Import / Export

Off-page connector state is serialized as part of the standard diagram JSON under
`sheets[n].components`. No special export step is needed.

**Schema version:** The diagram format was bumped from version 3 to **version 4** to support
this feature. The `migrateDiagram()` function transparently upgrades older saved files:

- `props.target_sheet` on `link_source` → renamed to `props.linked_sheet`
- `props.from_sheet` on `link_target` → renamed to `props.linked_sheet`

Legacy diagrams are upgraded automatically on the next load; no manual intervention is required.

---

## API / Storage

The helpers used by this feature are pure functions exported for testability:

| Function | Signature | Returns |
|---|---|---|
| `resolveLinkedSheetIndex` | `(comp, sheets[])` | Sheet index (number) or `-1` |
| `findPairedConnector` | `(linkId, subtype, sheets[])` | `{ sheetIndex, component }` or `null` |
| `validateSheetLinks` | `(sheets[])` | `Array<{ component, sheetIndex, message }>` |
| `getSheetLinkBadgeText` | `(comp, sheets[])` | Badge string or `''` |
| `navigateToLinkedSheet` | `(comp)` | `void` — calls `loadSheet()` and highlights partner |

Tests: `tests/onelineOffPageConnectors.test.mjs` (17 assertions).

---

## Backward Compatibility

Diagrams saved before version 4 that contain no `sheet_link` components are unaffected — the
v4 migration only touches components with `type === "sheet_link"`. Diagrams with no such
components pass through migration unchanged.

---

## Workflow Example

**Scenario:** Main switchboard (Sheet 1) feeds a motor control centre (Sheet 2) via a 480 V
feeder tagged `FEEDER-MCC1`.

**Sheet 1 setup:**
1. Draw main bus; connect a breaker `CB-MCC1` below it.
2. Place **Sheet Link Out** after the breaker; connect it to the breaker's lower port.
3. Set `link_id = FEEDER-MCC1`, `linked_sheet = Sheet 2`.

**Sheet 2 setup:**
1. Place **Sheet Link In** at the top of Sheet 2.
2. Connect it to the MCC bus.
3. Set `link_id = FEEDER-MCC1`, `linked_sheet = Sheet 1`.

**Result:** Double-clicking either connector instantly navigates to the paired sheet and
highlights the matching connector, providing seamless traversal of the full electrical system
across both drawing sheets.
