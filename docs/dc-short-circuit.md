# DC Short-Circuit & Arc Flash Analysis

## Overview

The DC short-circuit and arc flash module (`analysis/dcShortCircuit.mjs`) calculates:

1. **Bolted DC fault current** (IEEE 946-2004 / IEC 61660-1) — the maximum prospective short-circuit current available at a fault point in a DC distribution system.
2. **DC arcing current and arc flash incident energy** (NFPA 70E-2024 Annex D.8.1, Ammerman method) — the energy a worker may be exposed to during a DC arc flash event.
3. **Protection device interrupt rating check** — verifies that fuses and breakers have adequate DC interrupt ratings for the available fault current.

Typical applications: battery rooms, UPS DC buses, PV string/combiner boxes, telecom power plants, DC switchgear (125 V / 250 V station batteries).

---

## Standards Referenced

| Standard | Scope |
|----------|-------|
| **IEEE 946-2004** | Recommended Practice for the Design of DC Auxiliary Power Systems for Generating Stations — fault current model |
| **IEC 61660-1:1997** | Short-circuit currents in DC auxiliary installations in power plants and substations |
| **NFPA 70E-2024 Annex D.8 / D.8.1** | DC arc flash hazard analysis |
| **IEEE P1458** | Recommended Practice for the Design, Operation, and Maintenance of DC Systems — arc flash reference |
| **Ammerman et al. (2010)** | "DC Arc Models and Incident Energy Calculations," *IEEE Trans. Ind. Appl.* 46(5) |
| **Stokes & Oppenlander (1991)** | "Electric Arcs in Open Air," *J. Phys. D: Appl. Phys.* 24, 26–35 |

---

## Calculation Method

### 1. DC Bolted Fault Current (IEEE 946)

The Thevenin equivalent circuit for a DC battery source delivers a bolted fault current:

```
I_bf = V_oc / R_total
```

where:
- `V_oc` = open-circuit (no-load) voltage of the DC source (V)
- `R_total = R_battery + R_cable + R_bus` (Ω)

**Battery voltage by chemistry:**

| Chemistry | V/cell | Cells for 48 V | Cells for 125 V |
|-----------|--------|----------------|-----------------|
| Lead-acid (flooded / AGM) | 2.0 V | 24 | 60 |
| Nickel-cadmium (NiCd) | 1.2 V | 40 | 104 |
| Lithium-ion | 3.6 V | 14 | 35 |
| LiFePO4 | 3.2 V | 15 | 39 |

### 2. L/R Time Constant

If the total loop inductance `L` (mH) is known:

```
τ (ms) = L (mH) / R_total (Ω)
```

In most low-voltage DC distribution systems, inductance is negligible (< 0.1 mH) and τ ≈ 0 ms.

### 3. DC Arcing Current (Stokes–Oppenlander / Ammerman Model)

The arc voltage for DC arcs in air (Stokes & Oppenlander 1991):

```
V_arc = 20 + 0.534 × g (mm) × I_arc^0.12
```

Combined with the circuit equation:

```
I_arc = (V_oc − V_arc) / R_total
```

These two equations are solved iteratively (25 Newton–Raphson steps, starting at `I_arc₀ = 0.85 × I_bf`). The arc current is bounded to [0, I_bf].

### 4. Incident Energy (NFPA 70E Annex D.8.1 — Lee/Ammerman Method)

Arc flash power:
```
P_arc = V_arc × I_arc   [W]
```

Incident energy at the working distance D (cm):
```
E = (4.184 × C_f × P_arc × t_arc) / (2π × D_cm²)   [cal/cm²]
```

Enclosure correction factor:
- `C_f = 1.0` — open air / open busbars
- `C_f = 2.0` — enclosed box (panel, switchgear, UPS cabinet)

### 5. Arc Flash Boundary

The distance at which incident energy equals 1.2 cal/cm² (onset of second-degree burn):

```
D_af = √((4.184 × C_f × P_arc × t_arc) / (2π × 1.2))   [cm → mm]
```

### 6. PPE Category (NFPA 70E-2024 Table 130.7(C)(15)(c))

| Incident Energy | PPE Category |
|----------------|--------------|
| ≤ 1.2 cal/cm² | Category 0 (no PPE required) |
| > 1.2 – ≤ 4 cal/cm² | Category 1 (4 cal/cm² minimum) |
| > 4 – ≤ 8 cal/cm² | Category 2 (8 cal/cm² minimum) |
| > 8 – ≤ 25 cal/cm² | Category 3 (25 cal/cm² minimum) |
| > 25 – ≤ 40 cal/cm² | Category 4 (40 cal/cm² minimum) |
| > 40 cal/cm² | Dangerous — special protection required |

---

## Module API

### `calcDcFaultCurrent(params)`

```js
import { calcDcFaultCurrent } from './analysis/dcShortCircuit.mjs';

const { boltedFaultCurrentA, timeConstantMs, totalResistanceOhm } = calcDcFaultCurrent({
  batteryVoltageV: 125,           // DC bus voltage (V)
  batteryInternalResistanceOhm: 0.020,  // battery string resistance (Ω)
  cableResistanceOhm: 0.005,      // one-way cable resistance (Ω)
  busbarResistanceOhm: 0.001,     // bus/bar resistance (Ω)
  inductanceMH: 0,                // circuit inductance (mH), default 0
});
// boltedFaultCurrentA ≈ 4808 A
```

### `calcDcArcFlash(params)`

```js
import { calcDcArcFlash } from './analysis/dcShortCircuit.mjs';

const result = calcDcArcFlash({
  batteryVoltageV: 125,
  batteryInternalResistanceOhm: 0.020,
  cableResistanceOhm: 0.005,
  gapMm: 25,                   // electrode gap (mm)
  workingDistanceMm: 455,      // working distance (mm)
  arcDurationMs: 50,           // protection clearing time (ms)
  enclosureType: 'open_air',   // 'open_air' | 'enclosed_box'
});
// result.incidentEnergyCalCm2, result.ppeCategory, result.arcFlashBoundaryMm
```

### `selectDcProtection(params)`

```js
import { selectDcProtection } from './analysis/dcShortCircuit.mjs';

const checks = selectDcProtection({
  availableFaultCurrentA: 4808,
  devices: [
    { tag: 'F1', type: 'fuse', ratedCurrentA: 100, interruptRatingA: 10000, clearingTimeMs: 8 },
    { tag: 'CB1', type: 'breaker', ratedCurrentA: 100, interruptRatingA: 3000 },
  ],
});
// checks[0].pass === true (10 kA fuse passes)
// checks[1].pass === false (3 kA breaker fails — insufficient for 4808 A fault)
```

### `runDcShortCircuitStudy(inputs)`

Orchestrates all three calculations in one call:

```js
import { runDcShortCircuitStudy } from './analysis/dcShortCircuit.mjs';

const result = runDcShortCircuitStudy({
  batteryVoltageV: 125,
  batteryInternalResistanceOhm: 0.020,
  cableResistanceOhm: 0.005,
  runArcFlash: true,
  arcDurationMs: 50,
  gapMm: 25,
  workingDistanceMm: 455,
  enclosureType: 'open_air',
  devices: [{ tag: 'F1', type: 'fuse', ratedCurrentA: 100, interruptRatingA: 10000 }],
  studyLabel: '125 V Station Battery — Room 101',
});
```

---

## Important Notes

### DC vs. AC Interrupt Ratings

Fuses and circuit breakers have **separate** AC and DC interrupt ratings. The DC interrupt rating is typically lower than the AC rating because a DC arc does not self-extinguish at a current zero. Always verify:
- The device is rated for the DC system voltage
- The DC interrupt rating ≥ available DC fault current

### Arc Flash Mitigation for DC Systems

High-energy DC arc flash scenarios (> 8 cal/cm²) should be mitigated by:
- Using current-limiting fuses (clear in < 8 ms)
- Reducing battery string voltage where possible
- Increasing the working distance
- Adding current-limiting reactors (large battery plants)

### PV Systems

For PV combiner boxes, the available fault current is the short-circuit current of all parallel strings. The DC bus voltage is the maximum power point or open-circuit voltage of the PV array. Use `calcDcFaultCurrent` with `batteryVoltageV` set to the PV open-circuit voltage and `batteryInternalResistanceOhm` set to the equivalent source impedance.

---

## See Also

- [`battery.html`](../battery.html) — Battery / UPS Sizing (IEEE 485)
- [`shortCircuit.html`](../shortCircuit.html) — AC Short-Circuit Analysis (ANSI/IEC)
- [`arcFlash.html`](../arcFlash.html) — AC Arc Flash Analysis (IEEE 1584-2018)
- [`tcc.html`](../tcc.html) — Time-Current Coordination
