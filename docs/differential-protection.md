# Differential Protection Study (87B / 87T / 87G)

## Overview

The Differential Protection study analyses percentage-differential relay operation for power transformers (87T), buses (87B), and generators (87G). It verifies whether a relay will operate, remain restrained, or be blocked by harmonic content for a given set of measured or calculated currents.

**Page:** `differentialprotection.html`  
**Analysis module:** `analysis/differentialProtection.mjs`

---

## Standards

| Standard | Scope |
|----------|-------|
| IEEE C37.91-2008 | Guide for Protecting Power Transformers |
| IEEE C37.102-2006 | Guide for AC Generator Protection |
| IEEE C37.97-2020 | Guide for Protective Relay Applications to Power System Buses |
| IEC 60255-151:2009 | Functional requirements — percentage differential relays |

---

## Algorithm

### 1. Rated Currents

Computed from nameplate MVA and rated voltages (three-phase basis):

```
I_rated_primary   = MVA × 1000 / (√3 × V_HV_kV)   [A]
I_rated_secondary = MVA × 1000 / (√3 × V_LV_kV)   [A]
```

### 2. Winding Correction (Transformers)

For delta-wye (Yd/Dy) transformer connections, the secondary CT current must be corrected for the vector group phase shift. The magnitude correction factor `k` is:

| Connection | Correction factor k |
|------------|---------------------|
| Yy0, Yy6, Dd0 | 1.0 |
| Yd1, Yd11 | √3 ≈ 1.732 |
| Dy1, Dy11 | 1/√3 ≈ 0.577 |

Per IEEE C37.91-2008 §5.4, numerical relays apply digital phase-rotation compensation; this tool models the magnitude component of the correction.

```
I_CT_secondary = I_secondary_A / CTR2
I_corrected    = I_CT_secondary × k
I₂_pu          = I_corrected / (I_rated_secondary / CTR2)
```

For bus and generator protection, no winding correction is applied (equivalent to Yy0).

### 3. Operate and Restraint Currents

Per-unit values normalised to rated:

```
I₁_pu  = |I_primary_A / CTR1| / (I_rated_primary / CTR1)
I_op   = |I₁_pu − I₂_pu|           (differential / operate current)
I_res  = (|I₁_pu| + |I₂_pu|) / 2   (average restraint current)
```

- On load or through-fault: `I_op ≈ 0`, `I_res ≈ load_pu`
- On internal fault: `I_op ≈ I₁_pu` (secondary current collapses)

### 4. Dual-Slope Percentage-Differential Characteristic

IEC 60255-151 §5 defines a dual-slope characteristic:

```
Zone 1 (I_res ≤ I_res_break):  trip if I_op ≥ I_min + slope₁ × I_res
Zone 2 (I_res  > I_res_break):  trip if I_op ≥ I_min + slope₂ × I_res
```

| Parameter | Typical range | Default |
|-----------|---------------|---------|
| I_min (minimum pickup) | 0.10–0.30 pu | 0.20 pu |
| Slope 1 | 20–30% | 25% |
| Slope 2 | 40–60% | 50% |
| I_res_break | 1.5–3.0 pu | 2.0 pu |

The higher slope in Zone 2 prevents maloperation on heavy through-faults where CT saturation causes measurement errors.

### 5. Harmonic Restraint

**Inrush blocking (2nd harmonic):**  
When a transformer is energised, the magnetising inrush current is rich in 2nd harmonic. The relay measures the ratio of 2nd harmonic to fundamental in the differential current:

```
H₂ ratio = |I_diff_2nd| / |I_diff_1st|
Block if H₂ ratio ≥ IHR₂_threshold  (typical: 15–20%)
```

**Overexcitation blocking (5th harmonic):**  
Transformer core overexcitation produces strong 5th harmonic:

```
H₅ ratio = |I_diff_5th| / |I_diff_1st|
Block if H₅ ratio ≥ IHR₅_threshold  (typical: 20–35%)
```

### 6. Relay Status

| Status | Meaning |
|--------|---------|
| **RESTRAINED** | `I_op < trip_threshold`. Relay does not operate. Normal for load and through-fault. |
| **OPERATE** | `I_op ≥ trip_threshold` and no harmonic blocking. Relay trips (~1–2 cycles). Internal fault detected. |
| **HARMONIC_BLOCKED_INRUSH** | Would operate but 2nd harmonic ratio ≥ IHR₂ threshold. Inrush blocking prevents false trip. |
| **HARMONIC_BLOCKED_OVEREXC** | Would operate but 5th harmonic ratio ≥ IHR₅ threshold. Overexcitation blocking prevents false trip. |

---

## CT Ratio Selection Guidelines

The CT ratios must be selected so that the relay's CT secondary currents are approximately equal at rated load (matched current method):

```
CTR1 / CTR2 ≈ I_rated_secondary / I_rated_primary  (for Yy transformers)
CTR1 / CTR2 ≈ (I_rated_secondary / I_rated_primary) × (1/√3)  (for Yd transformers)
```

For example, a 10 MVA 115/13.8 kV Yd1 transformer:
- I_rated_primary = 50.2 A → CTR1 = 100:5 (ratio = 20)
- I_rated_secondary = 418.4 A → CTR2 = 800:5 (ratio = 160)
- Winding correction: √3 factor compensates for the Yd connection

---

## I_op vs I_res Plot

The study renders a scatter chart showing:
- **Zone 1 line** (solid blue): `I_op = I_min + slope₁ × I_res` for `I_res ≤ I_res_break`
- **Zone 2 line** (dashed purple): `I_op = I_min + slope₂ × I_res` for `I_res > I_res_break`
- **I_min line** (dotted grey): minimum pickup boundary
- **Operating points** (coloured markers): per-phase `(I_res, I_op)` — green = restrained, red = operate, amber = harmonic-blocked

Points above the characteristic lines are in the trip region. The breakpoint `I_res_break` marks the transition from Zone 1 to Zone 2.

---

## TCC Integration

Differential relay devices are available in the **TCC** tool (labeled `87T`, `87B`, `87G`) with:
- Instantaneous trip time of ~17 ms (1 cycle at 60 Hz)
- Characteristic plotted as a vertical line at the minimum operate primary current

The minimum operate primary current is:
```
I_min_operate = I_min_pu × I_rated_primary  [A]
```

---

## Related Studies

- [Short Circuit](shortCircuit.html) — obtain fault current levels for relay evaluation
- [TCC / Protection Coordination](tcc.html) — coordinate differential relay with downstream overcurrent devices
- [Arc Flash](arcFlash.html) — incident energy at the protected equipment bus
- [Load Flow](loadFlow.html) — obtain normal load currents for relay margin verification
