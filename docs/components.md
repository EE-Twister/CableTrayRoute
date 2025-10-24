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
