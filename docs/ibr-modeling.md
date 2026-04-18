# IBR Modeling — PV / BESS / Inverter-Based Resource Analysis

**Module:** `analysis/ibrModeling.mjs`  
**UI Page:** `ibr.html`  
**Tests:** `tests/ibrModeling.test.mjs`

## Overview

This module implements the five core calculations needed to model inverter-based resources
(IBRs) — solar PV arrays, battery energy storage systems (BESS), and grid-forming inverters —
in electrical studies.

IBRs behave fundamentally differently from synchronous generators:

- **Fault current is current-limited** (1.05–1.2× rated) rather than synchronous-machine-level
  (5–10× rated). This affects protection coordination.
- **Reactive power is limited by the P-Q capability ellipse** (√(S²−P²)), not by field excitation.
- **Voltage-reactive power droop (Volt-VAR)** is required by IEEE 1547-2018 for all utility-
  interactive inverters.
- **Active power curtailment (Freq-Watt)** is triggered by over-frequency events.

## Standards References

| Standard | Scope |
|---|---|
| IEEE 1547-2018 | Interconnection and interoperability of DER with utility distribution systems |
| IEEE 1547a-2020 | Amendment — ride-through requirements and Volt-VAR profiles |
| IEEE 2800-2022 | IBR interconnection with transmission systems (grid-forming requirements) |
| IEC 61727:2004 | PV system utility interface characteristics |
| IEC 60891:2021 | Procedures for temperature and irradiance corrections (PV I-V curves) |
| IEC 62116:2014 | Anti-islanding test procedures for PV inverters |

## Functions

### `pvArrayOutput(params)` — PV AC Output

Calculates AC output power from a PV array at arbitrary irradiance and temperature.

**Inputs:**

| Parameter | Unit | Default | Description |
|---|---|---|---|
| `irradiance_W_m2` | W/m² | — | Plane-of-array irradiance |
| `temp_C` | °C | — | Module cell temperature |
| `Pstc_kW` | kW | — | DC array rating at STC (1000 W/m², 25 °C) |
| `tempCoeff_pct` | %/°C | −0.35 | Power temperature coefficient |
| `inverterEff` | 0–1 | 0.97 | Inverter efficiency (CEC-weighted or peak) |
| `sRated_kVA` | kVA | Pstc/η | Inverter apparent power limit |
| `voltVarQ_kvar` | kvar | 0 | Reactive power dispatch (from Volt-VAR) |

**Equations (IEC 60891):**

```
irradFactor  = G / G_STC          (G_STC = 1000 W/m²)
tempFactor   = 1 + γ_P × (T − 25)
P_DC         = P_STC × irradFactor × tempFactor
P_AC         = P_DC × η_inv        (clamped: √(P_AC² + Q²) ≤ S_rated)
```

**Returns:** `{ pDC_kW, pAC_kW, qAC_kvar, sAC_kVA, pf, curtailed, tempFactor, irradFactor }`

---

### `ibrPQCapability(params)` — P-Q Envelope & Volt-VAR

Computes the reactive power capability envelope and Volt-VAR operating point.

**Inputs:**

| Parameter | Default | Description |
|---|---|---|
| `sRated_kVA` | — | Inverter apparent power rating |
| `pOutput_kW` | — | Current active power output |
| `vBus_pu` | 1.0 | Bus voltage in per-unit |
| `voltVarEnabled` | true | Enable IEEE 1547 Volt-VAR droop |
| `voltVarCategory` | `'B'` | IEEE 1547 Table 8 category (`'A'` or `'B'`) |

**Capability limit:**

```
Q_max = √(S_rated² − P_out²)    [kvar]
```

**IEEE 1547-2018 Table 8 default Volt-VAR curves:**

| V (pu) | Q (pu) — Cat B | Q (pu) — Cat A |
|---|---|---|
| ≤ 0.90 | +0.44 | ≤ 0.92 → +0.44 |
| 0.98 | 0.0 | 0.98 → 0.0 |
| 1.02 | 0.0 | 1.02 → 0.0 |
| ≥ 1.10 | −0.44 | ≥ 1.08 → −0.44 |

Positive Q = capacitive (voltage support), negative Q = inductive (voltage absorption).

**Returns:** `{ qMin_kvar, qMax_kvar, qDroop_kvar, pf_min, pf_max, operatingPoint }`

---

### `ibrFaultContribution(params)` — Fault Current

**Inputs:**

| Parameter | Default | Description |
|---|---|---|
| `sRated_kVA` | — | Inverter apparent power rating |
| `vLL_kV` | — | Bus line-to-line voltage |
| `vBus_pu` | 1.0 | Pre-fault bus voltage (pu) |
| `limitFactor` | 1.1 | Fault current / rated current ratio |
| `rideThrough` | true | false = inverter trips (zero contribution) |

**Equations (IEEE 1547 §6.4 / IEEE 2800 §6.7.1):**

```
I_rated = S_rated / (√3 × V_LL)
I_fault = k_limit × I_rated     (when rideThrough = true)
I_fault = 0                      (when rideThrough = false — inverter trips)
```

Typical `k_limit` values:
- Grid-following inverters (IEEE 1547 Category I): 1.05–1.1
- Grid-following with LVRT (IEEE 1547 Category II/III): 1.1–1.2
- Grid-forming inverters (IEEE 2800): up to 1.5

**Returns:** `{ Irated_A, Ifault_A, Ifault_pu, tripped }`

---

### `bessDispatch(params)` — BESS Dispatch

**Inputs:**

| Parameter | Default | Description |
|---|---|---|
| `sRated_kW` | — | Rated active power (kW) |
| `sRated_kVA` | sRated_kW | Apparent power limit |
| `soc_pct` | — | Current state of charge (%) |
| `mode` | `'discharge'` | Operating mode |
| `setpointKw` | sRated_kW | Requested active power setpoint |
| `vBus_pu` | 1.0 | Bus voltage (for volt_var mode) |
| `roundTripEff` | 0.92 | AC-AC round-trip efficiency |
| `minSocPct` | 10 | Minimum SOC for discharge |
| `maxSocPct` | 95 | Maximum SOC for charge |

**Dispatch logic:**

```
Discharge:  P_AC = P_setpoint × η_rt     (blocked if SOC ≤ SOC_min)
Charge:     P_AC = −P_setpoint / η_rt    (blocked if SOC ≥ SOC_max)
Standby:    P_AC = 0, Q = 0
Volt-VAR:   P_AC = 0, Q = Volt-VAR droop(V_bus)
```

**Returns:** `{ pAC_kW, qAC_kvar, socLimited, mode }`

---

### `freqWattResponse(params)` — Frequency-Watt Curtailment

**Inputs:**

| Parameter | Default | Description |
|---|---|---|
| `pMax_kW` | — | Maximum available active power |
| `freq_Hz` | — | Measured system frequency |
| `nomFreq_Hz` | 60 | Nominal frequency |
| `dbLow_Hz` | 59.98 | Lower deadband |
| `dbHigh_Hz` | 60.02 | Upper deadband |
| `droop_pct` | 5 | Droop (%/Hz above deadband) |

**Equations (IEEE 1547-2018 §5.3.1):**

```
When f ∈ [f_db_low, f_db_high]:
    curtailFraction = 0
    P_dispatch = P_max

When f > f_db_high:
    f_dev = f − f_db_high
    curtailFraction = min(1, droop_pct/100 × f_dev)
    P_dispatch = P_max × (1 − curtailFraction)

When f < f_db_low:
    curtailFraction = 0   (inverter runs at full available power)
```

**Returns:** `{ pDispatch_kW, curtailFraction, freqDeviation_Hz, region }`

---

### `runIBRStudy(inputs)` — Convenience Wrapper

Runs all five calculations in sequence for a single IBR resource. Returns:

```js
{
  pvOutput,         // null for BESS/generic IBR
  pqCapability,
  faultContribution,
  bessResult,       // null for PV/generic IBR
  freqWatt,
}
```

## Integration with Load Flow and Short Circuit

### Load Flow Integration (`analysis/loadFlow.js`)

IBR components (`pv_inverter`, `bess`) are modeled as PQ buses with Volt-VAR Q injection.
The Newton-Raphson solver applies `ibrPQCapability()` to clamp reactive power within the
capability envelope after each voltage update iteration.

`analysis/loadFlowModel.js` detects IBR devices via `isIBRDevice()` and extracts their
operating parameters via `deriveIBRProfile()`.

### Short-Circuit Integration (`analysis/shortCircuit.mjs`)

When building the Thevenin equivalent for a bus, IBR contributions are computed via
`ibrFaultContribution()` rather than the synchronous-machine Thevenin model. The current-limited
fault current is added as a current injection to the bus rather than a voltage-behind-reactance.

## Example Usage

```js
import { runIBRStudy } from './analysis/ibrModeling.mjs';

// 1 MW PV system on a 34.5 kV bus
const result = runIBRStudy({
  resourceType: 'pv',
  sRated_kVA: 1050,
  vLL_kV: 34.5,
  Pstc_kW: 1000,
  irradiance_W_m2: 900,
  temp_C: 35,
  vBus_pu: 1.02,
});

console.log(`AC output: ${result.pvOutput.pAC_kW.toFixed(1)} kW`);
console.log(`Volt-VAR Q: ${result.pqCapability.qDroop_kvar.toFixed(1)} kvar`);
console.log(`Fault current: ${result.faultContribution.Ifault_A.toFixed(1)} A`);
```
