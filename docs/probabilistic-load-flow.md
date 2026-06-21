# Probabilistic / Monte Carlo Load Flow

The Probabilistic Load Flow study runs the AC Newton-Raphson solver across many randomized scenarios. Each scenario samples a system load multiplier and a generation multiplier from user-defined probability distributions, solves a single load flow, and records the operating point. Aggregating thousands of scenarios produces **probability statistics** for bus voltages and system losses — percentiles, histograms, and the probability of a voltage-limit violation.

## When to Use

- **Renewable / EV-rich feeders** where a single deterministic load flow is not representative of real operating conditions.
- **Hosting-capacity studies** — quantify the probability that PV back-feed pushes a bus above 1.05 pu.
- **Risk-based planning** — report `P(undervoltage)` instead of relying on a single worst case.
- **Loss estimation with confidence bands** (P5–P95) rather than a point value.

## Quick Start

1. Open your project and draw the one-line diagram on the **One-Line** page. Bus loads and generator outputs become the base case scaled by each scenario.
2. Navigate to **Studies → Power System → Probabilistic / Monte Carlo Load Flow**.
3. Choose the **load** and **generation** multiplier distributions.
4. Set the **scenario count** and **random seed**.
5. Click **Run Monte Carlo**.
6. Review the probability of violation, loss and voltage histograms, and per-bus statistics. Click **Export Results (CSV)** to download.

## Method

For each scenario, driven by a seeded random number generator:

```
loadScale ~ loadDist        Pd = Pd_base × loadScale,  Qd = Qd_base × loadScale
genScale  ~ genDist         Pg = Pg_base × genScale,   Qg = Qg_base × genScale
```

A single AC load flow is solved per scenario. The study records total loss, minimum/maximum bus voltage, every per-bus voltage, and whether any bus left the limits. After all scenarios:

- **Statistics** (mean, std, min, max, P5, P50, P95) for system loss and minimum bus voltage.
- **Histograms** of system loss and minimum bus voltage.
- **Per-bus** mean/std/min/P5/max voltage with `P(V < 0.95)` and `P(V > 1.05)`.
- **Probability of violation** — fraction of converged scenarios with any bus outside 0.95–1.05 pu.

### Reproducibility

A seeded `mulberry32` RNG drives all sampling, so **the same seed always reproduces identical results**. Change the seed to explore a different random realisation; the underlying distributions are unchanged.

## Input Distributions

| Type | Parameters | Typical use |
|------|------------|-------------|
| Constant | value | Fixed multiplier (deterministic) |
| Normal | mean, sd | Symmetric load uncertainty around an expected value |
| Uniform | min, max | Equal probability across a range |
| Triangular | min, mode, max | Only a min, most-likely, and max are known |
| Beta | α, β | Bounded on [0, 1] — the standard renewable capacity-factor model |
| Empirical | sample list | Bootstrap directly from measured meter / SCADA data |

Optional **clamp min / clamp max** bounds are applied after sampling to keep multipliers physical (e.g. load ≥ 0).

**Renewable example:** model PV/wind output as `Beta(α=2, β=5)` on the generation multiplier — a distribution skewed toward lower capacity factor, bounded at 0 and 1.

**Voltage limits (ANSI C84.1 Range A):** 0.95–1.05 pu.

## Interpreting Results

- **P(voltage violation)** — overall risk that any bus leaves the limits in a random scenario.
- **Histograms** — the probability distributions of system loss and minimum bus voltage; the dashed line marks the voltage limit.
- **Per-bus risk** — the worst of `P(V<0.95)` and `P(V>1.05)` for each bus, highlighting which buses drive the system risk.

## Limitations

- **Uniform scaling** — all loads share one multiplier and all generators share another. Per-bus input distributions require a custom model via the API.
- **No correlation** between the load and generation distributions.
- Diverged scenarios are excluded from the statistics and reported in the warnings.
- Screening-level: pair with the deterministic **Load Flow**, **Quasi-Dynamic Load Flow**, and **Contingency** studies for design confirmation.

## References

- IEEE Std 399-1997 (Brown Book) §14 — Load Flow.
- Borkowska, B. (1974), "Probabilistic Load Flow", *IEEE Transactions on Power Apparatus and Systems*, PAS-93.
- Allan, Borkowska & Grigg (1974), "Probabilistic analysis of power flows".
