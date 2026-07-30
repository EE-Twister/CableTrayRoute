# Scenario Comparison

The Scenario Comparison page compares two complete saved project scenarios rather than only comparing cable and tray totals.

## Compared project domains

- Equipment, Load List, Panel Schedule, Cable Schedule, Tray Schedule, Conduit Schedule, and Ductbank Schedule
- One-Line sheets, components, and connections
- Every saved engineering study found in either scenario
- Study validity, approval state, warnings, and key numerical metrics

The domain summary separates added, removed, changed, and unchanged records. The detailed change register identifies the affected record and the fields that changed. Run dates and other volatile timestamps do not create a false study change by themselves.

## Study comparison

Study rows are discovered from the scenario snapshots, so a newly added study does not require a hardcoded comparison-page update. Each row reports:

- Whether the result is added, removed, changed, or unchanged
- Saved-result validity or legacy/unverified state
- Engineering approval state
- Important summary metrics available in the result

## Export

**Export Comparison CSV** produces one portable register containing domain summaries, record changes, and study-result changes. It does not modify either scenario.

## Limitations

- A comparison identifies differences; it does not decide which scenario is technically preferred.
- Record matching uses stable IDs/tags where available. Records without stable identifiers fall back to deterministic row keys.
- Approval and validity differences are reported, but formal engineering acceptance remains outside the comparison calculation.
