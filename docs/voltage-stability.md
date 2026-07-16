# Voltage Stability Analysis

Provides preliminary P-V and Q-V sensitivity sweeps using sequential Newton-Raphson power flows. Solver nonconvergence is reported as a numerical boundary only; it is not treated as a physical voltage-collapse nose. The Q-V sweep records voltage response to reactive injection but does not claim a reactive margin.

> **Screening limitation:** Final voltage-stability margins require continuation
> power flow or another independently validated method, complete generator
> reactive limits and controls, transformer taps, shunts, contingency dispatch,
> and the applicable planning criteria.

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
| Last converged sample (MW) | Total load at the final converged Newton-Raphson step; not a confirmed maximum-transfer point |
| Sampled converged range (MW, %) | Distance from the operating point to the last converged sample; not a physical loadability margin |
| Critical bus | Bus with lowest voltage at the operating point |
| Reactive margin (MVAR) | Not assigned by the sequential sweep; continuation power flow is required |
| Collapse at λ | Load factor at which the power flow first failed to converge |
| P-V curve | Voltage vs. total load for all buses (SVG) |
| Q-V curve | Bus voltage vs. reactive injection at target bus (SVG) |

## Algorithm

1. For each λ from `lambdaStart` to `lambdaMax` in steps of `Δλ`:
   a. Scale all PQ bus loads by λ (PV and slack buses unchanged).
   b. Run Newton-Raphson power flow until convergence (tolerance 1 × 10⁻⁶ pu, max 30 iterations).
   c. Record bus voltages and angles if converged; stop sweep on first divergent step.
2. The first nonconverged point is retained as a solver boundary. It is not labeled as a physical nose or collapse point.
3. The Q-V sweep modifies net reactive load across the configured MVAR range, including net capacitive injection when injection exceeds the original load.

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

## Results Interpretation

Do not apply pass/fail thresholds to the sampled converged range. Establish the
physical maximum-transfer point and project margin with continuation power flow
before comparing against utility or planning criteria.

## Limitations

- The NR-based sweep uses a fixed step size. Smaller steps refine the sampled numerical boundary but do not establish the physical nose; use a CPF predictor-corrector formulation for that purpose.
- Only balanced three-phase, fundamental-frequency steady-state conditions are modeled.
- Generator reactive limits (Q\_min/Q\_max) are not enforced in the current implementation; PV buses may violate reactive limits during the sweep.
- The model does not include transformer tap changers, shunt capacitors, or voltage regulators.
