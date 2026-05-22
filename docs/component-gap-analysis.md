# Component & Attribute Gap Analysis

Generated on 2026-05-22 from `componentLibrary.json`.

## Missing Common Component Types

- pv_array

## Attribute Coverage by Existing Component Type

| Component Type | Missing Attributes (common baseline) |
| --- | --- |
| cable | size, insulation, ampacity, length |
| mcc | kw, efficiency, power_factor |
| motor | kw, efficiency, power_factor |
| panel | kw, kvar, demand_factor |
| switchboard | kw, kvar, demand_factor |
| generator | efficiency, power_factor |
| load | kw, demand_factor |
| breaker | time_dial |
| fuse | time_dial |
| recloser | time_dial |
| ats | — |
| battery | — |
| bus | — |
| busway | — |
| ct | — |
| double_throw | — |
| grounding_transformer | — |
| inverter | — |
| meter | — |
| pt_vt | — |
| reactor | — |
| relay | — |
| single_throw | — |
| switch | — |
| text_box | — |
| transformer | — |
| ups | — |
| utility | — |

## Notes

- Baseline attributes are derived from common fields found in peer one-line/power-system design tools.
- Product-bearing one-line components receive runtime baseline manufacturer, catalog approval, source, verification, datasheet, BIM, lifecycle, and voltage fields even when a legacy library row omits them.
- This report is a heuristic gap check and should be reviewed before schema enforcement.
