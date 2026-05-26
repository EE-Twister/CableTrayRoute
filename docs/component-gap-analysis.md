# Component & Attribute Gap Analysis

Generated on 2026-05-26 from `componentLibrary.json`.

## Missing Common Component Types

- None from the baseline list.

## Attribute Coverage by Existing Component Type

| Component Type | Missing Attributes (common baseline) |
| --- | --- |
| ats | — |
| battery | — |
| breaker | — |
| bus | — |
| busway | — |
| cable | — |
| ct | — |
| double_throw | — |
| fuse | — |
| generator | — |
| grounding_transformer | — |
| inverter | — |
| load | — |
| mcc | — |
| meter | — |
| motor | — |
| panel | — |
| pt_vt | — |
| pv_array | — |
| reactor | — |
| recloser | — |
| relay | — |
| single_throw | — |
| switch | — |
| switchboard | — |
| text_box | — |
| transformer | — |
| ups | — |
| utility | — |

## Notes

- Baseline attributes are derived from common fields found in peer one-line/power-system design tools.
- Product-bearing one-line components receive runtime baseline manufacturer, catalog approval, source, verification, datasheet, BIM, lifecycle, and voltage fields even when a legacy library row omits them.
- An attribute is considered present if it appears under its canonical name or any documented alias (e.g., `kw` is satisfied by `hp`, `rated_kva`, `kva`, etc.). See `ATTRIBUTE_ALIASES` in `scripts/componentCoverageAudit.mjs`.
- `src/validation/librarySchema.mjs` is the canonical schema for MCC and Motor entries; the heuristic baseline here is intentionally looser so it surfaces gaps without duplicating the validator.
- This report is a heuristic gap check and should be reviewed before schema enforcement.
