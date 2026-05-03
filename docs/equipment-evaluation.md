# Equipment Evaluation

**Page:** `equipmentevaluation.html`  
**Module:** `analysis/equipmentEvaluation.mjs`  
**Navigation:** Studies → Protection → Equipment Evaluation

## Overview

The Equipment Evaluation study checks every equipment item on the one-line diagram against the available fault current from the Short Circuit and Arc Flash studies. It produces a pass/fail/incomplete compliance table — the standard "equipment duty evaluation" deliverable required by most electrical engineering clients.

## Checks Performed

### 1. AIC — Interrupting Rating (NEC 110.9)

Compares the device interrupting rating (AIC, in kA) against the 3-phase bolted fault current at that bus.

- **Pass:** `fault kA ≤ interruptRating kA`
- **Fail:** Device is undersized — replace with a higher-rated device.
- **Incomplete:** No interrupt rating entered, or Short Circuit study not run.

Applies to: Breakers, fuses, relays, disconnects, reclosers, panels (via `main_interrupting_ka`), switchboards (via `interrupting_ka`), busways (via `short_circuit_rating_ka`).

### 2. Withstand — Short-Time Withstand (I²t Rule)

Checks the short-time withstand current rating against fault current at the actual clearing time, using the constant-energy (I²t) rule:

```
I_adjusted = ratingKA × √(ratingSeconds / clearingSeconds)
```

- **Pass:** `fault kA ≤ I_adjusted`
- **Fail:** Device or bus cannot withstand the fault for the clearing time — reduce clearing time or upgrade rating.
- **Incomplete:** No withstand rating entered, or no clearing time available.

Applies to: Breakers (via `withstandRatingKA`, `withstandCycles`), switchboards (via `withstand_1s_ka` at 60 cycles).

### 3. Cable I²t Thermal Duty (NEC 110.10 / IEC 60364-5-54)

Checks that the conductor cross-section is sufficient for the available fault current and clearing time:

```
A_min = (I_fault_A × √t) / k   [mm²]
```

| Material / Insulation | k factor |
|-----------------------|----------|
| Copper PVC            | 115      |
| Copper XLPE           | 135      |
| Copper EPR            | 143      |
| Aluminium PVC         | 76       |
| Aluminium XLPE        | 87       |

- **Pass:** `A_actual ≥ A_min`
- **Fail:** Upsize conductor or reduce clearing time.
- **Incomplete:** Conductor size not specified, or no short-circuit data for cable.

Applies to: Cable segments on the one-line (`type: 'cable'`) and cable schedule entries (`getCables()`).

### 4. SCCR — Short-Circuit Current Rating (NEC 409.22)

Compares the assembly SCCR against available fault current. Applies to MCC (`type: 'mcc'`) components with `sccr_ka` prop.

## Prerequisites

1. **One-Line Diagram:** Add breakers, fuses, switchboards, and cable segments with the relevant rating properties filled in (see below).
2. **Short Circuit Study:** Run to generate `threePhaseKA` results.
3. **Arc Flash Study** *(optional but recommended):* Provides clearing times per component.

## Entering Rating Data

Open the One-Line editor, select a component, and fill the following properties:

| Component | Property | Description |
|-----------|----------|-------------|
| Breaker/Fuse | `interruptRatingKA` | AIC interrupting rating (kA) |
| Breaker/Fuse | `withstandRatingKA` | Short-time withstand (kA) |
| Breaker/Fuse | `withstandCycles`   | Withstand duration (cycles; default 30) |
| Switchboard  | `interrupting_ka`   | Interrupting rating (kA) |
| Switchboard  | `withstand_1s_ka`   | 1-second withstand (kA) |
| Panel        | `main_interrupting_ka` | Main device AIC (kA) |
| MCC          | `sccr_ka`           | Short-Circuit Current Rating (kA) |
| Cable seg.   | `size_awg_kcmil`    | Conductor size (e.g., `500 kcmil`, `#4 AWG`) |
| Cable seg.   | `material`          | `copper` or `aluminium` |
| Cable seg.   | `insulation_type`   | `xlpe`, `pvc`, or `epr` |

Devices linked via the `device` property to a `protectiveDevices.json` entry will inherit that entry's `interruptRating`, `withstandRatingKA`, and `withstandCycles` values.

## Exports

- **CSV:** One row per check per device; click **Export CSV** on the page.
- **Design Coach:** Failing equipment items are surfaced as Compliance recommendations in the Cross-Study Design Coach.
- **Dashboard:** The Workflow Dashboard shows an **Equipment Failures** KPI tile.

## Calculation Basis

| Check | Standard |
|-------|----------|
| AIC | NEC 110.9 — Equipment Interrupting Rating |
| Withstand | ANSI C37.13, IEC 62271-100 — Short-time withstand |
| Cable I²t | NEC 110.10, IEC 60364-5-54 §543 |
| SCCR | NEC 409.22, UL 508A |

## Limitations

- Fault current used is the bolted 3-phase symmetrical value from the Short Circuit study. Asymmetrical (peak) current checks are not performed.
- Clearing times come from the Arc Flash study; if no arc flash data is available, withstand and cable thermal checks are marked Incomplete.
- Cable schedule entries (`getCables()`) use the worst-case fault current from the source bus; conservative but may show Incomplete if no bus mapping exists.
