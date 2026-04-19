# Differential Protection (87B / 87T / 87G) — User Guide

## Overview

Differential protection (ANSI device 87) is the primary protection scheme for transformers,
generators, and buses. It compares the algebraic sum of all currents entering a defined zone:
during normal operation, the sum is zero; a fault inside the zone creates an unbalance that
the relay detects as an *operating* (differential) current.

CableTrayRoute implements the standard **percentage-differential characteristic** used by SEL,
GE, ABB, Siemens, and other relay vendors. The study supports three zone types:

| Code | Protected Equipment | Harmonic Restraint |
|------|--------------------|--------------------|
| **87B** | Bus (switchgear, substation bus) | None |
| **87T** | Power transformer | 2nd + 5th harmonic |
| **87G** | Generator (stator winding) | 5th harmonic only |

## Standards

- **IEEE C37.91-2008** — Guide for Protecting Power Transformers
- **IEEE C37.102-2006** — Guide for AC Generator Protection
- **IEEE C37.97-1979** — Guide for Protective Relay Applications to Power System Buses
- **IEEE C37.111-2013** — COMTRADE format (relay event file exchange)

## Methodology

### Step 1 — CT Ratio and Tap

Each winding of the protected element has a dedicated CT. The relay's **tap** compensates for
different CT ratios so that equal through-currents produce equal per-unit secondary currents.

```
Nominal tap = CT₁ ratio / CT₂ ratio
Mismatch %  = |tap_set − nominal_tap| / nominal_tap × 100
```

IEEE C37.91 allows up to 5% mismatch without additional correction. Above 5%, the relay
either saturates on through-faults or fails to trip for small internal faults near the
trip boundary.

### Step 2 — Operating and Restraint Currents

Terminal currents are converted to per-unit of CT secondary (normalised to tap):

```
I₁_pu = (I_A / (CT₁/CT_sec)) / tap
I₂_pu = (I_B / (CT₂/CT_sec)) / tap

I_op  = | I₁_pu − I₂_pu |              (operating / differential current)
I_rst = ( |I₁_pu| + |I₂_pu| ) / 2      (restraint current)
```

Use a positive sign for current flowing **into** the zone, negative for current flowing out.
For a through-fault (external fault), both terminals carry the same magnitude in opposite
directions, so I_op ≈ 0. For an in-zone fault, one terminal may carry fault current with no
return path, giving a large I_op.

### Step 3 — Dual-Slope Characteristic

The relay trips when the operating current exceeds the restraint-dependent threshold:

```
Slope 1 region  (I_rst < I_bp):
  threshold = max(I_min, S₁ × I_rst)

Slope 2 region  (I_rst ≥ I_bp):
  threshold = S₁×I_bp + S₂×(I_rst − I_bp)
```

- **S₁ (Slope 1)**: primary restraint region. Typical: 25%. Covers load and external faults
  where CT errors are small.
- **S₂ (Slope 2)**: high-current region where CTs may saturate, requiring greater restraint.
  Typical: 65%.
- **I_min**: minimum pickup in per-unit. Relay will not operate below this threshold.
  Typical: 0.20 pu.
- **I_bp**: breakpoint (pu). Transition from Slope 1 to Slope 2. Set just above maximum
  through-current (e.g., 3.0 pu for a transformer rated at twice full-load current with
  emergency overload).

**Trip condition**: `I_op > threshold` AND harmonic restraint not active.

### Step 4 — Harmonic Restraint (87T / 87G)

#### Transformer Inrush (87T — 2nd Harmonic)

When a transformer is energised, the magnetising inrush current may contain 15–80% second
harmonic content. Without restraint, the differential relay would trip on every energisation.
Per **IEEE C37.91 §8.2**, if the 2nd harmonic component exceeds **15%** of the fundamental,
the relay blocks tripping.

#### Over-Excitation (87T / 87G — 5th Harmonic)

Over-voltage on a transformer or generator core causes over-excitation (V/Hz > rated). The
resulting magnetising current contains significant 5th harmonic. Per IEEE C37.91, if the
5th harmonic exceeds **35%**, tripping is blocked.

Bus differential (87B) does not apply harmonic restraint — buses do not exhibit inrush.

## Inputs

| Field | Description |
|-------|-------------|
| Zone label | Optional descriptive name for the protected element |
| Zone type | 87B / 87T / 87G |
| CT₁ ratio | Primary turns on terminal 1 (e.g., 600 for 600:5 CT) |
| CT₂ ratio | Primary turns on terminal 2 |
| CT secondary | 5 A or 1 A |
| Tap setting | Relay compensation tap — set to CT₁/CT₂ or nearest available value |
| Slope 1 (%) | Restraint slope for low-current region. Default: 25% |
| Slope 2 (%) | Restraint slope for high-current region. Default: 65% |
| I_min (pu) | Minimum operating current pickup. Default: 0.20 pu |
| I_bp (pu) | Breakpoint restraint current. Default: 3.0 pu |
| I_A (A) | Current at terminal 1 (A primary, positive = into zone) |
| I_B (A) | Current at terminal 2 (A primary, negative = out of zone for through-current) |
| 2nd harmonic % | Percentage of fundamental (87T only) |
| 5th harmonic % | Percentage of fundamental (87T, 87G) |

## Outputs

| Output | Description |
|--------|-------------|
| Trip / No-Trip | Whether the relay would operate |
| I_op (pu) | Operating (differential) current |
| I_rst (pu) | Restraint current |
| Threshold (pu) | Dual-slope threshold at the computed I_rst |
| Security margin | (threshold − I_op) / threshold × 100% — positive means secure |
| Harmonic restraint | Active / Not active; reason |
| CT mismatch | % mismatch vs. 5% limit |
| Dual-slope plot | I_rst vs. I_op chart with trip boundary and operating point |

## Device Library

Three pre-configured relay entries are included:

| ID | Relay | Zone | Slope 1 | Slope 2 | I_min | Harmonic |
|----|-------|------|---------|---------|-------|---------|
| `sel_487b` | SEL-487B | 87B | 25% | 65% | 0.20 pu | None |
| `sel_387` | SEL-387 | 87T | 25% | 65% | 0.20 pu | 2nd + 5th |
| `ge_t60` | GE Multilin T60 | 87T | 30% | 70% | 0.15 pu | 2nd + 5th |

These appear in the TCC device library and can be assigned to one-line components with
subtype `relay_87`.

## Worked Example — 2000 kVA Transformer (87T)

**System**: 2000 kVA, 13.8 kV / 480 V, Δ-Y transformer.

**CTs**: HV side — 600:5 (CT₁ = 600), LV side — 100:5 (CT₂ = 100).

**Tap**: 600 / 100 = 6.0 (exact).

**Settings**: Slope 1 = 25%, Slope 2 = 65%, I_min = 0.20 pu, I_bp = 3.0 pu.

**Normal load (500 A primary, HV side)**:

```
I_A = +500 A  (into zone, HV terminal)
I_B = −500 A  (out of zone, LV terminal; approximately 500 × 13.8/0.48 ≈ 14,375 A LV
               but here primary-referred)
```

For a perfect tap and balanced transformer, I_op ≈ 0, I_rst ≈ load level. No trip.

**Transformer energisation with 20% 2nd harmonic**:
- 2nd harmonic 20% > 15% → harmonic restraint active → **NO TRIP** (correct, prevents
  false trip on energisation).

**In-zone fault (Ia = 5000 A, Ib = 0)**:
```
I₁_pu = (5000 / 120) / 6 = 6.94 pu
I₂_pu = 0
I_op  = 6.94 pu
I_rst = 3.47 pu  (above I_bp = 3.0)
threshold = 0.75 + 0.65×(3.47−3.0) = 0.75 + 0.31 = 1.06 pu
6.94 > 1.06 → TRIP ✓
```

## Verification Against Competitors

This study reproduces the percentage-differential characteristic implemented in:

- **ETAP Star Protection Coordination** — dual-slope 87T with harmonic restraint
- **EasyPower Protection** — SEL/GE relay library with harmonic blocking
- **SKM PTW** — bus and transformer differential zones
- **DIgSILENT PowerFactory** — differential relay elements with IEC C37.111 event export

## See Also

- [TCC Coordination](../tcc.html) — overcurrent relay coordination
- [Short Circuit](../shortCircuit.html) — fault current magnitudes for protection study
- [Arc Flash](../arcFlash.html) — incident energy and PPE requirements
