# Component & Attribute Gap Analysis

Generated on 2026-04-14 from `componentLibrary.json`.

## Missing Common Component Types

- motor
- pv_array

## Attribute Coverage by Existing Component Type

| Component Type | Missing Attributes (common baseline) |
| --- | --- |
| mcc | tag, description, manufacturer, model, phases, commissioning_state, service_status, notes, rated_voltage_kv, kw, efficiency, power_factor |
| load | tag, description, manufacturer, model, phases, commissioning_state, service_status, notes, rated_voltage_kv, kw, demand_factor |
| ats | tag, description, manufacturer, model, phases, commissioning_state, service_status, notes, rated_voltage_kv |
| cable | phases, commissioning_state, service_status, notes, rated_voltage_kv, size, insulation, ampacity, length |
| contactor | tag, description, manufacturer, model, phases, commissioning_state, service_status, notes, rated_voltage_kv |
| ct | tag, description, manufacturer, model, phases, commissioning_state, service_status, notes, rated_voltage_kv |
| double_throw | tag, description, manufacturer, model, phases, commissioning_state, service_status, notes, rated_voltage_kv |
| grounding_transformer | tag, description, manufacturer, model, phases, commissioning_state, service_status, notes, rated_voltage_kv |
| reactor | tag, description, manufacturer, model, phases, commissioning_state, service_status, notes, rated_voltage_kv |
| single_throw | tag, description, manufacturer, model, phases, commissioning_state, service_status, notes, rated_voltage_kv |
| text_box | tag, description, manufacturer, model, phases, commissioning_state, service_status, notes, rated_voltage_kv |
| transformer | tag, description, manufacturer, model, phases, commissioning_state, service_status, notes, rated_voltage_kv |
| ups | tag, description, manufacturer, model, phases, commissioning_state, service_status, notes, rated_voltage_kv |
| vt | tag, description, manufacturer, model, phases, commissioning_state, service_status, notes, rated_voltage_kv |
| utility | tag, description, manufacturer, model, phases, commissioning_state, service_status, rated_voltage_kv |
| generator | phases, commissioning_state, service_status, notes, rated_voltage_kv, efficiency, power_factor |
| bus | manufacturer, model, phases, commissioning_state, service_status, rated_voltage_kv |
| panel | commissioning_state, service_status, notes, kw, kvar, demand_factor |
| switchboard | commissioning_state, service_status, notes, kw, kvar, demand_factor |
| inverter | phases, commissioning_state, service_status, notes, rated_voltage_kv |
| meter | phases, commissioning_state, service_status, notes, rated_voltage_kv |
| battery | phases, commissioning_state, service_status, notes |
| breaker | commissioning_state, service_status, notes, time_dial |
| fuse | commissioning_state, service_status, notes, time_dial |
| recloser | commissioning_state, service_status, notes, time_dial |
| relay | commissioning_state, service_status, notes |

## Notes

- Baseline attributes are derived from common fields found in peer one-line/power-system design tools.
- This report is a heuristic gap check and should be reviewed before schema enforcement.
