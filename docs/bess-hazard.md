# BESS Hazard / Thermal Runaway Modeling

CableTrayRoute implements a screening-level Hazard Mitigation Analysis (HMA) for battery energy storage systems (BESS) in compliance with **NFPA 855-2023** (Standard for the Installation of Stationary Energy Storage Systems) and **NFPA 68-2018** (Standard on Explosion Protection by Deflagration Venting).

## Standards referenced

| Standard | Scope |
|---|---|
| NFPA 855-2023 | ESS installation requirements; §15 — Indoor Stationary ESS |
| NFPA 68-2018  | Deflagration venting; §7.4.3 — Bartknecht correlation |
| UL 9540A-2023 | Thermal runaway propagation test method (cell → module → rack) |
| IFC 1207-2020 | International Fire Code — Energy Storage Systems |
| NFPA 70 Art. 706 | National Electrical Code — Energy Storage Systems |

## Study inputs

| Input | Unit | Notes |
|---|---|---|
| Total rated capacity | kWh | Sum of all BESS units at the site |
| Battery chemistry | — | LFP, NMC, NCA, lead-acid, NiCd |
| Cells per module | — | Used for UL 9540A propagation cascade |
| Modules per rack | — | Used for UL 9540A propagation cascade |
| Ambient temperature | °C | Higher T → faster propagation |
| Room volume | m³ | Net internal volume of ESS room |
| Vent opening pressure P_stat | kPa | Explosion-relief panel activation pressure; typically 3–10 kPa |
| Installed vent area | m² | Total explosion-relief panel area; 0 if none |
| Exposures (table) | m | Label, type (property line / occupied building / ignition source), actual distance |

## Calculations

### 1. Separation distances — NFPA 855 §15.3

NFPA 855-2023 Table 15.3.2 specifies minimum clearances by ESS rated energy:

| Exposure type | ≤ 50 kWh | > 50 kWh |
|---|---|---|
| Property line | 0.9 m (3 ft) | 1.5 m (5 ft) |
| Occupied building | 1.5 m (5 ft) | 3.0 m (10 ft) |
| Ignition / electrical source | 0.9 m (3 ft) | 0.9 m (3 ft) |

The check compares each entered exposure distance against the table value. A **warn** is issued when the margin above the minimum is less than 0.3 m.

### 2. Thermal runaway propagation — UL 9540A

A lumped thermal-mass model estimates propagation time through a rack:

- **Cell-to-cell**: Chemistry-dependent base time corrected for ambient temperature using an Arrhenius approximation (reaction rate doubles every 10°C above 25°C reference).
- **Cell-to-module**: Scales with cells per module (linear with 0.7 barrier-effectiveness factor).
- **Module-to-rack**: Scales with modules per rack (linear with 0.5 factor for rack enclosure heat concentration).

Chemistry propagation base times at 25°C ambient:

| Chemistry | Cell-to-cell base [min] | K_G [bar·m/s] |
|---|---|---|
| LFP (LiFePO₄) | 20 | 50 |
| NMC | 8 | 120 |
| NCA | 4 | 200 |
| NiCd | 15 | 400 |
| Lead-acid (VRLA) | 30 | 450 |

NFPA 855 §15.9 recommends automatic suppression when module-to-rack propagation time is less than 30 minutes.

### 3. Deflagration vent area — NFPA 68 §7.4.3

The Bartknecht correlation from NFPA 68-2018 §7.4.3.2 is applied:

```
A_v = (P_stat^(-0.5682) × K_G^0.5922 × V^0.6672 × P_max^0.1723) / 1640
```

where:
- `A_v` = required vent area [m²]
- `P_stat` = vent opening pressure [bar]
- `K_G` = deflagration index [bar·m/s] (chemistry-specific off-gas)
- `V` = enclosure volume [m³]
- `P_max` = maximum unvented explosion pressure [bar]

The constant 1640 reconciles SI units. The correlation is applicable when P_stat ≤ 0.1 bar (10 kPa) and K_G ≤ 550 bar·m/s; a warning is issued for inputs outside this range.

### 4. HMA summary

The overall HMA status is:
- **Pass**: all separation checks pass, installed vent ≥ required, module-to-rack ≥ 30 min
- **Warn**: all checks pass but one or more margins are tight (< 0.3 m separation margin, or propagation warnings)
- **Fail**: any separation check fails, installed vent < required, or module-to-rack < 30 min

## Chemistry parameters

| Chemistry | K_G [bar·m/s] | P_max [bar] | Notes |
|---|---|---|---|
| LFP | 50 | 4.0 | CO₂/CO dominant off-gas; most thermally stable |
| NMC | 120 | 5.5 | Mixed CO₂/CO/H₂ off-gas |
| NCA | 200 | 6.5 | More volatile organic off-gas |
| NiCd | 400 | 6.5 | H₂ off-gas during overcharge |
| Lead-acid | 450 | 6.9 | H₂ off-gas during charging |

K_G values are representative of typical off-gas compositions from UL 9540A cell-level testing at near-stoichiometric conditions.

## Implementation

| File | Purpose |
|---|---|
| `analysis/bessHazard.mjs` | Pure calculation module (no DOM) |
| `bessHazard.html` | Study page |
| `bessHazard.js` | Page entry point (DOM wiring) |
| `src/bessHazard.js` | Rollup bundle entry |
| `tests/bessHazard.test.mjs` | Unit tests |

## Exported functions

```javascript
separationDistance(exposureType, ratedKwh)
// → { minDistM, minDistFt }

checkSeparations(ratedKwh, exposures[])
// → Array<{ label, type, actualDistM, minDistM, margin, pass, status }>

propagationAmbientFactor(ambientC)
// → number  (Arrhenius correction; 1.0 at 25°C)

propagationTiming({ chemistry, cellsPerModule, modulesPerRack, ambientC })
// → { cellToCell_min, cellToModule_min, moduleToRack_min, warnings[] }

deflagrationVentArea({ volumeM3, pstatKpa, chemistry })
// → { ventAreaM2, ventAreaFt2, kG_barMs, pMax_bar, pStat_bar, warnings[] }

hmaSummary({ separationChecks, propagation, ventArea, providedVentAreaM2, ratedKwh, chemistry })
// → { status, separationOk, ventOk, propagationOk, issues[] }

runBessHazardStudy(inputs)
// → { valid, errors, separationChecks, propagation, ventArea, summary, ... }
```

## Disclaimer

This module implements published engineering correlations for screening purposes only. A final Hazard Mitigation Analysis per NFPA 855 §15.3 must be prepared by a licensed professional engineer and reviewed and approved by the Authority Having Jurisdiction (AHJ) before any BESS installation. The K_G values and propagation times are representative of typical test conditions; actual values depend on specific cell design and configuration.
