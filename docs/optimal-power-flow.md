# Optimal Power Flow / Economic Dispatch

The Optimal Power Flow (OPF) / Economic Dispatch study schedules a fleet of dispatchable generators to meet a system demand at the **lowest total fuel cost**, while respecting each unit's minimum and maximum output limits. It implements the classic equal-incremental-cost ("lambda") dispatch of convex quadratic cost curves — the cost core of a full AC-OPF.

## When to Use

- **Microgrid / on-site generation planning** — Determine how engines, gas turbines, or gensets should share a load to minimise fuel cost.
- **Multi-generator standby plants** — Find the most economical loading split across paralleled units.
- **Marginal cost of energy** — Read the system lambda (incremental cost) at a given demand.
- **Dispatch value** — Quantify the savings of cost-aware dispatch versus running every unit proportionally to capacity.

## Quick Start

1. Navigate to **Studies → Power System → Optimal Power Flow / Economic Dispatch**.
2. Enter your generators in the fleet table, or click **Load Demonstration Fleet** for the textbook 3-unit example.
3. Enter the **system demand** (MW) and an optional **transmission loss** percentage.
4. Click **Run Economic Dispatch**.
5. Review the system lambda, per-unit dispatch, total cost, and savings versus naive dispatch.
6. Click **Export Results (CSV)** to download the dispatch schedule.

## Cost Model

Each unit `i` has a convex quadratic fuel-cost curve:

```
C_i(P) = a_i + b_i·P + c_i·P²      [$/h]
IC_i(P) = b_i + 2·c_i·P            [$/MWh]   (incremental / marginal cost)
```

| Coefficient | Units | Meaning |
|-------------|-------|---------|
| `a` | $/h | No-load (fixed) cost |
| `b` | $/MWh | Linear cost term |
| `c` | $/MWh² | Quadratic cost term (must be ≥ 0 for a convex curve) |

`Pmin` and `Pmax` (MW) bound each unit's stable operating range.

## Method — Equal Incremental Cost (Lambda Dispatch)

At the least-cost optimum, **every unit operating strictly between its limits runs at the same system incremental cost λ**:

```
P_i(λ) = (λ − b_i) / (2·c_i),   clamped to [Pmin_i, Pmax_i]
```

Units whose incremental cost already exceeds λ at `Pmin` are held at `Pmin`; units that would only reach λ beyond `Pmax` are capped at `Pmax`. Because `Σ P_i(λ)` is monotonic in λ, the value of λ that satisfies `Σ P_i = demand + losses` is found by bisection.

**Losses** are modelled at screening level as a flat percentage of demand:

```
required generation = demand × (1 + loss% / 100)
```

**Savings** are reported against a naive capacity-proportional dispatch (which ignores cost differences) to quantify the value of economic scheduling.

## Fleet CSV Format

Import or export the fleet as CSV with columns `id, name, pmin, pmax, a, b, c`:

```
# id, name, pmin, pmax, a, b, c
G1, Unit 1, 150, 600, 561, 7.92, 0.001562
G2, Unit 2, 100, 400, 310, 7.85, 0.00194
G3, Unit 3, 50,  200, 78,  7.97, 0.00482
```

- Lines beginning with `#` are comments and are ignored.
- A header row starting with `id`, `name`, or `unit` is ignored automatically.
- Comma or tab delimited.

## Worked Example (Demonstration Fleet)

The built-in fleet is the canonical Wood, Wollenberg & Sheblé 3-unit example. For a demand of **850 MW** with no losses:

| Unit | Output (MW) | Incremental cost ($/MWh) |
|------|-------------|--------------------------|
| Unit 1 | ≈ 393.2 | ≈ 9.15 |
| Unit 2 | ≈ 334.6 | ≈ 9.15 |
| Unit 3 | ≈ 122.2 | ≈ 9.15 |

- **System lambda** ≈ 9.148 $/MWh
- **Total cost** ≈ $8,194/h

All three units operate at the same incremental cost — the signature of an optimal interior dispatch.

## Interpreting Results

- **System lambda** — the marginal cost of serving one more MW. This is the price signal used for energy bidding and marginal-cost recovery.
- **Status** — a unit *At max* has no upward reserve; a unit *At min* is too expensive to load further; *Marginal* units set the system lambda.
- **Savings vs. naive** — how much the economic schedule beats loading every unit proportionally to capacity.
- **Warnings** — surfaced when demand exceeds total capacity (unserved load), falls below total minimum stable generation (surplus), or when units are pinned at their limits.

## Limitations

This is a **screening-level, single-period** economic dispatch:

- No transmission line limits, security (N-1), or DC/AC network constraints.
- No ramp limits, start-up costs, or unit commitment.
- No reactive-power or voltage optimisation — real-power dispatch only.
- Losses are a flat percentage; there is no network B-matrix.

For network-constrained results, pair this study with the **Load Flow**, **Quasi-Dynamic Load Flow**, and **Contingency** studies. Final dispatch decisions should be verified against generator vendor heat-rate data and applicable interconnection agreements.

## References

- Wood, Wollenberg & Sheblé, *Power Generation, Operation, and Control*, 3rd ed., §3 (Economic Dispatch of Thermal Units).
- IEEE Std 399-1997 (Brown Book) §3 — System economics.
