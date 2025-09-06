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
