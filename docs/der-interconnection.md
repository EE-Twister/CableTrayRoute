# IEEE 1547-2018 DER Interconnection Study

**Module:** `analysis/derInterconnect.mjs`  
**UI page:** `derinterconnect.html`  
**Tests:** `tests/derInterconnect.test.mjs` (47 assertions)

---

## Overview

This tool evaluates the six mandatory screening criteria defined by **IEEE 1547-2018** (Standard for Interconnection and Interoperability of Distributed Energy Resources with Associated Electric Power Systems Interfaces, as amended by **IEEE 1547a-2020**) for US utility distribution interconnection of distributed energy resources (DER) including solar PV, battery energy storage systems (BESS), and wind turbines.

US utilities require all six criteria to be satisfied before issuing an interconnection agreement. The study integrates with the IBR Modeling tool (Gap #61) — ride-through settings can be imported directly.

---

## Standards References

| Standard | Scope |
|----------|-------|
| **IEEE 1547-2018** | Interconnection requirements for DER ≤ 10 MVA at distribution voltage levels |
| **IEEE 1547a-2020** | Amendment: updates to ride-through categories and anti-islanding |
| **ANSI C84.1-2020** | Service voltage range requirements (Range A/B) |
| **IEEE 2800-2022** | Transmission-connected IBR (used for fault current limits) |

---

## Screening Criteria

### 1. Steady-State PCC Voltage Impact (ANSI C84.1)

DER active and reactive power injection causes a voltage rise at the point of common coupling (PCC). The rise must keep the bus voltage within ANSI C84.1 limits.

**Formula (linearized Thevenin approximation):**
```
ΔV ≈ (P·R + Q·X) / V₀²   [per-unit]
```
where R + jX is the Thevenin source impedance (pu on 1 MVA base), P and Q are the DER output in pu on the same base, and V₀ is the pre-DER voltage.

**Limits:**
- Range A (normal sustained): 0.95–1.05 pu
- Range B (infrequent/short-duration): 0.917–1.083 pu

**Pass criterion:** `V_with_DER` within Range A.

---

### 2. Fault Current Contribution (IEEE 1547-2018 §6.4)

Inverter-based resources contribute a limited fault current — unlike synchronous machines. The total fault current at the PCC (grid + IBR) must not exceed the protective device's interrupting rating.

**Formula:**
```
I_rated = S_rated / (√3 × V_LL)
I_IBR_fault = k_limit × I_rated        (k_limit = 1.05–1.2, default 1.1)
I_total = I_existing + I_IBR_fault
```

**Pass criterion:** `I_total ≤ device interrupting rating`.

---

### 3. Anti-Islanding (IEEE 1547-2018 §8.1)

DER must detect unintentional islanding (the DER continuing to energize a portion of the grid after utility disconnection) and cease energizing the area EPS within the time limits.

**Trip time limits:**
| Category | Maximum Trip Time |
|----------|------------------|
| A | 2.0 s |
| B | 1.0 s |
| C | 0.16 s |

**Monitoring methods:**
- **Active** — frequency shift, impedance measurement, slip-mode: eliminates the non-detection zone (NDZ)
- **Passive** — under/over voltage/frequency relay: acceptable but may have NDZ
- **None** — non-compliant per IEEE 1547-2018 §8.1

**Pass criterion:** `trip_time ≤ category_limit` AND monitoring method is not "none".

---

### 4. Voltage / Frequency Ride-Through (IEEE 1547-2018 Tables 3 & 5)

DER must remain connected and support the grid during voltage and frequency disturbances within the defined continuous operating zone. The DER's configured trip thresholds must be at least as wide as the IEEE 1547 requirements for the declared category.

**Voltage ride-through (Table 3):**
| Category | Min V (pu) | Max V (pu) |
|----------|-----------|-----------|
| I | 0.70 | 1.10 |
| II | 0.65 | 1.10 |
| III | 0.50 | 1.20 |

**Frequency ride-through (Table 5, 60 Hz system):**
| Category | Min f (Hz) | Max f (Hz) |
|----------|-----------|-----------|
| I | 58.5 | 61.5 |
| II | 57.0 | 62.0 |
| III | 56.5 | 63.0 |

For 50 Hz systems, limits are scaled proportionally.

**Pass criterion:** Configured trip thresholds ≤ minimum required and ≥ maximum required for each category.

---

### 5. Harmonic Current Compliance (IEEE 1547-2018 Table 2)

DER harmonic current injection at the PCC must not exceed the limits in IEEE 1547-2018 Table 2, expressed as a percentage of the DER rated fundamental current.

**Key limits:**
| Harmonic Order | Limit (% of I_rated) |
|---------------|---------------------|
| 3rd, 5th, 7th | 3.0% |
| 9th | 0.5% |
| 11th, 13th | 1.0% |
| 15th, 21st | 0.3% |
| 17th, 19th | 1.5% |
| 23rd, 25th | 0.6% |
| **THD** | **5.0%** |

**Pass criterion:** THD ≤ 5% AND all individual harmonics within limits.

---

## Module API

```js
import {
  checkPCCVoltage,
  checkFaultImpact,
  checkAntiIslanding,
  checkRideThrough,
  checkHarmonicsCompliance,
  runDERInterconnectStudy,
} from './analysis/derInterconnect.mjs';
```

### `checkPCCVoltage(params)`

| Parameter | Type | Description |
|-----------|------|-------------|
| `v_pcc_pu` | number | Pre-DER PCC voltage (pu), default 1.0 |
| `der_rated_kW` | number | DER rated active power (kW, > 0) |
| `der_rated_kVAR` | number | DER rated reactive power injection (kVAR) |
| `sc_MVA` | number | Short-circuit MVA at PCC (> 0) |
| `r_pu` | number | Thevenin R in pu on 1 MVA base |
| `x_pu` | number | Thevenin X in pu on 1 MVA base |

Returns: `{ v_nominal_pu, v_with_der_pu, delta_v_pct, rangeA_pass, rangeB_pass, pass }`

### `checkFaultImpact(params)`

| Parameter | Type | Description |
|-----------|------|-------------|
| `der_rated_kVA` | number | Inverter apparent power (kVA, > 0) |
| `v_ll_kV` | number | Bus line-to-line voltage (kV, > 0) |
| `existing_fault_kA` | number | Pre-DER fault current at PCC (kA) |
| `device_interrupting_kA` | number | Device interrupting rating (kA) |
| `k_limit` | number | IBR current limit factor (pu), default 1.1 |

Returns: `{ ibr_rated_A, ibr_fault_A, total_fault_kA, interrupting_margin_pct, pass }`

### `checkAntiIslanding(params)`

| Parameter | Type | Description |
|-----------|------|-------------|
| `category` | string | `'A'`, `'B'`, or `'C'` |
| `trip_time_s` | number | Configured island detection trip time (s) |
| `monitoring_type` | string | `'active'`, `'passive'`, or `'none'` |

Returns: `{ category, limit_s, trip_time_s, trip_time_compliant, monitoring_method_valid, pass }`

### `checkRideThrough(params)`

| Parameter | Type | Description |
|-----------|------|-------------|
| `category` | string | `'I'`, `'II'`, or `'III'` |
| `v_rt_lo_pu` | number | Configured low-voltage trip threshold (pu) |
| `v_rt_hi_pu` | number | Configured high-voltage trip threshold (pu) |
| `f_rt_lo_hz` | number | Configured low-frequency trip threshold (Hz) |
| `f_rt_hi_hz` | number | Configured high-frequency trip threshold (Hz) |
| `frequency_hz` | number | Nominal system frequency (Hz), default 60 |

Returns: `{ category, voltage_rt_pass, freq_rt_pass, v_requirement, f_requirement, pass }`

### `checkHarmonicsCompliance(params)`

| Parameter | Type | Description |
|-----------|------|-------------|
| `thd_pct` | number | Total Harmonic Distortion (% of fundamental) |
| `individual_harmonics` | `{order, pct}[]` | Individual harmonic components |

Returns: `{ thd_pct, thd_limit_pct, thd_pass, individual_pass, violations, pass }`

### `runDERInterconnectStudy(params)`

Unified entry point. Accepts an object with five sub-parameter objects: `{ pcc_voltage, fault_impact, anti_islanding, ride_through, harmonics }`.

Returns: `{ pcc_voltage, fault_impact, anti_islanding, ride_through, harmonics, overall_pass, summary_flags }`

---

## Integration with IBR Modeling

The **Import from IBR Study** button on `derinterconnect.html` reads the saved IBR study (`studies.ibr`) and pre-populates:
- Inverter apparent power rating (from fault contribution inputs)
- PCC voltage level
- Current limit factor k_limit

See [IBR Modeling Guide](ibr-modeling.md) for the IBR study workflow.

---

## Input Assumptions

- DER output is modeled at rated conditions (nameplate power).
- PCC voltage rise uses the linearized Thevenin approximation — accurate for X/R ≥ 3 and DER penetration ≤ 20% of SC MVA.
- Fault current contribution uses the IEEE 1547-2018 §6.4 single-multiplier model; IEEE 2800-2022 grid-forming inverter models (up to 1.5×) are not included.
- Ride-through compliance checks the outer continuous operating zone only; momentary cessation and must-trip sub-zones are not modeled.
- Harmonic limits apply at rated output; de-rated conditions may have different harmonic profiles.

---

## Typical Values

| Parameter | Typical Range |
|-----------|---------------|
| SC MVA (distribution) | 50–500 MVA |
| k_limit (distribution IBR) | 1.05–1.2 |
| PCC voltage range | 0.97–1.03 pu |
| THD (modern grid-tied inverter) | 1–4% |
| Trip time (Category B) | 0.1–1.0 s |
