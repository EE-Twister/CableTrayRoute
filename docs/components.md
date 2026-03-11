# Component Fields

The one-line component library defines several common properties used by equipment, panels, and loads. These fields map directly to columns in exported schedules.

| Field | Description | Schedule Column |
|-------|-------------|----------------|
| `voltage_class` | Nominal voltage class (e.g. 0.48 kV, 5 kV) | `voltage_class` |
| `enclosure` | Enclosure rating such as NEMA type | `enclosure` |
| `thermal_rating` | Maximum operating temperature rating | `thermal_rating` |
| `manufacturer` | Equipment manufacturer name | `manufacturer` |
| `model` | Manufacturer model number | `model` |

Each subtype in `componentLibrary.json` may include these properties in its schema. When present, the oneline editor renders dropdowns preloaded with common kV classes and manufacturer model numbers, and the values are persisted through `setEquipment`, `setPanels`, and `setLoads` for schedule generation.

## Transformer calculated fields

- Transformer impedance (R and X in ohms) is now displayed as a calculated, read-only field in the oneline property drawer. The values update immediately when `kVA`, `%Z`, or `X/R` inputs change so users can verify the derived impedance before applying changes.
- The `baseKV`, `kV`, and `prefault_voltage` entries auto-populate from the active winding voltage. When the derived default differs from a user-entered value, the input shows a **Custom** badge and retains the override across subsequent edits.

## Source calculated fields

- Utility, generator, and inverter sources show the `thevenin_mva` field as calculated output. The value derives from the short-circuit capacity and present base voltage. Entries such as `25 kA` are normalized to MVA using the current voltage base, while raw MVA inputs are passed through directly.
- Source base voltage fields (`baseKV`, `kV`, `kv`, and `prefault_voltage`) mirror the active source voltage automatically. Custom overrides are highlighted with the **Custom** badge so manual entries persist without being replaced by the auto-derived value.

## UI consistency checklist

Use this checklist when shipping UI updates so layout and component styling stay aligned with shared tokens:

- Use `src/styles/tokens.css` variables for color, typography, spacing, radius, and elevation rather than hard-coded values.
- Keep shared shells (`.top-nav`, `.container`, `.sidebar`, `.main-content`, `.card`) on the spacing and elevation scale before introducing one-off overrides.
- Keep modal surfaces and controls (`.modal`, `.modal-content`, `.modal-body`, `.modal-actions`, `.close-btn`) token-driven for width, padding, border radius, and font sizing.
- For script-generated UI in `site.js` and `src/components/modal.js`, prefer CSS variable references (for example `var(--space-4)` and `var(--size-help-modal-height)`) over literal `px`/`rem` values.
- Validate both light and dark mode appearances after UI changes.
