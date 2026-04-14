# Component & Attribute Gap Analysis

Generated on 2026-04-14 from `componentLibrary.json`.

## Missing Common Component Types

- generator
- breaker
- fuse
- panel
- switchboard
- battery
- pv_array
- cable
- meter

## Attribute Coverage by Existing Component Type

| Component Type | Missing Attributes (common baseline) |
| --- | --- |
| link_source | tag, description, manufacturer, model, volts, phases, short_circuit_capacity, xr_ratio, frequency_hz |
| mcc | tag, description, manufacturer, model, phases, kw, efficiency, power_factor |
| recloser | tag, description, manufacturer, model, phases, pickup_amps, time_dial, interrupting_rating_ka |
| relay | tag, description, manufacturer, model, volts, phases, pickup_amps, interrupting_rating_ka |
| static_load | tag, description, manufacturer, model, phases, kw, kvar, demand_factor |
| motor_load | tag, description, manufacturer, model, phases, kw, power_factor |
| ats | tag, description, manufacturer, model, volts, phases |
| auto_transformer | tag, description, manufacturer, model, volts, phases |
| class_rk1 | tag, description, manufacturer, model, volts, phases |
| contactor | tag, description, manufacturer, model, volts, phases |
| ct | tag, description, manufacturer, model, volts, phases |
| double_throw | tag, description, manufacturer, model, volts, phases |
| grounding_transformer | tag, description, manufacturer, model, volts, phases |
| hv_cb | tag, description, manufacturer, model, volts, phases |
| link_target | tag, description, manufacturer, model, volts, phases |
| lv_cb | tag, description, manufacturer, model, volts, phases |
| mv_cb | tag, description, manufacturer, model, volts, phases |
| single_throw | tag, description, manufacturer, model, volts, phases |
| text_box | tag, description, manufacturer, model, volts, phases |
| three_winding | tag, description, manufacturer, model, volts, phases |
| two_winding | tag, description, manufacturer, model, volts, phases |
| vt | tag, description, manufacturer, model, volts, phases |
| asynchronous | tag, description, manufacturer, model, phases |
| bus | tag, description, manufacturer, model, phases |
| feeder | tag, description, manufacturer, model, phases |
| pv_inverter | tag, description, manufacturer, model, phases |
| reactor | tag, description, manufacturer, model, phases |
| shunt_capacitor_bank | tag, description, manufacturer, model, phases |
| synchronous | tag, description, manufacturer, model, phases |
| ups | tag, description, manufacturer, model, phases |
| utility | tag, description, manufacturer, model, phases |

## Notes

- Baseline attributes are derived from common fields found in peer one-line/power-system design tools.
- This report is a heuristic gap check and should be reviewed before schema enforcement.
