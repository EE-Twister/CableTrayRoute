# Bus Duct / Cable Bus Sizing

**Study page:** `busdust.html`  
**Analysis module:** `analysis/busDuctSizing.mjs`  
**Standards:** NEC 368, NEC 215.2(A), IEEE 605-2008

---

## Overview

The Bus Duct Sizing study calculates:

1. **Derated ampacity** — NEC 368 combined derating (orientation, ambient temperature, stacking).
2. **Voltage drop** — Impedance-method feeder voltage drop per NEC 215.2(A)(4).
3. **Fault stress** — IEEE 605 electromagnetic force per foot and maximum support span.

---

## Ampacity Derating (NEC 368)

The manufacturer's rated ampacity (at 40 °C ambient, horizontal flat installation) is multiplied by three independent factors:

| Factor | Standard | Values |
|---|---|---|
| Orientation | NEC 368.12 | Horizontal = 1.00; Vertical flat = 1.00; Edge-on = 0.80 |
| Ambient temperature | NEC 310.15(B)(1)(a) analogy | `√((75 − T_amb) / (75 − 40))`; clamped to 0.01–1.20 |
| Stacking (proximity) | Manufacturer guidance | 1 run = 1.00; 2 = 0.80; 3 = 0.70; ≥ 4 = 0.65 |

The combined factor = orientation × ambient × stacking.

The tool selects the smallest standard busway rating (800, 1000, 1200, 1350, 1600, 2000, 2500, 3000, 4000, or 5000 A) whose derated ampacity meets or exceeds the load current.

---

## Voltage Drop (NEC 215.2)

```
VD_LN [V] = I × L × (R·cosφ + X·sinφ)        (three-phase, line-to-neutral)
VD_LL [V] = VD_LN × √3
VD [%]    = (VD_LL / V_LL) × 100
```

For single-phase: `VD_LN = I × 2L × (R·cosφ + X·sinφ)` (forward + return conductors).

**Threshold:** NEC 215.2(A)(4) recommends ≤ 3% for feeder circuits.

---

## Fault Stress (IEEE 605-2008)

Electromagnetic force per unit length on the outer conductor of a flat three-phase bus during a fault:

```
F/L [lbf/ft] = 0.54 × I_kA² / d_in
```

where `I_kA` = symmetrical RMS fault current (kA) and `d_in` = centre-to-centre conductor spacing (in).

Maximum support span from simply-supported beam mechanics:

```
L_max [ft] = √(8 × S_y × Z / 12 / (F/L))
```

| Parameter | Symbol | Cu (ASTM B187) | Al (ASTM B273 6101-T63) |
|---|---|---|---|
| Allowable bending stress | S_y | 10 000 psi | 6 000 psi |
| Section modulus | Z | See `TYPICAL_SECTION_MODULUS` table | See table |

---

## Worked Example

| Input | Value |
|---|---|
| Load current | 1 500 A |
| System voltage | 480 V (3-phase) |
| Material | Aluminium |
| Run length | 100 ft |
| Orientation | Horizontal |
| Ambient temperature | 40 °C |
| Stacked runs | 1 |
| Fault current | 65 kA |
| Conductor spacing | 6 in |
| Support span | 10 ft |

**Results:**

- Selected busway: **2000 A Al** (smallest standard ≥ 1500 A with no derating at reference conditions)
- Derated ampacity: **2000 A** (combined factor = 1.00 at reference conditions)
- Utilization: **75%**
- Voltage drop: (0.145 mΩ/ft × 100 ft / 1000 Ω) × 1500 A × (0.85 cos + 0.527 sin) × √3 / 480 × 100 ≈ **0.81%** — **Pass ≤ 3%**
- Force per foot: 0.54 × 65² / 6 ≈ **380 lbf/ft**
- Max support span (IEEE 605): √(8 × 6000 × 0.70 / 12 / 380) ≈ **2.8 ft**
- Installed span 10 ft > 2.8 ft → **Fail** (factory-assembled busway enclosures typically withstand higher loads; verify with manufacturer)

---

## Limitations

- Resistance and reactance values are indicative mid-range figures from published tables. Verify against the selected manufacturer's product data sheet.
- The IEEE 605 formula applies to the bare conductor mechanical properties. Factory-assembled busway enclosures carry additional structural load through their housings; the manufacturer's certified short-time withstand rating and support span specification govern final installation.
- The ambient temperature derating uses a 75 °C conductor temperature rating as a proxy; confirm the actual insulation class with the manufacturer.
