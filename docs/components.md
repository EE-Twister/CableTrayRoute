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

## Generator study model fields

- Generator components now pre-populate study-ready dynamic and dispatch metadata for both `synchronous` and `asynchronous` subtypes.
- Added fields include `rated_mva`, `rated_kv`, `xdpp_pu`, `xdp_pu`, `xd_pu`, `h_constant_s`, `governor_mode`, `avr_mode`, `min_kw`, `max_kw`, and `ramp_kw_per_min`.
- Existing diagrams are migrated in-memory so missing generator study fields are filled with safe defaults when projects load, and generator property forms mark these fields as required.

## Meter component fields

- The one-line palette now includes a `meter` component subtype for revenue and power-quality instrumentation.
- Meter fields include `tag`, `description`, `manufacturer`, `model`, `meter_class`, `ct_ratio`, `pt_ratio`, `sample_rate_hz`, and study capability flags (`supports_thd`, `supports_flicker`, `supports_waveform_capture`).
- Validation enforces both `ct_ratio` and `pt_ratio` when any meter study capability flag is enabled so harmonics/power-quality workflows do not run with incomplete instrument transformer scaling.


## Current transformer (CT) component fields

- The one-line palette now includes a `ct` subtype under **Protection** with a dedicated CT icon and default study-ready metadata.
- Required CT fields are `tag`, `ratio_primary`, `ratio_secondary`, `accuracy_class`, `burden_va`, `knee_point_v`, `polarity`, and `location_context` (`metering` or `protection`).
- Optional linkage fields (`protected_device_id`, `meter_id`, `relay_id`) let each CT reference the protected asset or instrument endpoint using existing component-id conventions.
- Validation enforces physically valid values (positive ratios, positive burden/knee-point, and `ratio_primary >= ratio_secondary`) so study scaling inputs are not silently invalid.
- Protection and metering study builders now receive normalized CT metadata in the study input object (`ct`) whenever a linked CT is found (explicit `ct_id`, reverse CT link fields, or direct CT connection).

## Potential/voltage transformer (PT/VT) component fields

- The one-line palette now includes a `pt_vt` subtype under **Protection** (type `vt`) with transformer symbol defaults.
- Required PT/VT fields are `tag`, `primary_voltage`, `secondary_voltage`, `accuracy_class`, `burden_va`, `connection_type`, and `fuse_protection`.
- Optional linkage fields (`protected_device_id`, `meter_id`, `relay_id`, and `consumer_ids`) model downstream metering/protection consumers using component IDs.
- Validation enforces:
  - required-field completeness,
  - physically valid ratio direction (`primary_voltage >= secondary_voltage`),
  - ratio range (`1..2000`),
  - linked voltage-base compatibility (PT/VT primary voltage vs linked consumer voltage base).
- Protection and metering study preprocessing now attaches normalized PT/VT metadata in study inputs as `pt_vt` (and under `instrument_transformers.pt_vt` when CT/PT are both present), including computed scaling ratio and voltage-base compatibility flags.

## DC bus component fields

- The one-line palette now includes a `dc_bus` subtype under the Bus category with a dedicated DC icon.
- DC bus fields include `tag`, `description`, `nominal_voltage_vdc`, `grounding_scheme`, `max_continuous_current_a`, and `short_circuit_rating_ka`.
- Validation flags DC bus records missing any of the required DC study fields so DC short-circuit and DC arc-flash workflows do not run on incomplete bus metadata.

## Switchboard component fields

- The one-line palette now includes a `switchboard` subtype for LV/MV lineup modeling.
- Switchboard fields include `tag`, `description`, `manufacturer`, `model`, `rated_voltage_kv`, `phases`, `bus_rating_a`, `withstand_1s_ka`, `interrupting_ka`, `arc_resistant_type`, and `maintenance_mode_supported`.
- Validation flags switchboard records missing any required short-circuit and protection metadata so study inputs are complete before execution.

## MCC component fields

- The one-line palette now includes an `mcc` subtype (Motor Control Center) under the Panel category with a dedicated MCC icon.
- MCC fields include `tag`, `description`, `manufacturer`, `model`, `rated_voltage_kv`, `bus_rating_a`, `main_device_type`, `sccr_ka`, `bucket_count`, `spare_bucket_count`, and `form_type`.
- Legacy diagrams are migrated in-memory so MCC records missing any required fields are assigned safe defaults when projects load.
- Validation flags MCC records with missing/invalid required metadata so lineup and short-circuit workflows remain study-ready.

## Cable segment component fields

- The one-line palette now includes a `cable` subtype for explicit inter-device cable segments.
- Cable segment fields include `tag`, `description`, `manufacturer`, `model`, `length_ft`, `material`, `insulation_type`, `temp_rating_c`, `size_awg_kcmil`, `parallel_sets`, `r_ohm_per_kft`, and `x_ohm_per_kft`.
- Validation flags cable segments missing required impedance and construction metadata so voltage-drop and short-circuit path calculations do not silently fall back to assumed values.

## Busway segment component fields

- The one-line palette now includes a `busway` subtype for explicit inter-device busway runs.
- Busway segment fields include `length_ft`, `material`, `insulation_type`, `enclosure_rating`, `busway_type` (`feeder` or `plug-in`), `ampacity_a`, `r_ohm_per_kft`, `x_ohm_per_kft`, and `short_circuit_rating_ka`.
- Validation now requires positive impedance values and complete ampacity/short-circuit ratings so study ingestion can treat busway distinctly from cable assumptions.

## Protective component normalized fields

- Breakers, fuses, relays, and reclosers now share a common protection schema baseline for study ingestion.
- Normalized fields include `tag`, `description`, `manufacturer`, `model`, `rated_voltage_kv`, `phases`, `interrupting_rating_ka`, `pickup_amps`, `time_dial_or_tms`, `curve_family`, `ground_fault_enabled`, `ground_pickup_a`, and `ground_time_delay_s`.
- Legacy keys are retained for compatibility, and the normalized fields are pre-populated in the component defaults so existing TCC/short-circuit/arc-flash flows can consume a consistent property set.

## UI consistency checklist

Use this checklist when shipping UI updates so layout and component styling stay aligned with shared tokens:

- Use `src/styles/tokens.css` variables for color, typography, spacing, radius, and elevation rather than hard-coded values.
- Keep shared shells (`.top-nav`, `.container`, `.sidebar`, `.main-content`, `.card`) on the spacing and elevation scale before introducing one-off overrides.
- Keep modal surfaces and controls (`.modal`, `.modal-content`, `.modal-body`, `.modal-actions`, `.close-btn`) token-driven for width, padding, border radius, and font sizing.
- For script-generated UI in `site.js` and `src/components/modal.js`, prefer CSS variable references (for example `var(--space-4)` and `var(--size-help-modal-height)`) over literal `px`/`rem` values.
- Validate both light and dark mode appearances after UI changes.

## Command palette rollout slices

To keep command-palette delivery incremental and easy to validate, ship it in the following slices:

1. **Slice 1: Trigger + shell**
   - Add `Ctrl/Cmd + K` keyboard trigger.
   - Render an accessible dialog shell with a search input and keyboard hints.
   - Support close behaviors (`Esc`, backdrop click).
2. **Slice 2: Action index**
   - Add common global actions (new/import/export/save/help).
   - Add navigation commands to common workflow pages.
   - Add study commands that activate existing run buttons when available.
3. **Slice 3: Search relevance + recent commands**
   - Add fuzzy search ranking across command labels and keywords.
   - Track recent successful commands in session preferences.
   - Prefer recent commands when the query is blank.
4. **Slice 4: Accessibility hardening + UX polish**
   - Ensure full keyboard operation (arrow keys, enter, escape) and readable empty states.
   - Refine hover/active visual states for discoverability in light/dark themes.
   - Add docs and regression checks for activation and command execution.
