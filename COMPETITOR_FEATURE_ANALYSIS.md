# Competitor Feature Gap Analysis

## Date: 2026-03-16

This document identifies features commonly found in major competitor platforms that are currently missing from CableTrayRoute.

---

## Executive Summary

CableTrayRoute already offers a strong, integrated suite covering cable routing (3D Dijkstra pathfinding), electrical studies (load flow, short circuit, arc flash, harmonics, TCC, motor starting), one-line diagram editing, and comprehensive import/export. However, comparison with major competitors — including manufacturer tools (Eaton B-Line, Legrand Cablofil, Panduit, OBO Bettermann, Niedax, Chalfant), power system analysis platforms (ETAP, EasyPower, SKM PowerTools), and dedicated raceway/cable management software (Bentley Raceway, Aeries CARS, MagiCAD, Trimble MEP, Paneldes) — reveals **20 feature gaps** across six categories.

---

## Gap Analysis by Category

### 1. BIM/CAD Integration & 3D Modeling

| Missing Feature | Competitor(s) | Description |
|---|---|---|
| **Revit Plugin / Live BIM Sync** | ETAP, EasyPower, Eaton B-Line, Legrand Cablofil | Native Revit add-in that synchronizes tray layouts bidirectionally with BIM models. CableTrayRoute can import Revit data but lacks a live plugin or real-time sync. EasyPower explicitly supports Revit 2025. |
| **AutoCAD / AVEVA / SmartPlant 3D Integration** | Eaton B-Line, Legrand Cablofil, OBO Bettermann, Aeries CARS, Paneldes | Direct plug-ins for AutoCAD (2D/3D), AVEVA, SmartPlant 3D, CATIA V5, SolidWorks. OBO offers a free AutoCAD plug-in for 3D cable sections. CableTrayRoute exports DXF but has no native CAD plug-in. |
| **BIM Object Library** | Eaton B-Line (CoSPEC), Legrand Cablofil (BIMobject), Niedax (Stabicad), Chalfant, OBO (TraceParts) | Downloadable manufacturer-specific BIM families (Revit RFA, IFC) for cable tray products with parametric sizing. Niedax integrates 226 products into Revit via Stabicad. |
| **Clash Detection / Interference Analysis** | MagiCAD, Trimble MEP (SysQue), Paneldes, Bentley Raceway | Real-time clash checking between cable tray routes and other MEP/structural elements. Critical for coordinated BIM workflows. Absent from CableTrayRoute. |

### 2. Structural & Seismic Analysis

| Missing Feature | Competitor(s) | Description |
|---|---|---|
| **Support Span / Structural Load Calculator** | Eaton B-Line, Legrand Cablofil (Interactive Load Table), Bentley Raceway, NEMA standards | Calculates maximum support span based on cable weight, tray type, load class (NEMA 12A/12B/12C), and concentrated/uniform loading. Legrand offers an Excel-based Interactive Load Table for NEMA and IEC. Bentley Raceway tracks weight capacity per segment. A fundamental design requirement absent from CableTrayRoute. |
| **Seismic Bracing Analysis** | Eaton (TOLBrace), SkyCiv, STAAD, Dlubal RFEM | Seismic category I analysis for cable tray supports per IBC/ASCE 7. Eaton's TOLBrace generates complete seismic bracing submittals. Nuclear and critical facilities require this. |
| **Wind & Environmental Load Analysis** | SkyCiv, STAAD, ProtaStructure | Outdoor cable tray installations require wind load calculations per ASCE 7. No competitor cable tray tool does this natively, but structural analysis platforms do. |

### 3. Product Selection, Specification & Procurement

| Missing Feature | Competitor(s) | Description |
|---|---|---|
| **Product Configurator / Selector** | Legrand Cablofil, Eaton B-Line (CoSPEC), Panduit, Niedax (Cable Calculator), OBO Bettermann | Interactive tool to select tray type, NEMA class, material, size, and finish. Generates part numbers and specifications. Niedax's Cable Calculator recommends trays based on cable inputs. CableTrayRoute is product-agnostic — it has no manufacturer catalog integration. |
| **Submittal Package Generator** | Legrand Cablofil (Submittal Builder), Eaton B-Line, Chalfant (ARCAT specs) | Auto-assembles cover sheets, cut sheets, and spec sheets into a single PDF submittal. CableTrayRoute exports reports but not formatted submittals with manufacturer data. |
| **Bill of Materials / Take-Off Wizard** | Legrand Cablofil (Take Off Wizard), Eaton B-Line, Aeries CARS, Bentley Raceway, OBO Construct | Generates a complete material list with part numbers, quantities, and fittings (elbows, tees, reducers) from a route layout. OBO Construct generates equipment lists in multiple formats. CableTrayRoute's BOM is cable-focused, not tray-hardware-focused. |
| **Cost Estimation with Real Pricing** | Legrand, Eaton (CADmep/Harrison codes), Panduit, Aeries CARS (Quick-Bid) | Estimate project cost using actual manufacturer pricing. Eaton integrates Harrison codes for contractor estimation. Aeries CARS includes a Quick-Bid Estimating tool. CableTrayRoute has cost multipliers for routing optimization but no real-world pricing database. |
| **Cable Pull Cards / Construction Docs** | Aeries CARS (CM Builder), Bentley Raceway, Trimble MEP (SysQue) | Generate cable pull cards, termination cards, and spool sheets for field construction crews. Supports prefabrication workflows. Not available in CableTrayRoute. |

### 4. Electrical Analysis Gaps

| Missing Feature | Competitor(s) | Description |
|---|---|---|
| **Multi-Standard Cable Sizing** | ETAP | CableTrayRoute primarily follows NEC. ETAP supports 8+ international standards: IEC 60502, IEC 60364, BS 7671, AS/NZS 3008, NF C15-100, IEC 60092 (marine). Global projects need this. |
| **Transient Stability Analysis** | ETAP, EasyPower (Advanced), SKM PowerTools | Dynamic simulation of system response to disturbances (fault, load rejection, motor starting sequences over time). Goes beyond static motor starting study. |
| **Reliability / Contingency Analysis (N-1)** | ETAP, EasyPower | Automated N-1 contingency analysis and system reliability calculations (MTBF, availability). CableTrayRoute has reliability reporting modules but the depth compared to ETAP is unclear. |
| **Ground Grid / Grounding Analysis** | ETAP, EasyPower, SKM | Design and analysis of grounding systems — step/touch voltage, ground potential rise, grid resistance. Entirely absent from CableTrayRoute. |
| **Magnetic Field Exposure Analysis** | ETAP | Calculates magnetic field strength around underground raceways using load flow currents. Relevant for EMF compliance near occupied spaces. |

### 5. Construction & Field Workflows

| Missing Feature | Competitor(s) | Description |
|---|---|---|
| **Prefabrication / Spool Sheet Output** | Trimble MEP (SysQue), Legrand (FAS Path Configurator) | LOD 400 models with spool sheets for prefabricated cable tray assemblies. Legrand's FAS Path Configurator creates prefabricated cable pathway support kits assembled in advance and shipped to site. |
| **Field Layout from BIM** | Trimble MEP | Import DXF from BIM model to lay out cable tray positions directly in the field using mobile devices or total stations. |

### 6. Collaboration, Deployment & Workflow

| Missing Feature | Competitor(s) | Description |
|---|---|---|
| **Multi-User Real-Time Collaboration** | ETAP (enterprise), EasyPower | Multiple engineers working on the same project simultaneously with conflict resolution. CableTrayRoute has single-user project save/load with server sync but no real-time multi-user editing. |
| **SmartDesign / Auto-Sizing** | EasyPower (SmartDesign) | Automated equipment selection and sizing to NEC codes — auto-sizes transformers, breakers, feeders, and cables based on load data. CableTrayRoute sizes cable routes but doesn't auto-select protective devices or equipment ratings. |
| **Regulatory/Code Update Service** | ETAP, EasyPower, Eaton (TOLBrace) | Automatic updates when NEC, IEEE, or IEC standards are revised. CableTrayRoute's standards are embedded in code without a formal update mechanism. |

---

## Feature Comparison Matrix

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
| Clash Detection | **No** | — | — | — | — | — | — | — | Yes | Yes |
| Support Span Calculator | **No** | — | — | Yes | Yes | Yes | — | — | — | — |
| Seismic Bracing Analysis | **No** | — | — | Yes | — | — | — | — | — | — |
| Product Configurator | **No** | — | — | Yes | Yes | — | — | Yes | — | — |
| Submittal Generator | **No** | — | — | Yes | Yes | — | Yes | Yes | — | — |
| Take-Off / Tray BOM | **No** | — | — | — | Yes | Yes | Yes | Yes | — | Yes |
| Cable Pull Cards | **No** | — | — | — | — | Yes | Yes | — | — | Yes |
| Prefab / Spool Sheets | **No** | — | — | — | Yes | — | — | — | — | Yes |
| Multi-Standard (IEC/BS/AS) | **No** | Yes | — | — | — | — | — | — | Yes | Yes |
| Transient Stability | **No** | Yes | Yes | — | — | — | — | — | — | — |
| Ground Grid Analysis | **No** | Yes | Yes | — | — | — | — | — | — | — |
| SmartDesign Auto-Sizing | **No** | — | Yes | — | — | — | Yes | — | — | — |
| Real-Time Collaboration | **No** | Yes | — | — | — | Yes | — | — | — | Yes |
| Cost Estimation | **No** | — | — | Yes | Yes | — | Yes | — | — | — |
| PWA / Offline Support | **Yes** | — | — | — | — | — | — | — | — | — |
| Cost-Free Web Access | **Yes** | — | — | Partial | Partial | — | — | Yes | — | — |

---

## Prioritized Recommendations

### High Priority (High impact, addresses core workflow gaps)
1. **Support Span / Structural Load Calculator** — Fundamental for any cable tray design; no structural verification tool exists. Offered by Eaton, Legrand, and Bentley Raceway.
2. **Tray Hardware BOM / Take-Off** — Engineers need fittings lists (elbows, tees, covers, supports), not just cable lists. Offered by 5+ competitors.
3. **Cable Pull Cards / Construction Documents** — Field crews need pull cards with tension, route, and termination data. Standard in Aeries CARS and Bentley Raceway.
4. **Multi-Standard Cable Sizing (IEC/BS)** — Required for any international project work. ETAP supports 8+ standards.

### Medium Priority (Competitive differentiation)
5. **Clash Detection** — Real-time interference checking with other MEP disciplines. Standard in MagiCAD, Trimble, and Paneldes. Critical for BIM coordination.
6. **Product Configurator with Manufacturer Catalogs** — Partner with manufacturers or build a generic tray catalog. Niedax's Cable Calculator is a good model.
7. **Submittal Package Generator** — Assemble professional submittals with cover sheets and cut sheets.
8. **Revit Plugin / BIM Sync** — Most requested integration in the AEC industry.
9. **Seismic Bracing Calculator** — Required for IBC jurisdictions and critical facilities.
10. **SmartDesign Auto-Sizing** — Auto-select breakers, transformers, and cable sizes from load data. Available in EasyPower and Aeries CARS (LoadMatic).
11. **Prefabrication / Spool Sheet Support** — Growing industry trend; Trimble SysQue outputs LOD 400 spool sheets.

### Lower Priority (Advanced / niche)
12. **Transient Stability Analysis** — Advanced study for large industrial/utility systems.
13. **Ground Grid Analysis** — Important but typically handled by specialized tools.
14. **Real-Time Multi-User Collaboration** — Enterprise feature with significant development effort.
15. **Magnetic Field Exposure Analysis** — Niche requirement for specific facility types.
16. **Field Layout from BIM** — Mobile device layout from BIM models; currently only Trimble offers this.

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
