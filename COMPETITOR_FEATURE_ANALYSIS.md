# Competitor Feature Gap Analysis

## Date: 2026-03-24 (updated from 2026-03-21; original 2026-03-16; usability/calculation pass added 2026-03-24)

This document identifies features commonly found in major competitor platforms that are currently missing from CableTrayRoute.

---

## Executive Summary

CableTrayRoute already offers a strong, integrated suite covering cable routing (3D Dijkstra pathfinding), electrical studies (load flow, short circuit, arc flash, harmonics, TCC, motor starting), one-line diagram editing, and comprehensive import/export. Comparison with major competitors — including manufacturer tools (Eaton B-Line, Legrand Cablofil, Panduit, OBO Bettermann, Niedax, Chalfant), power system analysis platforms (ETAP, EasyPower, SKM PowerTools), and dedicated raceway/cable management software (Bentley Raceway, Aeries CARS, MagiCAD, Trimble MEP, Paneldes) — originally revealed **20 feature gaps** across six categories.

**Since the initial analysis (2026-03-16), 16 of those 20 gaps have been implemented.** The remaining 4 gaps require external infrastructure (native CAD plugins, live pricing databases) and are deferred.

**The 2026-03-24 refresh of competitor products** (ETAP 2024/2025, EasyPower 2025, MagiCAD 2026, Eplan Platform 2025/2026, Revit 2026, Bentley Raceway 2024/2025, Paneldes 2025) revealed **10 additional feature gaps** across AI/ML interfaces, interoperability standards, field operations, and emerging infrastructure patterns. **Of those 10, six have since been implemented** (AI/LLM Copilot, IFC Export, QR Code generation, REST API, Alert() replacement, and navigation consistency). Additionally, two calculation completeness gaps (asymmetric fault types and VFD/soft-starter motor starting) have also been implemented. The remaining open gaps are documented below.

A **second pass on 2026-03-24** examines the application through two additional lenses not covered in the feature-presence analysis: **usability quality** (how CableTrayRoute behaves vs. competitor UX standards) and **calculation completeness** (simplified models, missing correction factors, and analysis gaps relative to ETAP, EasyPower, SKM, and Aeries CARS). These findings are documented under "Usability Gaps vs. Competitors" and "Calculation Completeness Gaps".

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

**Status:** Partially addressed. `costestimate.html` provides configurable RS Means–based pricing. Live manufacturer pricing requires commercial data licensing agreements.

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

**Status:** Partially deferred. Full Omniverse integration is out of scope for a web app. NWC/Navisworks export and IFC-based coordination are feasible interim steps.

---

### 8. AI / High-Density Data Center Infrastructure Templates

| Missing Feature | Competitor(s) | Description |
|---|---|---|
| **Data Center Cable Tray Rack Templates** | SnakeTray, Chatsworth Products, industry trend | The AI data center buildout (2025–2026) has driven demand for specialized cable tray configurations: overhead ladder rack in hot/cold aisle arrangements, top-of-rack (ToR) patch routing, power whip scheduling, and structured cabling density calculations for 400G/800G optical links. No competitor has fully addressed this, but SnakeTray and Chatsworth have published application guides and product families specifically targeting AI data centers. CableTrayRoute has no data center–specific templates, typical aisle configurations, or structured cabling (Cat6A/fiber) fill models. |

**Status:** Not implemented. Represents a significant growth market. Feasible as template presets, structured cabling cable types, and aisle-configuration wizards.

---

### 9. Prefabricated Cable Length Optimization (Ordered-Length Planning)

| Missing Feature | Competitor(s) | Description |
|---|---|---|
| **Ordered-Length Prefab Cable Planning** | Eplan Platform 2025 (Cable proD) | Eplan Platform 2025 introduced a dedicated prefabricated cable workflow that computes cut lengths for factory-assembled cable assemblies and produces ordered-length bills of material with tolerance management. CableTrayRoute has spool sheet output and cable pull cards, but does not calculate ordered cut lengths, apply standard reel lengths, minimize cable waste/offcuts, or produce a cable procurement schedule tied to reel inventory. |

**Status:** Not implemented. Builds naturally on the existing `spoolSheets.mjs` and `pullCards.mjs` modules. Moderate complexity addition.

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

**Status:** Not implemented. Requires cable schedule data model extension and fill/ampacity calculation updates.

---

### 12. Cloud-Based Component / Equipment Library

| Missing Feature | Competitor(s) | Description |
|---|---|---|
| **Cloud-Synchronized Equipment Library** | Bentley Components Center (2024/2025) | Bentley Raceway 2024 integrated the Components Center — a cloud-hosted library of cell-based equipment that stays synchronized across projects and teams, with automatic property propagation to all tray segments using a product definition. CableTrayRoute's product configurator (`productconfig.html`) is project-local; there is no shared organization-wide or community-maintained library of tray products, connectors, and fittings that updates automatically when manufacturer specs change. |

**Status:** Not implemented. Requires a cloud storage layer for shared component definitions. Aligns with the existing multi-user collaboration infrastructure (`collaborationServer.mjs`).

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

**Status:** Not addressed. Requires adding chart/gauge components to result pages.

---

### 16. No Configuration Profiles or Project Templates

| Missing UX Pattern | Competitor Benchmark | Description |
|---|---|---|
| **Industry-specific project templates** | ETAP (industry configuration wizards), Aeries CARS (industrial/oil & gas defaults), SnakeTray (AI data center application guides) | Users must manually configure every project from scratch: select voltage standards, fill limits, cable groups, ambient conditions, and code edition individually. Competitors offer "Oil & Gas", "Data Center", "Industrial", and "Utility" templates that pre-populate sensible defaults. CableTrayRoute has no such template system. This is especially relevant given the separately identified gap for data center infrastructure templates (Gap #8 above). |

**Status:** Not addressed. Feasible as a preset JSON configuration applied on new-project creation.

---

### 17. No Sensitivity Analysis or Scenario Comparison UI

| Missing UX Pattern | Competitor Benchmark | Description |
|---|---|---|
| **Side-by-side scenario comparison and parameter sweeps** | ETAP (scenario manager with comparison view), EasyPower (study case comparison) | `src/scenarios.js` exists and stores multiple study variants, but there is no UI for comparing scenarios side-by-side (e.g., "Design A: avg fill 42%, 3 violations" vs "Design B: avg fill 38%, 0 violations") or for sweeping a parameter (e.g., "show tray fill as ambient temperature increases from 25°C to 50°C"). Users cannot perform "what-if" analysis without manually switching scenarios and recording results manually. |

**Status:** Not addressed. Requires extending the existing `src/scenarios.js` with a comparison view UI.

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

**Status:** Not addressed. Could be implemented as optional text fields on cable/tray records and a status column in result tables.

---

### 20. No Workflow Progress Dashboard

| Missing UX Pattern | Competitor Benchmark | Description |
|---|---|---|
| **Project health summary showing completion status** | EasyPower (project health view), Aeries CARS (progress tracking view) | `src/workflowStatus.js` exists in the codebase but there is no UI that surfaces a project-level health summary: which workflow steps are complete, which analyses have violations, and what the next recommended action is. Users must navigate to each of the 47+ pages individually to discover outstanding issues. A single dashboard showing "Cable Schedule ✓ · Tray Fill ⚠ (3 violations) · Routing ✓ · Arc Flash ✗ (not run)" would significantly reduce time-to-discovery. |

**Status:** Not addressed. `src/workflowStatus.js` infrastructure exists; requires a dashboard UI to surface it.

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

**Status:** Not addressed. `analysis/ampacity.mjs` has the correction factor tables; `autoSize.mjs` needs to call them with actual installation parameters.

---

### 24. Auto-Sizing Does Not Minimize Cost or Evaluate Cu/Al Tradeoff

| Missing Calculation | Competitor Benchmark | Description |
|---|---|---|
| **Cost-optimized conductor selection** | ETAP (cost-optimized sizing with material tradeoff), EasyPower | `analysis/autoSize.mjs` selects the next-larger standard size meeting ampacity requirements without evaluating whether a larger aluminum conductor would meet the same requirement at lower cost, or whether two smaller parallel conductors would be cheaper than one large conductor. Competitors perform a cost/weight optimization across material choices. The `analysis/costEstimate.mjs` cost data and `analysis/intlCableSize.mjs` size tables are both available and could be used to build this tradeoff. |

**Status:** Not addressed. Moderate complexity; requires integrating cost data into the sizing loop.

---

### 25. Pull Tension Uses Simplified Capstan Friction Model

| Missing Calculation | Competitor Benchmark | Description |
|---|---|---|
| **Advanced pull tension with conductor stiffness and temperature effects** | Aeries CARS CableMatic (detailed pulling simulation), Bentley Raceway (pulling calculations) | `src/pullCalc.js` implements the standard exponential capstan friction model (T₂ = T₁ × e^(μθ)) for bends and constant friction for straight runs. Missing: (1) conductor jacket stiffness — large cables resist bending at corners, increasing effective tension beyond the capstan model; (2) temperature-dependent friction coefficient — jacket material (PVC, XLPE) stiffness varies significantly with ambient temperature; (3) acceleration forces for long pulls in inclined trays; (4) dynamic vs. static friction transition at start-of-pull. Aeries CARS models all four effects. |

**Status:** Not addressed. Requires extending the pull tension model with stiffness and temperature correction terms.

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

**Status:** Not addressed. A greedy coordination algorithm working from the source toward loads could be implemented on top of the existing TCC curve library.

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

**Status:** Not addressed. Requires replacing the `continue` with a warning entry in the results explaining which combinations were skipped and why.

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
| Data Center Infrastructure Templates | **No** | — | — | — | — | — | — | — | — | — |
| Ordered-Length Cable Procurement | **No** | — | — | — | — | — | — | — | — | — |
| Open REST API / Scripting Automation | **Yes** ✓ | Yes | — | — | — | — | Yes | — | — | — |
| Parallel Cable / Multi-Core Runs | **No** | Yes | — | — | — | — | — | — | — | — |
| Cloud-Based Component Library | **No** | — | — | — | — | Yes | — | — | — | — |
| **Usability: Modal error dialogs (no alert())** | **Yes** ✓ | Yes | Yes | — | — | — | — | — | — | — |
| **Usability: Contextual fix guidance in violations** | **No** | Yes | Yes | — | — | — | — | — | — | — |
| **Usability: Visual fill gauges / heat-maps** | **No** | — | — | — | — | Yes | — | — | Yes | — |
| **Usability: Configuration profiles / templates** | **No** | Yes | — | — | — | — | Yes | — | — | — |
| **Usability: Scenario comparison UI** | **No** | Yes | Yes | — | — | — | — | — | — | — |
| **Usability: Full workflow onboarding tour** | **Yes** ✓ | Yes | Yes | — | — | Yes | — | — | — | — |
| **Usability: Results annotation / approval workflow** | **No** | Yes | — | — | — | Yes | — | — | — | — |
| **Usability: Workflow progress dashboard** | **No** | — | Yes | — | — | — | Yes | — | — | — |
| **Usability: Mobile-optimized field access** | **Yes ✓** | Yes | — | — | — | — | Yes | — | — | — |
| **Calc: Short circuit full fault matrix (SLG/LL/DLG)** | **Yes** ✓ | Yes | Yes | — | — | — | — | — | — | — |
| **Calc: Auto-sizing with tray derating + ambient temp** | **No** | Yes | Yes | — | — | — | — | — | — | — |
| **Calc: Motor starting VFD / soft-starter models** | **Yes** ✓ | Yes | Yes | — | — | — | — | — | — | — |
| **Calc: TCC auto-coordination algorithm** | **No** | Yes | Yes | — | — | — | — | — | — | — |
| **Calc: Unbalanced per-phase harmonics** | **No** | Yes | Yes | — | — | — | — | — | — | — |
| **Calc: Combined seismic + wind load scenario** | **Yes** ✓ | — | — | Yes | — | — | — | — | — | — |
| **Calc: Post-contingency transient stability check** | **No** | Yes | Yes | — | — | — | — | — | — | — |

*(✓ = implemented since initial 2026-03-16 analysis; new rows = gaps identified in 2026-03-24 refresh; **Usability** rows = UX pattern gaps; **Calc** rows = calculation completeness gaps)*

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

### New Medium-Priority (Feasible in Web App — 2026-03-24)

4. ~~**Open REST API / Scripting Automation**~~ → `server.mjs` `/api/v1/` routes, `docs/api-reference.md` ✅
5. **Ordered-Length Cable Procurement Planning** — Extend `spoolSheets.mjs` and `pullCards.mjs` to compute factory cut lengths, apply standard reel lengths, and minimize waste. Produces a cable procurement schedule.
6. ~~**Multi-Slot / Compartmented Tray Fill**~~ — Per-slot fill tracking via `slotFills[]`, `slot_groups` JSON field, per-slot DRC-01/DRC-02 in the DRC, and auto-populated fill UI. ✅
7. **Data Center Infrastructure Templates** — Add AI data center wizard: hot/cold aisle overhead ladder rack presets, structured cabling (Cat6A/fiber) cable types, top-of-rack routing templates, and high-density fill density guidance.
8. **Parallel Cable / Multi-Core Runs** — Extend the cable schedule data model to represent parallel runs (n × conductor size) as a first-class object with aggregate ampacity and combined tray fill.

### New Low-Priority / Deferred (2026-03-24)

9. **Cloud-Based Component Library** — Shared organization-wide product library synchronized via the existing collaboration backend. Aligns with Bentley's Components Center model.
10. **Electrical Digital Twin / Navisworks Export** — Navisworks NWC/NWD export and external 3D platform integration. Full Omniverse integration deferred; IFC export covers most of the use case.
11. **Revit Plugin / BIM Sync** — Requires Revit SDK (Windows-native C#/.NET). IFC export is the recommended interim step.
12. **AutoCAD / AVEVA Plugin** — Requires commercial CAD SDK licensing.
13. **BIM Object Library** — Requires manufacturer data partnerships for Revit RFA / IFC families.
14. **Live Manufacturer Pricing** — Requires commercial pricing data licenses (RS Means, Eaton/Harrison, Legrand).
15. ~~**Real-Time Multi-User Collaboration**~~ → Implemented via WebSocket presence bar and `src/collaborationServer.mjs`.

---

### Usability & Calculation Quality (2026-03-24 Pass)

**High Priority — Usability (quick wins with large UX impact):**

1. ~~**Replace `alert()` with modal dialogs**~~ (Gap #13) → Implemented. `src/components/modal.js` applied app-wide. ✅
2. ~~**Sync navigation on static pages**~~ (Gap #22) → Implemented. `src/components/navigation.js` injected on all pages. ✅
3. ~~**Add contextual "how to fix" guidance to violations**~~ (Gap #14) → Implemented. `remediation` field added to all DRC findings; rendered as "How to fix:" in the UI and included in text exports. ✅
4. **Workflow progress dashboard** (Gap #20) — Surface `src/workflowStatus.js` in a project overview page showing completion status and violation counts per module.

**Medium Priority — Usability:**

5. **Visual fill gauges and violation heat-map** (Gap #15) — Add SVG/CSS progress bars to `cabletrayfill.html` results; color-code violation rows in all analysis result tables.
6. **Scenario comparison UI** (Gap #17) — Extend `src/scenarios.js` to render a side-by-side comparison table for two selected scenarios.
7. **Configuration profiles / project templates** (Gap #16) — Add an "Industry Template" selector to the new-project flow with Oil & Gas, Data Center, and Industrial presets.
8. ~~**Expanded onboarding tour**~~ (Gap #18) → Implemented. `tour.js` refactored; 5-step interactive tours on Cable Schedule, Raceway Schedule, Tray Fill, and Optimal Route pages with auto-trigger on first visit. ✅

**High Priority — Calculation Completeness:**

9. ~~**Short circuit full fault matrix**~~ (Gap #26) → Implemented. SLG, L-L, DLG in `analysis/shortCircuit.mjs`. ✅
10. **Auto-sizing with derating factors** (Gap #23) — Apply NEC 310.15(B) ambient correction and NEC 310.15(C) bundling derating in `analysis/autoSize.mjs` using the existing correction tables in `analysis/ampacity.mjs`.
11. ~~**Motor starting VFD and soft-starter models**~~ (Gap #28) → Implemented. VFD and soft-starter profiles in `analysis/motorStart.js`. ✅

**Medium Priority — Calculation Completeness:**

12. **TCC auto-coordination algorithm** (Gap #29) — Implement a greedy source-to-load coordination pass on top of the existing `analysis/tcc.js` device curve library.
13. **Combined seismic + wind load scenario** (Gap #31) — Add an ASCE 7 load combination wrapper that invokes both `analysis/seismicBracing.mjs` and `analysis/windLoad.mjs` and checks against combined demand.
14. **Fix IntlCableSize silent skipping** (Gap #33) — Replace `continue` on line 528 of `analysis/intlCableSize.mjs` with an explicit warning result entry.
15. **Unbalanced per-phase harmonic injection** (Gap #27) — Extend `analysis/harmonics.js` to accept independent per-phase harmonic spectra and calculate neutral conductor THD and triplen harmonic currents.

**Low Priority — Calculation Completeness:**

16. **Pull tension conductor stiffness model** (Gap #25) — Extend `src/pullCalc.js` with stiffness and temperature-dependent friction corrections for large conductors.
17. **Post-contingency transient stability coupling** (Gap #32) — Invoke `analysis/transientStability.mjs` for generator buses during contingency analysis in `analysis/contingency.mjs`.
18. **Auto-sizing Cu/Al cost optimization** (Gap #24) — Integrate `analysis/costEstimate.mjs` pricing into `analysis/autoSize.mjs` to evaluate copper vs. aluminum tradeoffs.
19. **Results annotation and approval workflow** (Gap #19) — Add optional notes fields and status labels (Draft / Reviewed / Approved) to cable and tray records.
20. **Mobile-optimized field access view** (Gap #21) — Create a simplified read-only responsive view for cable schedules and pull cards, prerequisite for the QR code gap (Gap #6).

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

---

## Next Major Steps — Recommended Roadmap (as of 2026-03-24)

The following features were implemented in the most recent development cycle and are complete:
navigation consistency, password confirmation, auth button disabling, alert() replacement, AI Copilot, IFC export, QR codes, REST API, and asymmetric fault types (SLG/L-L/DLG).

The table below lists the recommended next work items in priority order.

### Priority 1 — Low Effort, High Impact

| # | Gap | Files | Notes |
|---|---|---|---|
| 1 | **Workflow Progress Dashboard** (#20) | `src/workflowStatus.js` → new `workflowdashboard.html` | Infrastructure already exists; needs a UI to surface step completion and violation counts. |
| 2 | **Contextual "How to Fix" Guidance in Violations** (#14) | `analysis/designRuleChecker.mjs`, `analysis/autoSize.mjs` | Add `remediation` field to violation objects. Pattern already exists in `analysis/arcFlash.mjs:412`. |
| 3 | **IntlCableSize Silent-Skip Warning** (#33) | `analysis/intlCableSize.mjs:528` | Replace `continue` with an explicit warning result entry. Single-line change. |

### Priority 2 — Medium Effort, High Calculation Value

| # | Gap | Files | Notes |
|---|---|---|---|
| 4 | **Auto-Sizing with NEC Derating** (#23) | `analysis/autoSize.mjs`, `analysis/ampacity.mjs` | Apply ambient temp (310.15(B)) and bundling (310.15(C)) derating. Correction tables already in `ampacity.mjs`. |
| 5 | **Combined Seismic + Wind Load** (#31) | new `analysis/combinedLoads.mjs` | Wrap both `seismicBracing.mjs` and `windLoad.mjs` under ASCE 7 Section 2.3 load combinations. |
| 6 | **Visual Fill Gauges / Heat-Map** (#15) | `cabletrayfill.html`, `cabletrayfill.js` | Add Plotly progress bars and color-coded violation cells. Significant UX improvement over plain tables. |

### Priority 3 — Medium Effort, UX / Feature Completeness

| # | Gap | Files | Notes |
|---|---|---|---|
| 7 | **Project Templates / Configuration Profiles** (#16) | `src/projectManager.js`, new `src/projectTemplates.js` | Preset JSON for Oil & Gas, Data Center, Industrial applied on new-project creation. |
| 8 | ~~**Multi-Slot Compartmented Tray Fill** (#5)~~ | `app.mjs`, `routeWorker.js`, `analysis/designRuleChecker.mjs`, `cabletrayfill.js`, `src/racewayschedule.js` | ✅ Implemented — per-slot `slotFills[]`, `slot_groups` JSON, per-slot DRC-01/DRC-02, auto-populated fill UI. |
| 9 | **Scenario Comparison UI** (#17) | `src/scenarios.js`, `scenarios.html` | `scenarios.js` exists; add side-by-side comparison view for two selected study variants. |
| 10 | **Prefabricated Cable Length Optimization** (#9) | new `analysis/cableProcurement.mjs` | Extends `spoolSheets.mjs` and `pullCards.mjs` with cut-length BOM and reel-waste minimization. |

### Priority 4 — Longer Term

| # | Gap | Notes |
|---|---|---|
| 11 | **TCC Auto-Coordination Algorithm** (#29) | Greedy source-to-load coordination over existing `analysis/tcc.js` curve library. |
| 12 | **Unbalanced Per-Phase Harmonics** (#27) | Extend `analysis/harmonics.js` for independent phase spectra and neutral triplen current calculation. |
| 13 | **Post-Contingency Transient Stability** (#32) | Couple `analysis/transientStability.mjs` into `analysis/contingency.mjs` for generator buses. |
| 14 | **Auto-Sizing Cu/Al Cost Optimization** (#24) | Integrate `analysis/costEstimate.mjs` into `analysis/autoSize.mjs` sizing loop. |
| 15 | **Results Annotation / Approval Workflow** (#19) | Notes fields and Draft/Reviewed/Approved status on cable and tray records. |
| 16 | **Mobile-Optimized Field Access View** (#21) | Simplified responsive read-only view for cable schedules and pull cards. |
| 17 | **Data Center Infrastructure Templates** (#8) | Hot/cold aisle presets, structured cabling types, ToR patch routing templates. |
| 18 | **Cloud-Based Component Library** (#12) | Shared org-wide product library over existing collaboration backend. |

### Deferred (Requires Native Desktop Infrastructure)

- Revit Plugin / Live BIM Sync — Requires Revit SDK (Windows-native C#/.NET)
- AutoCAD / AVEVA / SmartPlant 3D Plugin — Requires commercial CAD SDK licensing
- BIM Object Library — Requires manufacturer data partnerships
- Live Manufacturer Pricing Feed — Requires commercial data licensing (RS Means, Eaton, Legrand)
