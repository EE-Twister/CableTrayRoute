# Battery / UPS Sizing Guide

## Overview

The Battery / UPS Sizing study sizes a stationary battery bank and UPS unit to
maintain power to critical loads for a required duration following a utility
outage. The calculation follows **IEEE 485-2010** (lead-acid batteries) and
**IEEE 1115-2000** (nickel-cadmium batteries).

Correct battery sizing is required for:
- Emergency lighting and life-safety systems (NEC Article 700)
- Legally required standby power (NEC Article 701)
- Optional standby for data centers, control rooms, and process continuity (NEC 702)
- Telecom and SCADA back-up power (NERC CIP, Telcordia GR-63-CORE)

Undersized banks fail to hold load for the required duration. Oversized banks
increase capital cost, floor-loading requirements, and maintenance burden.

---

## When to Use This Study

Run this study when:
- Specifying a new UPS system or replacing an existing battery bank
- Evaluating runtime extension for an existing UPS
- Sizing a standalone DC battery system (telecom, substation control)
- Verifying compliance with NEC 700/701 minimum runtime requirements

**Upstream inputs:**
- Average and peak load demand — use the [Load List](../loadlist.html) or
  [Load Flow](../loadFlow.html) study P results
- Cold-environment ambient temperature — from facility data or ASHRAE design conditions

---

## IEEE 485 Algorithm — Step by Step

### Step 1: Net Energy (kWh)

For a uniform constant load:

```
kWh_net = P_avg_kW × t_hours
```

For a multi-period duty cycle (e.g., full load for 30 min, then shedded load for
90 min):

```
kWh_net = Σ (P_i × Δt_i)
```

### Step 2: Derate for Efficiency and Depth of Discharge

Not all energy in a battery bank is usable. Round-trip losses and manufacturer
depth-of-discharge (DoD) limits reduce the effective capacity:

```
kWh_design = kWh_net / (η × DoD)
```

| Chemistry         | η (round-trip) | DoD   | η × DoD |
|-------------------|----------------|-------|---------|
| Lead-Acid Flooded | 0.85           | 0.70  | 0.595   |
| Lead-Acid AGM     | 0.85           | 0.80  | 0.680   |
| Lithium-Ion       | 0.95           | 0.90  | 0.855   |
| Nickel-Cadmium    | 0.80           | 0.80  | 0.640   |

**Example:** 100 kWh net, Lead-Acid AGM:
`kWh_design = 100 / 0.680 = 147.1 kWh`

### Step 3: Temperature Correction (IEEE 485 §5.2)

Battery capacity decreases at low ambient temperatures. The temperature
correction factor K_temp scales the required bank size accordingly:

```
K_temp = min(1.0,  1 + coeff × (T_amb − 25°C))
kWh_temp = kWh_design / K_temp
```

K_temp is capped at 1.0: IEEE 485 does not credit extra capacity above 25 °C
(elevated temperature shortens cycle life without increasing usable energy).

**Temperature coefficients:**

| Chemistry         | coeff (per °C) |
|-------------------|----------------|
| Lead-Acid         | 0.008          |
| Lithium-Ion       | 0.003          |
| Nickel-Cadmium    | 0.006          |

**K_temp reference table** (Lead-Acid):

| Ambient (°C) | K_temp | Multiplier on kWh_design |
|-------------|--------|--------------------------|
| 25          | 1.000  | ×1.000                   |
| 15          | 0.920  | ×1.087                   |
| 5           | 0.840  | ×1.190                   |
| −5          | 0.760  | ×1.316                   |
| −15         | 0.680  | ×1.471                   |

### Step 4: Aging Factor (IEEE 485 §5.3)

Battery capacity degrades over its service life. IEEE 485 recommends sizing to
maintain full runtime until the end of the battery's rated cycle life, typically
when capacity falls to 80% of nameplate:

```
kWh_aged = kWh_temp × aging_factor
```

| Chemistry         | Aging Factor | Rationale                         |
|-------------------|--------------|-----------------------------------|
| Lead-Acid         | 1.25         | Replace at 80% capacity (1/0.80)  |
| Lithium-Ion       | 1.20         | Replace at ~80% capacity          |
| Nickel-Cadmium    | 1.20         | Replace at ~80% capacity          |

### Step 5: Design Margin (IEEE 485 §5.4)

An additional margin accounts for uncertainty in load growth, installation
differences, and measurement error:

```
kWh_final = kWh_aged × (1 + margin%)
```

IEEE 485 recommends a **minimum 10% design margin** for general applications.
Use 15–25% for life-safety and mission-critical systems.

---

## Input Reference

| Input | Description | Typical Range |
|-------|-------------|---------------|
| Average load (kW) | Continuous load the battery must sustain | 1–10,000 kW |
| Peak load (kW) | Instantaneous maximum for UPS kVA sizing | ≥ average |
| Runtime (hours) | Required discharge duration | 0.25–8 h |
| Chemistry | Lead-acid, lithium-ion, or NiCd | See table above |
| Ambient temp (°C) | Battery room / enclosure temperature | −40 to +40 °C |
| Design margin (%) | IEEE 485 §5.4 additional margin | 10–25% |
| UPS power factor | UPS output PF (typically 0.9 for modern units) | 0.8–1.0 |

---

## Results Interpretation

**Energy chain** — shows each step of the calculation so you can see which
factor dominates the final requirement. A large gap between kWh_net and
kWh_final in cold environments indicates that battery heating should be
considered.

**Recommended bank size** — the smallest standard rating (kWh) that meets the
final requirement. Standard sizes: 10, 15, 20, 25, 30, 40, 50, 60, 75, 100,
120, 150, 200, 250, 300, 400, 500, 600, 750, 1000 kWh.

**Runtime curve** — available runtime at 25%, 50%, 75%, 100%, and 125% of the
specified average load, for the selected bank. Use this to evaluate load shedding
strategies.

**UPS kVA** — standard UPS size ≥ peak_kW / UPS_PF. This ensures the UPS
inverter can supply the peak demand without overloading.

---

## Integration with Other Studies

| Study | How it feeds into Battery Sizing |
|-------|----------------------------------|
| [Load List](../loadlist.html) | Average and peak load demand (kW) |
| [Load Flow](../loadFlow.html) | Bus-level average P (kW) for sizing input |
| [Short Circuit](../shortCircuit.html) | For DC arc flash analysis (Gap #58) if battery bank feeds DC switchgear |
| [Arc Flash](../arcFlash.html) | UPS as an additional fault source for incident energy |
| [Motor Start](../motorStart.html) | Starting transient of motors on UPS bus sets peak load |

---

## Standards References

- **IEEE 485-2010** — IEEE Recommended Practice for Sizing Lead-Acid Batteries for
  Stationary Applications
- **IEEE 1115-2000** (revised 2014) — IEEE Recommended Practice for Sizing
  Nickel-Cadmium Batteries for Stationary Applications
- **IEEE 1184-2006** — IEEE Guide for Batteries for Uninterruptible Power Supply
  Systems
- **NEC Article 700** — Emergency Systems (minimum 1.5 h runtime)
- **NEC Article 701** — Legally Required Standby Systems
- **NEC Article 702** — Optional Standby Systems
- **NFPA 111-2019** — Standard on Stored Electrical Energy Emergency and Standby
  Power Systems

---

## Worked Example

**Scenario:** Data centre PDU room; critical load 100 kW average, 120 kW peak;
4-hour runtime required; Lead-Acid AGM batteries; 18 °C battery room.

| Step | Formula | Result |
|------|---------|--------|
| Net energy | 100 kW × 4 h | 400 kWh |
| Design capacity | 400 / (0.85 × 0.80) | 588.2 kWh |
| K_temp (18 °C) | 1 + 0.008 × (18−25) = 0.944 | 588.2 / 0.944 |
| Temp-corrected | | 623.1 kWh |
| Aging factor ×1.25 | | 778.9 kWh |
| Design margin ×1.10 | | 856.8 kWh |
| Standard bank size | nearest ≥ 856.8 kWh | **1000 kWh** |
| UPS kVA | 120 kW / 0.9 pf | 133.3 → **150 kVA** |

---

## Module Reference

All functions are exported from `analysis/batterySizing.mjs` with no DOM dependencies.

| Function | Purpose |
|----------|---------|
| `temperatureFactor(chemistry, tempC)` | IEEE 485 §5.2 K_temp factor |
| `requiredEnergyKwh(loadProfilePeriods)` | Net energy from duty cycle |
| `designCapacityKwh(kwhNet, chemistry, tempC, margin)` | Full five-step sizing chain |
| `standardBankSize(kwhRequired)` | Select nearest standard bank kWh |
| `runtimeCurve(kwhSelected, loadKw, chemistry)` | Runtime at 25/50/75/100/125% load |
| `upsKvaRequired(peakKw, upsPF)` | UPS kVA requirement and standard size |
| `runBatterySizingAnalysis(inputs)` | Master orchestrator — call this from the UI |
