# Voltage Stability Analysis (Gap #64)

## Overview

The Voltage Stability study generates P-V and Q-V curves to assess steady-state voltage collapse margins using a two-bus Thevenin equivalent model.

**Access:** Studies → Power System → Voltage Stability (`voltagestability.html`)

## Background

Voltage instability occurs when a power system cannot maintain steady voltage after a disturbance (load increase, generator trip, reactive device switching). The nose of the P-V curve marks the maximum loadability of the equivalent circuit — loading beyond this point results in voltage collapse.

## Model

A single-bus Thevenin equivalent is used:

```
Source (V_s = 1.0 pu) — Z = R + jX (pu) — Load Bus (P + jQ)
```

The Thevenin impedance is derived from the short-circuit MVA and X/R ratio:

```
Z_pu = MVA_base / MVA_sc
R = Z_pu / √(1 + XR²)
X = Z_pu · XR / √(1 + XR²)
```

The power flow equation (quadratic in V²):

```
V⁴ + (2PR + 2QX − 1)V² + (P² + Q²)Z² = 0
```

## P-V Curve

Traces bus voltage magnitude vs. active power loading factor λ.

- **Upper branch** — stable operating region
- **Lower branch** — unstable (below the nose)
- **Nose point** — maximum transferable power; onset of voltage collapse
- **MW margin** = (P_nose − P_base) / P_nose × 100%

The nose-point power is derived analytically by setting the voltage quadratic's discriminant to zero with Q = P · tan(φ):

```
P_nose = (|Z| / cosφ − (R + X·tanφ)) / (2·(X − R·tanφ)²)
```

For a lossless feeder (R → 0) at unity power factor, this reduces to the classical result P_max = 1/(2X).

## Q-V Curve

Sweeps bus voltage from 1.1 pu to 0.30 pu at constant active power and computes the reactive compensation Q_comp needed to maintain each voltage level. Positive Q_comp = capacitive injection (raises voltage).

- **Operating point** — Q_comp = 0 (no external reactive compensation)
- **Q-margin** = reactive support that can be withdrawn before voltage collapse = |minimum Q_comp on the upper branch|

A negative Q-margin indicates the bus requires capacitive compensation to maintain stable voltage at the current loading level.

## Interpretation Guidelines

| Indicator | Green (OK) | Yellow (Caution) | Red (Action Required) |
|-----------|-----------|------------------|-----------------------|
| MW margin | > 25% | 10–25% | < 10% |
| Q-margin | > 0 MVAr | — | ≤ 0 MVAr |
| Nose voltage | > 0.70 pu | 0.55–0.70 pu | < 0.55 pu |
| Base-case V | > 0.95 pu | 0.85–0.95 pu | < 0.85 pu |

## Limitations

This simplified model is appropriate for:
- Preliminary stability screening of radial feeders
- Industrial plant main bus assessment
- DER interconnection point evaluation

For multi-bus systems, generator reactive limits, automatic voltage regulators (AVR), or switched reactive devices, a full continuation power flow (CPF) solver with the complete network Y-bus is required.

## Implementation

| File | Description |
|------|-------------|
| `analysis/voltageStability.mjs` | Core P-V and Q-V calculation engine |
| `voltagestability.js` | UI logic and SVG chart rendering |
| `voltagestability.html` | Study page |
| `src/voltagestability.js` | Rollup entry point |
| `tests/voltageStability.test.mjs` | Unit test suite |

## References

- P. Kundur, *Power System Stability and Control*, Chapter 14 (McGraw-Hill, 1994)
- IEEE/PES Task Force, *Voltage Stability Assessment: Concepts, Practices and Tools* (June 2002)
- Carson W. Taylor, *Power System Voltage Stability* (McGraw-Hill, 1994)
- IEEE Std 1110-2002, Guide for Synchronous Generator Modeling Practices and Applications in Power System Stability Analyses
