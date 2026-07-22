# UI Refinement Log

## 2026-07-22

- Condensed Ductbank optional materials into persistent BOM table rows with an Include checkbox column and inline ground-wire run and allowance inputs; unchecked options remain visible for discovery but are omitted from exports and included-line totals.
- Removed cable and cable identification tags from the Ductbank BOM so conductor procurement remains governed by the cable schedule.
- Added customer-selectable Ductbank BOM options for one or two #4/0 bare copper grounding conductors, red warning dye application area, and excavation shoring wall area, including persisted selections, exported assumptions, and OSHA protective-system guidance.

## 2026-07-21

- Added an assumption-driven Ductbank Bill of Materials with route-length input, grouped conduit quantities, couplings, end fittings, spacers, pull rope, warning tape, concrete, excavation, bedding, backfill, editable allowances, scope exclusions, and a dedicated XLSX export.
- Corrected the Ductbank Route cable table so outside diameter, insulation thickness, and cable weight accept decimal measurements without triggering the browser's whole-number validation warning.
- Collapsed the Ductbank Route cable table by default while keeping cable and assignment counts plus Add Cable visible; drawing selections and validation targets automatically reopen the table when row-level editing is needed.

## 2026-07-18

- Modernized the Optimal Route graph into an interactive desktop review surface with isometric, plan, front, and right view presets; direct route, endpoint, and raceway selection; focused selection metrics; optional labels; utilization coloring; a compact semantic legend; and self-hosted full-screen and PNG output. Removed the per-cable Plotly legend and default labels that previously obscured dense route models.
- Reframed the graph's default presentation as a network-flow model: shared tray segments are consolidated into cable-density corridors, nearby endpoints are grouped into equipment nodes with floor stems, raceway geometry is visually exaggerated at facility scale, and detailed field jumps are opt-in while remaining visible for a selected cable.

## 2026-07-15

- Reordered the desktop DRC and Optimal Route workspaces around current results: DRC findings now precede options and methodology, while saved routes open in a dedicated review mode with routing setup available from an explicit toggle.
- Added Short Circuit input-freshness status and retained bus-by-bus run comparisons, including previous/current three-phase fault current and calculated deltas.
- Reduced Dashboard duplication to one exact primary next action, moved the full guided checklist behind an expandable section, and limited the blocker card to additional distinct blockers.
- Made generated Report Builder previews full-width on desktop while keeping configuration one tab away and export actions available in a sticky toolbar.
- Simplified Home to the active project, next action, readiness, and project workspace; the workflow path, examples, explanations, and full tool directory now live in one expandable reference section.
- Normalized saved routing output into one project contract for Optimal Route, DRC, Home, Dashboard, guided workflow, and report generation. Saved cable names, raceway assignments, segment geometry, modes, counts, and lengths now remain consistent across those surfaces.
- Made DRC evaluate the active project's saved route state immediately on open, including routes created by the guided sample, instead of initially presenting empty or stale routing findings.
- Aligned Home and Dashboard workflow completion, next-action, and DRC summaries around the same diagnostics and labeled the Home one-line graphic as an illustrative example rather than current project output.
- Replaced dense report DRC tables with readable finding cards, clarified report-content readiness copy, and added a compact mobile Generate/Print action bar while retaining print-safe output.
- Reworked narrow-screen workflow navigation into a step selector, converted the One-Line palette into a fixed bottom drawer, removed horizontal command-bar scrolling, and kept only actionable Auto-Build controls visible.
- Deduplicated One-Line utility-source palette entries, changed ambiguous validation labels to Diagram validation, and removed legacy default scenarios from the saved-project list unless they are explicit named projects.
- Persisted complete sample Short Circuit evidence, including calculated equipment results, input fingerprints, model counts, and impedance provenance, so saved results are useful before a rerun.

## 2026-07-14

- Restored saved Short Circuit and Optimal Route results directly into their review workspaces, including legacy study summaries, export state, saved timestamps, route tables, route summaries, and the 3D route model without requiring a recalculation.
- Split workflow completeness, design-rule validation, cable deliverable completeness, and issue readiness into explicit states on the Dashboard and Report Package Builder; active DRC errors now block issue/export readiness.
- Added mobile Configure/Preview tabs to Report Package Builder, replaced terminal-style assumptions with structured report content, and made report tables wrap within the paper/print width.
- Curated the One-Line palette to one canonical control per component, hid empty palette categories, and added collision-aware cable-label placement around components and other connection labels.
- Reordered Load List presets so defining fields appear first, added compact mobile load cards and action controls, clarified ductbank versus standalone conduit counts, and aligned cable/raceway handoff actions with Fill and Optimal Route.
- Made the 390 px One-Line workspace canvas reachable by compacting command surfaces, keeping the editor inside the remaining viewport, and collapsing the inspector by default on small screens.
- Rebuilt mobile navigation around a fixed page search, collapsible route groups, an independently scrolling route list, and utility actions that remain available at the bottom of the drawer.
- Unified report DRC routing with the canonical saved route-result format, including `batchResults`, and rendered summary-only short-circuit results as labeled values instead of fake bus rows.
- Constrained report previews to a paper-like width, contained wide tables inside the preview, excluded unavailable sections from presets, and added explicit section-selection actions.
- Simplified the dashboard into an overview-first surface by removing duplicate workflow/summary panels, hiding empty blocker cards, and collapsing quality, health, studies, and release-package detail.
- Replaced Load List's phantom empty editable row with a true guided empty state and added Core, Layout, Procurement, and Full Equipment List column views with Core as the default.
- Refined the Report Package Builder so preset labels remain visible in every theme, preview status distinguishes selected sections from sections with project content, preview generation focuses the rendered package, and table-of-contents numbering is not duplicated.
- Reordered Optimal Route results around the decision summary at normal desktop widths, made the summary sticky earlier, and clarified that the preferred conduit setting affects only new field routes.
- Reduced repeated workflow prompts by keeping Home's dynamic next action primary, moving Load List's downstream handoff after the working table, and collapsing project management on the dashboard until it is needed. Dashboard core-workflow completion is now explicitly distinct from optional study coverage.
- Made Sample Gallery discovery faster with collapsed introductory guidance, text search, popular tag filters, and an expandable full filter list.
- Consolidated the narrow-screen navigation into menu, project, and profile controls, moved command search and settings into the menu, and made the One-Line command surface wrap into a canvas-first small-screen workspace instead of overflowing horizontally.
- Corrected Project Report short-circuit field mapping so equipment tags and all calculated fault-current values render from the current study schema.
- Made report packages render every selected TOC entry as a populated, empty, or explicitly unavailable section, eliminating dead report anchors.
- Self-hosted Plotly and PapaParse with the build-managed vendor assets so Optimal Route works under the production Content Security Policy without external script access.
- Repaired the Project Workflow Core conduit geometry so rerunning its four cable routes produces four routed results.
- Kept One-Line and table presentation preferences outside canonical project data, removed write-on-read One-Line normalization, and stopped Raceway Schedule from autosaving on navigation without an edit.
- Restored the shared guided-workflow controls on Short Circuit through its bundled page entry.
- Removed decorative schedule preview bands, tightened short-height desktop spacing, and offset One-Line cable labels from their longest connection segment to reduce first-viewport crowding and diagram collisions.

## 2026-07-13

- Connected Short Circuit feeder paths to the canonical Cable Schedule. Cable tags and endpoints now resolve conductor size, material, raceway material, length, and parallel sets into NEC Table 9 impedance; missing or ambiguous inputs are surfaced instead of silently treated as ideal ties, and results include a readable source-to-fault impedance breakdown.
- Unified dashboard, guided workflow, and report-export readiness around the same core diagnostics. One-Line validation, pending reconciliation, duplicate or incomplete raceway parents, and routing gaps now prevent a false Ready state and block issue/export actions.
- Repaired the Project Workflow Core sample so all eight workflow stages are demonstrable: complete One-Line study attributes, unique nested conduit data, complete ductbank parent endpoints, reproducible routes, reviewed gates, and a clean eight-step checklist.
- Reworked Short Circuit and Arc Flash into project-connected review workspaces with active-project context, scope controls, result tables, input-quality signals, saved results, and explicit exports instead of automatic downloads.
- Corrected Short Circuit source recognition for One-Line `source / utility_source` components and added realistic source and transformer impedance to the flagship sample.
- Made study-page startup resilient to asynchronously loaded analysis modules so Arc Flash cannot miss initialization after `DOMContentLoaded`.
- Added application-wide display repair for legacy UTF-8/Windows-1252 mojibake, including dynamically inserted navigation and sample content, and normalized all imported sample payloads before persistence.
- Simplified sample selection to one clear Open Guided Sample action and made homepage onboarding opt-in from Reopen Onboarding.
- Made the legacy One-Line tour opt-in from its explicit **Tour** control so guided samples open directly on the working canvas.
- Refocused simple page headers into compact title bars so schedules, calculators, studies, and deliverable controls begin higher in the first viewport.
- Reduced decorative workspace-preview banners while retaining their page-family illustrations and supporting context.
- Converted load, cable, raceway, and ductbank readiness metrics into compact status chips and suppressed zero-value issue chips so primary tables and forms remain dominant.
- Corrected the empty Raceway Schedule status so a schedule with no raceway records no longer reports that it is ready for routing and export.

## 2026-05-15

- Refined the Cable Tray Fill page to match the schedule and raceway workspace patterns with a page visual overview, card-based sections, shared toolbars, and a responsive table viewport.
- Made the tray fill tour opt-in from the page actions instead of auto-starting on first visit.
- Improved cable table action and filter accessibility with named icon buttons and clearer table controls.
- Tightened the Cable Tray Fill data grid with structured column headers and moved the tray fill gauge into a compact status panel with current fill and limit metrics.
- Fixed Cable Tray Fill field help so column-header help icons show inline field guidance instead of opening the full documentation iframe.
- Modernized the Ductbank Route workflow with compact action bars, guided conduit and cable entry, readiness summaries, actionable warnings, CSV templates, filtered table counts, empty states, and an Auto Assign helper for unassigned cables.
- Polished Ductbank Route table accessibility with pressed filter states, keyboard-friendly sortable headers, live row-count updates, sticky first columns, row hover states, and generated labels for table fields and row actions.
- Added selectable Ductbank drawing cable markers with quick-property popovers, selected-cable highlighting, keyboard activation, and a shortcut back to the cable table row.
- Corrected Ductbank thermal estimates to use cable-specific temperature ratings, current-carrying conductor counts, equivalent conduit diameter in soil resistance, and burial-depth-aware finite solver boundaries.
- Added an overview-card ampacity-over list so over-limit cable estimates are visible without opening the full ampacity table.
- Split ductbank thermal and ampacity alerts into separate overview filters and scoped actionable warnings to the active filter.
- Added scaled native-soil context, a sky band above grade, and an elevation-to-grade callout to the ductbank route drawing.
- Reworked the Optimal Route page with opt-in page tour behavior, routing presets, readiness checks, clearer empty-state actions, result summary KPIs, route explanations, plot legend, row-to-model highlighting, before/after utilization, and grouped export/analysis/fill actions.
- Reframed the Optimal Route results into a model-first review workspace, moved source tables into a secondary Source Data panel, and replaced stacked route cards with a compact route list table with expandable segment details.
- Aligned the ductbank thermal heat map to the same scaled drawing origin as the ductbank, expanded surrounding soil by burial depth on each side, kept solver resolution independent of the visual earth/sky padding, and added an Earth/Sky Context toggle.
- Prevented incomplete ductbank heat-source rows from being treated as a 0 F source at the ductbank origin, removing the false cold spot at the upper-left of the heat map.
- Improved Fault Cable Bracing usability by making onboarding opt-in on that page, removing false invalid states from converted spacing inputs, and switching the primary action when users choose schedule evaluation.
- Added a Fault Cable Bracing calculation setup review, clearer single-result decision summary, and schedule result triage with OD-source badges, fallback warnings, and highest-required-strength sorting.
- Added lower-priority Fault Cable Bracing polish: common fault-current presets, keyboard arrow navigation for arrangement selection, copyable result summaries, and CSV export for schedule results.

## 2026-05-11

- Improved form control consistency by standardizing control height, spacing, and focus-visible outlines for text/number inputs, selects, and textareas.
- Improved modal readability and action layout by adding description styling, spacing, responsive stacked actions on small screens, and stronger modal elevation.
- Improved keyboard accessibility by adding explicit focus-visible styling to modal close controls.
