# Egress & Emergency Lighting Calculator

**Gap #95 — Photometric / Egress Lighting**

## Overview

The Egress Lighting study calculates average maintained illuminance using the lumen method and checks NFPA 101 §7.9.2.1 egress compliance requirements for emergency lighting systems.

When an IES photometric file and fixture positions are provided, the tool also performs a point-by-point illuminance grid calculation using the cosine-cube method and displays a pseudo-colour isolux map.

The page includes a live sample layout preview that scales the room from the entered length and width, places luminaires from the entered fixture coordinates when available, and otherwise shows an auto-spaced layout based on the number of luminaires. The preview also shows the egress path, room dimensions, and a height reference for ceiling, mounting, and workplane elevations.

## Standards

| Standard | Application |
|----------|-------------|
| NFPA 101-2021 §7.9.2.1 | Egress illuminance: avg ≥ 1.0 fc, min ≥ 0.1 fc |
| IES HB-10-11 §9 | Lumen method calculation procedure |
| ANSI/IES LM-63-2019 | IES photometric data file format |
| NEC 700/701 | Emergency / Legally Required Standby Systems |

## Lumen Method

Average maintained illuminance is calculated as:

```
E_avg = (N × F × CU × LLF) / A
```

| Symbol | Parameter | Notes |
|--------|-----------|-------|
| N | Number of luminaires | — |
| F | Initial lumens per luminaire | From IES file or manufacturer data |
| CU | Coefficient of Utilization | From CU table (function of RCR and reflectances) |
| LLF | Light Loss Factor | 0.80 typical for LED; accounts for depreciation and dirt |
| A | Room area (ft²) | L × W |

**Room Cavity Ratio:**
```
RCR = 5 × H_c × (L + W) / (L × W)
```
where H_c = fixture mounting height − workplane height.

## Point-by-Point Grid

When fixture positions and an IES LM-63 photometric file are provided, the tool calculates a 10×10 workplane illuminance grid using:

```
E = I(θ) × cos(θ) / D²   [fc]
```

where:
- I(θ) = candela value at vertical angle θ (linearly interpolated from IES table)
- θ = angle from nadir (straight down)
- D = slant distance from fixture to point = √(H² + d²)
- cos(θ) = H / D

## NFPA 101 Egress Requirements

Per NFPA 101-2021 §7.9.2.1, emergency egress lighting must provide:
- **Average** illuminance ≥ **1.0 fc** (10.8 lux) along the path of egress
- **Minimum** illuminance ≥ **0.1 fc** (1.1 lux) at any point on the path

The minimum check requires a point-by-point grid (IES file + fixture positions).

## Sample Layout Preview

The layout preview is intended as a quick visual check of the user's input parameters. In lumen-method-only mode, fixture positions are generated from the room aspect ratio and luminaire count so a corridor produces a centerline row while wider rooms produce multiple rows. After an IES file is loaded and fixture coordinates are entered, the same preview switches to those explicit coordinates and flags positions that fall outside the room boundary.

## CU Table

The built-in CU table represents a generic efficient direct-component LED troffer/panel (BF = 1.0). Three reflectance presets are available:

| Preset | Ceiling | Wall |
|--------|---------|------|
| High | 80% | 70% |
| Medium | 70% | 50% |
| Low | 50% | 30% |

For final design documents, use the CU table from the manufacturer's IES photometric file.

## Module

`analysis/lighting.mjs` — pure calculation, no DOM dependencies.

```js
import {
  parseIES,
  roomCavityRatio,
  coefficientOfUtilization,
  averageIlluminance,
  pointIlluminanceGrid,
  egressComplianceCheck,
  runLightingStudy,
} from './analysis/lighting.mjs';
```

## Tests

`tests/lighting.test.mjs` covers all calculation functions, IES parser, default layout generation, egress checks, and integration paths.

```sh
node tests/lighting.test.mjs
```
