# Competitor Feature Gap Analysis

## Date: 2026-04-12 (advanced power systems & DER deep dive added 2026-04-11 / documented 2026-04-12; custom pricing book added 2026-04-11; one-line diagram & TCC deep dive added 2026-04-06; one-line diagram UI pass added 2026-04-05; all prior gaps resolved 2026-04-04; usability/calculation pass added 2026-03-24; original 2026-03-16)

This document identifies features commonly found in major competitor platforms that are currently missing from CableTrayRoute.

---

## Executive Summary

CableTrayRoute already offers a strong, integrated suite covering cable routing (3D Dijkstra pathfinding), electrical studies (load flow, short circuit, arc flash, harmonics, TCC, motor starting), one-line diagram editing, and comprehensive import/export. Comparison with major competitors — including manufacturer tools (Eaton B-Line, Legrand Cablofil, Panduit, OBO Bettermann, Niedax, Chalfant), power system analysis platforms (ETAP, EasyPower, SKM PowerTools), and dedicated raceway/cable management software (Bentley Raceway, Aeries CARS, MagiCAD, Trimble MEP, Paneldes) — originally revealed **20 feature gaps** across six categories.

**All 20 original gaps have been implemented.** The 4 gaps that previously required external infrastructure (native CAD plugins, live pricing databases) remain deferred pending commercial partnerships.

**The 2026-03-24 refresh of competitor products** (ETAP 2024/2025, EasyPower 2025, MagiCAD 2026, Eplan Platform 2025/2026, Revit 2026, Bentley Raceway 2024/2025, Paneldes 2025) revealed **10 additional feature gaps** across AI/ML interfaces, interoperability standards, field operations, and emerging infrastructure patterns. **All 10 have now been implemented** (AI/LLM Copilot, IFC Export, QR Code generation, REST API, Alert() replacement, navigation consistency, ordered-length procurement, parallel cable support, visual fill gauges, and workflow dashboard). The 4 infrastructure-dependent items (BIM plugins, live pricing) remain deferred.

A **second pass on 2026-03-24** examined the application through two additional lenses: **usability quality** and **calculation completeness**. **All identified usability gaps (Gaps #13–#22) and all calculation completeness gaps (Gaps #23–#33) have been implemented** as of 2026-04-04. See "Implemented Since 2026-03-24" for the full list.

A **2026-04-05 pass** focused specifically on the **one-line diagram editor UI**, benchmarked against ETAP 2024/2025, EasyPower 2025, SKM PowerTools, PowerWorld Simulator, and NEPLAN 360 (web-native). This revealed **14 new UI interaction gaps** (Gaps #34–#47). **All 14 have now been implemented.** See "One-Line Diagram UI Gaps (2026-04-05)" below.

A **2026-04-06 pass** performed a focused deep dive on **one-line diagram connectivity features** and the **TCC (Time-Current Curve) engine**, benchmarked against ETAP 2024/2025, EasyPower 2025, SKM PTW 9, PowerWorld Simulator 23, and DIgSILENT PowerFactory 2024. This revealed **10 new gaps** (Gaps #48–#57) across two areas: (1) multi-sheet diagramming and diagram annotation capabilities missing from the one-line editor and (2) advanced TCC curve types, arc flash integration, ground fault protection, and reporting absent from the coordination study tool. See "One-Line Diagram & TCC Deep Dive (2026-04-06)" below.

A **2026-04-11 pass — advanced power systems & DER analysis** performed a focused review of the `analysis/` module tree against the full study catalogs of **ETAP 2024/2025**, **EasyPower 2025**, **SKM PowerTools 9**, **DIgSILENT PowerFactory 2024**, **PSS/E**, **Siemens PSS SINCAL**, **CYME**, and domain-specific sizing calculators (**Schneider Ecodial**, **Caterpillar SpecSizer**, **Eaton Bussmann OSCAR**). The study catalogs were filtered to identify *core* AC/DC power systems analyses that are commonly expected in any modern engineering deliverable (protection, DC, DER, power quality, insulation coordination, economic dispatch). This revealed **13 new gaps** (**Gaps #58–#70**) across DC systems, battery/UPS sizing, renewable/DER integration, harmonic resonance, voltage stability, differential protection, insulation coordination, protection settings interoperability, IEC cable ampacity, voltage flicker, motor derating, quasi-dynamic time-series simulation, and economic optimization. **Gap #59 (Battery / UPS Sizing per IEEE 485) has been implemented 2026-04-12. Gap #58 (DC Short-Circuit & Arc Flash) has been implemented 2026-04-18. Gap #61 (PV/BESS/IBR Modeling) has been implemented 2026-04-18. Gap #62 (IEEE 1547-2018 DER Interconnection Study) has been implemented 2026-04-18. Gap #63 (Frequency Scan / Harmonic Resonance) has been implemented 2026-04-19. Gap #67 (Differential Protection 87B/87T/87G) has been implemented 2026-04-19. The remaining 4 (Gaps #64, #65, #70, and deferred items) are not yet implemented.** See "Advanced Power Systems & DER Deep Dive (2026-04-11)" below.

A separate **2026-04-11 extension** to the Cost Estimation module added **custom pricing book import/export** — closing the "user-configurable pricing" half of the live-pricing gap without requiring commercial licensing.

**Current status: 63 of 71 total identified gaps implemented. 1 deferred (BIM/CAD plugin). Live pricing gap extended with custom CSV pricing book. 7 newly identified and open (Gaps #63–#70 except #63, #66, #68, #69 which are implemented) — all represent advanced power systems studies not previously in the competitive feature set.**

---

## Implemented Since Initial Analysis

The following features were identified as gaps and have since been implemented:

| Feature | Module | UI Page | Tests |
|---|---|---|---|
| Support Span / Structural Load Calculator | `analysis/supportSpan.mjs` | `supportspan.html` | `tests/supportSpan.test.mjs` |
| Tray Hardware BOM / Take-Off | `analysis/trayHardware.mjs` | `trayhardwarebom.html` | `tests/trayHardware.test.mjs` |
| Cable Pull Cards / Construction Docs | `analysis/pullCards.mjs` | `pullcards.html` | `tests/pullCards.test.mjs` |
| Multi-Standard Cable Sizing (IEC/BS/AS) | `analysis/intlCableSize.mjs` | `intlCableSize.html` | `tests/intlCableSize.test.mjs` |
| Clash Detection | `analysis/clashDetect.mjs` | `clashdetect.html` | *(integration)* |
| Product Configurator | `analysis/productConfig.mjs` | `productconfig.html` | `tests/productConfig.test.mjs` |
| Submittal Package Generator | `src/submittal.js` | `submittal.html` | *(E2E)* |
| Seismic Bracing Analysis | `analysis/seismicBracing.mjs` | `seismicBracing.html` | `tests/seismicBracing.test.mjs` |
| Wind & Environmental Load Analysis | `analysis/windLoad.mjs` | `windload.html` | `tests/windLoad.test.mjs` |
| SmartDesign Auto-Sizing | `analysis/autoSize.mjs` | `autosize.html` | `tests/autoSize.test.mjs` |
| Prefabrication / Spool Sheet Output | `analysis/spoolSheets.mjs` | `spoolsheets.html` | *(integration)* |
| Transient Stability Analysis | `analysis/transientStability.mjs` | `transientstability.html` | `tests/transientStability.test.mjs` |
| Ground Grid / Grounding Analysis | `analysis/groundGrid.mjs` | `groundgrid.html` | `tests/groundGrid.test.mjs` |
| Magnetic Field Exposure Analysis (EMF) | `analysis/emf.mjs` | `emf.html` | `tests/emf.test.mjs` |
| Reliability / N-1 Analysis | `analysis/reliability.js` | `reliability.html` | `tests/reliabilityAnalysis.test.mjs` |
| Cost Estimation | `analysis/costEstimate.mjs` | `costestimate.html` | `tests/costEstimate.test.mjs` |
| Real-Time Multi-User Collaboration | `src/collaborationServer.mjs`, `src/collabManager.js` | *(all pages via presence bar)* | `tests/collaboration.test.mjs`, `tests/collaborationServer.test.mjs` |
| Voltage Drop Compliance Study | `analysis/voltageDropStudy.mjs` | `voltagedropstudy.html` | `tests/voltageDropStudy.test.mjs` |
| AI/LLM Copilot (Natural Language Queries) | `src/copilot.js`, `/api/copilot` in `server.mjs` | All pages (floating panel) | `tests/copilot.test.mjs` |
| QR Code Tag Generation for Field Access | `analysis/pullCards.mjs`, `analysis/trayHardware.mjs` | `pullcards.html`, `trayhardwarebom.html` | `tests/pullCards.test.mjs` |
| Open REST API / Scripting Interface | `server.mjs` (`/api/v1/` routes) | *(API)* | `tests/api.test.mjs` |
| IFC 4.x Export | `src/exporters/ifc4.mjs` | *(export action)* | — |
| Asymmetric Fault Types (SLG, L-L, DLG) | `analysis/shortCircuit.mjs` | `shortcircuit.html` | `tests/shortCircuit.test.mjs` |
| Alert() Replacement with Modal Dialogs | `src/components/modal.js` (applied app-wide) | All pages | — |
| Navigation Consistency on Static Pages | `src/components/navigation.js` (injected on all pages) | `index.html`, `help.html`, `404.html`, `500.html` | — |
| VFD / Soft Starter Motor Starting Models | `analysis/motorStart.js` | `motorstart.html` | — |
| Cloud-Synchronized Component Library (#12) | `server.mjs` — `CloudLibraryStore`, `LibraryShareStore`; `/api/v1/library` endpoints | `library.html` (sync badge, cloud save/load/share) | `tests/cloudLibrary.test.mjs` |

---

## Implemented Since 2026-03-24 Analysis

The following features were implemented after the 2026-03-24 competitor refresh — closing all remaining feasible gaps. The document was updated to reflect these on 2026-04-04.

| Feature | Module | UI Page | Tests |
|---|---|---|---|
| Ordered-Length Cable Procurement (#9) | `analysis/cableProcurement.mjs` | `spoolsheets.html` (Procurement tab) | `tests/cableProcurement.test.mjs` |
| Parallel Cable / Multi-Core Runs (#11) | `analysis/designRuleChecker.mjs` (DRC-07), `analysis/pullCards.mjs` | `cableschedule.html` | `tests/parallelCables.test.mjs` |
| Contextual "How to Fix" in DRC (#14) | `analysis/designRuleChecker.mjs` — `remediation` field | `designrulechecker.html` | — |
| Visual Fill Gauges / Heat-Map (#15) | `src/components/fillGauge.js`, `cabletrayfill.js`, `conduitfill.js` | `cabletrayfill.html`, `conduitfill.html` | — |
| Configuration Profiles / Templates (#16) | `src/projectTemplates.js`, `src/projectManager.js` | New-project flow | — |
| Scenario Comparison UI (#17) | `src/scenarioComparison.js`, `src/styles/scenarioComparison.css` | `scenarios.html` | — |
| Workflow Progress Dashboard (#20) | `workflowdashboard.html`, `dist/workflowdashboard.js` | `workflowdashboard.html` | — |
| Auto-Sizing NEC Derating (#23) | `analysis/autoSize.mjs` — `ambientTempFactor()`, `bundlingFactor()`, `trayFillFactor()` | `autosize.html` | `tests/autoSize.test.mjs` |
| Auto-Sizing Cu/Al Cost Optimization (#24) | `analysis/autoSize.mjs` — `minimizeCostConductors()`, `evaluateConductorOption()` | `autosize.html` | `tests/autoSize.test.mjs` |
| Pull Tension Stiffness Model (#25) | `src/pullCalc.js` — temperature friction, bending stiffness, static friction | *(pull calc UI)* | — |
| Unbalanced Per-Phase Harmonics (#27) | `analysis/harmonics.js` — `runHarmonicsUnbalanced()` | `harmonics.html` | `tests/harmonics.test.mjs` |
| TCC Auto-Coordination Algorithm (#29) | `analysis/tccAutoCoord.mjs` — `greedyCoordinate()` | `tcc.html` | `tests/tccAutoCoord.test.mjs` |
| Post-Contingency Transient Stability (#32) | `analysis/contingency.mjs` + `analysis/transientStability.mjs` | `contingency.html` | `tests/contingency.test.mjs` |
| IntlCableSize Warning on Skipped Sizes (#33) | `analysis/intlCableSize.mjs` — `skippedSizes[]` array | `intlCableSize.html` | `tests/intlCableSize.test.mjs` |
| Combined Seismic + Wind Load (#31) | `analysis/structuralLoadCombinations.mjs` | `seismicwindcombined.html` | `tests/structuralLoadCombinations.test.mjs` |
| Engineer Approval Workflow (#19) | `src/components/studyApproval.js`, cable `engineer_note`/`review_status`, DRC accept-risk | All study pages, `cableschedule.html`, `designrulechecker.html` | `tests/studyApproval.test.mjs` |
| Mobile Field Access (#21) | `fieldview.html` | `fieldview.html` | — |

---

## Implemented Since 2026-04-06 Analysis (Cloud Library)

| # | Feature | Module | UI Element | Tests |
|---|---|---|---|---|
| 12 | Cloud-Synchronized Component Library | `server.mjs` — `CloudLibraryStore`, `LibraryShareStore`; 6 REST endpoints under `/api/v1/library` | `library.html` — sync badge, Save/Load/Share to Cloud buttons; auto-sync on save; `?share=` URL param for direct link access | `tests/cloudLibrary.test.mjs` |
| 13 | CTI Tabular Coordination Report (#56) | `reports/coordinationReport.mjs` — `buildCTIRows(deviceEntries, coordResult, faultCurrentA, margin)` + `CTI_HEADERS`; uses `interpolateTime()` from `tccAutoCoord.mjs`; 5 standard test-current levels per adjacent device pair | `tcc.html` — "Export CTI Report" button (shown after Auto-Coordinate); downloads `coordination-cti-report.csv` via `downloadCSV()` from `reports/reporting.mjs` | `tests/tcc/ctiReport.test.mjs` |
| 14 | Ground Fault Protection Curves (#55) | `data/protectiveDevices.json` — 5 GFP entries (`gfp_ni/vi/ei/zs/parametric_relay`) with `groundFault: true`, `iec60255: true`, `sensorType`, `nec230_95: true`; `analysis/tccAutoCoord.mjs` — `greedyCoordinateGFP()`; `analysis/tcc.js` — `groundFault` view option, `GFP_COLOR_PALETTE`, `buildGFPLibraryEntries()`, dashed purple curve rendering, GFP auto-coordination dispatch | `tcc.html` — "Ground Fault Plane" in Views panel; "Ground Fault Relays (GFP)" device group; dashed purple curves on chart | `tests/tcc/groundFaultProtection.test.mjs` |

---

## Implemented Since 2026-04-05 Analysis (One-Line Diagram UI)

The following features were identified by benchmarking the one-line diagram editor specifically against dedicated SLD tools (ETAP, EasyPower, SKM PowerTools, PowerWorld Simulator, NEPLAN 360). All 14 gaps were implemented as of 2026-04-05.

| # | Feature | Module | UI Element | Tests |
|---|---|---|---|---|
| 34 | Rubber-band / marquee selection | `oneline.js` — `finalizeMarqueeSelection()` | Existing (confirmed implemented) | `tests/onelineUIFeatures.test.mjs` |
| 35 | Snap-to-bus auto-connection on drop | `oneline.js` — `autoAttachComponent()` | Drop on canvas (already implemented; enhanced) | — |
| 36 | Energized / de-energized operating-state display | `oneline.js` — `computeEnergizedSet()`, `renderEnergizedState()` | View toolbar `#toggle-energized` | `tests/onelineUIFeatures.test.mjs` |
| 37 | IEC 60617 / ANSI-IEEE symbol standard toggle | `oneline.js` — `symbolStandard` state; `componentLibrary.json` `iconIEC` fields; `icons/components/iec/` | Settings `#symbol-standard-select` | — |
| 38 | Title block template system | `oneline.js` — `renderTitleBlock()`, `titleBlockFields` | `#title-block-btn`, `#title-block-show-toggle` | — |
| 39 | Minimap / overview navigator | `oneline.js` — `renderMinimap()`, `minimapVisible` | View toolbar `#minimap-toggle`; `#minimap-container` in HTML | `tests/onelineUIFeatures.test.mjs` |
| 40 | Component grouping / ungrouping | `oneline.js` — `groupSelection()`, `ungroupComponent()` | Context menu "Group Selection" / "Ungroup" | `tests/onelineUIFeatures.test.mjs` |
| 41 | Lock / unlock components (UI-exposed) | `oneline.js` — `toggleLock()`; lock guard in drag/delete/keyboard Delete | Context menu "Lock / Unlock"; padlock indicator in render | `tests/onelineUIFeatures.test.mjs` |
| 42 | Zoom to selection (Shift+F) | `oneline.js` — `zoomToSelection()` | `#zoom-fit-selection-btn`; `Shift+F` keyboard | `tests/onelineUIFeatures.test.mjs` |
| 43 | Select Connected (topology flood-fill) | `oneline.js` — `selectConnected()` | Context menu "Select Connected" | `tests/onelineUIFeatures.test.mjs` |
| 44 | Select by Type | `oneline.js` — `selectByType()` | Context menu "Select All of This Type" | `tests/onelineUIFeatures.test.mjs` |
| 45 | Animated power-flow indicators | `oneline.js` — `renderFlowAnimations()`; SVG `<animateMotion>` | Active when Load Flow overlays are shown | — |
| 46 | Customizable per-type datablocks | `oneline.js` — `openDatablocksModal()`, `diagramDatablockConfig` | Views button → per-type field checkbox grid | — |
| 47 | Orthogonal (Manhattan) connection routing toggle | `oneline.js` — `orthogonalRouting` state; Grid toolbar toggle | `#orthogonal-routing-toggle` | — |

---



## One-Line Diagram Daily UX Quick Wins (2026-04-15)

For day-to-day drafting speed (especially for power users coming from ETAP/EasyPower/SKM), the one-line editor already covers many baseline items (right-click edit/rename/duplicate/rotate/lock, select connected, select by type, grouping, zoom-to-fit, grid snap, layers, minimap). The following **simple** additions are still common in competitor tools and would likely provide immediate productivity gains:

1. **Right-click align/distribute commands** (not only toolbar buttons)
   - Why it matters: users keep their cursor on the canvas and avoid toolbar travel.
   - Typical actions: Align Left/Right/Top/Bottom, Distribute Horizontal/Vertical.

2. **Bring to Front / Send to Back (z-order) in context menu**
   - Why it matters: annotation bubbles, zone blocks, and crossing symbols are faster to manage when stacking order is one click away.

3. **Connection waypoint handles + “Add elbow here” command**
   - Why it matters: manual cleanup of dense drawings is faster than opening full connection edit dialogs.

4. **Repeat last command (hotkey) and configurable keyboard shortcuts**
   - Why it matters: repetitive layout work (duplicate, rotate, align) is significantly faster with remembered commands.

5. **Quick-add via right-click on canvas**
   - Why it matters: “Add breaker here / Add transformer here / Add text note here” mirrors CAD-like workflows and reduces palette switching.

6. **Nudge with grid-aware step sizes**
   - Why it matters: arrow keys with Shift/Ctrl step multipliers are heavily used for precise final placement.

7. **Lock position vs lock properties (separate lock modes)**
   - Why it matters: reviewers often want to freeze geometry but still permit metadata edits.

8. **Recent symbols / favorites strip**
   - Why it matters: cuts repeated search/scroll in larger symbol libraries.

9. **Inline label editing on double-click (for all symbol types)**
   - Why it matters: avoids modal friction during annotation-heavy sessions.

10. **Persistent snapping aids (guides + distance readout)**
    - Why it matters: users can align against nearby objects without toggling full grid modes.

### Suggested priority (highest everyday impact)

- **P1:** Context-menu align/distribute, z-order actions, nudge step controls.
- **P2:** Quick-add canvas menu, inline label editing coverage, repeat-last command.
- **P3:** Favorites/recent symbols, advanced waypoint elbow editing, guide/readout polish.

## One-Line Diagram & TCC Deep Dive (2026-04-06 Pass)

Benchmarked against: **ETAP 2024/2025** (composite networks, protection zone overlays, arc flash label generation), **EasyPower 2025** (multi-sheet cross-references, arc flash boundary on TCC, CTI reports), **SKM PTW 9** (layer management, IEC relay curve library, SVG chart export), **PowerWorld Simulator 23** (animated geographic one-line, GIS background), and **DIgSILENT PowerFactory 2024** (IEC 60255 formula curves, ground fault protection TCC, flexible study result annotations).

---

### Gap #48 – Cross-Sheet Off-Page Connectors

| Missing Feature | Competitor(s) | Description |
|---|---|---|
| **Off-page / cross-sheet reference connector symbols** | ETAP, EasyPower, SKM PTW, DIgSILENT PowerFactory | All professional SLD tools support "off-page connector" or "inter-sheet link" symbols: a flag-shaped terminal that marks where a bus or feeder continues on another sheet, displaying the target sheet number and bus name. When clicked, the diagram navigates to the matching connector on the referenced sheet. Without this, any diagram requiring more than one sheet must represent complete isolated subsystems — cross-area feeders, transformer secondaries feeding loads on a different sheet, or utility tie connections cannot be cleanly represented across sheets. CableTrayRoute already has multi-sheet support (`sheets[]`, sheet tabs, `addSheet()`) but has no cross-sheet connector symbol type in `componentLibrary.json`. |

**Status:** ✅ **Implemented 2026-04-10.** The pre-existing `link_source` (Sheet Link Out) and `link_target` (Sheet Link In) stubs in `componentLibrary.json` are now fully functional. Both props were normalized to a single `linked_sheet` key (replacing the asymmetric `target_sheet`/`from_sheet`). `oneline.js` gains four pure helper functions — `resolveLinkedSheetIndex()`, `findPairedConnector()`, `validateSheetLinks()`, `getSheetLinkBadgeText()` — and a `navigateToLinkedSheet()` action function. Double-clicking any sheet link connector calls `loadSheet()` to switch sheets and then selects and pulse-highlights the paired connector via the `findHighlightId` mechanism for 3 seconds. A blue arrow badge (`→ Sheet 2` / `← Sheet 1`) renders below the connector icon via the `sheet-link-badge` SVG text element. Both `dblclick` listeners in `render()` (on the `<g>` and the inner `<image>`) dispatch to navigation for sheet_link types. `validateDiagram()` checks `link_id` presence, `linked_sheet` presence, and cross-sheet pairing; sheet links are excluded from the "Unconnected component" warning. `DIAGRAM_VERSION` bumped from `3` to `4`; the `migrateDiagram()` v4 block renames legacy `target_sheet`/`from_sheet` props. Tests: `tests/onelineOffPageConnectors.test.mjs` (17 assertions). Docs: `docs/off-page-connectors.md`.

---

### Gap #49 – Arc Flash Warning Label Generation on One-Line

| Implemented Feature | Competitor(s) | Description |
|---|---|---|
| **NFPA 70E–compliant arc flash label overlay on diagram** | ETAP 2024/2025 (arc flash label printing from one-line), EasyPower 2025 (arc flash annotation blocks) | After running the arc flash study, ETAP and EasyPower generate NFPA 70E–compliant warning label text blocks directly on the one-line at each analyzed bus: incident energy (cal/cm²), PPE category, arc flash boundary (mm), working distance, and glove class. These can be printed as stand-alone label sheets for field installation on switchgear. CableTrayRoute already stores arc flash results per component (`arcFlash.incidentEnergy`, `arcFlash.boundary`, `arcFlash.ppeCategory`, `arcFlash.clearingTime`) and exposes them in datablocks and the study approval panel, but has no dedicated arc flash label layout mode that formats NFPA 70E–standard warning label geometry for printing. |

**Status:** ✅ **Implemented 2026-04-07.** Two complementary deliverables:

1. **Print Label Sheet** — `reports/arcFlashReport.mjs` exports `buildLabelSheetHtml(results, projectName)` which generates a complete print-ready HTML document with all NFPA 70E labels arranged in a 2-column × 6 in × 4 in grid (landscape, ½ in margins). `openLabelPrintWindow(results)` opens the sheet in a new browser window with a "Print All Labels" button. The "Print Labels" button in `oneline.html` Studies panel becomes enabled after each arc flash run and calls `openLabelPrintWindow(getStudies().arcFlash)`.

2. **One-Line Diagram Overlay** — `renderArcFlashLabelOverlays(svg)` in `oneline.js` renders compact signal-color SVG badge overlays above each analyzed bus component: colored banner (orange WARNING / red DANGER per ANSI Z535), PPE category, and incident energy. Controlled by the "Show Label Overlays" checkbox in the Studies panel (`#toggle-arcflash-label-mode`); state held in `arcFlashLabelMode` flag, re-rendered on each `render()` call when active.

Signal word thresholds per ANSI Z535: **DANGER** (≥ 40 cal/cm², `#d32f2f`) / **WARNING** (< 40 cal/cm², `#f57c00`). Label template at `reports/labels.mjs` (`generateArcFlashLabel()`); customisable via `reports/templates/arcflashLabel.svg`. Tests: `tests/arcFlashLabels.test.mjs` (17 assertions covering signal word selection, color mapping, voltage formatting, HTML structure, template token substitution). Docs: `docs/arc-flash-labels.md`.

---

### Gap #50 – Protection / Coordination Zone Overlay

| Missing Feature | Competitor(s) | Description |
|---|---|---|
| **Color-coded protection zone regions on the one-line** | ETAP 2024/2025 (protection zone coloring), SKM PTW 9 (zone overlay), DIgSILENT PowerFactory (protection group shading) | Professional SLD tools allow engineers to define protection zones — each bounded by its upstream and downstream protective devices — and render each zone as a translucent colored region on the one-line. This makes it immediately clear which devices form a coordination group and which equipment falls within each protection zone. It is especially valuable for large diagrams with multiple voltage levels, where verifying selectivity by inspection is difficult. CableTrayRoute has no concept of protection zones in `oneline.js`; there is topology-based energized-state coloring (Gap #36, implemented) but no user-defined protection zone grouping or shading overlay. |

**Status:** ✅ **Implemented 2026-04-11.** `oneline.js` `renderProtectionZones()` + zone management functions (`createProtectionZone()`, `deleteProtectionZone()`, `renameProtectionZone()`, `setZoneVisibility()`, `setZoneColor()`, `toggleComponentInZone()`) + panel renderer `renderProtectionZonesPanel()`. Zone data persisted as `sheet.protectionZones[]` in `dataStore.mjs`. Toolbar "Zones" toggle checkbox (`#toggle-protection-zones`) + "Zones" sidebar panel button open `#protection-zones-panel`. Canvas click is intercepted when `activeZoneId` is set (assignment mode) to toggle component membership. Overlays rendered as translucent SVG `<rect>` elements with dashed borders, inserted before connections for correct Z-order. Zone name labels rendered above each rect. Tests: `tests/onelineProtectionZones.test.mjs`. Documentation: `docs/protection-zones.md`.

---

### Gap #51 – Named Layer Management

| Implemented Feature | Competitor(s) | Description |
|---|---|---|
| **Named show/hide diagram layers** | ETAP, EasyPower, SKM PTW, NEPLAN 360 | All major SLD editors support a layer system: named layers (e.g., "Protection Devices", "Loads", "Generation", "Annotations", "Voltage Labels") each with independent visibility and lock state. Toggling a layer hides all its member components without deleting them, allowing engineers to produce clean presentation diagrams (loads hidden, only protection shown) from the same single-line model. |

**Status:** ✅ **Implemented 2026-04-06.** `oneline.js` `createLayer()` / `deleteLayer()` / `renameLayer()` / `setLayerVisibility()` / `setLayerLocked()` / `assignSelectedToLayer()` / `renderLayerPanel()`. A `layers` array is persisted per sheet in `dataStore.mjs`; each component gains an optional `layer` string property. Components on hidden layers are excluded from `render()`; components on locked layers have pointer-events disabled. The Layers panel sidebar (`#layers-panel`) is toggled via a toolbar button. Layer state is snapshot in undo/redo history. Tests: `tests/onelineLayerManagement.test.mjs`. Documentation: `docs/layer-management.md`.

---

### Gap #52 – Background Image / Site Plan Underlay

| Missing Feature | Competitor(s) | Description |
|---|---|---|
| **Raster image import as diagram background** | PowerWorld Simulator 23 (GIS geographic background), ETAP (site plan underlay for plant one-lines), EasyPower (background image import) | Importing a JPEG/PNG floor plan, site map, or geographic raster image as a diagram background layer lets engineers verify that the electrical diagram's equipment positions correspond to physical locations. This is common in industrial plant diagrams (overlay on building floor plan) and utility distribution planning (overlay on aerial map). CableTrayRoute's canvas is a plain SVG with no background import capability. |

**Status:** ✅ Implemented 2026-04-11. `oneline.js` gains `uploadBackground(file)`, `clearBackground()`, and `renderBgPanel()` functions. A hidden `<input type="file">` is triggered by the **Background** toolbar button (View group). The selected image is read as a base64 data URI via `FileReader` and stored in `sheets[activeSheet].backgroundImage = { url, opacity: 0.4, visible: true }`. `render()` creates an `<image id="bg-underlay">` element inserted after `<rect id="grid-bg">` so it renders above the grid but below all components. `applyDiagramZoom()` sizes the underlay to the full viewport (`x/y/width/height` matching the grid background). A sidebar panel (`#bg-image-panel`) provides an opacity slider (0–100), Hide/Show toggle, and Remove Image button. Each diagram sheet stores its own independent `backgroundImage`. The field round-trips through `save()`, `getOneLine()` (dataStore.mjs), and `importDiagram()` automatically. JPEG, PNG, GIF, and SVG files are supported. Tests: `tests/onelineBackgroundImage.test.mjs` (20 tests). Docs: `docs/background-image-underlay.md`.

---

### Gap #53 – IEC 60255 Formula-Based Relay Curve Family

| Missing Feature | Competitor(s) | Description |
|---|---|---|
| **Mathematical IEC inverse-time relay curves (NI / VI / EI / LTI)** | ETAP, EasyPower, SKM PTW, DIgSILENT PowerFactory | IEC 60255-151 defines four standard inverse-time relay curve families computed from the formula **t = TMS × k / [(I/Is)^α − 1]**: Normal Inverse (k = 0.14, α = 0.02), Very Inverse (k = 13.5, α = 1), Extremely Inverse (k = 80, α = 2), and Long-Time Inverse (k = 120, α = 1). These are the dominant relay characteristic types used in IEC-jurisdiction utilities and international projects. All professional TCC tools generate these curves parametrically from user-entered Time Multiplier Setting (TMS) and pickup current (Is). CableTrayRoute's `analysis/tcc.js` device library uses only sampled point-based curves; it contains no IEC 60255 curve formula engine and no TMS/Is parameter inputs for IEC relay types. This is a critical gap for any coordination study in a non-ANSI jurisdiction. |

**Status:** ✅ Implemented 2026-04-06; extended 2026-04-07. `analysis/iecRelayCurves.mjs` exports `computeIecCurvePoints(familyKey, tms, pickupAmps)` which generates 80 log-spaced `{current, time}` points from the IEC 60255-151 formula for all four curve families (NI, VI, EI, LTI). `analysis/tccUtils.js` `scaleCurve()` detects `device.iec60255 === true` and generates the curve directly from the formula (with ±5% Class E1 tolerance bands) instead of scaling point arrays. **curveFamily override** added 2026-04-07: `scaleCurve()` now reads `firstDefined(overrides.curveFamily, device.curveFamily)`, allowing the active curve family to be changed via the settings panel without adding a new device; `settings.curveFamily` is reflected in the returned object. Five device entries in `data/protectiveDevices.json`: four fixed-family entries (`iec_ni_relay`, `iec_vi_relay`, `iec_ei_relay`, `iec_lti_relay`) plus a new unified **`iec_parametric_relay`** with `curveFamily` in `settingOptions` (NI/VI/EI/LTI dropdown), TMS range 0.05–2.0, and Pickup 50–1600 A. `analysis/tcc.js` `formatSettingLabel()` maps `curveFamily` → `'Curve Family (IEC 60255-151)'`. The TCC settings panel renders all three dropdowns (Curve Family, TMS, Pickup) automatically via the existing field-iteration loop. `analysis/tccAutoCoord.mjs` `findCoordinatingTimeDial()` and `greedyCoordinate()` pass `tms` (not `time`) as the dial override key for IEC devices, enabling Auto-Coordinate to find the minimum TMS for selective coordination. Tests in `tests/tcc/iecRelayCurves.test.mjs` cover formula accuracy, monotonicity, TMS linearity, tolerance bands, `scaleCurve` integration, and curveFamily override (all four families, combined TMS/pickup/family override). Docs: `docs/iec-relay-curves.md`.

---

### Gap #54 – Arc Flash Incident Energy Overlay on TCC Chart

| Missing Feature | Competitor(s) | Description |
|---|---|---|
| **Cal/cm² incident energy curve overlaid on TCC log-log chart** | ETAP 2024/2025, EasyPower 2025 | After running an arc flash study, ETAP and EasyPower overlay a "constant incident energy" curve on the TCC chart. This curve shows, for a given fault current, the maximum allowable clearing time to remain below a target incident energy threshold (e.g., 8 cal/cm² for PPE Category 2 or 40 cal/cm² for PPE Category 4). Engineers can visually verify that the upstream protective device's TCC is entirely to the left of / below the incident energy limit curve — if any part of the device curve intersects or exceeds it, an arc flash hazard exists at that current level. This is one of the most actionable displays in a coordination study. CableTrayRoute's `analysis/tcc.js` has no arc flash overlay; `analysis/arcFlash.mjs` results (incident energy, clearing time) are not surfaced on the TCC chart in any form. |

**Status:** ✅ **Implemented 2026-04-06.** `analysis/arcFlash.mjs` exports `incidentEnergyLimitCurve(params, thresholdCalCm2, currentRangeKA)` which inverts the IEEE 1584-2018 incident energy formula to produce a `{ current, time }` point array for any cal/cm² threshold. In `analysis/tcc.js`, a new `'arcFlashOverlay'` view option (added to `TCC_VIEW_OPTIONS`) reads `studies.arcFlash` via `getStudies()`, sweeps 200 log-spaced current points across the chart domain, calls `incidentEnergyLimitCurve()`, and pushes an `'arcFlashLimit'` overlay entry that is rendered as a red dashed path (`stroke-dasharray: 10,5`, stroke-width 2.5) with a matching legend entry. After each `plot()` call, the `#arc-flash-overlay-controls` selector in `tcc.html` is shown only when arc flash results exist; the dropdown offers 8 / 25 / 40 cal/cm² thresholds (PPE Cat 2–4) and re-renders on change. Tests: `tests/tcc/arcFlashOverlay.test.mjs` (19 assertions covering return shape, monotonicity, threshold scaling, enclosure effect, edge cases, and IEEE 1584 spot-checks).

---

### Gap #55 – Ground Fault / Residual Overcurrent Protection Curves

| Missing Feature | Competitor(s) | Description |
|---|---|---|
| **Separate TCC for ground fault relays (residual and zero-sequence)** | ETAP, EasyPower, SKM PTW | Phase overcurrent coordination (A-, B-, C-phase) is the primary TCC use case, but ground fault protection is equally mandatory: NEC 230.95 requires ground fault protection on service equipment ≥ 1000 A at 150 V–600 V line-to-ground; OSHA 29 CFR 1910.304 mandates GFP on solidly-grounded systems. Ground fault relays (residual overcurrent = Ia+Ib+Ic or zero-sequence CT) have their own time-current characteristics and must coordinate with downstream ground fault devices. Professional TCC tools plot residual and zero-sequence relay curves as a separate "ground fault plane" alongside the phase curves. CableTrayRoute's `PROTECTIVE_TYPES` set includes `'relay'` and `'breaker'`, but there is no ground fault relay curve type, no GFP element property on breaker/relay components, and no separate ground-fault TCC plot mode. |

**Status:** ✅ Implemented 2026-04-11. Five IEC 60255-151 GFP relay entries (`gfp_ni_relay`, `gfp_vi_relay`, `gfp_ei_relay`, `gfp_zs_relay`, `gfp_parametric_relay`) added to `data/protectiveDevices.json` with `groundFault: true`, `iec60255: true`, `sensorType` (`residual` or `zero_sequence`), and `nec230_95: true` compliance flag. The IEC formula engine in `analysis/iecRelayCurves.mjs` and `scaleCurve()` in `analysis/tccUtils.js` required no changes — the existing IEC branch handles GFP devices generically. A new `greedyCoordinateGFP()` function was exported from `analysis/tccAutoCoord.mjs` to coordinate GFP device chains independently of phase devices. In `analysis/tcc.js`: added a `groundFault` entry to `TCC_VIEW_OPTIONS`; added `GFP_COLOR_PALETTE` (purple `#7c3aed` family); added `buildGFPLibraryEntries()` and a separate "Ground Fault Relays (GFP)" catalog group; GFP curves render as dashed purple lines (`stroke-dasharray: 8,4`); `autoCoordinate()` dispatches phase and GFP entries to their respective coordination functions. Tests in `tests/tcc/groundFaultProtection.test.mjs` cover 27 assertions across device library schema, curve generation, coordination, and NEC 230.95 metadata. Documentation: `docs/ground-fault-protection.md`.

---

### Gap #56 – Coordination Time Interval (CTI) Tabular Report

| Missing Feature | Competitor(s) | Description |
|---|---|---|
| **Tabular selectivity report with device-pair CTI margins** | ETAP, EasyPower, SKM PTW | The standard deliverable for a protective device coordination study is a CTI (Coordination Time Interval) table: for each upstream–downstream device pair, the report lists the operating time of each device at key fault current levels (maximum bolted fault, minimum fault, 200 % FLA, motor starting current) and the margin between them. For electromechanical relays, the required CTI is ≥ 0.2 s; for digital/static relays ≥ 0.1 s; for fuse-breaker combinations ≥ 0.1 s. CableTrayRoute's `greedyCoordinate()` in `analysis/tccAutoCoord.mjs` computes margin values and the `#coordination-panel` shows pass/fail per device pair, but produces no tabular CTI report — no downloadable table listing device names, settings, test current levels, individual operating times, and margin columns. Without this, the coordination study has no formal documentation artifact. |

**Status:** ✅ Implemented 2026-04-06. `reports/coordinationReport.mjs` exports `buildCTIRows(deviceEntries, coordResult, faultCurrentA, margin)` which produces one row per adjacent device pair × 5 standard test-current levels (100 / 60 / 25 / 10 / 5 % of max fault current). Each row includes upstream device name, downstream device name, test current [A], upstream trip time [s], downstream trip time [s], actual margin [s], required CTI [s], and Pass/Fail status. Uses `interpolateTime()` from `tccAutoCoord.mjs` with conservative `minCurve`/`maxCurve` bands where available. The `autoCoordinate()` function in `analysis/tcc.js` now stores the last coordination state and reveals an "Export CTI Report" button which calls `buildCTIRows()` and `downloadCSV()` from `reports/reporting.mjs` to download `coordination-cti-report.csv`. Column headers are exported as `CTI_HEADERS`. Tests in `tests/tcc/ctiReport.test.mjs` cover row counts, column completeness, Pass/Fail logic, three-device scenarios, and edge-case input validation.

---

### Gap #57 – Vector (SVG) Chart Export for TCC Study Reports

| Missing Feature | Competitor(s) | Description |
|---|---|---|
| **Download TCC log-log chart as SVG or high-resolution PNG** | ETAP, EasyPower, SKM PTW, DIgSILENT PowerFactory | Professional TCC tools export the coordination chart as a standalone vector graphic (SVG or EMF) or high-resolution raster (PNG ≥ 300 dpi) for inclusion in engineering study reports submitted to utilities, AHJs, and clients. CableTrayRoute's `tcc.html` has a "Print Plot" button that triggers `window.print()` — this works for paper printing but produces no standalone downloadable file. The SVG is rendered inline in the DOM; it could be serialized and offered as a download, but this is not currently implemented. All professional tools treat chart export as a primary workflow step. |

**Status:** ✅ **Implemented 2026-04-06.** `analysis/tcc.js` `handleExportSVG()` / `handleExportPNG()` + "Export SVG" and "Export PNG" buttons in `tcc.html`. Pure utilities (inline styles constant, scale factor, markup builder, canvas dimension calculator) extracted to `analysis/chartExportUtils.mjs`. Tests: `tests/tcc/chartExport.test.mjs`.

---

## Advanced Power Systems & DER Deep Dive (2026-04-12 Pass)

Benchmarked against: **ETAP 2024/2025** (full AC+DC study suite, DER interconnect, frequency scan, voltage stability, OPF), **EasyPower 2025** (DC arc flash, battery sizing, capacitor bank, DER), **SKM PowerTools 9** (DAPPER DC module, relay settings export, IEC 60909), **DIgSILENT PowerFactory 2024** (quasi-dynamic simulation, voltage stability, frequency scan, IEC 60287 cable rating), **PSS/E** (voltage stability, OPF, IBR modeling), **Siemens PSS SINCAL** (insulation coordination, IEC cable rating), **CYME** (DER hosting capacity, time-series load flow), and domain-specific sizing tools (**Schneider Ecodial** for DC/battery, **Caterpillar SpecSizer** for generator sizing, **Eaton Bussmann OSCAR** for fuse coordination).

This pass examines CableTrayRoute's `analysis/` module tree against the full study catalogs of these competitors, focusing on **core power systems analyses** expected in modern engineering deliverables that have not been previously benchmarked.

---

### Gap #58 – DC System Short-Circuit & DC Arc Flash (NFPA 70E Annex D.8)

| Missing Feature | Competitor(s) | Description |
|---|---|---|
| **DC fault current calculation and DC arc flash incident energy** | ETAP DC Module, EasyPower DC SC & Arc Flash, SKM DAPPER DC, Schneider Ecodial DC | DC systems (battery rooms, PV combiner boxes, UPS output buses, DC switchgear in transit/marine) require fault current analysis per IEEE 946 and arc flash incident energy per NFPA 70E Annex D.8 / IEEE 1584 DC extension. The DC arc flash calculation uses a distinct model from the AC IEEE 1584 method — arc resistance is modeled differently, and the arc sustain threshold (~20 V DC) and gap distance formula differ. ETAP and EasyPower both provide a dedicated DC short-circuit module with battery internal impedance, cable resistance, and fuse/breaker operating time to compute bolted and arcing DC fault currents. CableTrayRoute's `analysis/shortCircuit.mjs` and `analysis/arcFlash.mjs` are strictly AC (they reference sequence networks, symmetrical components, and IEEE 1584 AC formulas). There is no DC fault current method, no battery impedance model, and no DC arc flash energy calculation. This is a critical gap for battery energy storage, PV, and data center UPS projects. |

**Status:** ✅ **Implemented 2026-04-18.** `analysis/dcShortCircuit.mjs` — DC bolted fault current (IEEE 946-2004 / IEC 61660-1 Thevenin model: I_bf = V_oc / R_total), DC arcing current (Stokes–Oppenlander iterative arc voltage model: V_arc = 20 + 0.534 × g × I_arc^0.12), DC arc flash incident energy (NFPA 70E Annex D.8.1 / Ammerman 2010 Lee method: E = 4.184 × C_f × P_arc × t / (2π × D²)), arc flash boundary (1.2 cal/cm² threshold), PPE category (NFPA 70E Table 130.7(C)(15)(c) Cat 0–4 / Dangerous), L/R time constant, and protection device interrupt rating check. Battery chemistry database (lead-acid, AGM, NiCd, Li-ion, LiFePO4) with V/cell constants. Enclosure correction factor C_f (1.0 open air, 2.0 enclosed box). Exports: `calcDcFaultCurrent()`, `calcDcArcFlash()`, `calcDcArcingCurrent()`, `selectDcProtection()`, `runDcShortCircuitStudy()`, `ppeCategoryForEnergy()`, `totalCircuitResistance()`, `openCircuitVoltage()`. UI: `dcshortcircuit.html` (battery source section, circuit impedance, optional arc flash panel, protection device table). Navigation: added to Studies → Protection group alongside AC Short Circuit and Arc Flash. Tests: `tests/dcShortCircuit.test.mjs` (47 assertions covering fault current, arcing current, incident energy, PPE categories, protection check, and integration). Docs: `docs/dc-short-circuit.md`.

---

### Gap #59 – Battery / UPS Sizing per IEEE 485

| Missing Feature | Competitor(s) | Description |
|---|---|---|
| **Stationary battery sizing and UPS runtime calculation** | ETAP Battery Sizing, EasyPower DC Systems, SKM DAPPER, Schneider Ecodial | IEEE 485 (lead-acid) and IEEE 1115 (nickel-cadmium) define the standard method for sizing stationary batteries: given a duty cycle (time-sequenced load profile of constant-power, constant-current, and momentary loads), compute the minimum battery capacity (Ah at a reference rate) that maintains terminal voltage above the minimum threshold for the full discharge period. This requires cell voltage vs. discharge time curves, temperature correction factors (IEEE 485 §5.2), design margin, and aging factor. ETAP and EasyPower automate this with a graphical duty cycle editor and cell selection from manufacturer databases (Enersys, C&D, EnerSys PowerSafe). CableTrayRoute has `battery_kwh` and `battery_runtime_min` fields in `componentLibrary.json` but no IEEE 485 sizing engine, no duty cycle model, and no cell selection algorithm. |

**Status:** ✅ **Implemented 2026-04-12.**

Six pure calculation functions and a master run function implemented in `analysis/batterySizing.mjs`:
- `temperatureFactor()` — IEEE 485 §5.2: K_temp = min(1.0, 1 + coeff × (T_amb − 25)), per-chemistry coefficients (lead-acid 0.008, Li-ion 0.003, NiCd 0.006)
- `requiredEnergyKwh()` — net energy from multi-period duty cycle: Σ(P_i × Δt_i)
- `designCapacityKwh()` — full five-step sizing chain: DoD + efficiency → temperature correction → aging factor → design margin
- `standardBankSize()` — selects nearest standard kWh rating ≥ required from 20-entry table [10…1000 kWh]
- `runtimeCurve()` — runtime at 25/50/75/100/125% load fractions for the selected bank
- `upsKvaRequired()` — UPS kVA = P_peak / PF_UPS with nearest standard kVA selection
- `runBatterySizingAnalysis()` — unified analysis entry point; persisted to `studies.batterySizing` via `dataStore.mjs`

Study page `battery.html` / `battery.js` provides form inputs for system label, average load kW, peak load kW, runtime hours, battery chemistry (lead-acid-flooded/AGM, lithium-ion, nickel-cadmium), ambient temperature °C, design margin %, and UPS output power factor. Results show the full IEEE 485 energy chain with intermediate values, recommended standard bank size with nearby options, runtime curve table, UPS kVA recommendation, and actionable warnings (cold temperature, large bank, high peak-to-average ratio). Engineer review panel via `initStudyApprovalPanel('batterySizing')`. Navigation entry added to Studies section in `src/components/navigation.js`. Rollup bundle entry added: `battery: 'src/battery.js'`. Tests: `tests/batterySizing.test.mjs` (43 assertions). Docs: `docs/battery-sizing.md`.

---

### Gap #60 – Capacitor Bank Sizing & Power Factor Correction

| Missing Feature | Competitor(s) | Description |
|---|---|---|
| **Automatic PFC sizing with resonance check** | ETAP Optimal Capacitor Placement, EasyPower Capacitor Module, DIgSILENT PowerFactory | Power factor correction is a standard deliverable for industrial facilities. The sizing workflow: (1) measure/estimate reactive power demand (kVAR) from load flow results; (2) select capacitor bank kVAR to achieve target PF (typically 0.95 or utility penalty threshold); (3) verify no parallel resonance between the cap bank and system impedance at any harmonic order (h_r = √(MVA_sc / MVAR_cap)); (4) if resonance falls near a dominant harmonic (5th, 7th, 11th), specify a detuned reactor (typically 5.67%, 7%, or 14% tuning factor). ETAP includes automatic optimal capacitor placement with loss minimization. CableTrayRoute's `analysis/harmonics.js` models harmonic sources and computes THD, and `analysis/loadFlow.js` computes reactive power flows, but there is no capacitor bank sizing function, no kVAR target optimizer, no resonance check formula, and no detuned filter specification. |

**Status:** ✅ **Implemented 2026-04-12.**

Four pure calculation functions and a master run function implemented in `analysis/capacitorBank.mjs`:
- `requiredKvar()` — IEEE 18-2012 §7 PFC formula: `Q_cap = P × (tan(cos⁻¹(pf_existing)) − tan(cos⁻¹(pf_target)))`
- `resonanceOrder()` — parallel resonance harmonic order: `h_r = √(kVA_sc / kVAR_cap)` with 'safe' / 'caution' / 'danger' risk classification (bands: ±0.5 danger, ±1.0 caution relative to dominant harmonics)
- `detuningRecommendation()` — maps resonance order to standard detuning factors: 5.67% (h_tune=4.30), 7% (h_tune=3.78), 14% (h_tune=2.68)
- `standardBankSizes()` — selects nearest NEMA standard kVAR rating ≥ required, plus 2-stage switched option
- `runCapacitorBankAnalysis()` — unified analysis entry point; reads optional pre-existing studies context; persisted to `studies.capacitorBank` via `dataStore.mjs`

Study page `capacitorbank.html` / `capacitorbank.js` provides form inputs for bus label, P (kW), existing and target PF, system voltage, SC MVA, and dominant harmonic order checkboxes. Results show required kVAR with formula, recommended standard bank + 2-stage option, resonance risk badge (colour-coded), and detuning reactor specification card. Engineer review panel via `initStudyApprovalPanel('capacitorBank')`. Navigation entry added to Studies section in `src/components/navigation.js`. Rollup bundle entry added: `capacitorbank: 'src/capacitorbank.js'`. Tests: `tests/capacitorBank.test.mjs` (26 assertions). Docs: `docs/capacitor-bank.md`.

---

### Gap #61 – PV / BESS / Inverter-Based Resource (IBR) Modeling

| Missing Feature | Competitor(s) | Description |
|---|---|---|
| **Solar PV, battery energy storage, and grid-forming inverter models** | ETAP Renewable Energy Module (2024), DIgSILENT PowerFactory (IBR generic model), PSS/E (WECC-approved IBR models), CYME DER Hosting Capacity | The global energy transition has made inverter-based resources (IBRs) — solar PV arrays, battery energy storage systems (BESS), and wind turbines — the dominant new generation type. Modeling IBRs in load flow requires: (1) P-Q capability curves bounded by the inverter apparent power rating; (2) voltage-reactive power droop (Volt-VAR) per IEEE 1547; (3) active power curtailment and frequency-watt droop; (4) current-limited fault contribution (typically 1.1–1.2× rated) for short-circuit studies — fundamentally different from synchronous machine models. ETAP 2024 added a dedicated renewable energy module with PV string/array sizing, irradiance-based output modeling, and BESS charge/discharge profiles. CableTrayRoute's `analysis/loadFlow.js` and `analysis/shortCircuit.mjs` model only conventional synchronous generators (constant voltage behind subtransient reactance for SC, PV bus for LF). There is no inverter model, no PV array sizing, no BESS state-of-charge model, and no current-limited fault contribution. |

**Status:** ✅ **Implemented 2026-04-18.** `analysis/ibrModeling.mjs` — five core IBR calculations: (1) `pvArrayOutput()` — STC-corrected AC output from irradiance and temperature (IEC 60891); (2) `ibrPQCapability()` — P-Q capability envelope and Volt-VAR droop per IEEE 1547-2018 Table 8 (Category A and B curves); (3) `ibrFaultContribution()` — current-limited fault current per IEEE 1547-2018 §6.4 and IEEE 2800-2022 §6.7.1 (1.05–1.2× rated); (4) `bessDispatch()` — BESS charge/discharge/standby/volt-var with SOC constraints and round-trip efficiency; (5) `freqWattResponse()` — active power curtailment per IEEE 1547-2018 §5.3.1. Load flow integration: `analysis/loadFlowModel.js` exports `isIBRDevice()` and `deriveIBRProfile()`; `analysis/loadFlow.js` applies Volt-VAR Q-clamping within the Newton-Raphson outer loop. Short-circuit integration: `analysis/shortCircuit.mjs` calls `resolveIBRForComponent()` to store current-limited fault contribution in `entry.ibr`. UI: `ibr.html` (four-tab study page: PV Array, BESS, Fault Contribution, Volt-VAR); P-Q capability canvas diagram. Tests: `tests/ibrModeling.test.mjs` (42 tests). Docs: `docs/ibr-modeling.md`.

---

### Gap #62 – IEEE 1547-2018 DER Interconnection Study

| Missing Feature | Competitor(s) | Description |
|---|---|---|
| **Distributed energy resource interconnection compliance** | ETAP DER Module, EasyPower DER, CYME Hosting Capacity, Interconnection.com | IEEE 1547-2018 (as amended by 1547a-2020) is mandatory for all DER interconnections to utility distribution systems in the US. Utilities require an interconnection study covering: (1) steady-state voltage impact at the point of common coupling (PCC); (2) voltage regulation impact (ANSI C84.1 Range A/B); (3) fault current contribution and protection coordination impact; (4) unintentional islanding detection (anti-islanding per 1547 §8.1); (5) voltage/frequency ride-through capability (Category I/II/III); and (6) power quality (flicker, harmonics) at the PCC. ETAP and CYME automate these six screening criteria. CableTrayRoute has no IEEE 1547 compliance module, no DER screening criteria, no anti-islanding check, and no ride-through capability verification. |

**Status:** ✅ **Implemented 2026-04-18.** `analysis/derInterconnect.mjs` — five pure calculation functions: (1) `checkPCCVoltage()` — ANSI C84.1-2020 Range A/B steady-state voltage impact using linearized Thevenin approximation (ΔV ≈ (P·R + Q·X)/V²); (2) `checkFaultImpact()` — IEEE 1547-2018 §6.4 current-limited IBR fault contribution (k_limit × I_rated) added to existing fault, checked against device interrupting rating; (3) `checkAntiIslanding()` — IEEE 1547-2018 §8.1 islanding detection trip time limits by category (A: 2.0 s, B: 1.0 s, C: 0.16 s) and monitoring method validation; (4) `checkRideThrough()` — IEEE 1547-2018 Table 3/Table 5 voltage and frequency ride-through window compliance for Categories I/II/III (50 Hz scaling included); (5) `checkHarmonicsCompliance()` — IEEE 1547-2018 Table 2 THD (5%) and individual harmonic limits with violation list. Unified `runDERInterconnectStudy()` entry point returns all five sub-results, `overall_pass`, and `summary_flags`. UI: `derinterconnect.html` (full study form with DER configuration, system data, anti-islanding, ride-through, harmonics; summary compliance table; detail result cards; CSV export; Import from IBR Study button). Persisted to `studies.derInterconnect` via `dataStore.mjs`. Navigation entry added to Renewable group in `src/components/navigation.js`. Tests: `tests/derInterconnect.test.mjs` (47 assertions). Docs: `docs/der-interconnection.md`.

---

### Gap #63 – Frequency Scan / Harmonic Resonance / Impedance vs. Frequency

| Missing Feature | Competitor(s) | Description |
|---|---|---|
| **System impedance-frequency sweep and resonance identification** | ETAP Harmonic Analysis (frequency scan mode), EasyPower Harmonic Analysis, DIgSILENT PowerFactory, SKM PowerTools | A frequency scan sweeps the system driving-point impedance (Z(f) = R(f) + jX(f)) from the fundamental (50/60 Hz) through the 50th harmonic, plotting impedance magnitude and angle vs. frequency. Peaks in the impedance magnitude indicate parallel resonance (voltage amplification risk); troughs indicate series resonance (current amplification risk). This is essential for harmonic filter design — tuned and detuned filter parameters (reactor %, capacitor kVAR, quality factor) are derived directly from the resonance plot. CableTrayRoute's `analysis/harmonics.js` computes THD using a quality-factor approximation (`const q = Number(f.q) || 1`) but does not construct the system admittance/impedance matrix as a function of frequency, does not perform a frequency sweep, and cannot identify resonant frequencies or design harmonic filters. |

**Status:** ✅ **Implemented 2026-04-19.** `analysis/frequencyScan.mjs` — five exported functions: (1) `computeSourceImpedance(h, {systemKv, scMva, xrRatio})` — Thevenin source R+jX at harmonic h (Z_base = kV²/MVA, X scales linearly with h); (2) `computeCapacitorImpedance(h, {kvar, systemKv})` — shunt cap bank impedance (X_c1 = kV²×1000/kVAR, Z = −j×X_c1/h); (3) `computeFilterImpedance(h, {reactorPct, kvar, systemKv})` — detuned series L-C filter (h_tune = √(100/reactorPct), Z = j×(h×X_L1 − X_C/h)); (4) `computeCableImpedance(h, {rOhmPerKft, xOhmPerKft, lengthKft})` — series cable R+j×h×X; (5) `parallelImpedances(zList)` — admittance-sum parallel combination. Master function `runFrequencyScan(inputs)` sweeps h=1 to 50 in 0.5-order steps, returns `{points[], resonances[], warnings[]}`. `identifyResonances()` detects local maxima (parallel resonance) and minima (series resonance) with risk classification: `danger` (within ±0.5 of dominant harmonic 5/7/11/13/17/19/23/25), `caution` (±1.0), `low` (>1.0). UI: `frequencyscan.html` — dynamic cap bank/filter/cable rows, SVG impedance-magnitude chart, resonance summary table with colour-coded risk badges, full scan data table. Navigation: added to Studies → Power Quality group alongside Harmonics and Capacitor Bank. Rollup entry: `frequencyscan: 'src/frequencyscan.js'`. Tests: `tests/frequencyScan.test.mjs` (12 test cases covering source/cap/filter/cable impedance helpers, parallel combination, resonance identification, resonance order vs. IEEE 519 formula, detuned filter, danger classification, validation errors). Docs: `docs/frequency-scan.md`.

---

### Gap #64 – Voltage Stability Analysis (P-V / Q-V Curves, Continuation Power Flow)

| Missing Feature | Competitor(s) | Description |
|---|---|---|
| **Bus voltage stability margin and collapse point identification** | ETAP Voltage Stability, DIgSILENT PowerFactory (CPF), PSS/E, PowerWorld Simulator | Voltage stability analysis determines how close a power system is to voltage collapse under increasing load or generation transfer. The P-V curve (nose curve) plots bus voltage vs. total system load, identifying the maximum loadability (MW) and the critical bus. The Q-V curve plots reactive power injection required to maintain a target voltage, identifying the reactive margin (MVAR) before collapse. Continuation power flow (CPF) traces the P-V curve through the nose point using predictor-corrector methods. This is required for NERC TPL-001 transmission planning compliance and is standard practice for industrial facilities with large motor loads (voltage collapse during motor starting). CableTrayRoute's `analysis/loadFlow.js` implements Newton-Raphson for a single operating point but has no continuation power flow, no P-V/Q-V curve generation, and no voltage stability margin calculation. |

**Status:** Not implemented.

---

### Gap #65 – Optimal Power Flow / Economic Dispatch

| Missing Feature | Competitor(s) | Description |
|---|---|---|
| **Loss minimization and generation cost optimization** | ETAP Optimal Power Flow, PowerWorld Simulator OPF, DIgSILENT PowerFactory, PSS/E OPF | Optimal power flow (OPF) extends load flow by optimizing generator dispatch, transformer tap positions, and capacitor switching to minimize an objective function (total generation cost, system losses, or voltage deviation) subject to bus voltage limits, branch thermal limits, and generator capability constraints. Economic dispatch — a simplified OPF — determines least-cost generator loading for a given total demand. This is standard for utility operations, industrial facilities with cogeneration, and microgrid dispatch optimization. CableTrayRoute's `analysis/loadFlow.js` solves a conventional Newton-Raphson power flow with fixed generator setpoints; it has no optimization layer, no cost function, no constraint enforcement on branch flows, and no automatic tap/capacitor adjustment. |

**Status:** Not implemented.

---

### Gap #66 – Standby / Emergency Generator Sizing (NFPA 110 / NEC 700-702)

| Missing Feature | Competitor(s) | Description |
|---|---|---|
| **Engine-generator set sizing for emergency and standby loads** | ETAP Generator Sizing, EasyPower GenSize, Caterpillar SpecSizer, Cummins Power Suite, Kohler KPS | Generator sizing for emergency (NEC 700), legally required standby (NEC 701), and optional standby (NEC 702) systems requires: (1) load tabulation with demand factors per NEC 220; (2) motor starting transient analysis — the largest motor start determines the generator's transient kW/kVA requirement and voltage/frequency dip; (3) harmonic loading from VFDs and UPS (generator oversizing factor); (4) altitude and temperature derating; (5) fuel consumption at 25/50/75/100% load for runtime calculation per NFPA 110. ETAP and the manufacturer tools automate this. CableTrayRoute's `analysis/motorStart.js` models motor starting voltage dip on an infinite bus or user-specified source impedance but does not model a finite-capacity generator (where the frequency also drops during the start transient), has no generator selection algorithm, and has no NFPA 110/NEC 700 load tabulation. |

**Status:** ✅ **Implemented 2026-04-12.** `analysis/generatorSizing.mjs` — altitude and temperature derating (NFPA 110 Annex B / ISO 8528-1), continuous load tabulation with demand factors, largest motor step-load check (IEEE 446 §5.3), transient voltage dip check (IEEE 446 §5.4), standard generator size selection, and fuel runtime calculation. UI: `generatorsizing.html`. Tests: `tests/generatorSizing.test.mjs`. Docs: `docs/generator-sizing.md`.

---

### Gap #67 – Differential Protection Zone Modeling (87B / 87T / 87G)

| Missing Feature | Competitor(s) | Description |
|---|---|---|
| **Bus, transformer, and generator differential relay characteristic curves** | ETAP Star, EasyPower, SKM PTW, DIgSILENT PowerFactory | Differential protection (ANSI device 87) operates on the principle of current balance: the algebraic sum of currents entering and leaving a protected zone should be zero during normal operation. Types: bus differential (87B), transformer differential (87T) with harmonic restraint for inrush blocking, and generator differential (87G). Professional TCC/protection tools model the percentage differential characteristic: a plot of operating current vs. restraint current with dual-slope (Slope 1 and Slope 2) and minimum pickup thresholds. CT ratio mismatch compensation and tap-setting calculations are automated. CableTrayRoute's `analysis/tcc.js` and `data/protectiveDevices.json` model overcurrent devices (fuses, breakers, relays with inverse-time curves) but have no differential relay type, no percentage-differential characteristic curve, no CT ratio matching, and no inrush restraint modeling. This is a significant gap for any facility with transformers or generators requiring unit protection. |

**Status:** ✅ **Implemented 2026-04-19.** `analysis/differentialProtection.mjs` — full percentage-differential characteristic with dual-slope trip boundary (Slope 1 / Slope 2 / I_min / breakpoint per IEEE C37.91-2008). Exports: `ctRatioMismatch()` (CT ratio mismatch % and acceptable flag, ≤ 5% limit per C37.91), `dualSlopeCharacteristic()` (200-point boundary curve for plotting), `calcOperatingRestraintCurrents()` (I_op = |I₁/n₁ − I₂/n₂|, I_rst = (|I₁/n₁| + |I₂/n₂|)/2), `checkHarmonicRestraint()` (2nd harmonic ≥ 15% → inrush block for 87T; 5th harmonic ≥ 35% → over-excitation block for 87T/87G; no restraint for 87B), `evalTrip()` (dual-slope threshold evaluation with harmonic override), `buildDifferentialCurve()` (charLine + minPickupLine arrays for TCC/chart rendering), `runDifferentialStudy()` (unified entry point with CT mismatch, operating point, harmonic check, dual-slope evaluation, characteristic curve, warnings; persisted to `studies.differentialProtection` via `dataStore.mjs`). Three relay entries added to `data/protectiveDevices.json` (`sel_487b`, `sel_387`, `ge_t60`) with `subtype: "relay_87"`. `relay_87` added to `PROTECTIVE_TYPES` in `analysis/tcc.js` — relay_87 devices appear in TCC device selection lists; empty `curve: []` renders no time-current line (correct — differential relays use I_rst vs. I_op axes, not time-current). Study page `differentialprotection.html` / `differentialprotection.js` provides zone type selector (87B/87T/87G), CT ratio inputs, dual-slope settings, operating current inputs, conditional harmonic content fields (hidden for 87B, 2nd harmonic hidden for 87G), Canvas-based dual-slope characteristic plot (red trip boundary, green/red operating point, slope labels), trip/no-trip badge, CT mismatch check, security margin, CSV export, engineer review panel via `initStudyApprovalPanel('differentialProtection')`. Navigation: added to Studies → Protection group alongside TCC, Short Circuit, Arc Flash, DC Short-Circuit in `src/components/navigation.js`. Rollup entry: `differentialprotection: 'src/differentialProtection.js'`. Tests: `tests/differentialProtection.test.mjs` (47 assertions covering CT mismatch, dual-slope characteristic monotonicity, operating/restraint currents, harmonic restraint for all zone types, trip evaluation at boundary conditions, security margin sign, integration study runner, input validation). Docs: `docs/differential-protection.md`.

---

### Gap #68 – IEC 60909 Short-Circuit Calculation Method

| Missing Feature | Competitor(s) | Description |
|---|---|---|
| **Full IEC 60909 initial, peak, breaking, and steady-state fault currents** | ETAP IEC 60909 Module, EasyPower IEC SC, DIgSILENT PowerFactory, CYME | IEC 60909 (International Electrotechnical Commission) is the standard short-circuit calculation method used outside North America. It differs from the ANSI/IEEE method in CableTrayRoute in several key ways: (1) voltage factor c (1.05 for max, 0.95 for min) applied to the pre-fault voltage; (2) initial symmetrical SC current Ik" calculated with impedance correction factors for generators (KG), power station units (KSO), and transformers (KT); (3) peak SC current ip = κ × √2 × Ik" where κ depends on R/X ratio; (4) symmetrical breaking current Ib with generator time-dependent decay; (5) steady-state SC current Ik. CableTrayRoute's `analysis/shortCircuit.mjs` uses the ANSI/IEEE method (1/2 cycle and 30-cycle networks with multiplying factors). There is no IEC 60909 voltage factor c, no impedance correction factors KG/KT/KSO, no peak current ip calculation, and no breaking/steady-state current distinction. This is required for all IEC-jurisdiction projects. |

**Status:** Not implemented.

---

### Gap #69 – Cable Ampacity per IEC 60287 (Thermal Circuit Model)

| Missing Feature | Competitor(s) | Description |
|---|---|---|
| **IEC 60287 cable current rating with full thermal ladder network** | ETAP Cable Sizing, DIgSILENT PowerFactory, CYME Cable Rating, Siemens PSS SINCAL, CYMCAP | IEC 60287-1-1 calculates the continuous current rating of cables from first principles using a thermal equivalent circuit: conductor losses (I²R with AC resistance correction for skin/proximity effect), dielectric losses (for MV/HV cables), sheath/screen losses (λ₁), armour losses (λ₂), and thermal resistances of insulation (T₁), bedding (T₂), outer serving (T₃), and surrounding medium (T₄, soil or air). The method accounts for soil thermal resistivity, depth of burial, grouping (de-rating for multiple circuits), and soil drying-out (critical temperature rise). CableTrayRoute's cable sizing uses NEC ampacity tables (pre-computed values from NEC 310.16–310.21) and IEC lookup tables in `analysis/intlCableSize.mjs`, but does not implement the IEC 60287 thermal circuit calculation from first principles. This means custom installation conditions (non-standard soil, deep burial, complex duct bank arrangements beyond the Neher-McGrath model in `ductbankroute.js`) cannot be evaluated. |

**Status:** ✅ **Implemented 2026-04-17.** `analysis/iec60287.mjs` — full IEC 60287-1-1:2023 thermal circuit model. Exports: `calcAmpacity()` (main entry, returns rated current and full thermal breakdown), `thermalResistances()` (T1–T4 component analysis), `groupDerating()` (IEC 60287-2-1 Table 1 grouping factors), `conductorAcResistance()` (R_ac with skin/proximity corrections), `ambientTempCorrection()`, `defaultInsulThickMm()` (IEC 60502-1/-2 lookup). Supports all installation methods: direct burial (Kennelly formula), conduit/duct, cable tray, and free air. Conductor resistance database: IEC 60228 Class 2 values for Cu and Al, 1.5–1000 mm². Insulation types: XLPE, EPR, PVC, LSZH, XLPE-HT, Paper (MV/HV). Grouping derating for flat, flat-touching, and trefoil arrangements. Dielectric losses W_d for cables >18 kV. UI: `iec60287.html`. Tests: `tests/iec60287.test.mjs`. Docs: `docs/iec60287.md`.

---

### Gap #70 – Voltage Flicker Assessment (IEC 61000-4-15 Pst / Plt)

| Missing Feature | Competitor(s) | Description |
|---|---|---|
| **Short-term and long-term flicker severity from fluctuating loads** | ETAP Voltage Flicker, EasyPower Power Quality, DIgSILENT PowerFactory | Voltage flicker is the perceptible variation in light output caused by rapid voltage fluctuations from loads such as arc furnaces, welding machines, motor starts, and wind turbines. IEC 61000-4-15 defines the flickermeter algorithm producing Pst (short-term flicker severity, 10-min observation) and Plt (long-term, 2 hours). IEEE 1453 adapts this for North American 120 V / 60 Hz systems. Utilities enforce Pst ≤ 1.0 at the PCC per IEC 61000-3-3 / IEEE 1453. The calculation requires a time-domain voltage waveform or a simplified ΔV/V method with repetition rate. ETAP and PowerFactory include dedicated flicker assessment modules. CableTrayRoute's `analysis/motorStart.js` computes voltage dip during motor starting (a single event) but does not compute Pst/Plt for repetitive events, has no flickermeter algorithm, and has no IEC 61000-4-15 or IEEE 1453 compliance check. |

**Status:** Not implemented.

---

## Remaining Gaps (3 of 20)

These features require native desktop integration, external pricing databases, or significant backend infrastructure not feasible in a browser-based tool:

### 1. BIM/CAD Plugin Integration

| Missing Feature | Competitor(s) | Description |
|---|---|---|
| **Revit Plugin / Live BIM Sync** | ETAP, EasyPower, Eaton B-Line, Legrand Cablofil | Native Revit add-in that synchronizes tray layouts bidirectionally with BIM models. CableTrayRoute can import Revit data but lacks a live plugin or real-time sync. EasyPower explicitly supports Revit 2025. |
| **AutoCAD / AVEVA / SmartPlant 3D Integration** | Eaton B-Line, Legrand Cablofil, OBO Bettermann, Aeries CARS, Paneldes | Direct plug-ins for AutoCAD (2D/3D), AVEVA, SmartPlant 3D, CATIA V5, SolidWorks. OBO offers a free AutoCAD plug-in for 3D cable sections. CableTrayRoute exports DXF but has no native CAD plug-in. |
| **BIM Object Library** | Eaton B-Line (CoSPEC), Legrand Cablofil (BIMobject), Niedax (Stabicad), Chalfant, OBO (TraceParts) | Downloadable manufacturer-specific BIM families (Revit RFA, IFC) for cable tray products with parametric sizing. Niedax integrates 226 products into Revit via Stabicad. |

**Status:** Deferred. Requires Windows-native SDKs (Revit API, AutoCAD ARX) or manufacturer partnerships for BIM families. Not feasible as a pure web app.

### 2. Real-Time Cost Pricing Database

| Missing Feature | Competitor(s) | Description |
|---|---|---|
| **Cost Estimation with Real Manufacturer Pricing** | Legrand, Eaton (CADmep/Harrison codes), Panduit, Aeries CARS (Quick-Bid) | Estimate project cost using actual manufacturer pricing with live catalog integration. CableTrayRoute now has a cost estimator with RS Means–based unit prices, but no live manufacturer pricing feed. |

**Status:** ✅ Extended 2026-04-11. `costestimate.html` now supports **custom pricing book import/export via CSV**. Engineers can import distributor quote pricing (or any rate sheet) from a `.csv` file; prices are merged with defaults, persisted in browser storage across sessions, and exported back to CSV for audit. `analysis/costEstimate.mjs` exports `parsePricingCSV()` and `exportPricingCSV()`. The XLSX export includes a "Pricing basis" row identifying the custom source and date. A default pricing book covering all cable sizes, tray widths, conduit trade sizes, fittings, and labor rates can be exported and used as an edit template. Docs: `docs/cost-estimate-pricing.md`. Tests: 25 new assertions in `tests/costEstimate.test.mjs` covering parse, export, roundtrip, and error handling. The live automatic manufacturer pricing feed (Eaton/Legrand catalog API) remains deferred — requires commercial data licensing.

---

## Newly Identified Gaps (2026-03-24 Analysis)

The following gaps were discovered by reviewing competitor release notes and product announcements from 2025–2026. They are distinct from the four deferred gaps above.

---

### 3. AI / Natural Language Interface

| Missing Feature | Competitor(s) | Description |
|---|---|---|
| **AI/LLM Copilot (Natural Language Queries)** | ETAP (Electric Copilot™, 2024/2025) | ETAP's Electric Copilot™ lets engineers query the project in plain English — e.g., "list all cables exceeding 80% fill" or "show overloaded feeders" — and receive instant filtered results and summaries. CableTrayRoute has no natural language or AI-assisted query layer; all data interrogation requires manual navigation through tables and filters. |

**Status:** Implemented. `src/copilot.js` provides a floating panel with Claude API (Haiku) integration on every page. Server endpoint at `/api/copilot` in `server.mjs`, rate-limited at 10 req/min.

---

### 4. IFC Export with Rich Property Sets

| Missing Feature | Competitor(s) | Description |
|---|---|---|
| **IFC 4.x Export (with Cable Tray Properties)** | MagiCAD 2026, Bentley Raceway, Trimble MEP | MagiCAD 2026 exports cable tray material codes, material names, and type-name properties directly into IFC property sets, enabling downstream BIM workflows (clash detection in Navisworks, federated models, COBie handover). CableTrayRoute exports DXF only; there is no IFC output at any level. This is the most practical BIM interoperability gap that does not require a native plugin. |

**Status:** Implemented. `src/exporters/ifc4.mjs` exports IFC4 STEP-Physical-File format with cable tray spatial hierarchy (Project → Site → Building → Storey → IfcCableTray / IfcCableSegment).

---

### 5. Multi-Slot / Compartmented Tray Fill Visualization

| Missing Feature | Competitor(s) | Description |
|---|---|---|
| **Multi-Slot Cable Tray Layouts** | MagiCAD 2026 (up to 5 slots per tray) | MagiCAD 2026 evaluates cable fill ratios for trays divided into multiple internal compartments (up to 5 slots), each tracked independently. CableTrayRoute models trays as single-fill containers; it does not support compartmented trays where different cable groups occupy separate longitudinal dividers within one physical tray. This matters for instrumentation/power segregation using divider strips. |

**Status:** Implemented. `app.mjs` and `routeWorker.js` `CableRoutingSystem` now tracks per-slot fill via `slotFills[]`; `slot_groups` JSON field maps each slot to a cable group; `addTraySegment` parses the mapping; `_findSlotForCable` / `_trayHasCapacityForCable` / `updateTrayFill` operate at slot granularity; `getTrayUtilization` returns per-slot detail. `analysis/designRuleChecker.mjs` runs DRC-01 per slot and suppresses DRC-02 for correctly compartmented trays. `cabletrayfill.js` auto-populates compartments from `num_slots`/`slot_groups`. `src/racewayschedule.js` exposes both new fields in the raceway schedule UI. Backward compatible — single-slot trays behave identically to prior code.

---

### 6. QR Code Tag Generation for Field Access

| Missing Feature | Competitor(s) | Description |
|---|---|---|
| **QR Code Embedding in Cable / Equipment Tags** | ETAP 2024/2025 | ETAP 2024 added QR code generation embedded in text boxes and equipment annotations so field technicians can scan a tag and immediately access the relevant equipment datasheet, test record, or one-line location on a mobile device. CableTrayRoute generates cable pull cards and submittal packages as PDFs but does not embed scannable QR codes linking back to live project data. |

**Status:** Implemented. `analysis/pullCards.mjs` and `analysis/trayHardware.mjs` embed QR codes in pull card and hardware BOM PDFs via the `qrcode` npm package (v1.5.4). QR payloads encode cable-specific URLs for field scanning.

---

### 7. Electrical Digital Twin / 3D Platform Integration

| Missing Feature | Competitor(s) | Description |
|---|---|---|
| **Electrical Digital Twin with Real-Time Simulation** | ETAP + NVIDIA Omniverse (2025) | ETAP introduced the world's first Electrical Digital Twin integrating with NVIDIA Omniverse for AI factory power simulation (Grid-to-Chip level). While CableTrayRoute has GPU-accelerated thermal analysis and 3D visualization, it has no integration with external 3D/simulation platforms (Omniverse, Navisworks, Unreal Engine) for live power–mechanical co-simulation. |
| **Navisworks / 3D BIM Viewer Export** | MagiCAD 2026, Bentley Raceway 2024 | Both MagiCAD and Bentley Raceway export cable tray geometry and fill data to Navisworks NWC/NWD for federated 3D model reviews. CableTrayRoute's built-in 3D viewer is standalone; it cannot feed data into external BIM coordination platforms. |

**Status:** ✅ Implemented (glTF 2.0 export — 2026-04-11). `src/exporters/gltf2.mjs` `exportToGLTF2()` produces a binary `.glb` file containing solid rectangular-prism meshes for all cable tray segments and GL_LINES polylines for cable routes. Fill heat-map coloring is encoded as three PBR materials (grey/yellow/red). Per-node `extras` carry `tray_id`, `fill_pct`, `width_in`, `height_in` — accessible in Navisworks Properties panel. "Export 3D Model (.glb)" button added to the 3D view in `optimalRoute.html`. Full Omniverse / live power–mechanical co-simulation remains out of scope for a web app. Docs: `docs/gltf-export.md`. Tests: `tests/gltfExport.test.mjs`.

---

### 8. AI / High-Density Data Center Infrastructure Templates

| Missing Feature | Competitor(s) | Description |
|---|---|---|
| **Data Center Cable Tray Rack Templates** | SnakeTray, Chatsworth Products, industry trend | The AI data center buildout (2025–2026) has driven demand for specialized cable tray configurations: overhead ladder rack in hot/cold aisle arrangements, top-of-rack (ToR) patch routing, power whip scheduling, and structured cabling density calculations for 400G/800G optical links. No competitor has fully addressed this, but SnakeTray and Chatsworth have published application guides and product families specifically targeting AI data centers. CableTrayRoute has no data center–specific templates, typical aisle configurations, or structured cabling (Cat6A/fiber) fill models. |

**Status:** ✅ Implemented. `src/projectTemplates.js` provides an **AI Data Center** project template with hot/cold aisle overhead ladder rack topology: redundant 480 V A/B UPS feeds and 208 V PDU branches on dedicated power trays (`TRAY-PWR-A`, `TRAY-PWR-B`), OM4 and OS2 fiber backbone on a cold-aisle wire-basket tray (`TRAY-FIBER-SPINE`), and Cat6A horizontal distribution under raised-floor (`TRAY-DATA-ROW1/2`). `cableschedule.js` adds `'Data'` and `'Fiber'` cable type options to the cable schedule, enabling structured cabling entries alongside power and control cables. `analysis/designRuleChecker.mjs` **DRC-06** (TIA-568.0-D §4.5 / NEC Article 800) raises a WARNING when Data or Fiber cables share a tray with Power cables, with actionable remediation guidance.

---

### 9. Prefabricated Cable Length Optimization (Ordered-Length Planning)

| Missing Feature | Competitor(s) | Description |
|---|---|---|
| **Ordered-Length Prefab Cable Planning** | Eplan Platform 2025 (Cable proD) | Eplan Platform 2025 introduced a dedicated prefabricated cable workflow that computes cut lengths for factory-assembled cable assemblies and produces ordered-length bills of material with tolerance management. CableTrayRoute has spool sheet output and cable pull cards, but does not calculate ordered cut lengths, apply standard reel lengths, minimize cable waste/offcuts, or produce a cable procurement schedule tied to reel inventory. |

**Status:** ✅ Implemented. `analysis/cableProcurement.mjs` provides `calculateProcurement()` — takes routed cable segments and produces a procurement report with per-cable cut lengths (route length + configurable pull-through allowance), standard reel assignments (closest reel ≥ required length), offcut waste tracking, and total reel count. `exportProcurementCSV()` generates a procurement schedule in CSV format. The UI is wired into `spoolsheets.html` as a dedicated "Procurement Schedule" tab alongside the spool sheet. Tests in `tests/cableProcurement.test.mjs`.

---

### 10. Open REST API / Scripting Automation Interface

| Missing Feature | Competitor(s) | Description |
|---|---|---|
| **Public REST API or Scripting Layer** | Revit 2026 (Dynamo scripting), AutoCAD Plant 3D 2026 (Python API), ETAP (COM/API) | Revit 2026 exposes all conductor sizing logic via Dynamo; AutoCAD Plant 3D 2026 added a Python cable tray scripting API; ETAP has a long-standing COM/API for automated study execution. CableTrayRoute has no documented public API, no webhook endpoints, and no scripting interface for external tools to programmatically create projects, run analyses, or export results. This blocks integration with ERP/procurement systems (SAP, Maximo) and CI/CD pipelines for automated design checks. |

**Status:** Implemented. `server.mjs` exposes `/api/v1/` endpoints for cables, trays, short-circuit, motor start, and voltage drop studies with Bearer token + CSRF authentication and rate limiting. Documented in `docs/api-reference.md`.

---

### 11. Parallel Cable / Multi-Conductor Specification

| Missing Feature | Competitor(s) | Description |
|---|---|---|
| **Parallel Cable Runs & Multi-Core Conductor Types** | Revit 2026, ETAP | Revit 2026 introduces a new cable type system supporting parallel cable specifications (multiple cables per circuit) and multi-core conductor definitions (replacing legacy single wire-gauge entries). ETAP supports parallel feeder modeling in load flow. CableTrayRoute represents each cable as a single entry in the schedule; it does not model parallel runs (e.g., 3 × 240 mm² cables in parallel for a 2 000 A feeder) as a first-class object with aggregate ampacity and tray fill computed per-run. |

**Status:** ✅ Implemented. The cable schedule now supports a `parallel_count` field (integer ≥ 1) representing the number of identical conductors run in parallel per phase. `analysis/designRuleChecker.mjs` DRC-03 computes aggregate ampacity as `(per-cable ampacity × parallel_count)` and applies bundling derating with `conductors × parallel_count`. New **DRC-07** enforces NEC 310.10(H): raises an ERROR when conductors below 1/0 AWG are specified as parallel, and a WARNING when no route length is recorded (equal-length compliance cannot be verified). `analysis/pullCards.mjs` `buildPullCard()` multiplies total weight and area by `parallel_count`. `analysis/autoSize.mjs` `sizeFeeder()` returns a `parallelSuggestion` (count, size, installed ampacity, NEC note) when the load exceeds single-conductor capacity. 18 new tests in `tests/parallelCables.test.mjs`.

---

### 12. Cloud-Based Component / Equipment Library

| Missing Feature | Competitor(s) | Description |
|---|---|---|
| **Cloud-Synchronized Equipment Library** | Bentley Components Center (2024/2025) | Bentley Raceway 2024 integrated the Components Center — a cloud-hosted library of cell-based equipment that stays synchronized across projects and teams, with automatic property propagation to all tray segments using a product definition. CableTrayRoute's product configurator (`productconfig.html`) is project-local; there is no shared organization-wide or community-maintained library of tray products, connectors, and fittings that updates automatically when manufacturer specs change. |

**Status:** ✅ Implemented. `server.mjs` — `CloudLibraryStore` (versioned file storage under `server_data/libraries/{username}/`) and `LibraryShareStore` (30-day token-based sharing, `server_data/library-shares.json`). REST API: `GET/PUT /api/v1/library` (authenticated), `GET/POST/DELETE /api/v1/library/shares` (authenticated), `GET /api/v1/library/shared/:token` (public). `library.html` updated with sync status badge, **Save to Cloud**, **Load from Cloud**, **Share Library**, and **Load Shared Library** buttons, auto-sync on save, and `?share=<token>` URL parameter for direct link access. Tests: `tests/cloudLibrary.test.mjs` (16 assertions).

---

---

## Usability Gaps vs. Competitors (2026-03-24 Pass)

These gaps describe areas where CableTrayRoute's user experience lags behind competitor UX standards, independent of whether the underlying calculation feature exists.

---

### 13. Error Dialogs Use Browser `alert()` Instead of Modal Dialogs

| Missing UX Pattern | Competitor Benchmark | Description |
|---|---|---|
| **Consistent in-app modal error handling** | ETAP, EasyPower (modal dialogs throughout) | Over 50 instances of `alert()` are used for error messages instead of the application's existing modal component: `cabletrayfill.js` (40+ instances), `src/panelSchedule.js` (13 instances), `src/racewayschedule.js`, `src/scenarios.js`, and `src/projectManager.js`. Browser `alert()` blocks the entire UI, cannot be styled or dismissed gracefully, and is inconsistent with the rest of the application. The modal component (`src/components/modal.js`) is already implemented and used correctly in many places — it is simply not applied consistently. |

**Status:** Implemented. App-wide `alert()` replacement using `src/components/modal.js`, applied across `cabletrayfill.js`, `panelSchedule.js`, `racewayschedule.js`, `scenarios.js`, and `projectManager.js`.

---

### 14. No Contextual "Why / How to Fix" Guidance in Violation Messages

| Missing UX Pattern | Competitor Benchmark | Description |
|---|---|---|
| **Inline corrective-action suggestions** | ETAP Electric Copilot™, EasyPower (contextual rule explanations) | `analysis/designRuleChecker.mjs` reports violations such as "Tray fill 52.3% exceeds NEC 392.22(A) limit of 40%" but provides no explanation of why the limit exists, no guidance on how to resolve it (add a tray, reroute cables, use a wider tray), and no indication of which specific cables are contributing most to the excess. The only place in the codebase where this is done correctly is `analysis/arcFlash.mjs` line 412: `'Incident energy exceeds 40 cal/cm²; verify protective coordination and consider mitigation.'` — that pattern should be applied everywhere. |

**Status:** ✅ Implemented (2026-03-24). Every DRC finding (DRC-01 through DRC-05) now carries a `remediation` field with actionable fix guidance. The UI (`designrulechecker.js`) renders a blue "How to fix:" section beneath each finding card, and the plain-text export (`formatDrcReport`) includes a `HOW TO FIX:` line for each finding. CSS styles for all DRC finding cards were also added to `src/styles/components.css`.

---

### 15. No Visual Dashboards or Fill Gauges

| Missing UX Pattern | Competitor Benchmark | Description |
|---|---|---|
| **Graphical utilization heat-maps and progress gauges** | MagiCAD 2026, Bentley Raceway 2024/2025 (graphical fill heat-maps and color-coded tray schedules) | All analysis results are displayed as plain text or unstyled HTML tables. There are no fill gauge/progress bars showing % utilization per tray, no per-tray utilization heat-maps highlighting overloaded segments, no color-coded violation cells in result tables, and no summary charts (bar charts, pie charts) showing distribution of fill levels across the project. MagiCAD and Bentley both provide graphical utilization overlays on the 3D model. At minimum, a visual fill gauge for `cabletrayfill.html` and a sorted worst-offenders list would bring the UX in line with competitors. |

**Status:** ✅ Implemented. `src/components/fillGauge.js` provides a reusable semi-circular SVG fill gauge with colour zones (green 0–40%, amber 40–50%, red 50%+), tick marks at the 40% and 50% NEC limits, ARIA `role="meter"` attributes, and a public `update(percentage)` API. The gauge is wired into `cabletrayfill.js` (one gauge per tray row) and `conduitfill.js` (one gauge per conduit). `src/scenarioComparison.js` renders per-scenario tray fill gauges in the side-by-side comparison view. Tray fill result rows are heat-map coloured by fill percentage using CSS classes (`.fill-ok`, `.fill-warn`, `.fill-over`). The heat-map background is also applied to the expanded detail view of each tray.

---

### 16. No Configuration Profiles or Project Templates

| Missing UX Pattern | Competitor Benchmark | Description |
|---|---|---|
| **Industry-specific project templates** | ETAP (industry configuration wizards), Aeries CARS (industrial/oil & gas defaults), SnakeTray (AI data center application guides) | Users must manually configure every project from scratch: select voltage standards, fill limits, cable groups, ambient conditions, and code edition individually. Competitors offer "Oil & Gas", "Data Center", "Industrial", and "Utility" templates that pre-populate sensible defaults. CableTrayRoute has no such template system. This is especially relevant given the separately identified gap for data center infrastructure templates (Gap #8 above). |

**Status:** ✅ Implemented. `src/projectTemplates.js` defines three industry template presets — **Oil & Gas**, **Data Center**, and **Industrial** — each pre-populating representative cables and raceways. `src/projectManager.js` exposes `selectProjectTemplate()`, a keyboard-navigable modal card grid shown as the second step of the new-project flow. Selecting a template calls `mergeTemplateIntoProject()`, which inserts template cables and raceways before saving. Template card styles (`.template-grid`, `.template-card`) with hover, focus-visible, selected, and dark-mode support live in `src/styles/components.css`. A fourth "Blank" option is always available.

---

### 17. No Sensitivity Analysis or Scenario Comparison UI

| Missing UX Pattern | Competitor Benchmark | Description |
|---|---|---|
| **Side-by-side scenario comparison and parameter sweeps** | ETAP (scenario manager with comparison view), EasyPower (study case comparison) | `src/scenarios.js` exists and stores multiple study variants, but there is no UI for comparing scenarios side-by-side (e.g., "Design A: avg fill 42%, 3 violations" vs "Design B: avg fill 38%, 0 violations") or for sweeping a parameter (e.g., "show tray fill as ambient temperature increases from 25°C to 50°C"). Users cannot perform "what-if" analysis without manually switching scenarios and recording results manually. |

**Status:** ✅ Implemented. Dedicated `scenarios.html` page backed by `src/scenarioComparison.js` and `src/styles/scenarioComparison.css`. The comparison view shows two user-selected scenarios side-by-side: a cable schedule diff (Added / Removed / Changed rows highlighted in green / red / amber), per-scenario tray fill gauges rendered via `src/components/fillGauge.js`, and a study results summary card. Scenario metadata (name, created date, cable/tray counts) is pulled from `dataStore.mjs`.

---

### 18. Minimal Onboarding — 3-Step Tour for One Module Only

| Missing UX Pattern | Competitor Benchmark | Description |
|---|---|---|
| **Guided setup wizards and workflow walkthroughs** | EasyPower (step-by-step setup wizards), Bentley Raceway (workflow guidance panels) | `tour.js` provides only a 3-step interactive tour that targets the one-line diagram editor (palette → canvas → properties). There is no walkthrough for the core cable routing workflow (schedule → tray setup → fill → route), no guided introduction to any electrical study, and no "first-time user" wizard that walks through creating a complete project. New engineers face a steep learning curve with no in-app guidance beyond a help page. |

**Status:** ✅ Implemented. `tour.js` refactored into a reusable tour runner: `start(steps, tourKey)` accepts per-page step arrays and records completion in `localStorage` via `hasDoneTour(tourKey)`. Interactive 5-step tours added to all four core workflow pages: `cableschedule.html` (add cable, table, sample data, route-all, export), `racewayschedule.html` (add tray, tray table, add conduit, sample data, Revit export), `cabletrayfill.html` (tray params, add cable, fill gauge, draw, export), and `optimalRoute.html` (fill limit, field penalty, calculate, progress, results). Each page shows a "Take Tour" button and auto-triggers on first visit.

---

### 19. No Results Annotation or Engineer Approval Workflow

| Missing UX Pattern | Competitor Benchmark | Description |
|---|---|---|
| **Engineer notes and approval status on study results** | ETAP (comments on study results), Bentley Raceway (approval workflow with status stamps) | There is no way for an engineer to add notes to individual cables, flag a design rule violation as "accepted by engineer", mark a study result as "Approved by PE", or leave review comments for collaborators. This is a significant gap for multi-user collaboration — the existing real-time collaboration (`src/collabManager.js`) allows simultaneous editing but has no review/approval layer. |

**Status:** ✅ Implemented. The full approval workflow now spans three layers:
1. **Cable records** — `cableschedule.js` exposes `engineer_note` (free-text) and `review_status` (Pending / Approved / Flagged) columns on every cable row. Color-coded cells use `.review-status-*` CSS classes.
2. **DRC violations** — `designrulechecker.js` lets engineers "Accept Risk" on individual violations via `getDrcAcceptedFindings` / `setDrcAcceptedFindings` in `dataStore.mjs`, with documented rationale stored per finding.
3. **Study results** — `src/components/studyApproval.js` adds a reusable "Engineer Review" panel to all seven electrical study pages (Arc Flash, Load Flow, Short Circuit, Harmonics, Motor Start, TCC, Contingency). Each panel lets a PE set status, enter their name, set the review date, and add engineering notes. Data persists to project storage under `studyApprovals` (added to `dataStore.mjs`). A `getApprovalBadgeHTML()` helper is available for embedding the stamp in PDF/export outputs. Tests in `tests/studyApproval.test.mjs`.

---

### 20. No Workflow Progress Dashboard

| Missing UX Pattern | Competitor Benchmark | Description |
|---|---|---|
| **Project health summary showing completion status** | EasyPower (project health view), Aeries CARS (progress tracking view) | `src/workflowStatus.js` exists in the codebase but there is no UI that surfaces a project-level health summary: which workflow steps are complete, which analyses have violations, and what the next recommended action is. Users must navigate to each of the 47+ pages individually to discover outstanding issues. A single dashboard showing "Cable Schedule ✓ · Tray Fill ⚠ (3 violations) · Routing ✓ · Arc Flash ✗ (not run)" would significantly reduce time-to-discovery. |

**Status:** ✅ Implemented. `workflowdashboard.html` provides a three-panel project health overview:
1. **Workflow Progress** — a linear progress bar with "N of 7 workflow steps complete" text and a "Next recommended step" link, powered by `src/workflowStatus.js`.
2. **Project Summary** — stat tiles showing cable count, tray count, conduit count, ductbank count, and trays-over-80%-fill (linked to `cabletrayfill.html`).
3. **Electrical Studies** — list of 7 studies (Arc Flash, Short Circuit, Load Flow, Harmonics, Motor Start, Reliability, Contingency) showing whether each has saved results in localStorage. The page is bundled as `dist/workflowdashboard.js` and registered in the navigation under the Workflow section.

---

### 21. No Mobile-Optimized Field Access

| Missing UX Pattern | Competitor Benchmark | Description |
|---|---|---|
| **Mobile / tablet views for field inspection** | ETAP 2025 (dedicated mobile app), Aeries CARS (field access module) | Pages declare `<meta name="viewport">` and the navigation has a hamburger toggle, but complex tables, 3D Plotly visualizations, and multi-column forms are not usable on mobile screens. Competitors offer dedicated mobile views or companion apps that let field technicians view cable schedules, pull cards, and tray assignments on tablets during installation. This is particularly relevant given the QR code gap (Gap #6) — QR codes on pull cards are meaningless without a mobile-friendly target view. |

**Status:** ✅ Implemented. `fieldview.html` provides a mobile-optimized read-only page for field technicians. QR codes on pull cards (generated by `analysis/pullCards.mjs`) now link to `fieldview.html#cable=TAG` instead of the full desktop cable schedule. When the page loads it reads the cable tag from the URL hash, looks it up in localStorage project data, and displays a large-text card showing tag, from/to endpoints, conductor count and size, cable OD, voltage group, tray path, and notes — all in a touch-friendly layout (18px base font, 44px touch targets, max-width 640px). Tray QR codes link to `fieldview.html#tray=ID` via a new `trayQRPayload()` helper. Graceful fallback messages guide the user when no project is loaded or the cable/tray is not found. The page is registered in `src/components/navigation.js` under the Support section and includes a print stylesheet that hides navigation and action buttons.

---

### 22. Navigation Out of Sync on Static Pages

| Missing UX Pattern | Competitor Benchmark | Description |
|---|---|---|
| **Consistent application navigation** | All competitors (consistent navigation patterns) | `index.html`, `help.html`, `404.html`, and `500.html` use hardcoded navigation HTML that is missing all Studies pages (TCC, Harmonics, Motor Start, Load Flow, Short Circuit, Arc Flash) and the Custom Components and Account links. The dynamic navigation component (`src/components/navigation.js`) that correctly defines all 21 routes is not used on these pages. Users who arrive at the landing page or error pages cannot navigate to any electrical study. |

**Status:** Implemented. `src/components/navigation.js` is now injected dynamically on all pages including `index.html`, `help.html`, `404.html`, and `500.html`, providing consistent access to all 21+ routes.

---

## Calculation Completeness Gaps (2026-03-24 Pass)

These gaps describe areas where CableTrayRoute's calculation engine uses simplified models, omits required correction factors, or lacks analysis modes that best-in-class competitors (ETAP, EasyPower, SKM, Aeries CARS) provide.

---

### 23. Auto-Sizing Ignores Tray Derating and Ambient Temperature Corrections

| Missing Calculation | Competitor Benchmark | Description |
|---|---|---|
| **NEC 310.15(B) & (C) derating in conductor auto-selection** | ETAP cable sizing, EasyPower SmartDesign | `analysis/autoSize.mjs` looks up NEC ampacity tables at the 30°C baseline and selects the next-larger standard conductor size. It does not apply: (1) ambient temperature correction factors per NEC Table 310.15(B)(1)(a); (2) more-than-3-conductors bundling/grouping derating per NEC 310.15(C); or (3) tray fill derating per NEC 392.80(A). The result is that auto-selected conductors may be undersized once installation conditions are accounted for. ETAP and EasyPower both apply all three derating sequences before finalizing a conductor size. |

**Status:** ✅ Implemented. `analysis/autoSize.mjs` now contains the full NEC correction factor stack:
- `AMBIENT_TEMP_CORRECTION` table — NEC Table 310.15(B)(1)(a) factors for 60/75/90°C insulation ratings at ambient temperatures 10–90°C.
- `BUNDLING_FACTORS` table — NEC 310.15(C)(1) adjustment factors for 1–40+ current-carrying conductors in a raceway.
- `TRAY_FILL_FACTORS` map — NEC 392.80(A): `conduit` (1.0), `tray_spaced` (1.0), `tray_touching` (0.65).
- `ambientTempFactor(ambientTempC, tempRating)`, `bundlingFactor(bundledConductors)`, `trayFillFactor(installationType)` — exported helper functions.
- `selectConductorSize(requiredAmps, material, tempRating, {ambientTempC, bundledConductors, installationType})` — grosses up the required ampacity by `1/combinedFactor` before table lookup.
- `sizeFeeder()` and `sizeMotorBranch()` both accept `ambientTempC`, `bundledConductors`, and `installationType` parameters and pass them through to `selectConductorSize()`.
- `autosize.html` exposes "Installation Conditions" fieldsets for all three parameters on both the Feeder and Motor tabs, with NEC references in field hints. Results display the combined derating factor and derated installed ampacity when derating applies.

---

### 24. Auto-Sizing Does Not Minimize Cost or Evaluate Cu/Al Tradeoff

| Missing Calculation | Competitor Benchmark | Description |
|---|---|---|
| **Cost-optimized conductor selection** | ETAP (cost-optimized sizing with material tradeoff), EasyPower | `analysis/autoSize.mjs` selects the next-larger standard size meeting ampacity requirements without evaluating whether a larger aluminum conductor would meet the same requirement at lower cost, or whether two smaller parallel conductors would be cheaper than one large conductor. Competitors perform a cost/weight optimization across material choices. The `analysis/costEstimate.mjs` cost data and `analysis/intlCableSize.mjs` size tables are both available and could be used to build this tradeoff. |

**Status:** ✅ Implemented. `analysis/autoSize.mjs` includes `CU_COST_PER_FT` and `AL_COST_PER_FT` tables (RS Means–based indicative pricing) and four new exported functions:
- `conductorCostPerFt(size, material)` — $/ft lookup.
- `meetsParallelRequirement(size)` — NEC 310.10(H) ≥ 1/0 AWG check.
- `evaluateConductorOption(requiredAmps, material, tempRating, nParallel, options)` — returns ampacity, installed ampacity (after derating), cost per ft per phase, and NEC compliance notes.
- `minimizeCostConductors(requiredAmps, tempRating, {allowAluminum, maxParallel, …})` — evaluates all Cu/Al × 1–4 parallel combinations, filters NEC 310.10(H) violations, and returns options sorted cheapest-first.
`autosize.js` renders a "Conductor Cost Comparison" table below the feeder sizing result, with "selected" and "cheapest" badges, percentage-vs-baseline column, and RS Means disclaimer. Cu vs. Al savings of 20–40% are typical for large conductors.

---

### 25. Pull Tension Uses Simplified Capstan Friction Model

| Missing Calculation | Competitor Benchmark | Description |
|---|---|---|
| **Advanced pull tension with conductor stiffness and temperature effects** | Aeries CARS CableMatic (detailed pulling simulation), Bentley Raceway (pulling calculations) | `src/pullCalc.js` implements the standard exponential capstan friction model (T₂ = T₁ × e^(μθ)) for bends and constant friction for straight runs. Missing: (1) conductor jacket stiffness — large cables resist bending at corners, increasing effective tension beyond the capstan model; (2) temperature-dependent friction coefficient — jacket material (PVC, XLPE) stiffness varies significantly with ambient temperature; (3) acceleration forces for long pulls in inclined trays; (4) dynamic vs. static friction transition at start-of-pull. Aeries CARS models all four effects. |

**Status:** ✅ Implemented. `src/pullCalc.js` `calcPullTension()` now applies three additional correction terms on top of the base capstan model:
1. **Temperature-dependent friction** — PVC and XLPE jacket friction coefficients follow a linear temperature correction with per-material `alpha` coefficients referenced to 30°C (Southwire Cable Installation Manual). Coefficient rises ~15% in cold climates and decreases ~10% in hot plant environments.
2. **Conductor bending stiffness** — large cables resist conforming to bends, adding tension proportional to `EI × θ / R²` at each corner. Bending stiffness `EI` is derived from conductor outside diameter using a simplified hollow-tube model.
3. **Static vs. kinetic friction** — a static friction multiplier (default 1.5×) is applied to the first straight segment to model breakaway tension at start-of-pull. Subsequent segments use kinetic friction.

---

### 26. Short Circuit Analysis Limited to Three-Phase Symmetric Faults

| Missing Calculation | Competitor Benchmark | Description |
|---|---|---|
| **Full fault matrix: SLG, L-L, DLG, and impedance faults** | ETAP, EasyPower, SKM PowerTools (complete ANSI/IEC fault matrix) | `analysis/shortCircuit.mjs` calculates three-phase symmetric (3Φ) bolted fault currents using Thevenin impedance. The single line-to-ground (SLG) fault is the most common distribution fault type and typically produces the highest ground fault current in effectively-grounded systems. Line-to-line (L-L) and double line-to-ground (DLG) faults are required for full protective device coordination and arc flash boundary determination. Impedance faults (non-bolted) are required for high-resistance grounded systems. All three competitor platforms support the complete fault matrix. |

**Status:** Implemented. `analysis/shortCircuit.mjs` now computes SLG, L-L, and DLG faults using sequence network (positive/negative/zero sequence) impedance modeling alongside the existing 3LG calculation.

---

### 27. Harmonics Analysis Assumes Balanced Three-Phase Spectrum

| Missing Calculation | Competitor Benchmark | Description |
|---|---|---|
| **Per-phase unbalanced harmonic injection** | ETAP harmonic load flow, EasyPower harmonic analysis | `analysis/harmonics.js` calculates Total Harmonic Distortion (THD) and individual harmonic orders using a single-phase model with a quality-factor approximation (`const q = Number(f.q) || 1`). It does not support per-phase unbalanced harmonic spectra, which are common when single-phase VFDs, switch-mode power supplies, or EV chargers create different harmonic current magnitudes on each phase. Unbalanced harmonics drive triplen harmonic currents in the neutral conductor — a safety concern not detectable with a balanced model. |

**Status:** ✅ Implemented. `analysis/harmonics.js` exports `runHarmonicsUnbalanced(phaseData)`, which accepts optional per-phase spectra (`harmonicsA`, `harmonicsB`, `harmonicsC`) per component and falls back to the balanced `harmonics` field when absent. Triplen harmonic orders (3rd, 9th, 15th… — zero-sequence) are summed arithmetically across all three phases to compute neutral conductor RMS current; an overload flag is raised when the neutral exceeds 100 % of phase FLA. A phase imbalance flag is raised when per-phase ITHD values differ by more than 10 percentage points. The `harmonics.html` page adds an "Unbalanced Analysis" panel where engineers can enter independent Phase A/B/C spectra per component and view per-phase ITHD, worst VTHD, neutral current percentage, and overload/imbalance warnings. Neutral current summation math is tested in `tests/harmonics.test.mjs`.

---

### 28. Motor Starting Does Not Model VFDs or Soft Starters

| Missing Calculation | Competitor Benchmark | Description |
|---|---|---|
| **Reduced-voltage and VFD starting transient models** | ETAP (soft-starter and VFD motor starting), EasyPower (dynamic motor starting) | `analysis/motorStart.js` models direct-on-line (DOL) inrush current only: a multiplier (typically 6–8× FLA) applied as a step function. Variable-frequency drives (VFDs) limit inrush to approximately 1.0–1.5× FLA with a controlled ramp; reduced-voltage soft starters limit inrush to 2–4× FLA with a linear voltage ramp. These are the most common motor starting methods in modern industrial installations. Without VFD/soft-starter models, voltage drop analysis during motor starting is significantly overstated, leading to unnecessarily conservative cable and transformer sizing. |

**Status:** Implemented. `analysis/motorStart.js` models VFD (1.0–1.5× FLA controlled ramp) and soft-starter (2–4× FLA linear voltage ramp) starting transients in addition to direct-on-line (DOL).

---

### 29. No TCC Auto-Coordination Algorithm

| Missing Calculation | Competitor Benchmark | Description |
|---|---|---|
| **Automated protective device coordination** | ETAP Auto-Coordination, EasyPower Smart Coordination | `analysis/tcc.js` (320 KB) provides a full time-current curve library and manual curve plotting/overlay. Engineers must manually select and adjust device settings to achieve selective coordination. Neither ETAP's Auto-Coordination nor EasyPower's Smart Coordination require manual curve fitting — they automatically select device settings (pickup, time dial, instantaneous) that achieve coordination across the protection zone while minimizing arc flash incident energy. This is one of the most time-consuming tasks in electrical design and represents a high-value automation target. |

**Status:** ✅ Implemented. `analysis/tccAutoCoord.mjs` provides `greedyCoordinate(deviceEntries, faultCurrentA, options)` — a greedy source-to-load coordination pass over the TCC curve library in `analysis/tcc.js`. For each device in source→load order, `findCoordinatingTimeDial()` binary-searches the time-dial range to find the lowest setting that maintains a configurable margin (default 0.1 s) above the downstream device's operating time at every test current. `checkCoordination(upstream, downstream, testCurrents, margin)` validates any given pair. The result includes device-by-device coordination status, operating times at key currents, and margin values. The `tcc.html` page includes an "Auto-Coordinate" button that populates time-dial inputs and highlights coordination violations. Tests in `tests/tccAutoCoord.test.mjs`.

---

### 30. IFC Export Is a Non-Functional Stub

| Missing Calculation | Competitor Benchmark | Description |
|---|---|---|
| **Functional IFC 4.x geometry and property export** | MagiCAD 2026, Bentley Raceway, Trimble MEP (fully populated IFC property sets) | `bimExport.mjs` contains `IfcElectricDistributionBoard` stub objects and placeholder geometry without actual tray coordinates, cable segment data, or NEC/IEC property sets. The file is imported in the codebase but produces an IFC shell that downstream BIM tools (Navisworks, Revit, Solibri) cannot use for clash detection or COBie handover. This gap was previously identified (Gap #4) but is restated here because the existing code creates a false impression that IFC export is implemented — it is not functional. The `web-ifc` or `ifcjs` libraries are recommended to replace the stub with real geometry output. |

**Status:** Implemented. See Gap #4 above. `src/exporters/ifc4.mjs` provides functional IFC4 export with spatial hierarchy and cable tray geometry.

---

### 31. No Combined Seismic + Wind Load Scenario

| Missing Calculation | Competitor Benchmark | Description |
|---|---|---|
| **ASCE 7 combined load combinations (D + W + E)** | Eaton B-Line (combined load tables per NEMA VE 2), structural engineering standards | `analysis/seismicBracing.mjs` and `analysis/windLoad.mjs` operate as independent tools. NEMA VE 2 Section 4 and ASCE 7 Section 2.3 require checking combined load cases: dead load + wind (D + W) and dead load + seismic (D + 0.7E) simultaneously. A cable tray support designed for seismic alone may be inadequate for the combined wind + gravity case, and vice versa. No tool currently produces combined load demand vs. capacity ratios per support location. Eaton B-Line's CoSPEC tool includes combined load tables for their standard support products. |

**Status:** Implemented. `analysis/structuralLoadCombinations.mjs` wraps both `seismicBracing.mjs` and `windLoad.mjs` to evaluate ASCE 7-22 §2.3.1 (LRFD) and §2.4.1 (ASD) combined load combinations for cable tray supports: gravity (1.4D, 1.2D), wind-dominant (1.2D+W, 0.9D+W), and seismic-dominant ((1.2+0.2·S_DS)D+E_h and (0.9−0.2·S_DS)D+E_h). Vertical seismic effect E_v = 0.2·S_DS·D is applied per §12.4.2.2. The UI page `structuralcombinations.html` provides unified inputs, a full combination table with governing rows highlighted, and an optional capacity utilization check. Tested in `tests/structuralLoadCombinations.test.mjs`.

---

### 32. Contingency Analysis Does Not Check Transient Stability Limits

| Missing Calculation | Competitor Benchmark | Description |
|---|---|---|
| **Integrated post-contingency transient stability assessment** | ETAP (integrated dynamic contingency), EasyPower (dynamic study integration) | `analysis/contingency.mjs` runs a post-contingency steady-state load flow (N-1 outage) and flags voltage and thermal violations. It does not assess whether the post-fault power system trajectory violates transient stability limits: rotor angle stability (swing equation), rate-of-change-of-frequency (ROCOF), or inertia-dependent frequency nadir. A contingency that appears acceptable in steady-state load flow may cause loss of synchronism within the first few cycles. ETAP integrates its transient stability engine (`analysis/transientStability.mjs` equivalent) into the contingency sequence. |

**Status:** ✅ Implemented. `analysis/contingency.mjs` now accepts a `checkTransientStability` option (default `false`, opt-in). When enabled, generator-connected buses (those with `Pg > 0`) are identified and the classical OMIB swing equation from `analysis/transientStability.mjs` is simulated for each N-1 contingency. Pre-fault maximum power is estimated from the 30° operating-angle assumption (`Pmax_pre = Pm / sin(30°)`); post-fault maximum power scales by the squared post-contingency bus voltage ratio (`Pmax_post = Pmax_pre × (V_post/V_pre)²`). A bolted 3-phase fault (Pmax_fault = 0) is assumed during the fault period. Each contingency result now includes a `transientStability` field `{checked, stable, deltaMax_deg}`, and the summary includes a `transientlyUnstable` count. The `contingency.html` form exposes generator inertia H and fault clearing time inputs, and the results table shows a "Transient Stability" column with per-contingency stable/unstable status and peak rotor angle. Tests added in `tests/contingency.test.mjs`.

---

### 33. International Cable Sizer Silently Skips Unavailable Combinations

| Missing Calculation | Competitor Benchmark | Description |
|---|---|---|
| **Explicit warnings for unsupported size/insulation/installation combinations** | ETAP multi-standard cable sizing (explicit limitation notices) | `analysis/intlCableSize.mjs` line 528 contains `continue; // skip sizes with no data for this combination`. When no tabulated data exists for a user-selected combination of cable standard, insulation type, conductor material, and installation method, the size is silently omitted from the results. Users have no indication that certain options were not evaluated and may incorrectly assume the presented result is the only feasible size. ETAP and other professional tools explicitly flag "No data available for this configuration" rather than silently skipping. |

**Status:** ✅ Implemented. `analysis/intlCableSize.mjs` `sizeCable()` collects each skipped candidate into a `skippedSizes` array as `{ sizeMm2, reason }` before the `continue`, and includes the array on every return path — both `PASS` and `NO_SIZE_AVAILABLE`. `intlCableSize.js` `renderResult()` renders an amber warning block (using the existing `.result-warn` CSS class, `role="alert"`) listing each skipped size and its reason when `skippedSizes.length > 0`. All content is HTML-escaped. Four new tests in `tests/intlCableSize.test.mjs` verify the array is always present, empty for fully-tabulated combinations, and carries the required `{ sizeMm2, reason }` shape.

---

---

## One-Line Diagram UI Gaps (2026-04-05 Pass)

Benchmarked against: **ETAP 2024/2025** (Electric Copilot™, composite networks, operating state display), **EasyPower 2025** (title block templates, symbol libraries, IEC/ANSI toggle), **SKM PowerTools** (user-definable symbols, select-by-type, zoom area), **PowerWorld Simulator** (animated power flow, contour maps), and **NEPLAN 360** (web-native, minimap navigation, layer management).

---

### Gap #34 – Rubber-Band / Marquee Selection

| Missing Feature | Competitor(s) | Description |
|---|---|---|
| **Click-and-drag to select multiple components** | ETAP, EasyPower, SKM PowerTools, PowerWorld | All professional SLD editors allow dragging a selection rectangle across the canvas. Left-to-right drag (strict) requires fully enclosed components; right-to-left drag (crossing/intersect) selects any touched component. |

**Status:** ✅ Confirmed implemented. `oneline.js` `finalizeMarqueeSelection()` provides both strict (left→right, blue) and crossing (right→left, green dashed) marquee modes. The `marquee` state object and rendering in `render()` produce a visual rectangle during drag. Tests in `tests/onelineUIFeatures.test.mjs`.

---

### Gap #35 – Snap-to-Bus Auto-Connection on Drop

| Missing Feature | Competitor(s) | Description |
|---|---|---|
| **Auto-wire components to nearest bus on placement** | ETAP, EasyPower ("equipment automatically connects when placed on a bus") | When a protection or load component is dragged from the palette and dropped near a bus, it should snap to the nearest bus port and auto-create a connection. |

**Status:** ✅ Confirmed implemented. `oneline.js` `autoAttachComponent()` (line ~5137) runs after every palette drop and canvas move. It scans all other component ports within `max(12, gridSize/2)` px and auto-connects if within threshold. Called at `svg.addEventListener('drop')` and in the `mouseup` drag-end handler.

---

### Gap #36 – Energized / De-Energized Operating-State Display

| Missing Feature | Competitor(s) | Description |
|---|---|---|
| **Topology-based energized state coloring** | ETAP 2024 ("dynamic continuity check showing de-energized devices as semi-transparent") | Without running a full load-flow study, the diagram should visually distinguish equipment that is de-energized (due to open breakers or switches between it and a source) from equipment that is energized. ETAP renders de-energized equipment at reduced opacity in a user-selectable manner. |

**Status:** ✅ Implemented. `oneline.js` `computeEnergizedSet(components, connections)` performs a BFS/DFS from all `sources`-type nodes, traversing only through non-open switches/breakers (checks `props.state !== 'open'`). Returns a `Set<id>` of energized components. `renderEnergizedState(svg)` applies `.de-energized` CSS class (opacity 0.35, grayscale 80%) and a semi-transparent gray overlay rect to non-energized components. Toggle via `#toggle-energized` checkbox in the View toolbar group. Tests in `tests/onelineUIFeatures.test.mjs`.

---

### Gap #37 – IEC 60617 / ANSI-IEEE Symbol Standard Toggle

| Missing Feature | Competitor(s) | Description |
|---|---|---|
| **Global switch between IEC and ANSI symbol sets** | EasyPower 2025 (ANSI/IEEE and IEC standard symbols, user-importable symbol files), SKM PowerTools (interchangeable ANSI and IEC symbols) | International projects and IEC-jurisdiction utilities require IEC 60617 symbols (e.g., filled-circle generator, rectangular fuse). Switching globally between ANSI/IEEE and IEC symbol sets avoids manual per-component replacement. |

**Status:** ✅ Implemented. `componentLibrary.json` gains `iconIEC` fields for: Breaker (all voltage levels), Fuse, Transformer (2W), Switch (ATS, ST), Generator (synchronous), Motor Load. Six IEC SVG icons created under `icons/components/iec/` following IEC 60617-7 conventions. `oneline.js` `symbolStandard` state variable (persisted via `getItem`/`setItem('symbolStandard')`); in `render()` the icon selection uses `symbolStandard === 'IEC' && meta.iconIEC ? asset(meta.iconIEC) : meta.icon`. Toggle via `#symbol-standard-select` dropdown in Settings.

---

### Gap #38 – Title Block Template System

| Missing Feature | Competitor(s) | Description |
|---|---|---|
| **Drawing border with revision-tracking title block** | EasyPower 2025 (`.eztbk` title block format with company name, engineer, revision number, date, comments; up to 4+ revision rows) | Professional engineering drawings require a title block with project name, drawing number, revision letter, date, drawn-by, checked-by, company, and PE stamp area. EasyPower 2025 supports custom title block templates with multiple revision rows stored in an XML format. |

**Status:** ✅ Implemented. `oneline.js` `titleBlockFields` object (persisted via `setItem('diagramTitleBlock', ...)`). Fields: `projectName`, `drawingNumber`, `revision`, `revDate`, `drawnBy`, `checkedBy`, `company`, `peStamp`. `renderTitleBlock()` renders an HTML `<div id="title-block-overlay">` positioned bottom-right of the canvas scroll with a CSS `table.title-block-table`. Activated via `#title-block-show-toggle` checkbox in Settings. Edited via `#title-block-btn` → modal with 8 input fields. The overlay is excluded from DOM-to-SVG export paths (rendered as overlay on top of the SVG canvas).

---

### Gap #39 – Minimap / Overview Navigator

| Missing Feature | Competitor(s) | Description |
|---|---|---|
| **Inset overview map with viewport indicator** | NEPLAN 360 (spatial navigation, multi-user awareness), standard complex-diagram editors | Large diagrams with 50+ components on multiple sheets benefit from a bird's-eye minimap showing the full diagram extent with a semi-transparent rectangle indicating the current viewport. Click or drag in the minimap to pan to that location instantly. |

**Status:** ✅ Implemented. `#minimap-container` div (positioned absolute, bottom-left of `.oneline-canvas-scroll`) houses `#minimap-svg`. `oneline.js` `renderMinimap()` computes a scale factor from diagram bounds to minimap dimensions (180×120 px), draws filled rects for all non-group components, and draws a `.minimap-viewport` rect based on current `scrollLeft/scrollTop/zoom`. Called from `render()` and on scroll events. `minimapSvgEl.addEventListener('mousedown', ...)` converts minimap click coordinates back to diagram coords and scrolls the canvas. Toggle via `#minimap-toggle` in View toolbar. CSS in `src/styles/oneline.css`.

---

### Gap #40 – Component Grouping / Ungrouping

| Missing Feature | Competitor(s) | Description |
|---|---|---|
| **Named groups of components that move as a unit** | EasyPower, standard diagram editors | Selecting multiple components and grouping them creates a named group object that can be selected, moved, copied, and pasted as a single unit. The group renders a dashed bounding box with a label. Ungrouping dissolves the group back to its member components. |

**Status:** ✅ Implemented. `oneline.js` `groupSelection()` creates a `{ type:'group', memberIds:[], x, y, width, height, label:'Group' }` component encompassing the selection bounding box (+ 8px padding). The group renders as a dashed outline (`.group-outline`) with an italic label (`.group-label`). Moving a group moves all members (handled in drag logic). `ungroupComponent(groupId)` removes the group and restores members to the root `components[]`. Context menu shows "Group Selection" when ≥2 components selected, "Ungroup" when a group is right-clicked. Groups are backward-compatible — serialised as normal components in JSON. Tests in `tests/onelineUIFeatures.test.mjs`.

---

### Gap #41 – Lock / Unlock Components (UI-Exposed)

| Missing Feature | Competitor(s) | Description |
|---|---|---|
| **User-accessible component lock preventing accidental edits** | All professional SLD editors | The `locked` flag already existed in the data model but was never exposed to the user. Locking should: prevent drag-move, block keyboard Delete, block context-menu delete, and show a visual padlock indicator on the component. |

**Status:** ✅ Implemented. `oneline.js` `toggleLock(comp)` flips `comp.locked` and calls `pushHistory()` + `render()` + `save()`. Visual padlock `🔒` SVG text element appended near top-right of locked component bounding box (`.locked-indicator`). Guards added in: drag setup (locked components excluded from `dragOffset`), keyboard Delete handler, and context-menu Delete handler. Context menu item "Lock / Unlock" added to `oneline.html`. Tests in `tests/onelineUIFeatures.test.mjs`.

---

### Gap #42 – Zoom to Selection (Shift+F)

| Missing Feature | Competitor(s) | Description |
|---|---|---|
| **Fit viewport to selected components only** | ETAP ("Zoom Area"), EasyPower, SKM PowerTools | The existing `F` key fits all components into view. A complementary "Fit Selection" operation zooms and pans to tightly frame only the currently selected components — essential for inspecting a specific zone in a large diagram. |

**Status:** ✅ Implemented. `oneline.js` `zoomToSelection()` computes the bounding box of `selection[]` (or falls back to `zoomToFit()` when nothing is selected), applies the same fit logic as `zoomToFit()` scoped to that bounding box. Bound to `Shift+F` in the keyboard handler and to `#zoom-fit-selection-btn` button (added to Zoom toolbar group in `oneline.html`). Status bar hint updated to show "Shift+F: fit selection". Tests in `tests/onelineUIFeatures.test.mjs`.

---

### Gap #43 – Select Connected (Topology Flood-Fill)

| Missing Feature | Competitor(s) | Description |
|---|---|---|
| **Select all components reachable via connections** | ETAP (connectivity-based operations), power system analysis tools | Right-clicking a component and choosing "Select Connected" flood-fills through the connection graph (both inbound and outbound), selecting every component reachable from the starting component. Useful for isolating a protection zone, a radial feeder, or a generator island for collective operations (move, copy, delete). |

**Status:** ✅ Implemented. `oneline.js` `selectConnected(startId)` performs a BFS over `comp.connections[].target` (outbound) and reverse-scans all components for inbound connections, plus iterates `sheet.connections[]` (sheet-level connections). Sets `selection` and `selected`, calls `render()` and `updateStatusBar()`. Context menu "Select Connected" added to `oneline.html`. Tests in `tests/onelineUIFeatures.test.mjs`.

---

### Gap #44 – Select by Type

| Missing Feature | Competitor(s) | Description |
|---|---|---|
| **Select all components of the same subtype** | SKM PowerTools, ETAP (type-based selection) | "Select All of This Type" (right-click → context menu) selects every component on the current sheet that has the same `subtype` as the right-clicked component — e.g., select all LV circuit breakers, all motors, or all buses at once. Enables bulk property edits, alignment, or deletion. |

**Status:** ✅ Implemented. `oneline.js` `selectByType(subtype)` filters `components` by `c.subtype === subtype`, updates `selection` and `selected`, shows a toast with the count. Context menu "Select All of This Type" added to `oneline.html`. Tests in `tests/onelineUIFeatures.test.mjs`.

---

### Gap #45 – Animated Power-Flow Indicators

| Missing Feature | Competitor(s) | Description |
|---|---|---|
| **Directional animated arrows on energised connections** | PowerWorld Simulator ("animated flows with customization for size, color, shape, density, and animation parameter — actual vs. percent flow") | When Load Flow study results are displayed, connection lines should show animated directional indicators (arrows or moving dashes) that convey power flow direction and magnitude. Flow direction reverses for negative real-power (generators absorbing power or reverse-flow feeders). Animation speed scales with `|P|` magnitude. |

**Status:** ✅ Implemented. `oneline.js` `renderFlowAnimations(svg)` iterates all `comp.connections[]` that have a `loading_kW` result value. For each, it creates an SVG `<path>` arrow marker with an `<animateMotion>` child; animation `dur` is clamped between 0.5 s and 3 s and inversely proportional to `|loading_kW|` (faster for heavier feeders). Flow direction is determined by the sign of `loading_kW` (positive = source→target, negative = reverse). Arrows styled with `.flow-arrow` class. Activated when `showOverlays` is true; called from `render()` only when `showOverlays` is set.

---

### Gap #46 – Customizable Per-Type Datablocks

| Missing Feature | Competitor(s) | Description |
|---|---|---|
| **User-configured overlay fields per component type** | ETAP datablocks (user-configurable display blocks showing input data and study results), SKM PowerTools textblocks, EasyPower 2025 text templates | The existing "Views" modal has a single shared set of overlay attributes. ETAP, SKM, and EasyPower all allow per-component-type configuration: which fields appear as overlays next to each symbol type — e.g., show kV and %loading for transformers but show kA for breakers. |

**Status:** ✅ Implemented. `oneline.js` `diagramDatablockConfig` (`{ [subtype]: string[] }`, persisted via `setItem('diagramDatablockConfig', ...)`). `openDatablocksModal()` presents a two-column grid: left = list of subtypes in the current diagram, right = checkboxes for all schema fields from `componentMeta` plus standard study-result fields (`voltage_mag`, `shortCircuit.threePhaseKA`, `loading_kW`, `loading_amps`, `arcFlash.incidentEnergy`, `reliability.mtbf`). "Views" toolbar button now opens this modal. Saves per-subtype field arrays; `render()` uses them to build overlay text per component. CSS for modal in `src/styles/oneline.css`.

---

### Gap #47 – Orthogonal (Manhattan) Connection Routing

| Missing Feature | Competitor(s) | Description |
|---|---|---|
| **All connection segments restricted to horizontal/vertical** | Standard professional SLD editors (no diagonal wires), ETAP, EasyPower | Connection wires in professional SLD drawings use only horizontal and vertical segments (Manhattan routing). Diagonal connections look unprofessional and make it hard to read diagrams. A routing mode toggle should ensure all connections route through right-angle bends only. |

**Status:** ✅ Confirmed implemented (routing was already orthogonal). `oneline.js` `routeConnection()` has always generated horizontal-first or vertical-first polyline paths via `horizontalFirst()` and `verticalFirst()` helper functions with intersection avoidance. All rendered connections are already strictly orthogonal. The `#orthogonal-routing-toggle` checkbox added to Grid toolbar and `orthogonalRouting` state variable make the routing mode explicit and persistent (`setItem('orthogonalRouting', ...)`). The toggle is enabled by default visually indicating that orthogonal routing is active.

---

## Feature Comparison Matrix (Updated)

| Feature | CableTrayRoute | ETAP | EasyPower | Eaton B-Line | Legrand Cablofil | Bentley Raceway | Aeries CARS | OBO Construct | MagiCAD | Trimble MEP |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Cable Fill Calculator | Yes | Yes | — | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| 3D Route Visualization | Yes | Yes | Yes | — | — | Yes | Yes | Yes | Yes | Yes |
| Optimal Cable Routing (Dijkstra) | **Yes** | — | — | — | — | Yes | Yes | — | Yes | — |
| One-Line Diagram Editor | Yes | Yes | Yes | — | — | — | Yes | — | — | — |
| Load Flow (Newton-Raphson) | Yes | Yes | Yes | — | — | — | — | — | — | — |
| Short Circuit Analysis | Yes | Yes | Yes | — | — | — | — | — | — | — |
| Arc Flash (IEEE 1584) | Yes | Yes | Yes | — | — | — | — | — | — | — |
| Harmonics (IEEE 519) | Yes | Yes | Yes | — | — | — | — | — | — | — |
| TCC Coordination Curves | Yes | Yes | Yes | — | — | — | — | — | — | — |
| Motor Starting Study | Yes | Yes | Yes | — | — | — | — | — | — | — |
| Ductbank Thermal Analysis | Yes | Yes | — | — | — | — | Yes | — | — | — |
| Revit Plugin (Live Sync) | **No** | Yes | Yes | Yes | — | — | Yes | — | Yes | Yes |
| AutoCAD/AVEVA Plugin | **No** | — | — | Yes | Yes | Yes | Yes | Yes | Yes | — |
| BIM Object Library | **No** | — | — | Yes | Yes | — | — | Yes | — | — |
| Clash Detection | **Yes** ✓ | — | — | — | — | — | — | — | Yes | Yes |
| Support Span Calculator | **Yes** ✓ | — | — | Yes | Yes | Yes | — | — | — | — |
| Seismic Bracing Analysis | **Yes** ✓ | — | — | Yes | — | — | — | — | — | — |
| Wind Load Analysis | **Yes** ✓ | — | — | — | — | — | — | — | — | — |
| Product Configurator | **Yes** ✓ | — | — | Yes | Yes | — | — | Yes | — | — |
| Submittal Generator | **Yes** ✓ | — | — | Yes | Yes | — | Yes | Yes | — | — |
| Take-Off / Tray BOM | **Yes** ✓ | — | — | — | Yes | Yes | Yes | Yes | — | Yes |
| Cable Pull Cards | **Yes** ✓ | — | — | — | — | Yes | Yes | — | — | Yes |
| Prefab / Spool Sheets | **Yes** ✓ | — | — | — | Yes | — | — | — | — | Yes |
| Multi-Standard (IEC/BS/AS) | **Yes** ✓ | Yes | — | — | — | — | — | — | Yes | Yes |
| Transient Stability | **Yes** ✓ | Yes | Yes | — | — | — | — | — | — | — |
| Ground Grid Analysis | **Yes** ✓ | Yes | Yes | — | — | — | — | — | — | — |
| Magnetic Field / EMF Analysis | **Yes** ✓ | Yes | — | — | — | — | — | — | — | — |
| SmartDesign Auto-Sizing | **Yes** ✓ | — | Yes | — | — | — | Yes | — | — | — |
| Reliability / N-1 Analysis | **Yes** ✓ | Yes | Yes | — | — | — | — | — | — | — |
| Cost Estimation (RS Means basis) | **Yes** ✓ | — | — | Yes | Yes | — | Yes | — | — | — |
| Real-Time Collaboration | **Yes ✓** | Yes | — | — | — | Yes | — | — | — | Yes |
| PWA / Offline Support | **Yes** | — | — | — | — | — | — | — | — | — |
| Cost-Free Web Access | **Yes** | — | — | Partial | Partial | — | — | Yes | — | — |
| AI/LLM Natural Language Interface | **Yes** ✓ | Yes | — | — | — | — | — | — | — | — |
| IFC Export (Rich Property Sets) | **Yes** ✓ | — | — | — | — | Yes | Yes | — | Yes | Yes |
| Multi-Slot / Compartmented Tray Fill | **Yes ✓** | — | — | — | — | — | — | — | Yes | — |
| QR Code Tag Generation | **Yes** ✓ | Yes | — | — | — | — | — | — | — | — |
| Electrical Digital Twin Integration | **No** | Yes | — | — | — | — | — | — | — | — |
| Data Center Infrastructure Templates | **Yes** ✓ | — | — | — | — | — | — | — | — | — |
| Ordered-Length Cable Procurement | **Yes** ✓ | — | — | — | — | — | — | — | — | — |
| Open REST API / Scripting Automation | **Yes** ✓ | Yes | — | — | — | — | Yes | — | — | — |
| Parallel Cable / Multi-Core Runs | **Yes** ✓ | Yes | — | — | — | — | — | — | — | — |
| Cloud-Based Component Library | **No** | — | — | — | — | Yes | — | — | — | — |
| **Usability: Modal error dialogs (no alert())** | **Yes** ✓ | Yes | Yes | — | — | — | — | — | — | — |
| **Usability: Contextual fix guidance in violations** | **Yes** ✓ | Yes | Yes | — | — | — | — | — | — | — |
| **Usability: Visual fill gauges / heat-maps** | **Yes** ✓ | — | — | — | — | Yes | — | — | Yes | — |
| **Usability: Configuration profiles / templates** | **Yes** ✓ | Yes | — | — | — | — | Yes | — | — | — |
| **Usability: Scenario comparison UI** | **Yes** ✓ | Yes | Yes | — | — | — | — | — | — | — |
| **Usability: Full workflow onboarding tour** | **Yes** ✓ | Yes | Yes | — | — | Yes | — | — | — | — |
| **Usability: Results annotation / approval workflow** | **Yes** ✓ | Yes | — | — | — | Yes | — | — | — | — |
| **Usability: Workflow progress dashboard** | **Yes** ✓ | — | Yes | — | — | — | Yes | — | — | — |
| **Usability: Mobile-optimized field access** | **Yes** ✓ | Yes | — | — | — | — | Yes | — | — | — |
| **Calc: Short circuit full fault matrix (SLG/LL/DLG)** | **Yes** ✓ | Yes | Yes | — | — | — | — | — | — | — |
| **Calc: Auto-sizing with tray derating + ambient temp** | **Yes** ✓ | Yes | Yes | — | — | — | — | — | — | — |
| **Calc: Motor starting VFD / soft-starter models** | **Yes** ✓ | Yes | Yes | — | — | — | — | — | — | — |
| **Calc: TCC auto-coordination algorithm** | **Yes** ✓ | Yes | Yes | — | — | — | — | — | — | — |
| **Calc: Unbalanced per-phase harmonics** | **Yes** ✓ | Yes | Yes | — | — | — | — | — | — | — |
| **Calc: Combined seismic + wind load scenario** | **Yes** ✓ | — | — | Yes | — | — | — | — | — | — |
| **Calc: Post-contingency transient stability check** | **Yes** ✓ | Yes | Yes | — | — | — | — | — | — | — |
| **SLD: Cross-sheet off-page connectors** | **No** | Yes | Yes | — | — | — | Yes | — | — | — |
| **SLD: Arc flash warning label generation** | **No** | Yes | Yes | — | — | — | — | — | — | — |
| **SLD: Protection zone overlay / coloring** | **No** | Yes | — | — | — | — | — | — | — | — |
| **SLD: Named layer management** | **Yes** ✅ | Yes | Yes | — | — | — | — | — | Yes | — |
| **SLD: Background image / site plan underlay** | **No** | Yes | Yes | — | — | — | — | — | — | — |
| **TCC: IEC 60255 formula-based relay curves** | **No** | Yes | Yes | — | — | — | — | — | — | — |
| **TCC: Arc flash incident energy overlay** | **No** | Yes | Yes | — | — | — | — | — | — | — |
| **TCC: Ground fault / residual protection curves** | **No** | Yes | Yes | — | — | — | — | — | — | — |
| **TCC: CTI tabular coordination report** | ✅ Yes | Yes | Yes | — | — | — | — | — | — | — |
| **TCC: SVG / vector chart export** | **No** | Yes | Yes | — | — | — | — | — | — | — |
| **DC Short Circuit & DC Arc Flash (NFPA 70E D.8)** | **No** | Yes | Yes | — | — | — | — | — | — | — |
| **Battery / UPS Sizing (IEEE 485)** | **No** | Yes | Yes | — | — | — | — | — | — | — |
| **Capacitor Bank / PFC Sizing** | **Yes ✓** | Yes | Yes | — | — | — | — | — | — | — |
| **PV / BESS / Inverter-Based Resource Modeling** | **No** | Yes | — | — | — | — | — | — | — | — |
| **IEEE 1547 DER Interconnection Study** | **No** | Yes | Yes | — | — | — | — | — | — | — |
| **Frequency Scan / Harmonic Resonance** | **No** | Yes | Yes | — | — | — | — | — | — | — |
| **Voltage Stability (P-V / Q-V Curves)** | **No** | Yes | — | — | — | — | — | — | — | — |
| **Optimal Power Flow / Economic Dispatch** | **No** | Yes | — | — | — | — | — | — | — | — |
| **Generator Sizing (NFPA 110)** | **No** | Yes | Yes | — | — | — | — | — | — | — |
| **Differential Protection (87B/T/G)** | **No** | Yes | Yes | — | — | — | — | — | — | — |
| **IEC 60909 Short-Circuit Method** | **No** | Yes | Yes | — | — | — | — | — | — | — |
| **Cable Ampacity per IEC 60287** | **No** | Yes | — | — | — | — | — | — | — | — |
| **Voltage Flicker (IEC 61000-4-15 Pst/Plt)** | **No** | Yes | Yes | — | — | — | — | — | — | — |

*(✓ = implemented since initial 2026-03-16 analysis; new rows = gaps identified in 2026-03-24 refresh; **Usability** rows = UX pattern gaps; **Calc** rows = calculation completeness gaps; **SLD** rows = one-line diagram gaps; **TCC** rows = TCC engine gaps; all ✓ rows implemented as of 2026-04-05; **SLD/TCC** rows = newly identified 2026-04-06; bottom 14 rows = advanced power systems gaps identified 2026-04-12, not yet implemented)*

---

## Prioritized Recommendations

### Completed ✅

All originally high- and medium-priority feasible items have been implemented:

1. ~~**Support Span / Structural Load Calculator**~~ → `supportspan.html`
2. ~~**Tray Hardware BOM / Take-Off**~~ → `trayhardwarebom.html`
3. ~~**Cable Pull Cards / Construction Documents**~~ → `pullcards.html`
4. ~~**Multi-Standard Cable Sizing (IEC/BS)**~~ → `intlCableSize.html`
5. ~~**Clash Detection**~~ → `clashdetect.html`
6. ~~**Product Configurator with Manufacturer Catalogs**~~ → `productconfig.html`
7. ~~**Submittal Package Generator**~~ → `submittal.html`
8. ~~**Seismic Bracing Calculator**~~ → `seismicBracing.html`
9. ~~**SmartDesign Auto-Sizing**~~ → `autosize.html`
10. ~~**Prefabrication / Spool Sheet Support**~~ → `spoolsheets.html`
11. ~~**Transient Stability Analysis**~~ → `transientstability.html`
12. ~~**Ground Grid Analysis**~~ → `groundgrid.html`
13. ~~**Magnetic Field Exposure Analysis**~~ → `emf.html`
14. ~~**Reliability / N-1 Analysis**~~ → `reliability.html`
15. ~~**Cost Estimation**~~ → `costestimate.html`
16. ~~**Wind & Environmental Load Analysis**~~ → `windload.html`

### New High-Priority (Feasible in Web App — 2026-03-24) — All Implemented ✅

1. ~~**IFC Export (Rich Property Sets)**~~ → `src/exporters/ifc4.mjs`
2. ~~**AI/LLM Natural Language Interface**~~ → `src/copilot.js`, `/api/copilot`
3. ~~**QR Code Tag Generation**~~ → `analysis/pullCards.mjs`, `analysis/trayHardware.mjs`

### New Medium-Priority (Feasible in Web App — 2026-03-24) — All Implemented ✅

4. ~~**Open REST API / Scripting Automation**~~ → `server.mjs` `/api/v1/` routes, `docs/api-reference.md` ✅
5. ~~**Ordered-Length Cable Procurement Planning**~~ → `analysis/cableProcurement.mjs`, Procurement Schedule tab in `spoolsheets.html`. ✅
6. ~~**Multi-Slot / Compartmented Tray Fill**~~ — Per-slot fill tracking via `slotFills[]`, `slot_groups` JSON field, per-slot DRC-01/DRC-02 in the DRC, and auto-populated fill UI. ✅
7. ~~**Data Center Infrastructure Templates**~~ — AI Data Center template with hot/cold aisle topology, Cat6A/fiber cable types, and DRC-06 EMI segregation rule. ✅
8. ~~**Parallel Cable / Multi-Core Runs**~~ → `parallel_count` field in cable schedule, DRC-07 NEC 310.10(H) validation, aggregate ampacity/fill in DRC-03. ✅

### New Low-Priority / Deferred (2026-03-24)

9. **Cloud-Based Component Library** — Shared organization-wide product library synchronized via the existing collaboration backend. Aligns with Bentley's Components Center model.
10. ~~**Electrical Digital Twin / Navisworks Export**~~ — ✅ **Implemented 2026-04-11** — `src/exporters/gltf2.mjs` `exportToGLTF2()` exports cable tray solid mesh geometry and cable route polylines as a glTF 2.0 binary (`.glb`) for Navisworks / BIM 360 import. Docs: `docs/gltf-export.md`. Tests: `tests/gltfExport.test.mjs`.
11. **Revit Plugin / BIM Sync** — Requires Revit SDK (Windows-native C#/.NET). IFC export is the recommended interim step.
12. **AutoCAD / AVEVA Plugin** — Requires commercial CAD SDK licensing.
13. **BIM Object Library** — Requires manufacturer data partnerships for Revit RFA / IFC families.
14. **Live Manufacturer Pricing** — Requires commercial pricing data licenses (RS Means, Eaton/Harrison, Legrand).
15. ~~**Real-Time Multi-User Collaboration**~~ → Implemented via WebSocket presence bar and `src/collaborationServer.mjs`.

---

### New Gaps — One-Line Diagram & TCC Deep Dive (2026-04-06)

**High Priority — TCC (high engineering value, directly affects study deliverables):**

1. ~~**IEC 60255 Formula-Based Relay Curves** (Gap #53)~~ — ✅ **Implemented.** `analysis/iecRelayCurves.mjs` formula engine + `analysis/tccUtils.js` IEC handler with curveFamily override + `iec_parametric_relay` device in `data/protectiveDevices.json` (NI/VI/EI/LTI dropdown). Tests: `tests/tcc/iecRelayCurves.test.mjs`. Docs: `docs/iec-relay-curves.md`.

2. ~~**CTI Tabular Coordination Report** (Gap #56)~~ — ✅ **Implemented.** `reports/coordinationReport.mjs` `buildCTIRows()` + "Export CTI Report" button in `tcc.html`. Tests: `tests/tcc/ctiReport.test.mjs`.

3. ~~**Arc Flash Incident Energy Overlay on TCC** (Gap #54)~~ — ✅ **Implemented 2026-04-06.** `analysis/arcFlash.mjs` `incidentEnergyLimitCurve()` + `'arcFlashOverlay'` view option in `analysis/tcc.js` + threshold selector in `tcc.html`. Tests: `tests/tcc/arcFlashOverlay.test.mjs`.

4. ~~**SVG / Vector Chart Export** (Gap #57)~~ — ✅ **Implemented.** `analysis/tcc.js` `handleExportSVG()` / `handleExportPNG()` + "Export SVG" / "Export PNG" buttons in `tcc.html`. Utilities in `analysis/chartExportUtils.mjs`. Tests: `tests/tcc/chartExport.test.mjs`.

**Medium Priority — TCC:**

5. ~~**Ground Fault / Residual Protection Curves** (Gap #55)~~ — ✅ **Implemented 2026-04-11.** 5 GFP relay entries in `data/protectiveDevices.json`; `greedyCoordinateGFP()` in `analysis/tccAutoCoord.mjs`; "Ground Fault Plane" view in `analysis/tcc.js` with dashed purple curves. Docs: `docs/ground-fault-protection.md`. Tests: `tests/tcc/groundFaultProtection.test.mjs`.

**High Priority — One-Line Diagram:**

6. ~~**Cross-Sheet Off-Page Connectors** (Gap #48)~~ — ✅ **Implemented 2026-04-10.** `link_source`/`link_target` stubs activated with `linked_sheet` prop, badge rendering, double-click navigation, and cross-sheet validation. See `docs/off-page-connectors.md`.

**Medium Priority — One-Line Diagram:**

7. ~~**Arc Flash Warning Label Generation** (Gap #49)~~ — ✅ **Implemented 2026-04-07.** `reports/arcFlashReport.mjs` `buildLabelSheetHtml()` / `openLabelPrintWindow()` + "Print Labels" button in `oneline.html` Studies panel + `renderArcFlashLabelOverlays()` overlay badges in `oneline.js`. Tests: `tests/arcFlashLabels.test.mjs`. Docs: `docs/arc-flash-labels.md`.

8. **Named Layer Management** (Gap #51) — ✅ Implemented 2026-04-06. See `docs/layer-management.md`.

**Lower Priority — One-Line Diagram:**

9. **Protection / Coordination Zone Overlay** (Gap #50) — ✅ Implemented 2026-04-11. Users define named protection zones, assign components via canvas click in assignment mode; each zone renders as a translucent colored `<rect>` beneath the component layer in `render()`.

10. **Background Image / Site Plan Underlay** (Gap #52) — Recommended: add a file input for JPEG/PNG; store as a base64 data URL in `sheets[activeSheet].backgroundImage`; render as an `<image>` element at z-index 0 in the SVG canvas.

---

### Usability & Calculation Quality (2026-03-24 Pass)

**High Priority — Usability (quick wins with large UX impact) — All Done ✅:**

1. ~~**Replace `alert()` with modal dialogs**~~ (Gap #13) → Implemented. `src/components/modal.js` applied app-wide. ✅
2. ~~**Sync navigation on static pages**~~ (Gap #22) → Implemented. `src/components/navigation.js` injected on all pages. ✅
3. ~~**Add contextual "how to fix" guidance to violations**~~ (Gap #14) → Implemented. `remediation` field added to all DRC findings; rendered as "How to fix:" in the UI and included in text exports. ✅
4. ~~**Workflow progress dashboard**~~ (Gap #20) → Implemented. `workflowdashboard.html` — 7-step progress bar, project summary stats, and study completion panel. ✅

**Medium Priority — Usability — All Done ✅:**

5. ~~**Visual fill gauges and violation heat-map**~~ (Gap #15) → Implemented. `src/components/fillGauge.js` SVG semi-circular gauge wired into `cabletrayfill.js`, `conduitfill.js`, and scenario comparison; heat-map row colours on tray fill result table. ✅
6. ~~**Scenario comparison UI**~~ (Gap #17) → Implemented. Dedicated `scenarios.html` page with side-by-side cable schedule diff (Added/Removed/Changed), tray fill gauges, and study results comparison. `src/scenarioComparison.js`, `src/styles/scenarioComparison.css`. ✅
7. ~~**Configuration profiles / project templates**~~ (Gap #16) → Implemented. `src/projectTemplates.js` — Oil & Gas, Data Center, Industrial presets; template card selector in new-project flow via `src/projectManager.js`. ✅
8. ~~**Expanded onboarding tour**~~ (Gap #18) → Implemented. `tour.js` refactored; 5-step interactive tours on Cable Schedule, Raceway Schedule, Tray Fill, and Optimal Route pages with auto-trigger on first visit. ✅

**High Priority — Calculation Completeness — All Done ✅:**

9. ~~**Short circuit full fault matrix**~~ (Gap #26) → Implemented. SLG, L-L, DLG in `analysis/shortCircuit.mjs`. ✅
10. ~~**Auto-sizing with derating factors**~~ (Gap #23) → Implemented. `ambientTempFactor()`, `bundlingFactor()`, `trayFillFactor()` in `analysis/autoSize.mjs`; NEC 310.15(B)/(C) + 392.80(A) applied to all sizing functions; UI inputs in `autosize.html`. ✅
11. ~~**Motor starting VFD and soft-starter models**~~ (Gap #28) → Implemented. VFD and soft-starter profiles in `analysis/motorStart.js`. ✅

**Medium Priority — Calculation Completeness — All Done ✅:**

12. ~~**TCC auto-coordination algorithm**~~ (Gap #29) → Implemented. `greedyCoordinate()` in `analysis/tccAutoCoord.mjs`; greedy source-to-load coordination with configurable margin; Auto-Coordinate button in `tcc.html`. ✅
13. ~~**Combined seismic + wind load scenario**~~ (Gap #31) → Implemented. `analysis/structuralLoadCombinations.mjs`; ASCE 7-22 §2.3.1/§2.4.1 LRFD/ASD combinations; `structuralcombinations.html`. ✅
14. ~~**Fix IntlCableSize silent skipping**~~ (Gap #33) → Implemented. `skippedSizes[]` array on all `sizeCable()` return paths; amber warning block in `intlCableSize.js` UI. ✅
15. ~~**Unbalanced per-phase harmonic injection**~~ (Gap #27) → Implemented. `runHarmonicsUnbalanced()` in `analysis/harmonics.js`; per-phase ITHD, neutral RMS current, triplen summation, overload and imbalance flags. ✅

**Low Priority — Calculation Completeness — All Done ✅:**

16. ~~**Pull tension conductor stiffness model**~~ (Gap #25) → Implemented. `src/pullCalc.js` extended with temperature-dependent friction, bending stiffness correction, and static/kinetic friction transition. ✅
17. ~~**Post-contingency transient stability coupling**~~ (Gap #32) → Implemented. `analysis/contingency.mjs` integrates `transientStability.mjs` for generator buses; `checkTransientStability` option; per-contingency stable/unstable status and peak rotor angle. ✅
18. ~~**Auto-sizing Cu/Al cost optimization**~~ (Gap #24) → Implemented. `minimizeCostConductors()` and `evaluateConductorOption()` in `analysis/autoSize.mjs`; Cu/Al cost comparison table in `autosize.html`. ✅
19. ~~**Results annotation and approval workflow**~~ (Gap #19) → Implemented. `engineer_note`/`review_status` cable columns; DRC accept-risk workflow; `src/components/studyApproval.js` PE stamp panel on all study pages. ✅
20. ~~**Mobile-optimized field access view**~~ (Gap #21) → Implemented. `fieldview.html` — touch-friendly read-only cable/tray card; QR code targets updated. ✅

---

### New Gaps — Advanced Power Systems & DER (2026-04-12)

**High Priority — Critical for IEC-jurisdiction projects and modern DER/renewable integration:**

1. **IEC 60909 Short-Circuit Method** (Gap #68) — Required for all non-ANSI-jurisdiction projects. The existing `analysis/shortCircuit.mjs` uses ANSI/IEEE methods only. IEC 60909 voltage factor c, impedance correction factors KG/KT/KSO, peak current ip (κ factor), and breaking/steady-state current distinction are all absent. This blocks use of CableTrayRoute on any IEC-standard project.
2. ~~**IEC 60287 Cable Ampacity** (Gap #69)~~ — ✅ **Implemented 2026-04-17.** `analysis/iec60287.mjs`, `iec60287.html`, `tests/iec60287.test.mjs`, `docs/iec60287.md`.
3. **DC System Short-Circuit & DC Arc Flash** (Gap #58) — Essential for battery rooms, PV arrays, data center UPS buses, and transit/marine DC systems. NFPA 70E Annex D.8 / IEEE 1584 DC model. Recommended modules: `analysis/dcShortCircuit.mjs`, `analysis/dcArcFlash.mjs`.
4. ~~**PV / BESS / Inverter-Based Resource Modeling** (Gap #61)~~ — ✅ **Implemented 2026-04-18.** `analysis/ibrModeling.mjs`, `ibr.html`, `tests/ibrModeling.test.mjs`, `docs/ibr-modeling.md`.
5. ~~**IEEE 1547-2018 DER Interconnection Study** (Gap #62)~~ — ✅ **Implemented 2026-04-18.** `analysis/derInterconnect.mjs`, `derinterconnect.html`, `tests/derInterconnect.test.mjs`, `docs/der-interconnection.md`.

**Medium Priority — High engineering value, common in industrial and utility projects:**

6. ~~**Capacitor Bank Sizing & PFC** (Gap #60)~~ — ✅ **Implemented 2026-04-12.** `analysis/capacitorBank.mjs`, `capacitorbank.html`, `tests/capacitorBank.test.mjs`, `docs/capacitor-bank.md`.
7. **Frequency Scan / Harmonic Resonance** (Gap #63) — Required companion to any capacitor bank installation and essential for harmonic filter design. Impedance-frequency sweep, resonance identification. Recommended: extend `analysis/harmonics.js` with `frequencyScan()`.
8. **Battery / UPS Sizing per IEEE 485** (Gap #59) — Standard for any facility with emergency power. Duty cycle modeling, cell selection, temperature/aging correction. Recommended module: `analysis/batterySizing.mjs`.
9. ~~**Standby / Emergency Generator Sizing** (Gap #66)~~ — ✅ **Implemented 2026-04-12.** `analysis/generatorSizing.mjs`, `generatorsizing.html`, `tests/generatorSizing.test.mjs`, `docs/generator-sizing.md`.
10. **Differential Protection Modeling (87B/T/G)** (Gap #67) — Required for transformer and generator unit protection. Percentage-differential characteristic, CT ratio matching, harmonic restraint. Recommended: extend `analysis/tcc.js` and `data/protectiveDevices.json` with `'differential'` device type.

**Lower Priority — Advanced studies for transmission-level and utility planning:**

11. **Voltage Stability (P-V / Q-V Curves)** (Gap #64) — Continuation power flow for voltage collapse margin. Important for NERC TPL compliance and large industrial motor loads. Recommended: extend `analysis/loadFlow.js` with CPF mode.
12. **Optimal Power Flow / Economic Dispatch** (Gap #65) — Loss minimization, generation cost optimization. Most relevant for utility operations and microgrids with multiple dispatchable sources. Recommended module: `analysis/optimalPowerFlow.mjs`.
13. **Voltage Flicker (IEC 61000-4-15 Pst/Plt)** (Gap #70) — Important for facilities with arc furnaces, large motor starts, or wind generation. Pst/Plt calculation, IEC 61000-3-3 / IEEE 1453 compliance. Recommended module: `analysis/voltageFlicker.mjs`.

---

## CableTrayRoute Unique Advantages (Not Found in Competitors)

These features are unique strengths that competitors do not offer:

1. **Dijkstra-Based Optimal Cable Routing** — Automated least-cost pathfinding with capacity constraints. While Bentley Raceway and Aeries CARS offer automatic routing, CableTrayRoute's algorithm with thermal penalties and rebalancing is unique.
2. **Route Rebalancing** — Automatic rerouting when tray fill exceeds limits
3. **GPU-Accelerated Thermal Analysis** — Browser-based GPU.js thermal calculations
4. **Full PWA with Offline Support** — Works offline as an installable web app
5. **Free Web-Based Access** — No license cost, no desktop installation required
6. **Integrated End-to-End Workflow** — Cable schedule through routing through electrical studies in one platform
7. **Cable Group / Voltage Segregation in Routing** — Automatic enforcement of cable separation rules during routing
8. **Wind Load Analysis** — No competitor cable tray tool offers native wind load per ASCE 7
9. **Comprehensive Electrical Studies Suite** — Load flow, short circuit, arc flash, harmonics, TCC, motor starting, transient stability, reliability, EMF — all in a single free web app

---

## Sources

### Manufacturer Tools
- [Eaton B-Line CoSPEC Specifier Center](https://www.eaton.com/us/en-us/products/support-systems/b-line-series-cospec-specifier-center.html)
- [Eaton B-Line Software & Resources](https://www.eaton.com/us/en-us/products/support-systems/b-line-series-software-and-resources.html)
- [Legrand Cablofil Tools](https://cablofiltools.com/)
- [Legrand 3D Modeling Files](https://www.legrand.us/tools/cablofil-3d-modeling-files)
- [Legrand Interactive Load Table](https://www.legrand.ca/cablofil/tools/load-table.aspx)
- [Panduit Calculators & Design Tools](https://www.panduit.com/en/support/tools/calculators-and-design-tools.html)
- [Niedax Cable Calculator](https://www.niedax.com/de-en/cable-calculator/)
- [Niedax BIM Integration](https://www.niedax-group.com/en/who-we-are/innovation/bim/)
- [OBO Construct Software](https://www.obo.global/service/obo-construct/)
- [OBO Cable Assignment Calculator](https://www.obo.global/service/obo-construct/cable-assignment/)
- [Chalfant Contractor Tools](https://chalfant-obo.com/contractor-tools/)

### Power System Analysis Platforms
- [ETAP Cable Sizing Software](https://etap.com/product/cable-sizing-software)
- [ETAP Cable Systems Package](https://etap.com/packages/cable-systems)
- [EasyPower Products](https://www.easypower.com/products/easypower)
- [SKM Systems Analysis](https://www.skm.com/)
- [IEEE Atlanta IAS: SKM vs ETAP vs EasyPower](https://ewh.ieee.org/r3/atlanta/ias/2019-2020_Presentations/2020-05-18_SKMvsETAPvsEasyPower.pdf)

### Raceway & Cable Management Software
- [Bentley Raceway and Cable Management](https://www.bentley.com/software/bentley-raceway-and-cable-management/)
- [Aeries CARS Electrical Design Software](http://aeriescars.com/electrical-design-software-construction-management)
- [Aeries TrayMatic](http://aeriescars.com/traymatic-raceway-design)
- [Aeries CableMatic Plus](http://aeriescars.com/cablematic-plus-automatic-cable-routing-and-scheduling)
- [MagiCAD Cable Tray Modeling](https://www.magicad.com/tools/cable-tray-and-conduit-modelling/)
- [Trimble SysQue](https://www.trimble.com/en/products/trimble-sysque)
- [Paneldes Raceway Software](https://elecdes.com/electrical-cad-software/paneldes-raceway-and-cable-routing-software)

### Structural & Seismic Analysis
- [Seismic Analysis of Cable Trays (ScienceDirect)](https://www.sciencedirect.com/science/article/abs/pii/0029549378902418)
- [Optimal Cable Tray Support Span (ResearchGate)](https://www.researchgate.net/publication/349122839_An_In-depth_Analysis_for_Optimal_Cable_Tray_Support_Span)

### 2025–2026 Competitor Release Notes (2026-03-24 Refresh)

#### ETAP
- [ETAP What's New](https://etap.com/products/whats-new)
- [ETAP 2024 Release Notes](https://etap.com/product-releases/etap-2024-release)
- [ETAP Electrical Digital Twin + NVIDIA Omniverse (March 2025)](https://etap.com/company/news/in-the-news/2025/03/13/etap-introduces-world-s-first-electrical-digital-twin-to-simulate-ai-factory-power-from-grid-to-chip-level-using-nvidia-omniverse)
- [ETAP Electric Copilot™ AI Feature](https://etap.com/products/whats-new)

#### EasyPower
- [EasyPower 2025 What's New](https://help.easypower.com/ezp/25.0/Content/96_Release_Notes/What_s_New.htm)
- [EasyPower 2025 Release Details](https://help.easypower.com/ezp/25.0/Content/96_Release_Notes/2025_Release_Details.htm)

#### Bentley Raceway and Cable Management
- [Bentley Raceway 2024 New Features](https://docs.bentley.com/LiveContent/web/Bentley%20Raceway%20and%20Cable%20Management%20Help-v12/en/GUID-DE28893D-FFA3-4B18-8594-1F8E0D3F665F.html)
- [Bentley Components Center](https://www.bentley.com/software/bentley-raceway-and-cable-management/)

#### MagiCAD
- [MagiCAD 2026 for AutoCAD New Features](https://www.magicad.com/updates-and-releases/magicad-2026-autocad/)
- [MagiCAD 2026 for Revit New Features](https://www.magicad.com/updates-and-releases/magicad-2026-revit/)

#### Eplan Platform
- [Eplan Platform 2025 Smart Features](https://www.eplan.com/us-en/blog/software/eplan-platform-2025-smart-features-for-effortless-engineering)
- [Eplan Platform 2025 Connecting and Cabling](https://blog.eplan.co.uk/whats-new-in-eplan-platform-2025-clever-connecting-and-cabling)
- [Eplan Platform 2026 Sneak Peek](https://www.eplan.com/us-en/about-us/press/first-sneak-peek-into-the-upcoming-eplan-platform-2026/)

#### Autodesk Revit 2026
- [Revit 2026 New Conductor Capabilities](https://www.autodesk.com/blogs/aec/2025/06/23/new-conductor-capabilities-in-revit-2026/)
- [What's New in Revit 2026 (AUGI)](https://www.augi.com/articles/detail/whats-new-in-revit-2026)
- [Design Master: Revit 2026 Wire Sizing Changes](https://www.designmaster.biz/blog/2025/08/revit-2026-reinvents-wire-sizing/)

#### AutoCAD Plant 3D 2026
- [Plant 3D 2026 What's New](https://help.autodesk.com/cloudhelp/2026/ENU/Plant3D-WhatsNew/files/GUID-384C71E7-9012-48B1-95B2-D4C42EBCF423.htm)
- [Plant 3D 2026 New Features Overview](https://blog.integadesign.de/en/cad-blog/plant-3d-2026-new-features)

#### Paneldes
- [Paneldes 2025 Release Notes](https://elecdes.com/support/release-notes)

#### Industry Trends
- [AI Data Center Cable Management (Introl)](https://introl.com/blog/cable-management-systems-fiber-pathways-ai-data-center-2025)
- [AI Data Center Cabling Solutions (SnakeTray)](https://www.snaketray.com/ai-data-center-cabling-solutions/)
- [Rockwell & Eplan Digital Twin Partnership (SPS 2025)](https://www.rockwellautomation.com/en-no/company/news/press-releases/digital-twin-driven-electrical-simulation.html)
- [IFC Material Overrides for Cable Tray](https://digitalbbq.au/index.php/2025/08/07/setting-ifc-material-overrides-for-cable-tray-and-conduit/)

### Advanced Power Systems Standards (2026-04-12 Refresh)

#### IEC Standards
- IEC 60909-0:2016 — Short-circuit currents in three-phase AC systems (calculation of currents)
- IEC 60287-1-1:2023 — Electric cables: calculation of the current rating (100% load factor, direct burial)
- IEC 61000-4-15:2010+A1:2023 — Electromagnetic compatibility: flickermeter (functional and design specs)
- IEC 60071-1:2019 — Insulation coordination: definitions, principles and rules

#### IEEE Standards
- IEEE 946-2020 — Recommended Practice for the Design of DC Power Systems for Stationary Applications
- IEEE 485-2020 — Recommended Practice for Sizing Lead-Acid Batteries for Stationary Applications
- IEEE 1547-2018 — Standard for Interconnection and Interoperability of DER with Electric Power Systems
- IEEE 1453-2022 — Recommended Practice for the Analysis of Fluctuating Installations on Power Systems (voltage flicker)

#### NFPA / NEC
- NFPA 70E-2024 Annex D.8 — DC Arc Flash Hazard Calculation Methods
- NFPA 110-2022 — Standard for Emergency and Standby Power Systems
- NEC 700/701/702 — Emergency / Legally Required Standby / Optional Standby Systems

#### Competitor Study Catalogs
- ETAP DC Systems Module (battery sizing, DC short circuit, DC arc flash)
- ETAP Renewable Energy Module (PV array, BESS, IBR dynamic models)
- ETAP Voltage Stability (continuation power flow, P-V/Q-V curves)
- ETAP Optimal Power Flow (OPF with economic dispatch)
- EasyPower DC Arc Flash and DC Short Circuit modules
- EasyPower Capacitor Bank Sizing and Power Factor Correction
- DIgSILENT PowerFactory (frequency scan, quasi-dynamic simulation, IEC 60909, IEC 60287)
- SKM DAPPER DC Module (DC short circuit, battery sizing)
- CYME DER Hosting Capacity and Time-Series Load Flow
- Siemens PSS SINCAL (insulation coordination, IEC cable rating)
- Caterpillar SpecSizer (generator sizing with motor start transient analysis)
- Schneider Ecodial (DC systems, battery sizing, IEC 60909)

---

## Next Major Steps — Recommended Roadmap (as of 2026-04-12)

**Active focus: Advanced Power Systems & DER Analysis (Gaps #58–#70).** These 13 gaps represent the next tier of competitive features — advanced AC/DC studies, DER/renewable integration, and IEC calculation methods. See the priority table in "New Gaps — Advanced Power Systems & DER (2026-04-12 Roadmap)" above for the recommended implementation order.

All prior gaps (#1–#57) have been implemented as of 2026-04-11. The tables below are preserved for historical reference with ✅ status.

### 2026-04-12 Implementation Notes

#### Gap #68 — IEC 60909 Short-Circuit Method ✅ Implemented

Full IEC 60909-0:2016 equivalent voltage source method implemented in `analysis/iec60909.mjs`. The existing `analysis/shortCircuit.mjs` now delegates to this engine when `method === 'IEC'`.

**Implemented:**
- `cFactor(kV, mode, lvTolerancePct)` — Table 1 voltage factor lookup (LV/MV/HV, c_max/c_min)
- `kappaIEC(xr)` — Correct IEC peak factor formula: κ = 1.02 + 0.98 × e^(−3/XR) (§4.3.1.1)
- All four fault type currents: I"k3, I"k2, I"k1, I"k2E (§4.2–4.5)
- `ip` — Peak current: κ × √2 × I"k3
- `Ib` — Breaking current (far-from-generator: Ib = I"k3)
- `Ith` — Thermal equivalent current: I"k3 × √(m+1), with m computed via IEC §4.8.1 analytical formula
- `transformerCorrectionKT(xTPu, cMax)` — K_T formula exported but not yet applied in the batch runner
- Standalone study page `iec60909.html` with c-factor mode selector, fault duration input, PDF/CSV export
- Full unit test suite: `tests/iec60909/iec60909.test.cjs` (25 tests, all passing)
- User documentation: `docs/iec-60909.md`

**Deferred (follow-on work):**
- K_T impedance correction automatically applied per-transformer (currently exported but not batch-applied)
- K_G generator correction factor (synchronous machine impedance correction per §3.6)
- Near-to-generator μ factor for Ib reduction when generators contribute to the fault
- Integration into one-line diagram overlays (I"k3/ip overlay labels)

### Priority 1 — Low Effort, High Impact — All Done ✅

| # | Gap | Files | Status |
|---|---|---|---|
| 1 | ~~**Workflow Progress Dashboard** (#20)~~ | `workflowdashboard.html`, `dist/workflowdashboard.js` | ✅ Implemented |
| 2 | ~~**Contextual "How to Fix" Guidance in Violations** (#14)~~ | `analysis/designRuleChecker.mjs` — `remediation` field on all DRC findings | ✅ Implemented |
| 3 | ~~**IntlCableSize Silent-Skip Warning** (#33)~~ | `analysis/intlCableSize.mjs` — `skippedSizes[]` on all return paths | ✅ Implemented |

### Priority 2 — Medium Effort, High Calculation Value — All Done ✅

| # | Gap | Files | Status |
|---|---|---|---|
| 4 | ~~**Auto-Sizing with NEC Derating** (#23)~~ | `analysis/autoSize.mjs` — `ambientTempFactor()`, `bundlingFactor()`, `trayFillFactor()`; UI inputs in `autosize.html` | ✅ Implemented |
| 5 | ~~**Combined Seismic + Wind Load** (#31)~~ | `analysis/structuralLoadCombinations.mjs`; `seismicwindcombined.html` | ✅ Implemented |
| 6 | ~~**Visual Fill Gauges / Heat-Map** (#15)~~ | `src/components/fillGauge.js`; wired into `cabletrayfill.js`, `conduitfill.js`, `src/scenarioComparison.js` | ✅ Implemented |

### Priority 3 — Medium Effort, UX / Feature Completeness — All Done ✅

| # | Gap | Files | Status |
|---|---|---|---|
| 7 | ~~**Project Templates / Configuration Profiles** (#16)~~ | `src/projectTemplates.js`; template selector in `src/projectManager.js` | ✅ Implemented |
| 8 | ~~**Multi-Slot Compartmented Tray Fill** (#5)~~ | `app.mjs`, `routeWorker.js`, `analysis/designRuleChecker.mjs`, `cabletrayfill.js`, `src/racewayschedule.js` | ✅ Implemented |
| 9 | ~~**Scenario Comparison UI** (#17)~~ | `src/scenarioComparison.js`, `scenarios.html`, `src/styles/scenarioComparison.css` | ✅ Implemented |
| 10 | ~~**Prefabricated Cable Length Optimization** (#9)~~ | `analysis/cableProcurement.mjs`; Procurement Schedule tab in `spoolsheets.html` | ✅ Implemented |

### Priority 4 — Longer Term — All Done ✅

| # | Gap | Files | Status |
|---|---|---|---|
| 11 | ~~**TCC Auto-Coordination Algorithm** (#29)~~ | `analysis/tccAutoCoord.mjs` — `greedyCoordinate()`; Auto-Coordinate button in `tcc.html` | ✅ Implemented |
| 12 | ~~**Unbalanced Per-Phase Harmonics** (#27)~~ | `analysis/harmonics.js` — `runHarmonicsUnbalanced()`; neutral current and triplen summation | ✅ Implemented |
| 13 | ~~**Post-Contingency Transient Stability** (#32)~~ | `analysis/contingency.mjs` integrates `transientStability.mjs` for generator buses | ✅ Implemented |
| 14 | ~~**Auto-Sizing Cu/Al Cost Optimization** (#24)~~ | `analysis/autoSize.mjs` — `minimizeCostConductors()`; cost comparison table in `autosize.html` | ✅ Implemented |
| 15 | ~~**Results Annotation / Approval Workflow** (#19)~~ | `src/components/studyApproval.js`; cable `engineer_note`/`review_status`; DRC accept-risk workflow | ✅ Implemented |
| 16 | ~~**Mobile-Optimized Field Access View** (#21)~~ | `fieldview.html`; QR targets updated in `analysis/pullCards.mjs` | ✅ Implemented |
| 17 | ~~**Data Center Infrastructure Templates** (#8)~~ | `src/projectTemplates.js`; Cat6A/Fiber cable types; DRC-06 EMI segregation | ✅ Implemented |
| 18 | **Cloud-Based Component Library** (#12) | Requires server-side cloud storage layer | Deferred |

### Deferred (Requires Native Desktop Infrastructure or Commercial Licensing)

- **Revit Plugin / Live BIM Sync** — Requires Revit SDK (Windows-native C#/.NET)
- **AutoCAD / AVEVA / SmartPlant 3D Plugin** — Requires commercial CAD SDK licensing
- **BIM Object Library** — Requires manufacturer data partnerships for Revit RFA / IFC families
- **Live Manufacturer Pricing Feed** — Requires commercial data licensing (RS Means, Eaton, Legrand)
- ~~**Cloud-Based Component Library** (#12)~~ — ✅ **Implemented 2026-04-06** — see `tests/cloudLibrary.test.mjs` and `docs/api-reference.md#library-endpoints`

### New Gaps — Advanced Power Systems & DER (2026-04-12 Roadmap)

| Priority | # | Gap | Recommended Module | Effort | Status |
|---|---|---|---|---|---|
| **P1** | 68 | ~~**IEC 60909 Short-Circuit Method**~~ | `analysis/iec60909.mjs` | High | ✅ Implemented 2026-04-12 |
| **P1** | 69 | ~~**IEC 60287 Cable Ampacity**~~ | `analysis/iec60287.mjs` | High | ✅ Implemented 2026-04-17 |
| **P1** | 58 | ~~**DC Short-Circuit & DC Arc Flash**~~ | `analysis/dcShortCircuit.mjs`, `analysis/dcArcFlash.mjs` | High | ✅ Implemented 2026-04-18 |
| **P1** | 61 | ~~**PV / BESS / IBR Modeling**~~ | `analysis/ibrModeling.mjs` | High | ✅ Implemented 2026-04-18 |
| **P1** | 62 | ~~**IEEE 1547 DER Interconnection**~~ | `analysis/derInterconnect.mjs` | Medium | ✅ Implemented 2026-04-18 |
| **P2** | 60 | ~~**Capacitor Bank / PFC Sizing**~~ | `analysis/capacitorBank.mjs` | Medium | ✅ Implemented 2026-04-12 |
| **P2** | 63 | ~~**Frequency Scan / Harmonic Resonance**~~ | Extend `analysis/harmonics.js` | Medium | ✅ Implemented 2026-04-19 |
| **P2** | 59 | ~~**Battery / UPS Sizing (IEEE 485)**~~ | `analysis/batterySizing.mjs` | Medium | ✅ Implemented 2026-04-12 |
| **P2** | 66 | ~~**Generator Sizing (NFPA 110)**~~ | `analysis/generatorSizing.mjs` | Medium | ✅ Implemented 2026-04-12 |
| **P2** | 67 | ~~**Differential Protection (87B/T/G)**~~ | `analysis/differentialProtection.mjs`, `data/protectiveDevices.json` | Medium | ✅ Implemented 2026-04-19 |
| **P3** | 64 | **Voltage Stability (P-V / Q-V)** | Extend `analysis/loadFlow.js` | High | Not implemented |
| **P3** | 65 | **Optimal Power Flow / Economic Dispatch** | `analysis/optimalPowerFlow.mjs` | High | Not implemented |
| **P3** | 70 | **Voltage Flicker (Pst/Plt)** | `analysis/voltageFlicker.mjs` | Medium | Not implemented |
