# Voltage Stability Analysis

Identifies voltage collapse proximity by sweeping the total system load through sequential Newton-Raphson power flows and recording the resulting bus voltages (P-V nose curve). A companion Q-V sweep on a selected bus yields the reactive power margin.

## Standards

- NERC TPL-001-5 — Transmission Planning Performance Requirements
- IEEE Std 2800-2022 — IBR Interconnection (voltage stability screening)
- WECC Voltage Stability Methodology

## Input Fields

| Field | Description | Default |
|---|---|---|
| System MVA base | Per-unit base for all calculations | 100 |
| Bus ID | Unique string identifier for each bus | — |
| Bus type | `slack` (swing), `PQ` (load), or `PV` (generator) | — |
| Base kV | Bus nominal voltage in kV for impedance conversion | 13.8 |
| Pd (kW) | Active load at this bus (λ = 1 base case) | 0 |
| Qd (kVAR) | Reactive load at this bus | 0 |
| Pg (kW) | Active generation at this bus | 0 |
| Branch R / X | Series resistance and reactance in ohms | — |
| λ\_max | Maximum load factor to attempt | 3.0 |
| Δλ | Load step size | 0.05 |
| Target bus | Bus for Q-V reactive margin sweep | First PQ bus |
| Q min / max | Reactive injection sweep range (MVAR) | −50 / +50 |
| Q step | Step size for Q-V sweep (MVAR) | 2 |

## Outputs

| Output | Description |
|---|---|
| Operating load (MW) | Total system active load at base case (λ = 1) |
| Maximum loadability (MW) | Total load at last converged Newton-Raphson step |
| Loadability margin (MW, %) | MW distance from operating point to nose; NERC TPL screening threshold is ≥ 5% |
| Critical bus | Bus with lowest voltage at the operating point |
| Reactive margin (MVAR) | Minimum Q injection at the target bus before divergence |
| Collapse at λ | Load factor at which the power flow first failed to converge |
| P-V curve | Voltage vs. total load for all buses (SVG) |
| Q-V curve | Bus voltage vs. reactive injection at target bus (SVG) |

## Algorithm

1. For each λ from `lambdaStart` to `lambdaMax` in steps of `Δλ`:
   a. Scale all PQ bus loads by λ (PV and slack buses unchanged).
   b. Run Newton-Raphson power flow until convergence (tolerance 1 × 10⁻⁶ pu, max 30 iterations).
   c. Record bus voltages and angles if converged; stop sweep on first divergent step.
2. The nose point (maximum loadability) is the last converged λ × base load (MW).
3. The Q-V sweep modifies only the reactive load on the target bus across the configured MVAR range.

## Jacobian Formulation

The Newton-Raphson update solves **J Δx = r** where:

- **r** = [P\_spec − P\_calc, Q\_spec − Q\_calc] (power mismatch vector)
- **Δx** = [Δδ, ΔV] (angle and voltage magnitude corrections)
- **J** is the 4-submatrix power flow Jacobian:
  - H = ∂P/∂δ, N = ∂P/∂V
  - J = ∂Q/∂δ, L = ∂Q/∂V

Diagonal and off-diagonal elements per Kundur §6.3 (sign convention: θ\_ij = δ\_i − δ\_j).

## Per-Unit Conversion

Branch impedances are converted to per-unit using:

```
Z_pu = Z_ohm / base_Z,  where  base_Z = kV² / MVA_base
```

## Typical Results Interpretation

| Margin | Interpretation |
|---|---|
| < 5% | Low — near voltage collapse limit |
| 5–20% | Moderate — acceptable for most planning cases |
| > 20% | Adequate — well clear of collapse |

NERC TPL-001 does not mandate a universal MW margin threshold; typical utility planning practice uses 5–15% as a screening criterion depending on the contingency category.

## Limitations

- The NR-based sweep uses a fixed step size. Very small steps are needed for accurate nose-point detection; the CPF predictor-corrector formulation (arc-length parameterization) gives a smoother curve through the nose.
- Only balanced three-phase, fundamental-frequency steady-state conditions are modeled.
- Generator reactive limits (Q\_min/Q\_max) are not enforced in the current implementation; PV buses may violate reactive limits beyond the nose.
- The model does not include transformer tap changers, shunt capacitors, or voltage regulators.
