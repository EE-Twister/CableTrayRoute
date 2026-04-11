# Background Image / Site Plan Underlay

## Overview

The Background Image feature lets you import a JPEG, PNG, GIF, or SVG file as a translucent underlay beneath your one-line diagram. This makes it easy to verify that equipment positions on the electrical diagram correspond to their physical locations on a building floor plan, site map, or aerial photograph.

Typical use cases:
- Overlay a one-line on an industrial plant floor plan to check equipment placement
- Trace a utility distribution feeder over an aerial map
- Reference a building section view while placing cable tray routes

---

## Loading a Background Image

1. Open the **One-Line Diagram** page.
2. In the toolbar, find the **View** group and click **Background**.
3. A file picker opens. Select a JPEG, PNG, GIF, or SVG file from your computer.
4. The image appears immediately beneath all diagram components at 40% opacity.
5. The **Background Image** panel opens in the right sidebar, giving you opacity and visibility controls.

---

## Controls (Background Image Panel)

| Control | Description |
|---|---|
| **Opacity slider** (0–100) | Adjusts how transparent the background image is. Lower values make it more transparent; higher values make it more opaque. Default: 40%. |
| **Hide / Show** button | Toggles the background image visibility without removing it. The image data is preserved. |
| **Remove Image** button | Permanently removes the background image from the current sheet. This cannot be undone via the undo stack — use the **Revisions** history if you need to recover it. |
| **×** (close) | Collapses the panel. The image remains active; click **Background** in the toolbar to reopen the panel. |

---

## Per-Sheet Backgrounds

Each diagram sheet has its own independent background image. Sheet 1 can have a ground-floor plan while Sheet 2 has an aerial map. Switching between sheet tabs automatically updates the background and the panel to reflect the active sheet.

---

## Supported File Formats

| Format | MIME type | Notes |
|---|---|---|
| JPEG | `image/jpeg` | Best for photographs and aerial maps |
| PNG | `image/png` | Best for floor plans with transparency |
| GIF | `image/gif` | Supported; use PNG for static images |
| SVG | `image/svg+xml` | Vector — scales without loss; useful for CAD exports |

---

## Export and Import

The background image is stored as a [base64 data URI](https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/Data_URLs) inside the diagram JSON. This means:

- **Export Diagram** (the JSON export) includes the background image automatically. Importing this JSON on another machine or session restores the background image with no extra steps.
- **File size note:** A 1 MB JPEG becomes approximately 1.37 MB as base64. For large site maps consider downscaling the image before import to keep the project file manageable.
- The background image travels with the project through the **Save Project / Load Project** workflow as well.

---

## Workflow Example

1. **Export your floor plan** from a CAD tool or building information model as a PNG or PDF-rasterized JPEG.
2. In CableTrayRoute, open the one-line diagram.
3. Click **Background** and select the floor plan image.
4. Drag and position your electrical components so they align with the physical rooms or panel locations in the floor plan.
5. Reduce opacity to around 20–30% so the electrical diagram is easy to read while the floor plan is still visible for reference.
6. Export to PDF — the background image is included in the PDF export.

---

## Limitations

- The background image is stored as base64 inside the project file. Very large images (> 5 MB source) may cause the project file to become large and slow to load. Resize images to a reasonable resolution (e.g. 2000 × 1500 px) before importing.
- The image always scales to fill the current viewport bounds (same behaviour as the grid). If your diagram has a very wide or tall layout, the image will be letterboxed/pillarboxed using `preserveAspectRatio="xMidYMid meet"`.
- Removing a background image is not recorded in the undo/redo stack. Use **Revisions** (in the sheet controls) to recover a background if it was removed accidentally.
- External URL references are not supported — the image must be loaded from a local file.

---

## Technical Reference

**Data model** (per sheet):

```js
sheet.backgroundImage = {
  url: string,      // base64 data URI (data:image/png;base64,...)
  opacity: number,  // 0.0–1.0 (slider range 0–100 divided by 100)
  visible: boolean  // true = shown, false = hidden but preserved
};
```

**SVG element rendered:**

```xml
<image id="bg-underlay"
  href="data:image/png;base64,..."
  x="<viewport minX>"
  y="<viewport minY>"
  width="<viewport width>"
  height="<viewport height>"
  opacity="0.4"
  preserveAspectRatio="xMidYMid meet" />
```

The element is inserted immediately after `<rect id="grid-bg">` so it sits above the grid but below all component and connection elements.

**Storage:** Persisted via `setOneLine()` inside `dataStore.mjs` alongside components and layers. The `backgroundImage` field is optional — sheets without it behave exactly as before (no background rendered).
