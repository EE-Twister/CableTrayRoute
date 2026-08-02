# Battery / UPS Sizing Guide

## Overview

The Battery / UPS Sizing study provides two calculation paths:

- **Generic energy screen** for early energy, budget, and space planning.
- **Manufacturer-data duty-cycle sizing** for section-by-section stationary
  battery sizing when the selected product's discharge table, end voltage,
  temperature factor, and complete sequential DC duty cycle are available.

> **Selection boundary:** The manufacturer-data path is a transparent cell-selection
> review aid, not an IEEE compliance certification. Manufacturer sizing software,
> product qualification, load classification, random-load placement, and project
> acceptance checks remain required. IEEE 485-2020 applies to lead-acid batteries;
> IEEE 1115 applies to nickel-cadmium batteries. Neither applies to lithium-ion.

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
- Screening a requested NEC 700/701 runtime before a code and manufacturer review
- Reviewing a lead-acid or nickel-cadmium cell selection against a documented
  manufacturer discharge table and sequential DC duty cycle

**Upstream inputs:**
- Average and peak load demand — use the [Load List](../loadlist.html) or
  [Load Flow](../loadFlow.html) study P results
- Cold-environment ambient temperature — from facility data or ASHRAE design conditions

---

## Manufacturer-Data Duty-Cycle Method

Use this mode only when the manufacturer discharge-performance table is available
for the selected cell family, reference capacity, end voltage, and temperature
basis. The application deliberately contains no generic product curve and rejects
durations outside the entered table.

Enter the duty cycle as sequential constant-current periods:

```text
duration_minutes,current_amps
1,250
59,80
60,25
```

For each section endpoint, the calculation expresses the load as current changes
and superimposes those changes against the manufacturer current available for the
remaining duration:

```text
reference_units(section) = Σ [ΔI_i / I_manufacturer(remaining_duration_i)]
Ah_raw(section) = reference_units(section) × Ah_reference
Ah_corrected = Ah_raw / K_temperature × (100 / end_of_life_pct) × (1 + margin_pct/100)
```

Manufacturer discharge current is interpolated on log-log axes between entered
points. It is never extrapolated. Every result retains the per-load-step current
change, remaining duration, interpolated manufacturer current, and reference-unit
contribution. The section with the greatest corrected amp-hour requirement controls.

The candidate cell capacity from **Rack Layout & Connections** determines the
number of parallel strings:

```text
parallel_strings = ceil(Ah_required / candidate_cell_Ah)
installed_Ah = parallel_strings × candidate_cell_Ah
```

Required provenance inputs are:

- Manufacturer, cell model/family, document identifier, revision, and table/page
- Reference cell capacity represented by the entered current values
- End voltage in volts per cell
- Manufacturer temperature capacity factor for the design temperature
- Project end-of-life capacity criterion and design margin
- Complete ordered duty cycle, including momentary, noncontinuous, continuous,
  and deliberately placed random loads

---

## Generic Energy-Screening Algorithm — Step by Step

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

### Step 3: Assumed Temperature Correction

Battery capacity decreases at low ambient temperatures. The temperature
correction factor K_temp scales the required bank size accordingly:

```
K_temp = min(1.0,  1 + coeff × (T_amb − 25°C))
kWh_temp = kWh_design / K_temp
```

K_temp is capped at 1.0 for conservative screening. Replace this generic linear
coefficient with manufacturer data for the selected cell and discharge duration.

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

### Step 4: Assumed Aging Factor

Battery capacity degrades over its service life. The screening model applies a
generic end-of-life multiplier; final criteria depend on the battery technology,
project requirements, and selected standard:

```
kWh_aged = kWh_temp × aging_factor
```

| Chemistry         | Aging Factor | Rationale                         |
|-------------------|--------------|-----------------------------------|
| Lead-Acid         | 1.25         | Replace at 80% capacity (1/0.80)  |
| Lithium-Ion       | 1.20         | Replace at ~80% capacity          |
| Nickel-Cadmium    | 1.20         | Replace at ~80% capacity          |

### Step 5: User-Entered Design Margin

An additional margin accounts for uncertainty in load growth, installation
differences, and measurement error:

```
kWh_final = kWh_aged × (1 + margin%)
```

The default is **10%** for preliminary screening. Project criteria and the
applicable battery standard govern the final margin.

---

## Input Reference

| Input | Description | Typical Range |
|-------|-------------|---------------|
| Average load (kW) | Continuous load the battery must sustain | 1–10,000 kW |
| Peak load (kW) | Instantaneous maximum for UPS kVA sizing | ≥ average |
| Runtime (hours) | Required discharge duration | 0.25–8 h |
| Chemistry | Lead-acid, lithium-ion, or NiCd | See table above |
| Ambient temp (°C) | Battery room / enclosure temperature | −40 to +40 °C |
| Design margin (%) | User-entered screening allowance | 10–25% |
| UPS power factor | UPS output PF (typically 0.9 for modern units) | 0.8–1.0 |
| Sizing method | Generic energy screen or manufacturer-data duty cycle | Select by project phase |
| DC duty-cycle periods | Sequential duration (minutes) and current (A) rows | Complete project duty cycle |
| Manufacturer discharge table | Duration and current for one documented reference-capacity cell/string | Selected product data |
| Discharge table source | Manufacturer, model/family, document, revision, table/page | Required in duty-cycle mode |
| Reference capacity | Capacity represented by the discharge-current table | Manufacturer-specific |
| End voltage | Minimum voltage basis for the discharge table | Manufacturer/project-specific |
| Temperature capacity factor | Available-capacity fraction at design temperature | Manufacturer-specific, 0-1 |
| End-of-life capacity | Project replacement capacity threshold | Commonly 80%, verify criteria |
| DC bus voltage (V) | Nominal battery string / UPS DC bus voltage for rack layout | 125, 240, 480, 600 VDC |
| Nominal cell voltage (V) | Cell voltage used to compute cells in series | 2.0 lead-acid, 3.2 Li-ion, 1.2 NiCd |
| Cell capacity (Ah) | Per-cell amp-hour rating at the selected discharge rate | Manufacturer-specific |
| Cells per module | Cell grouping used for module and jumper layout | 1-24 typical |
| Modules per rack | Available module slots per rack frame | Manufacturer-specific |
| Rack geometry | Width, depth, height, racks per row, aisles, and clearances | Project / vendor-specific |
| Terminal side | Rack side used for generated DC bus routing | Front/rear, left/right |

---

## Results Interpretation

**Duty-cycle section table** — shows raw and corrected amp-hour capacity at
every section endpoint. The controlling section is highlighted. Expand the
contribution table to audit each current change, remaining duration, interpolated
manufacturer current, and reference-unit contribution.

**Cell / string selection** — compares the minimum corrected amp-hour requirement
with the candidate cell capacity and reports the required parallel-string count,
installed amp-hour capacity, and nominal installed energy.

**Energy chain** — shows each step of the calculation so you can see which
factor dominates the final requirement. A large gap between kWh_net and
kWh_final in cold environments indicates that battery heating should be
considered.

**Screening bank size** — the smallest generic kWh increment that meets the
screening requirement. Generic increments: 10, 15, 20, 25, 30, 40, 50, 60, 75, 100,
120, 150, 200, 250, 300, 400, 500, 600, 750, 1000 kWh.

**Runtime curve** — available runtime at 25%, 50%, 75%, 100%, and 125% of the
specified average load, for the selected bank. Use this to evaluate load shedding
strategies.

**UPS kVA** — standard UPS size ≥ peak_kW / UPS_PF. This ensures the UPS
inverter can supply the peak demand without overloading.

**Rack layout views** show a generated top view and elevation view from the
selected bank size and rack-layout inputs. The top view shows rack envelopes,
aisles/clearances, the positive and negative DC bus route, and the UPS/DC bus
tie point. The elevation view shows module slots, occupied modules by string,
series string grouping, and string jumper callouts. The connection schedule
lists each series string plus positive and negative home runs to the DC bus.

These views are coordination-level engineering aids. They do not replace
manufacturer shop drawings, installation drawings, seismic anchorage details,
ventilation analysis, protective device selection, cable ampacity checks, or
field-verified terminal layouts.

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

- **IEEE 485-2020** — IEEE Recommended Practice for Sizing Lead-Acid Batteries for
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
| `temperatureFactor(chemistry, tempC)` | Generic screening K_temp factor |
| `requiredEnergyKwh(loadProfilePeriods)` | Net energy from duty cycle |
| `designCapacityKwh(kwhNet, chemistry, tempC, margin)` | Generic five-step screening chain |
| `standardBankSize(kwhRequired)` | Select nearest standard bank kWh |
| `runtimeCurve(kwhSelected, loadKw, chemistry)` | Runtime at 25/50/75/100/125% load |
| `upsKvaRequired(peakKw, upsPF)` | UPS kVA requirement and standard size |
| `normalizeManufacturerDischargeTable(rows)` | Validate and order entered product discharge data |
| `interpolateManufacturerDischargeCurrent(rows, duration)` | Bounded log-log interpolation without extrapolation |
| `sizeManufacturerDutyCycle(inputs)` | Evaluate every duty-cycle section and select parallel strings |
| `runManufacturerDutyCycleAnalysis(inputs)` | Build the manufacturer-data result with provenance and warnings |
| `runBatterySizingAnalysis(inputs)` | Master orchestrator — call this from the UI |

Rack layout functions are exported from `analysis/batteryRackLayout.mjs`:

| Function | Purpose |
|----------|---------|
| `normalizeBatteryRackLayoutInputs(sizingResult, overrides)` | Normalize rack, cell, module, and clearance inputs with stable defaults |
| `buildBatteryRackLayoutModel(sizingResult, layoutInputs)` | Compute strings, rack placements, connection records, SVG-view geometry, and layout warnings |
