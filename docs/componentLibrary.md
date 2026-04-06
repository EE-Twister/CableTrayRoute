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

### Loading from the Cloud

On page load, the Library Manager automatically fetches your cloud library (if you are logged in) and populates the editor. To reload manually at any time, click **Load from Cloud**.

### Sharing a Library

Click **Share Library** to generate a 30-day read-only share link. Send the URL to teammates; they can paste it into **Load Shared Library** (or open it directly in their browser) without needing an account.

Share tokens can be revoked at any time via `DELETE /api/v1/library/shares/:shareId`. See [api-reference.md](api-reference.md) for the full REST API.

### Fallback Behaviour

If you are not logged in, or the server is unreachable, the Library Manager falls back to browser `localStorage` and the static `componentLibrary.json` file — no data is lost.
