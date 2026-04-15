# Phase 1 component checklist

Use this checklist when adding or reviewing the Phase 1 palette components (`mcc`, `busway`, `ct`, `pt_vt`, `ups`) in fixtures, migrations, and validation coverage.

## Baseline required fields (all Phase 1 components)

- `tag`
- `description`
- `manufacturer`
- `model`
- `phases`
- `commissioning_state`
- `service_status`
- `notes`

## Subtype-specific required fields

### `mcc`

- `rated_voltage_kv`
- `bus_rating_a`
- `main_device_type`
- `sccr_ka`
- `bucket_count`
- `spare_bucket_count`
- `form_type`

### `busway`

- `length_ft`
- `material`
- `insulation_type`
- `enclosure_rating`
- `busway_type`
- `ampacity_a`
- `r_ohm_per_kft`
- `x_ohm_per_kft`
- `short_circuit_rating_ka`

### `ct`

- `ratio_primary`
- `ratio_secondary`
- `accuracy_class`
- `burden_va`
- `knee_point_v`
- `polarity`
- `location_context`

### `pt_vt`

- `primary_voltage`
- `secondary_voltage`
- `accuracy_class`
- `burden_va`
- `connection_type`
- `fuse_protection`

### `ups`

- `topology`
- `rated_kva`
- `input_voltage_kv`
- `output_voltage_kv`
- `efficiency_pct`
- `battery_runtime_min`
- `battery_dc_v`
- `static_bypass_supported`
- `operating_mode`
- `mode_normal_enabled`
- `mode_battery_enabled`
- `mode_bypass_enabled`
- `runtime_normal_min`
- `runtime_battery_min`
- `runtime_bypass_min`
