# Hazardous Area Classification — Gap #94

## Overview

The Hazardous Area Classification tool allows engineers to define classified hazardous locations, assign Ex-rated electrical equipment to those areas, and verify that each device's explosion-protection type, equipment group, and temperature class are compatible with the area's requirements.

Two parallel classification systems are supported:

| System | Standard | Zone / Division |
|--------|----------|-----------------|
| NEC Class/Division | NEC Articles 500–506 | Class I/II/III, Division 1/2 |
| IEC / NEC Zone | IEC 60079-10-1/-10-2, NEC Article 505/506 | Zone 0/1/2 (gas), Zone 20/21/22 (dust) |

---

## Standards Referenced

| Standard | Title |
|----------|-------|
| NEC Article 500 | Hazardous (Classified) Locations, Classes I, II, III |
| NEC Article 505 | Zone Classification for Class I Locations |
| NEC Article 506 | Zone 20, 21, and 22 Locations for Combustible Dusts / Fibres |
| IEC 60079-0:2017 | Explosive atmospheres — General requirements |
| IEC 60079-10-1:2020 | Area classification — Flammable gas / vapour |
| IEC 60079-10-2:2015 | Area classification — Combustible dust |
| API RP 505-1997 | Classification of Locations at Petroleum Facilities |
| ATEX Directive 2014/34/EU | Equipment for explosive atmospheres (EU/UK) |

---

## NEC Class / Division System

### Classes

| Class | Hazardous Material |
|-------|--------------------|
| Class I | Flammable gases or vapours (hydrogen, propane, acetylene, etc.) |
| Class II | Combustible dust (grain, metal dust, carbon black, etc.) |
| Class III | Ignitable fibres or flyings (cotton, sawdust, etc.) |

### Divisions

| Division | Condition |
|----------|-----------|
| Division 1 | Hazardous concentrations present under normal operating conditions |
| Division 2 | Hazardous concentrations present only under abnormal conditions (e.g. equipment failure) |

### Gas Groups (Class I)

| Group | Representative Substances |
|-------|--------------------------|
| A | Acetylene |
| B | Hydrogen, ethylene oxide |
| C | Ethylene, diethyl ether |
| D | Acetone, ammonia, propane, methane |

### Dust Groups (Class II)

| Group | Representative Substances |
|-------|--------------------------|
| E | Metal dust (electrically conductive) |
| F | Carbon black, coal dust |
| G | Grain dust, flour, wood dust |

---

## IEC 60079 Zone System

### Gas / Vapour Zones (IEC 60079-10-1 / NEC Article 505)

| Zone | Condition |
|------|-----------|
| Zone 0 | Explosive gas atmosphere present continuously or for long periods |
| Zone 1 | Explosive gas atmosphere likely to occur in normal operation |
| Zone 2 | Explosive gas atmosphere unlikely in normal operation; present only briefly |

### Dust Zones (IEC 60079-10-2 / NEC Article 506)

| Zone | Condition |
|------|-----------|
| Zone 20 | Combustible dust present continuously or for long periods |
| Zone 21 | Combustible dust likely in normal operation |
| Zone 22 | Combustible dust unlikely in normal operation; present only briefly |

### NEC Division ↔ IEC Zone Equivalence (NEC Table 505.7(A))

| NEC | IEC Equivalent |
|-----|----------------|
| Class I, Division 1 | Zone 0 + Zone 1 |
| Class I, Division 2 | Zone 2 |
| Class II, Division 1 | Zone 20 + Zone 21 |
| Class II, Division 2 | Zone 22 |

---

## IEC Equipment Groups (IEC 60079-0 §5.1)

| Group | Application | Hazard Severity |
|-------|-------------|-----------------|
| Group I | Underground mines susceptible to firedamp | — |
| Group IIA | Surface industry — low-hazard gases (propane, methane) | Low |
| Group IIB | Surface industry — medium-hazard gases (ethylene) | Medium |
| Group IIC | Surface industry — hydrogen, acetylene | High |
| Group IIIA | Combustible flyings | Low |
| Group IIIB | Non-conductive dust | Medium |
| Group IIIC | Conductive dust | High |

**Coverage rule:** Higher groups cover lower groups — IIC equipment may be installed in IIA or IIB areas, but IIA equipment must NOT be installed in IIB or IIC areas.

---

## Ex Protection Types (IEC 60079-0, Table 1)

| Type | Description | Permitted Gas Zones | Permitted Dust Zones |
|------|-------------|---------------------|----------------------|
| Ex d | Flameproof enclosure | 1, 2 | — |
| Ex e | Increased safety | 1, 2 | — |
| Ex ia | Intrinsic safety Cat. ia | 0, 1, 2 | 20, 21, 22 |
| Ex ib | Intrinsic safety Cat. ib | 1, 2 | 21, 22 |
| Ex ic | Intrinsic safety Cat. ic | 2 | 22 |
| Ex ma | Encapsulation Cat. a | 0, 1, 2 | 20, 21, 22 |
| Ex mb | Encapsulation Cat. b | 1, 2 | 21, 22 |
| Ex n / nA | Non-sparking | 2 | — |
| Ex p / px | Pressurization | 1, 2 | 21, 22 |
| Ex t / ta | Dust ignition-proof | — | 20, 21, 22 |
| Ex tb | Dust enclosure Cat. 2 | — | 21, 22 |
| Ex tc | Dust enclosure Cat. 3 | — | 22 |

---

## Temperature Classes (IEC 60079-0)

Equipment surface temperature must not exceed the auto-ignition temperature of the hazardous substance. The T-rating specifies the maximum allowable surface temperature.

| T-Rating | Max Surface Temperature |
|----------|------------------------|
| T1 | 450 °C |
| T2 | 300 °C |
| T3 | 200 °C |
| T4 | 135 °C |
| T5 | 100 °C |
| T6 | 85 °C |

**Selection rule:** Choose a T-rating whose maximum temperature is below the auto-ignition temperature of the substance. T6 is the most restrictive; T1 is least restrictive.

---

## Compatibility Check Logic

The tool performs three checks for each device:

### 1. Protection Type vs. Zone

The Ex protection type must be rated for the area's zone (e.g., Zone 0 requires ia or ma; Zone 2 only allows n/nA). The NEC Division is first mapped to its IEC Zone equivalent, then the same check is applied.

### 2. Equipment Group vs. Gas/Dust Group

The device's equipment group must cover the area's gas or dust group. For IEC groups, the check compares hazard rank: IIC > IIB > IIA. For NEC groups, the tool maps Group A→IIC, B→IIC, C→IIB, D→IIA before comparison.

### 3. T-Rating

The device's declared T-rating (maximum surface temperature) must be ≤ the area's minimum T-rating requirement. A device rated T2 (300 °C max) fails in a T4 (135 °C) area because its surface can exceed the ignition temperature.

---

## Visual Layout Map

The page includes a live schematic 3D volume map above the classified-area and equipment tabs. The map is intended to be an engineering layout aid, not a CAD import.

Study-level layout fields:

| Field | Purpose | Default |
|-------|---------|---------|
| Facility Width (ft) | X-axis extent of the volume map | 80 |
| Facility Height (ft) | Y-axis extent of the volume map | 50 |
| Grid Spacing (ft) | Grid interval shown on the plan | 10 |
| Vertical Limit (ft) | Z-axis extent of the volume map | 20 |

The viewport toolbar rotates the isometric camera, pans the SVG view, or resets the camera to its default orientation. The map canvas also supports direct drag-to-pan. These controls only move the drawing view; they do not change area geometry, equipment coordinates, saved study data, or compliance results. The mini-axis in the map corner shows the current X/Y/Z orientation after the view is rotated.

Classified areas can define an optional map footprint:

| Field | Shape | Notes |
|-------|-------|-------|
| Shape | Circle or rectangle | Circle is the default for legacy studies |
| Center X / Center Y | Circle and rectangle | Coordinates are in feet from the lower-left facility origin |
| Radius | Circle | Radius of the classified zone footprint |
| Width / Height | Rectangle | Rectangle dimensions centered on X/Y |
| Bottom Elev. / Top Elev. | Circle and rectangle | Vertical limits of the classified volume |

Equipment can define optional X/Y/elevation coordinates. When equipment coordinates are blank, the marker is placed at the center of the assigned area volume. Existing saved studies without geometry still render because default area footprints, elevations, and equipment positions are generated automatically.

The SVG renders a single isometric volume schematic with an intentionally emphasized Z axis so vertical reach is legible in a small browser panel. Circular footprints are shown as translucent spherical/ellipsoidal volumes with their floor footprint, vertical centerline, and elevation label. Rectangular footprints are shown as translucent box volumes. Equipment markers are projected into the same X/Y/Z space with a dashed leader back to the floor plane, so plan position and vertical extent remain visually tied together.

The map and form rows are linked. Selecting a classified volume or equipment marker highlights the matching form row, switches to the relevant tab, and updates the selected-object inspector with classification, geometry, position, status, and issue details. Selecting an area or equipment row highlights the corresponding map object. The result tables and editable rows use the same status accent colors as the map so IDs, severity, and compatibility state can be scanned together.

Map color and marker coding:

| Item | Meaning |
|------|---------|
| Red footprint | Zone 0/20 or Division 1 severity |
| Orange footprint | Zone 1/21 severity |
| Amber footprint | Zone 2/22 or Division 2 severity |
| Green circle marker | Equipment compatibility passes |
| Red diamond marker | Equipment compatibility fails |
| Amber triangle marker | Missing data or geometry warning |
| Blue square marker | Equipment has not been checked yet |

The map also checks whether each equipment marker is inside its assigned area footprint and elevation range. A device outside the assigned volume is shown as a warning and the warning is included in the equipment results and CSV export.

---

## One-Line Diagram Integration

When the hazardous area study is loaded in the one-line diagram, enabling the **Haz Area Overlay** renders:

- A translucent zone rectangle around all components sharing an `hazAreaId`
- Zone label (area name + designation)
- Red fail badges on components with incompatible Ex ratings

Color coding matches IEC zone severity:
- Zone 0 / Div 1 → red tint
- Zone 1 / Div 1 (partial) → orange tint  
- Zone 2 / Div 2 → yellow tint

---

## Design Rule DRC-08

The Design Rule Checker includes **DRC-08 — Hazardous Area Equipment Compatibility**. When a `hazAreaCheckResult` is passed to `runDRC()`, it emits:

- **ERROR** for each incompatible protection type, group mismatch, or T-rating exceedance
- **WARNING** for missing T-rating declarations or absent certification numbers

---

## Report Package

The **Hazardous Area Report** preset in the Report Package Builder includes:

- Cover sheet
- Table of contents
- Revision history
- Assumptions / design basis
- Hazardous area classification summary (area table + equipment matrix)
- Design rule check results (DRC-08 findings)

---

## Disclaimer

This tool performs a compatibility screening check based on published IEC and NEC rules. A formal area classification study per API RP 505 or IEC 60079-10-1, prepared by a qualified engineer and approved by the Authority Having Jurisdiction (AHJ), is required before installation of electrical equipment in classified locations.
