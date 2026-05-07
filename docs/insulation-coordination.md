# Insulation Coordination

**Standard:** IEC 60071-1:2006+AMD1:2010 / IEC 60071-2:1996+AMD1:2012 / IEEE 1313.2-1999

**Module:** `analysis/insulationCoordination.mjs`  
**Study page:** `insulationcoordination.html`  
**Tests:** `tests/insulationCoordination.test.mjs`

---

## Purpose

Selects the lowest standard Basic Insulation Level (BIL) and Short-time withstand level (SIL) from
IEC 60071-1 Tables 2 and 3 that satisfies the required coordination withstand voltage at the
equipment terminals, accounting for altitude, safety factor, and surge arrester protective margins.

---

## Procedure (IEC 60071-2 §2)

### 1. Identify Um

The highest voltage for equipment (Um, kV rms) is the upper limit of the highest voltage in the
network for which the equipment is designed. Select from IEC 60071-1 Table 2 (Range I: Um ≤ 245 kV)
or Table 3 (Range II: Um > 245 kV).

### 2. Compute representative overvoltage

For lightning impulse, the representative overvoltage at the equipment is the surge arrester
lightning impulse residual voltage (protective level) at the maximum discharge current:

- Station class (IEC 60099-4): rated at 10 kA discharge current
- Intermediate class: rated at 5 kA
- Distribution class: rated at 1.5 kA

### 3. Atmospheric correction factor Ka (IEC 60071-2 §3.3)

```
Ka = e^(m × H / 8150)
```

| Insulation type | m |
|---|---|
| Lightning impulse, self-restoring (air gaps, arresters) | 1.0 |
| Power frequency, non-self-restoring (transformers, GIS) | 0.75 |

At sea level Ka = 1.0. At 1000 m Ka ≈ 1.13 (LI); at 2000 m Ka ≈ 1.28 (LI).

### 4. Coordination withstand voltage (IEC 60071-2 §3.22)

```
Ucw = Urp × Ks × Ka
```

| Approach | Safety factor Ks |
|---|---|
| Deterministic | 1.15 |
| Statistical | 1.05 |

### 5. Standard BIL selection

Lowest standard LIWV from IEC 60071-1 Table 2 (Range I) or Table 3 (Range II) such that:

```
BIL ≥ Ucw_LI
PFWV ≥ Ucw_TOV / √2  (Range I only)
```

### 6. Surge arrester protective margin (IEEE 1313.2 §6)

```
Mp (%) = (Ucw / Ures − 1) × 100
```

Required minimum margins:

| Stress class | Min Mp |
|---|---|
| Lightning impulse | 20% |
| Switching impulse | 15% |

### 7. Minimum MCOV (IEC 60099-5 §5.1)

| Earthing type | Minimum MCOV |
|---|---|
| Solidly / low-resistance earthed | Um / √3 |
| High-resistance earthed / isolated | Um |

---

## Statistical Risk of Failure (IEC 60071-2 Annex A)

A simplified Gaussian convolution approximates the risk of failure per overvoltage event:

```
R ≈ Φ((μs − U50) / √(σs² + σw²))
```

Where:
- μs = mean of overvoltage distribution (kV peak)
- σs = μs × CoV_stress
- U50 = 50% disruptive-discharge voltage ≈ BIL / (1 − 1.28 × CoV_withstand)
- σw = U50 × CoV_withstand
- Φ = standard normal CDF

Typical CoV values (IEC 60071-2 Annex A):
- Lightning, self-restoring: CoV_withstand ≈ 0.03
- Switching, self-restoring: CoV_withstand ≈ 0.06

**Acceptance target:** R ≤ 10⁻⁴ per event (transmission); R ≤ 10⁻³ (distribution)

---

## Temporary Overvoltage (TOV)

TOV magnitude at the equipment per IEC 60071-2 Table 1:

| Earthing type | TOV factor | U_TOV rms |
|---|---|---|
| Solidly earthed | 1.0 × | Um / √3 |
| Low-resistance earthed | 1.3 × | 1.3 Um / √3 |
| High-resistance / isolated | 1.73 × | Um (≈ phase-to-phase) |

---

## Standard Insulation Levels — IEC 60071-1 (Selected Range I values)

| Um (kV) | Standard BIL (kV peak) | PFWV (kV rms) |
|---|---|---|
| 12 | 60 / 75 / 95 | 28 |
| 24 | 95 / 125 / 145 | 50 |
| 36 | 145 / 170 | 70 |
| 72.5 | 325 | 140 |
| 123 | 450 / 550 | 230 |
| 145 | 550 / 650 | 275 |
| 245 | 850 / 950 / 1050 | 395 / 460 |

---

## API

```js
import {
  getStandardLevels,
  atmosphericCorrectionFactor,
  coordinationWithstandVoltage,
  protectiveMargin,
  surgeArresterMcov,
  statisticalRiskOfFailure,
  runInsulationCoordinationStudy,
} from './analysis/insulationCoordination.mjs';

const result = runInsulationCoordinationStudy({
  nominalVoltageKv: 138,
  umKv: 145,
  altitudeM: 0,
  groundingType: 'solidly_grounded',
  approach: 'deterministic',
  lightningImpulse: {
    representativeKvPeak: 416,  // arrester Ures at 10 kA
    arresterResidualKvPeak: 340,
  },
  surgeArresterMcovKv: 84,
});

// result.liResult.selectedBilKv   → 550 (kV)
// result.liResult.protectiveMargin.marginPct → ~40.7 %
// result.liResult.protectiveMargin.pass → true
// result.allPassed → true
```

---

## References

- IEC 60071-1:2006+AMD1:2010 — Insulation coordination — Part 1: Definitions, principles and rules
- IEC 60071-2:1996+AMD1:2012 — Insulation coordination — Part 2: Application guide
- IEEE 1313.2-1999 — Guide for the application of insulation coordination
- IEC 60099-4:2014 — Metal-oxide surge arresters without gaps for AC systems
- IEC 60099-5:2013 — Surge arresters — Part 5: Selection and application recommendations
