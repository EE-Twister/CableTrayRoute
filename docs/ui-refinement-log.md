# UI Refinement Log

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
- Added native-soil context, grade line, and an elevation-to-grade callout to the ductbank route drawing.

## 2026-05-11

- Improved form control consistency by standardizing control height, spacing, and focus-visible outlines for text/number inputs, selects, and textareas.
- Improved modal readability and action layout by adding description styling, spacing, responsive stacked actions on small screens, and stronger modal elevation.
- Improved keyboard accessibility by adding explicit focus-visible styling to modal close controls.
