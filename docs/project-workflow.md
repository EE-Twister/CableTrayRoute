# Project Workflow

CableTrayRoute supports two working modes:

- **Standalone modules:** Open any page directly, enter the schedule or study data you need, and export from that module without building the full project model.
- **Integrated workflow:** Follow the shared project path so records can be reconciled between modules:

`Equipment List -> Load List -> One-Line -> Cable Schedule -> Raceway Schedule -> Fill / Routing -> Studies -> Deliverables`

## Integrated Path

1. **Equipment List:** Create the major equipment inventory with tags, descriptions, ratings, and locations.
2. **Load List:** Define loads and their source relationships. Source / Panel fields can reference Equipment List tags.
3. **One-Line:** Draw the electrical relationships between sources, panels, equipment, loads, and cable segments.
4. **Cable Schedule:** Complete cable rows until they are schedule-ready.
5. **Raceway Schedule:** Define trays, conduits, and ductbanks.
6. **Fill / Routing:** Assign raceways, calculate tray/conduit fill, run ductbank checks, and optimize routes.
7. **Studies:** Run demand, load flow, short-circuit, arc flash, TCC, harmonics, motor start, and related engineering studies.
8. **Deliverables:** Build project reports, pull cards, spool sheets, procurement schedules, estimates, submittals, and release packages.

## Explicit Reconcile Behavior

The One-Line does not automatically overwrite schedule rows during page load, save, property edits, or study runs. Use **Reconcile Schedules** from the One-Line toolbar when you want to integrate diagram data into schedules.

The reconcile preview matches records by `ref`, `id`, or `tag`, then shows create, update, conflict, and unchanged counts for equipment, panels, loads, and cables. Applying the preview can create missing records and fill empty fields in matching records. It does not delete schedule rows, and it preserves existing non-empty schedule values when the One-Line proposes a different value.

Schedule pages can still be used first. When a schedule already contains equipment, load, panel, or cable records, the One-Line reconcile action treats those records as authoritative unless fields are blank.

## Current Core Workflow UX

- **Equipment List** now has a focused Add Equipment modal, starter records, summary cards, import mapping previews, and modal-based bulk updates for category, arrangement, and lineup.
- **Load List** shows grouped validation counts, equipment-tag source suggestions, and a next-action strip that continues to One-Line or Cable Schedule once loads are ready.
- **Project Dashboard** surfaces a project-level next action, step-specific blockers, direct fix links, schedule-ready/routing-ready health, pending studies, pending deliverables, and pending One-Line reconcile state.
- **Fill / Routing** now shows routing diagnostics for schedule-ready cables, routing-ready cables, coordinate-ready cables, invalid raceway references, geometry blockers, and handoff context on tray/conduit fill pages.
- **Deliverables** use saved route results from Optimal Route to expose pull-card groups, spool-sheet readiness, report-section readiness, saved snapshots, and release-package status on the downstream pages.
- **Ductbank Route** includes a next-action strip for conduit setup, cable assignment, fill calculation, thermal review, and calculation-report export.
- **Sample Gallery** includes visual thumbnail cards for the Project Workflow Core sample plus realistic commercial office, water treatment pump station, and EV charging depot samples. These projects exercise equipment, loads, one-line links, cable schedule rows, raceway geometry, route results, study data, report snapshots, and release packages.

## Deliverable Handoff Rules

Optimal Route writes the latest route output to the project store as `latestRouteResults`. Pull Cards, Spool Sheets, the Workflow Dashboard, and the Report Package Builder read that same project-level route output, so the user can move from routing to field deliverables without re-importing files.

The handoff stays explicit:

- Pull Cards can load the latest project route results or import a route workbook.
- Spool Sheets remain driven by Raceway Schedule tray geometry, with route-result counts shown as downstream context.
- Project Report shows route results, pull groups, spool counts, report snapshots, and release packages before preview generation.
- No deliverable page deletes or silently overwrites schedule records.
