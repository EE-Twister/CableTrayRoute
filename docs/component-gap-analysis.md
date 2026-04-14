# Component & Attribute Gap Analysis

Generated on 2026-04-14 from `componentLibrary.json`.

## Missing Common Component Types

- motor
- pv_array

## Attribute Coverage by Existing Component Type

| Component Type | Missing Attributes (common baseline) |
| --- | --- |
| mcc | tag, description, manufacturer, model, phases, kw, efficiency, power_factor |
| load | tag, description, manufacturer, model, phases, kw, demand_factor |
| ats | tag, description, manufacturer, model, volts, phases |
| cable | volts, phases, size, insulation, ampacity, length |
| contactor | tag, description, manufacturer, model, volts, phases |
| ct | tag, description, manufacturer, model, volts, phases |
| double_throw | tag, description, manufacturer, model, volts, phases |
| grounding_transformer | tag, description, manufacturer, model, volts, phases |
| single_throw | tag, description, manufacturer, model, volts, phases |
| text_box | tag, description, manufacturer, model, volts, phases |
| transformer | tag, description, manufacturer, model, volts, phases |
| vt | tag, description, manufacturer, model, volts, phases |
| reactor | tag, description, manufacturer, model, phases |
| ups | tag, description, manufacturer, model, phases |
| utility | tag, description, manufacturer, model, phases |
| panel | volts, kw, kvar, demand_factor |
| switchboard | volts, kw, kvar, demand_factor |
| bus | manufacturer, model, phases |
| generator | phases, efficiency, power_factor |
| battery | volts, phases |
| breaker | volts, time_dial |
| fuse | volts, time_dial |
| meter | volts, phases |
| inverter | phases |
| recloser | time_dial |
| relay | volts |

## Notes

- Baseline attributes are derived from common fields found in peer one-line/power-system design tools.
- This report is a heuristic gap check and should be reviewed before schema enforcement.
