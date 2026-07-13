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

## Workflow Context

Core workflow pages keep project guidance in a compact navigation row above the workspace. It identifies the current step, shows a small readiness status, and provides previous, dashboard, and next links without displacing the page's primary tools. Hovering the status exposes the current readiness explanation.

Each page remains usable as an independent calculator, table, diagram, or deliverable builder with its own direct entry, import, and export path. The shared status is driven by `src/workflowStatus.js`, so aliases such as Tray Fill, Conduit Fill, Ductbank, and Optimal Route report the same Fill / Routing readiness while preserving their specialized page tools. Page-specific panels can still show deeper diagnostics, but they should use the same status vocabulary: schedule-ready, routing-ready, route-results-ready, study-saved, and deliverable-ready.

The handoff-level inputs, outputs, readiness rules, and downstream consumers for every Workflow and Studies navigation page are generated in [Workflow and Studies Page Contracts](page-contracts.md) from `src/pageContracts.js`. The static contract-to-code comparison is generated in [Page Contract Code Audit](page-contract-audit.md) from `scripts/auditPageContracts.mjs`.

### Sample Workflow Context

Loading a gallery sample now stores its guided checklist with the project. A compact sample strip follows the user across every page included in that checklist and provides Previous, Next, Checklist, and Exit actions without replacing the page's primary controls.

The Underground Ductbank sample follows the complete data path from Equipment and Loads through One-Line, Cable Schedule, Raceway Schedule, Ductbank Route, Conduit Fill, and IEC 60287. Ductbank Route exposes a project-ductbank selector so DB-01 and DB-02 can be reviewed in the same workspace. Conduit Fill opens the requested conduit with its assigned cable and also provides a selector for the other project conduits.

Opening a sample replaces cached conduit and ductbank schedule context with the sample's complete parent and child records. Zero-valued coordinates remain visible in the Raceway Schedule so valid origins are not mistaken for missing geometry.

## Explicit Reconcile Behavior

The One-Line does not automatically overwrite schedule rows during page load, save, property edits, or study runs. Use **Reconcile Schedules** from the One-Line toolbar when you want to integrate diagram data into schedules.

The reconcile preview matches records by `ref`, `id`, or `tag`, then shows create, update, conflict, and unchanged counts for equipment, panels, loads, and cables. Applying the preview can create missing records and fill empty fields in matching records. It does not delete schedule rows, and it preserves existing non-empty schedule values when the One-Line proposes a different value.

Schedule pages can still be used first. When a schedule already contains equipment, load, panel, or cable records, the One-Line reconcile action treats those records as authoritative unless fields are blank.

## Current Core Workflow UX

- **Equipment List** now has a focused Add Equipment modal, starter records, summary cards, import mapping previews, and modal-based bulk updates for category, arrangement, and lineup.
- **Load List** shows grouped validation counts, equipment-tag source suggestions, and a next-action strip that continues to One-Line or Cable Schedule once loads are ready.
- **One-Line** defaults new palette devices to an upright vertical source-to-load orientation, places clicked components in a readable top-to-bottom stack, uses transparent ANSI/IEEE-style schematic symbols and bounds for sources, buses, protection, panels, UPS, motors, transformers, and study devices, aligns load and motor ports to their visible schematic terminals, supports click-to-connect from device bodies or visible ports, creates provisional cable metadata so drawing is not blocked by cable details, and keeps Properties, Validation, and History in the right-side inspector. The page can now Auto-Build missing one-line components from Equipment and Load List records, Auto Arrange around horizontal buses with vertical drops and branch spacing, Auto Space Equipment rows to standard horizontal branch spacing, load a denser SKM/ETAP-style sample with direct bus-centerline taps, motor and capacitor branches, and compact Engineering Labels, switch between Edit and Engineering Print drawing modes from View, show compact drafting-style Engineering Label callouts for voltage, rating, load-flow, fault, transformer, motor, and bus data with dark-mode-safe contrast, show readiness scoring and generated/assumption/link badges in Edit mode, keep detailed drawing datablocks and result overlays off by default for a clean black-line drafting view, render optional compact or expanded drawing datablocks with collision-aware placement, keep labels readable with drawing-background halos, show compact issue badges and optional review/validation status badges instead of large validation overlays, color devices by study or arc-flash result when those overlays are selected, use a paper-style drawing canvas that remains legible in dark mode, use a search-first palette with frequent components and category filters, keep fixed-stroke library icons readable in dark mode, use a viewport-scaled two-pane properties modal with non-overlapping actions and normalized engineering field labels for component editing, auto-fit after sample, Auto-Build, dropped components, and cross-probe navigation, apply operating-state open/closed overrides to energized tracing, edit selected connection cable details inline, offer validation quick fixes for common link/cable/voltage issues, and provide direct handoff links to equipment, loads, cable schedule, raceways, routing, and TCC where applicable.
- **Cross-probing** is available from Equipment List, Load List, Cable Schedule, TCC, equipment evaluation, design coach recommendations, DRC findings, and one-line validation issues. Links resolve one-line components by component id, tag/ref, schedule links, cable tag, or connected cable endpoints so users can move from tabular data or study findings back to the drawing context.
- **Project Dashboard** surfaces a My Projects workspace, project-level next action, a guided workflow runner, missing-information prompts, step-specific blockers, direct fix links, schedule-ready/routing-ready health, pending studies, pending deliverables, and pending One-Line reconcile state. The My Projects workspace lists local and signed-in cloud projects, shows recent save timestamps and record counts where available, and provides direct Open, Delete, Create New Project, Open Existing Project, Save Current Project, and sample-project actions. The top Project menu mirrors create/save/load/dashboard actions and shows a sync badge for local, unsaved, saved, cloud-ready, or sync-failed status. The **Design Basis Wizard** captures project code basis, sizing defaults, routing defaults, study prerequisites, and approval rules; those settings drive Auto-Build assumptions, generated cable/raceway defaults, route-result review gates, and release-package reviewer checks. The dashboard also includes a **Code Compliance Matrix** for basis, equipment/load intake, one-line/cable readiness, routing, studies/protection, and deliverables. The **Assumptions / Review Gates** panel shows current code, sizing, routing, generated-record, route-result, and study-review assumptions; reviewable gates open a review form where users can save a reviewed or flagged decision with reviewer, date, and notes. After equipment and loads exist, **Auto-Build Workflow** can seed missing one-line components/connections, design-basis-driven cable rows, starter raceway records, raceway assignments, and initial route results from assigned raceway geometry without overwriting user-entered fields; generated rows carry their design-basis trace for later review and user adjustment.
- **Fill / Routing** now shows routing diagnostics for schedule-ready cables, routing-ready cables, coordinate-ready cables, invalid raceway references, geometry blockers, and handoff context on tray/conduit fill pages.
- **Deliverables** use saved route results from Optimal Route to expose pull-card groups, spool-sheet readiness, report-section readiness, design-basis review gate status, saved snapshots, and release-package status on the downstream pages.
- **Ductbank Route** includes a project-ductbank selector plus a next-action strip for conduit setup, cable assignment, fill calculation, thermal review, and calculation-report export.
- **Sample Gallery** includes visual thumbnail cards for the Project Workflow Core sample plus realistic commercial office, water treatment pump station, and EV charging depot samples. These projects exercise equipment, loads, one-line links, cable schedule rows, raceway geometry, route results, study data, report snapshots, and release packages.
- **TCC** can open directly from a one-line protective device, plot the selected device with its nearest upstream and downstream protective devices beside a matching one-line preview, keep additional selected references collapsed into a compact count above the graph, prioritize the graph before controls on narrow screens, show transformer inrush/damage, motor cold/hot starting, motor thermal, and cable damage reference metrics where project data is available below the graph, expose those equipment references on hover/focus/tap in a pinned side-panel detail, confirm estimated equipment assumptions from metric cards or pinned detail, toggle draggable chart callouts for device tags and selected settings with context/selected/all scope options, choose chart range presets for coordination, motor starting, transformer inrush, and fault-current review, export a full review package with the graph, one-line preview, metrics, and coordination results, and show a source-to-load one-line preview with label leaders for dense layouts.

## Deliverable Handoff Rules

Optimal Route writes the latest route output to the project store as `latestRouteResults`. Pull Cards, Spool Sheets, the Workflow Dashboard, and the Report Package Builder read that same project-level route output, so the user can move from routing to field deliverables without re-importing files.

The handoff stays explicit:

- Pull Cards can load the latest project route results or import a route workbook.
- Spool Sheets remain driven by Raceway Schedule tray geometry, with route-result counts shown as downstream context.
- Project Report shows route results, pull groups, spool counts, design-basis review gate status, report snapshots, and release packages before preview generation.
- Report exports, print/PDF output, snapshots, and dashboard release packages are blocked while required design-basis deliverable gates remain open.
- No deliverable page deletes or silently overwrites schedule records.
