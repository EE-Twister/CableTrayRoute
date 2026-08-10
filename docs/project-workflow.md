# Project Workflow

## Readiness tiers

The workflow uses four separate readiness signals:

- **Workflow completeness** tracks whether the required project records and handoffs exist.
- **Calculation readiness** tracks whether saved studies and route results are available.
- **Validation readiness** reports active Design Rule Check errors and warnings.
- **Issue readiness** requires complete deliverable fields and no blocking validation errors.

A complete data workflow is not automatically issue-ready. The Dashboard and Report Package Builder both expose blocking DRC errors and missing cable insulation or voltage-rating fields.

Home, the Workflow Dashboard, guided workflow strips, DRC, and the Report Package Builder derive their completion and next-action state from the same core workflow diagnostics. A saved route therefore advances routing consistently on each surface, and active DRC counts remain consistent when moving between them.

CableTrayRoute supports two project-scoped working modes:

- **Focused project:** Create a separate project for a one-off calculation or schedule, then use only the page needed for that work. Its inputs remain isolated from every other project.
- **Integrated project:** Follow the shared project path. Core equipment, panel, load, cable, and raceway records remain the same records regardless of which page edits them:

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

Each page remains usable as a focused calculator, table, diagram, or deliverable builder with its own direct entry, import, and export path, but all persisted inputs belong to the active project. Create a new project before entering one-off data; do not use a page-local copy inside an unrelated project. The shared status is driven by `src/workflowStatus.js`, so aliases such as Tray Fill, Conduit Fill, Ductbank, and Optimal Route report the same Fill / Routing readiness while preserving their specialized page tools. Page-specific panels can still show deeper diagnostics, but they should use the same status vocabulary: schedule-ready, routing-ready, route-results-ready, study-saved, and deliverable-ready.

The handoff-level inputs, outputs, readiness rules, and downstream consumers for every Workflow and Studies navigation page are generated in [Workflow and Studies Page Contracts](page-contracts.md) from `src/pageContracts.js`. The static contract-to-code comparison is generated in [Page Contract Code Audit](page-contract-audit.md) from `scripts/auditPageContracts.mjs`.

### Sample Workflow Context

Loading a gallery sample stores its guided checklist with the project. The active project identifier is carried through every checklist and workflow link so sample data cannot be replaced by the default project while navigating. A compact sample strip is integrated into the workflow navigator and provides Previous, Next, Checklist, and Exit actions without adding a second step bar. If a saved copy already exists, the gallery reopens it; **Create Fresh Copy** is an explicit separate action.

The Underground Ductbank sample follows the complete data path from Equipment and Loads through One-Line, Cable Schedule, Raceway Schedule, Ductbank Route, Conduit Fill, and IEC 60287. Ductbank Route exposes a project-ductbank selector so DB-01 and DB-02 can be reviewed in the same workspace. Conduit Fill opens the requested conduit with its assigned cable and also provides a selector for the other project conduits.

Opening a sample replaces cached conduit and ductbank schedule context with the sample's complete parent and child records. Zero-valued coordinates remain visible in the Raceway Schedule so valid origins are not mistaken for missing geometry.

Older Underground Ductbank sample copies are repaired in place: missing parent tags are recovered from the parent id or conduit ids, the known sample endpoints and encasement are restored when absent, and the one-line receives a one-time spaced layout plus an automatic fit-to-view. Transformer tags are offset below winding labels so the two text layers do not overlap.

## Shared Project Data Authority

Equipment, panel, load, and cable schedules are the canonical engineering records. The One-Line stores diagram layout, connectivity, and stable links to those records. Reading the One-Line hydrates linked components from the canonical schedules, so schedule edits appear without duplicate re-entry. Saving a valid or in-progress One-Line automatically creates missing canonical records and updates populated shared fields edited on the diagram.

Automatic synchronization matches stable entity or circuit IDs first and falls back to `ref`, `id`, or `tag` without treating letter case as a different identity. Canvas-only fields such as X/Y position, size, rotation, and ports never enter schedule records. Rows not represented on the diagram are preserved, and blank diagram projections do not erase populated engineering values.

Stable IDs remain unchanged when equipment, panel, load, or cable display tags are renamed. References in dependent loads, cable endpoints, and One-Line links update in the same project mutation, so a tag change does not require duplicate edits on other pages. Because these records are study inputs, relevant tag changes also make previously saved study provenance stale until the study is rerun.

Deleting a referenced canonical record does not silently cascade-delete dependent engineering records. Before deletion, Equipment List, Load List, Panel Schedule, and Cable Schedule show the affected load, cable-endpoint, and One-Line references and require explicit confirmation. Loads and cables remain available for review, affected One-Line links are detached and marked as orphaned, and the Dashboard **Data Links** metric reports the unresolved references. Its **Data Link Review** lists each affected record with a link to the appropriate remediation page. Resolve each diagnostic by relinking the dependent record or deliberately removing it; deletion is not treated as engineering approval to discard downstream data.

**Review Shared Data** remains available on the One-Line as an audit and legacy-link repair surface; it is not a required data-entry handoff. Engineering validation remains separate from persistence: saving incomplete diagram work keeps the shared project data current but does not make that data calculation-ready or approved.

## Current Core Workflow UX

- **Equipment List** now has a focused Add Equipment modal, starter records, summary cards, import mapping previews, and modal-based bulk updates for category, arrangement, and lineup.
- **Load List** shows grouped validation counts, equipment-tag source suggestions, and a next-action strip that continues to One-Line or Cable Schedule once loads are ready.
- **One-Line** defaults new palette devices to an upright vertical source-to-load orientation, places clicked components in a readable top-to-bottom stack, uses transparent ANSI/IEEE-style schematic symbols and bounds for sources, buses, protection, panels, UPS, motors, transformers, and study devices, aligns load and motor ports to their visible schematic terminals, supports click-to-connect from device bodies or visible ports, creates provisional cable metadata so drawing is not blocked by cable details, and keeps Properties, Validation, and History in the right-side inspector. The component palette opens on **All**; category filters and search narrow the full library, while a persistent **Favorites & Recent** strip keeps up to 12 pinned and 8 recently placed symbols one click away. **Repeat Last** repeats the most recent placement, rotate/flip, Auto Arrange, or Auto Space action; the **Shortcuts** control persists configurable bindings for those actions plus fit commands. While dragging, nearby equipment edges and centers offer blue alignment guides with a live ΔX/ΔY readout; the **Guides** Grid control preserves that preference. The page can now Auto-Build missing one-line components from Equipment and Load List records, Auto Arrange around horizontal buses with vertical drops and branch spacing, Auto Space Equipment rows to standard horizontal branch spacing, load a denser SKM/ETAP-style sample with direct bus-centerline taps, motor and capacitor branches, and compact Engineering Labels, switch between Edit and Engineering Print drawing modes from View, show compact drafting-style Engineering Label callouts for voltage, rating, load-flow, fault, transformer, motor, and bus data with dark-mode-safe contrast, show readiness scoring and generated/assumption/link badges in Edit mode, keep detailed drawing datablocks and result overlays off by default for a clean black-line drafting view, render optional compact or expanded drawing datablocks with collision-aware placement, keep labels readable with drawing-background halos, show compact issue badges and optional review/validation status badges instead of large validation overlays, color devices by study or arc-flash result when those overlays are selected, use a paper-style drawing canvas that remains legible in dark mode, keep fixed-stroke library icons readable in dark mode, use a viewport-scaled two-pane properties modal with non-overlapping actions and normalized engineering field labels for component editing, auto-fit after sample, Auto-Build, dropped components, and cross-probe navigation, apply operating-state open/closed overrides to energized tracing, edit selected connection cable details inline, offer validation quick fixes for common link/cable/voltage issues, and provide direct handoff links to equipment, loads, cable schedule, raceways, routing, and TCC where applicable.
- **Cross-probing** is available from the Equipment List row context menu, Load List, Cable Schedule, TCC, equipment evaluation, design coach recommendations, DRC findings, and one-line validation issues. Links resolve one-line components by component id, tag/ref, schedule links, cable tag, or connected cable endpoints so users can move from tabular data or study findings back to the drawing context.
- **Project Dashboard** defaults to a **Cable routing** focus that prioritizes incomplete cable fields, raceway assignments, missing endpoint coordinates, route-result gaps, tray-fill warnings, and routing export availability. A **Full engineering workflow** focus restores the guided workflow, studies, quality checks, design-basis review, and release-package controls. Deliverable-blocking design-basis gates remain visible in either focus and automatically reveal the Quality Checks disclosure once, while Auto-Build remains available whenever existing equipment and loads can create missing workflow records. Both views use the same live project diagnostics and saved route-result contract, so counts do not diverge between the dashboard and guided workflow. The My Projects workspace lists local and signed-in cloud projects, shows recent save timestamps and record counts where available, and provides direct Open, Delete, Create New Project, Open Existing Project, Save Current Project, and sample-project actions. The top Project menu mirrors create/save/load/dashboard actions and shows a sync badge for local, unsaved, saved, cloud-ready, or sync-failed status.
- **Fill / Routing** now shows routing diagnostics for schedule-ready cables, routing-ready cables, coordinate-ready cables, invalid raceway references, geometry blockers, and handoff context on tray/conduit fill pages. Tray Fill includes a project-tray selector that loads the selected tray dimensions, compartments, and assigned cable rows; a selected Optimal Route result hands its tray directly into the same loader.
- **Deliverables** use saved route results from Optimal Route to expose pull-card groups, spool-sheet readiness, report-section readiness, design-basis review gate status, saved snapshots, and release-package status on the downstream pages.
- **Study results** label saved Short Circuit output as current, stale, or unknown against the active project-input fingerprint. Each rerun retains a compact per-bus snapshot so the next run can show previous/current three-phase fault current and deltas.
- **Ductbank Route** includes a project-ductbank selector plus a next-action strip for conduit setup, cable assignment, fill calculation, thermal review, and calculation-report export.
- **Sample Gallery** includes visual thumbnail cards for the Project Workflow Core sample plus realistic commercial office, water treatment pump station, and EV charging depot samples. These projects exercise equipment, loads, one-line links, cable schedule rows, raceway geometry, route results, study data, report snapshots, and release packages. Sample copies report whether they were written to persistent browser storage; if storage is full or unavailable, the sample remains usable in the current tab and the user is told to export it before closing or reloading.
- **TCC** can open directly from a one-line protective device, plot the selected device with its nearest upstream and downstream protective devices beside a matching one-line preview, keep additional selected references collapsed into a compact count above the graph, prioritize the graph before controls on narrow screens, show transformer inrush/damage, motor cold/hot starting, motor thermal, and cable damage reference metrics where project data is available below the graph, expose those equipment references on hover/focus/tap in a pinned side-panel detail, confirm estimated equipment assumptions from metric cards or pinned detail, toggle draggable chart callouts for device tags and selected settings with context/selected/all scope options, choose chart range presets for coordination, motor starting, transformer inrush, and fault-current review, export a full review package with the graph, one-line preview, metrics, and coordination results, and show a source-to-load one-line preview with label leaders for dense layouts.

## Deliverable Handoff Rules

Optimal Route writes a normalized route-result contract to the project store as `latestRouteResults`, including the current project-input fingerprint. DRC, Home, Pull Cards, Spool Sheets, the Workflow Dashboard, guided workflow, and the Report Package Builder read that same project-level route output, so the user can move from routing through validation and field deliverables without re-importing files. Route results are filtered to the current cable and raceway records, and Optimal Route refuses to present results as current after inputs change. Legacy and sample route rows are normalized and structurally checked on read so cable names and raceway assignments are not lost or attributed to the wrong project.

The handoff stays explicit:

- Pull Cards can load the latest project route results or import a route workbook.
- Spool Sheets remain driven by Raceway Schedule tray geometry, with route-result counts shown as downstream context.
- Project Report shows route results, pull groups, spool counts, design-basis review gate status, report snapshots, and release packages before preview generation.
- Report exports, print/PDF output, snapshots, and dashboard release packages are visibly disabled while required workflow or design-basis deliverable gates remain open; the readiness panel links to the first blocker.
- No deliverable page deletes or silently overwrites schedule records.
