# Competitor Feature Gap Analysis

## Date: 2026-03-21 (updated from 2026-03-16 original)

This document identifies features commonly found in major competitor platforms that are currently missing from CableTrayRoute.

---

## Executive Summary

CableTrayRoute already offers a strong, integrated suite covering cable routing (3D Dijkstra pathfinding), electrical studies (load flow, short circuit, arc flash, harmonics, TCC, motor starting), one-line diagram editing, and comprehensive import/export. Comparison with major competitors — including manufacturer tools (Eaton B-Line, Legrand Cablofil, Panduit, OBO Bettermann, Niedax, Chalfant), power system analysis platforms (ETAP, EasyPower, SKM PowerTools), and dedicated raceway/cable management software (Bentley Raceway, Aeries CARS, MagiCAD, Trimble MEP, Paneldes) — originally revealed **20 feature gaps** across six categories.

**Since the initial analysis (2026-03-16), 16 of those 20 gaps have been implemented.** The remaining 4 gaps require external infrastructure (native CAD plugins, real-time multi-user backend, live pricing databases) and are deferred.

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

---

## Remaining Gaps (4 of 20)

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

### 3. Real-Time Multi-User Collaboration

| Missing Feature | Competitor(s) | Description |
|---|---|---|
| **Multi-User Real-Time Collaboration** | ETAP (enterprise), EasyPower, Bentley Raceway | Multiple engineers working on the same project simultaneously with conflict resolution. CableTrayRoute has single-user project save/load with server sync but no real-time multi-user editing. |

**Status:** Deferred. Requires WebSocket infrastructure, CRDT or OT conflict resolution, and significant backend architecture.

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
| Real-Time Collaboration | **No** | Yes | — | — | — | Yes | — | — | — | Yes |
| PWA / Offline Support | **Yes** | — | — | — | — | — | — | — | — | — |
| Cost-Free Web Access | **Yes** | — | — | Partial | Partial | — | — | Yes | — | — |

*(✓ = implemented since initial 2026-03-16 analysis)*

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

### Deferred (require external infrastructure)

1. **Revit Plugin / BIM Sync** — Requires Revit SDK (Windows-native C#/.NET). Consider IFC export as interim step.
2. **AutoCAD / AVEVA Plugin** — Requires commercial CAD SDK licensing.
3. **BIM Object Library** — Requires manufacturer data partnerships for Revit RFA / IFC families.
4. **Live Manufacturer Pricing** — Requires commercial pricing data licenses (RS Means, Eaton/Harrison, Legrand).
5. **Real-Time Multi-User Collaboration** — Requires WebSocket + CRDT backend; significant infrastructure investment.

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
