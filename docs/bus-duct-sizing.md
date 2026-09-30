# Bus Duct / Cable Bus Sizing

> **Screening limitation:** All selected ratings, impedances, derating factors,
> and mechanical properties are generic. This calculation cannot establish a
> final busway product selection or compliance result. Manufacturer-certified
> ampacity, voltage-drop, short-circuit withstand, and support data govern.

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

Maximum electromagnetic force per unit length on a flat three-phase bus during a fault. The force follows the **peak** (first-cycle, asymmetrical) current, not the symmetrical RMS value:

```
F/L [lbf/ft] = (√3/2) × 5.4×10⁻⁷ × I_peak² / d_in        I_peak = k_p × I_rms
```

`I_rms` is the symmetrical RMS fault current (A), `d_in` the centre-to-centre conductor spacing (in), and the peak factor `k_p` follows the UL 857 / NEMA BU 1.1 busway test levels: 1.7 up to 10 kA, 2.0 from 10 to 20 kA, 2.2 above 20 kA. (An earlier version used the RMS value directly and understated the force about five-fold.)

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

- Selected busway: **1600 A Al** (smallest standard ≥ 1500 A at reference conditions)
- Derated ampacity: **1600 A** (combined factor = 1.00 at reference conditions); utilization **94%**
- Voltage drop: R = 0.01875 mΩ/ft, X = 0.00989 mΩ/ft → √3 × 1500 A × 100 ft × (0.01875 × 0.85 + 0.00989 × 0.527) / 1000 = 5.56 V, about **1.16%** of 480 V — **Pass ≤ 3%**
- Force per foot: peak factor 2.2 → I_peak = 143 kA; 0.866 × 5.4×10⁻⁷ × (143 000)² / 6 ≈ **1 594 lbf/ft**
- Max support span (IEEE 605): √(8 × 6000 × 0.58 / 12 / 1594) ≈ **1.2 ft**
- Installed span 10 ft > 1.2 ft → **Fail** (factory-assembled busway housings and insulators carry much of this load; verify with the manufacturer's certified short-circuit rating and hanger spacing)

---

## Limitations

- Resistance and reactance are generic estimates derived from conductor cross-section (copper about 20/I mΩ/ft, aluminum about 30/I mΩ/ft). They are order-of-magnitude values; use the manufacturer's published impedance for final design.
- The IEEE 605 formula applies to the bare conductor mechanical properties. Factory-assembled busway enclosures carry additional structural load through their housings; the manufacturer's certified short-time withstand rating and support span specification govern final installation.
- The ambient temperature derating uses a 75 °C conductor temperature rating as a proxy; confirm the actual insulation class with the manufacturer.
