# Quasi-Dynamic Load Flow

The Quasi-Dynamic Load Flow study sweeps a time-varying demand profile through the AC Newton-Raphson solver to reveal how bus voltages, branch flows, and system losses evolve across the operating day or year.

## When to Use

- **Annual energy loss** — Quantify total kWh lost in conductors over 8760 hours for IEC 60364-8-1 energy efficiency reporting.
- **DER hosting capacity** — Find the hours where PV back-feed pushes bus voltages above 1.05 pu, and determine how much additional generation can be connected.
- **Peak/off-peak comparison** — Identify which buses are critically loaded at system peak and which are over-voltage at minimum load (e.g. overnight with embedded generation).
- **Battery dispatch planning** — Identify high-loss hours to optimise BESS charge/discharge schedules.
- **Contingency screening** — Confirm that voltage limits are met across a range of loading conditions, not just at the single design-point load.

## Quick Start

1. Open your project and draw the one-line diagram on the **One-Line** page. Define bus loads (kW/kVAR) and generator outputs — these become the base-case values scaled by the profile.
2. Navigate to **Studies → Power System → Quasi-Dynamic Load Flow**.
3. Select a built-in profile (24-hour or 8760-hour) or upload a CSV.
4. Click **Run Quasi-Dynamic Study**.
5. Review the voltage envelope, peak/valley snapshots, and energy loss summary.
6. Click **Export Results (CSV)** to download timestep and envelope data.

## Profile Format

The study accepts a CSV or plain-text file with one row per timestep:

| Layout | Columns |
|--------|---------|
| 1-column | `loadScale` |
| 2-column | `hour, loadScale` |
| 3-column | `hour, loadScale, genScale` |

- Lines beginning with `#` are comments and are ignored.
- A header row starting with the word `hour` is ignored automatically.
- `loadScale` and `genScale` are per-unit multipliers applied to the base-case load and generation respectively. `1.0` means 100% of the base case; `0.5` means 50%.
- If `hour` is omitted (1-column mode), hours are assigned automatically starting at 0.
- For 8760-hour annual studies, hours run from 0 to 8759.

**Example 3-column CSV:**
```
# hour, loadScale, genScale
0, 0.55, 1.0
1, 0.50, 1.0
...
12, 1.00, 0.8
...
23, 0.59, 1.0
```

## Built-in Profiles

| Profile | Description |
|---------|-------------|
| **Typical 24-hour commercial weekday** | 24-step profile based on ASHRAE 90.1 typical commercial occupancy factors. Peak at midday (hour 12), valley in early morning (hour 3). |
| **Representative 8760-hour annual** | 365 days × 24 hours. Weekday pattern applied Monday–Friday; weekend loads attenuated by 25%. Suitable for screening studies. Replace with measured data for definitive analysis. |

## Calculation Method

For each timestep _t_:

```
Pd_t  = Pd_base  × loadScale_t    (bus real load, kW)
Qd_t  = Qd_base  × loadScale_t    (bus reactive load, kVAR)
Pg_t  = Pg_base  × genScale_t     (bus real generation, kW)
Qg_t  = Qg_base  × genScale_t     (bus reactive generation, kVAR)
```

The scaled snapshot is passed to the full Newton-Raphson AC load-flow solver (same engine as the [Load Flow](loadFlow.html) study). Each timestep is independent — no inter-step dynamics, ramp limits, or energy storage state is tracked.

**Energy loss accumulation** (each step assumed = 1 hour):
```
E_loss = Σ P_loss_t    (kWh)
```

**Load factor:**
```
LF = P_avg / P_peak
```

## Voltage Limits

Voltage limits follow **ANSI C84.1 Range A** (standard service voltage):

| Condition | Limit | Classification |
|-----------|-------|----------------|
| Over-voltage | > 1.05 pu | **FAIL** |
| Marginal high | 1.03–1.05 pu | **WARN** |
| Normal | 0.97–1.03 pu | **PASS** |
| Marginal low | 0.95–0.97 pu | **WARN** |
| Under-voltage | < 0.95 pu | **FAIL** |

## Results Explained

### Summary KPIs

| KPI | Description |
|-----|-------------|
| **Convergence** | Number of timesteps for which the Newton-Raphson solver converged. Non-converged steps are excluded from the voltage envelope. |
| **Voltage violations** | Number of buses where max voltage exceeded 1.05 pu (over) or min voltage fell below 0.95 pu (under) across all converged timesteps. |
| **Total energy loss** | Sum of branch resistive losses across all converged timesteps, in kWh. |
| **Load factor** | Average load ÷ peak load. A value near 1.0 indicates a flat profile; near 0.5 is typical for commercial loads. |

### Voltage Envelope Chart

The chart shows two overlaid time series:
- **Orange line** — total system load (kW) against the left Y-axis.
- **Blue shaded band** — the range of bus voltages (max pu on top, min pu on bottom) against the right Y-axis. The dashed red lines mark the 0.95 and 1.05 pu limits.

### Bus Voltage Envelope Table

One row per bus. Shows the maximum and minimum voltage (pu) seen across all converged timesteps, classified as PASS/WARN/FAIL.

### Peak and Valley Snapshots

The timestep with the highest and lowest total system load respectively. Useful for verifying thermal ratings (peak) and over-voltage risk (valley, especially with DER).

## Limitations

- **Uniform scaling** — all bus loads are scaled by the same `loadScale`. For bus-by-bus profiles, use the [REST API](api-reference.md) to provide a custom pre-built model.
- **No inter-period dynamics** — battery state of charge, generator ramp rates, and demand response are not modelled.
- **No economic dispatch** — generation is scaled uniformly. For least-cost dispatch with generator cost curves, the Optimal Power Flow study is the appropriate tool.
- **Computational time** — 8760-step runs with large networks (> 100 buses) may take several seconds in the browser. For very large networks consider using the API endpoint `/api/v1/studies/quasiDynamic`.

## Standards References

- IEEE Std 399-1997 — _Recommended Practice for Industrial and Commercial Power Systems Analysis_ §14 (Load Flow Studies)
- IEC 60364-8-1:2019 — _Low-voltage electrical installations — Part 8-1: Energy efficiency_
- CIGRÉ TB 577 (2014) — _Quasi-dynamic simulation of active distribution networks_
- ANSI C84.1-2020 — _Electric Power Systems and Equipment — Voltage Ratings (60 Hz)_
