# Component Library

The one-line editor loads component definitions from `componentLibrary.json`. Each object in this array describes a subtype available in the palette.

```json
[
  {
    "subtype": "MLO",
    "label": "MLO",
    "icon": "icons/MLO.svg",
    "category": "panel",
    "ports": [{ "x": 0, "y": 20 }, { "x": 80, "y": 20 }],
    "schema": [
      { "name": "voltage", "label": "Voltage", "type": "number" }
    ]
  }
]
```

- `subtype` – unique identifier used in saved diagrams.
- `label` – text shown in the palette.
- `icon` – path to an SVG displayed on the palette button.
- `category` – group such as `panel`, `equipment`, or `load`.
- `ports` – array of connection points relative to an 80×40 component.
- `schema` – optional property descriptors with `name`, `label`, and `type`.

## Component Instance Properties

At runtime each placed component also carries these standard properties on its saved JSON object:

| Property | Type | Description |
|----------|------|-------------|
| `id` | string | Unique identifier (e.g. `n1712345678901`) |
| `type` | string | Resolved component type (`bus`, `breaker`, `load`, …) |
| `subtype` | string | Library subtype key |
| `x`, `y` | number | Canvas position in diagram units |
| `label` | string | Display tag shown on the diagram |
| `ref` | string | Linked schedule row id |
| `rotation` | number | 0, 90, 180, or 270 degrees |
| `flipped` | boolean | Mirror along primary axis |
| `locked` | boolean | When `true`, prevents selection/drag (Gap #41) |
| `layer` | string (optional) | Named layer id this component belongs to (Gap #51) — see [layer-management.md](layer-management.md) |
| `connections` | array | Outbound connection descriptors |
| `props` | object | Subtype-specific properties |

Add new objects to the JSON array and provide matching icons to extend the palette without modifying JavaScript code.

## Icons

Place custom SVG files under `icons/components/` and reference them in `componentLibrary.json`. Missing icons fall back to `icons/placeholder.svg`.

## Cloud Synchronization

The **Library Manager** (`library.html`) supports saving your component library to the server so it persists across devices and browser sessions.

### Saving to the Cloud

1. Open **Library Manager** from the navigation menu.
2. Edit or upload your component library JSON in the editor.
3. Click **Save to Cloud** — the library is sent to `PUT /api/v1/library` and a "☁ Synced" badge confirms success.

When you click the regular **Save** button while logged in, the library is also auto-synced to the cloud.

If the server returns **409 Version conflict**, Library Manager now fetches the latest cloud copy and opens a conflict modal with three choices:

- **Overwrite cloud with my local edits** (retries save against the latest `baseVersion`)
- **Reload cloud version** (loads cloud data into the editor)
- **Merge non-conflicting changes** (merges by `component.subtype`, flags subtype collisions for manual review, then retries save with updated `baseVersion`)

### Loading from the Cloud

On page load, the Library Manager automatically fetches your cloud library (if you are logged in) and populates the editor. To reload manually at any time, click **Load from Cloud**.

### Import Formats and Template Workbook

Library Manager imports `.json`, `.csv`, `.xlsx`, and `.xls` files.

- Use **Import mode → Replace library** to overwrite the current editor state.
- Use **Import mode → Merge into existing** to merge categories/icons and upsert components by `subtype`.
- Spreadsheet imports use these workbook sheets:
  - `Components` (required for component rows)
  - `Categories`
  - `Icons`
  - Optional `Ports` and `Schema` sheets for flattened data.

Use **Download Template** in Library Manager to export a starter workbook containing all supported sheets and sample rows.

If XLSX runtime is unavailable in the browser, spreadsheet import/export is disabled gracefully and the UI prompts you to use JSON/CSV instead.

### Sharing a Library

Click **Share Library** to generate a 30-day read-only share link. Send the URL to teammates; they can paste it into **Load Shared Library** (or open it directly in their browser) without needing an account.

Share tokens can be revoked at any time via `DELETE /api/v1/library/shares/:shareId`. See [api-reference.md](api-reference.md) for the full REST API.

### Fallback Behaviour

If you are not logged in, or the server is unreachable, the Library Manager falls back to browser `localStorage` and the static `componentLibrary.json` file — no data is lost.
