# Differential Protection Zone Modeling (87B / 87T / 87G)

**Module:** `analysis/differentialProtection.mjs`  
**UI page:** `differentialprotection.html`  
**Tests:** `tests/tcc/differentialProtection.test.mjs`

---

## Overview

Percentage-differential protection (ANSI Device 87) is the primary unit protection scheme
for buses, transformers, and generators. It compares currents entering and leaving the
protected zone: under normal conditions or external faults, these currents balance and the
differential (operating) current is near zero. An internal fault creates a significant
imbalance that exceeds the relay's operating characteristic.

Three relay types are modeled:

| Type | Protected Equipment | Standard |
|------|---------------------|----------|
| **87B** | Buses (high-impedance or low-impedance) | IEEE C37.97-2012 |
| **87T** | Power transformers | IEEE C37.91-2008 |
| **87G** | Generator stator windings | IEEE C37.101-2006 |

---

## Theory

### Percentage-Differential Characteristic

Currents are expressed in **per-unit of rated current**:

- **Operating current:** `I_diff = |I₁ − I₂|`
- **Restraint current:** `I_rest = (|I₁| + |I₂|) / 2`

The relay operates (trips) when `I_diff ≥ threshold(I_rest)`. The threshold is defined by a
dual-slope characteristic:

```
Flat region    (I_rest ≤ I_min):       threshold = I_min
Slope 1 region (I_min < I_rest ≤ I_bp): threshold = max(S1 × I_rest, I_min)
Slope 2 region (I_rest > I_bp):         threshold = threshold(I_bp) + S2 × (I_rest − I_bp)
```

Where:
- `I_min` — minimum differential pickup (default 0.20 pu); prevents tripping on CT error at no load
- `S1` — Slope 1 (default 25%); applies to normal and moderately overloaded conditions
- `S2` — Slope 2 (default 50%); applies at high through-fault currents where CT saturation is likely
- `I_bp` — Breakpoint (default 3.0 pu); transition between the two slopes

**Typical settings:**

| Relay | Slope 1 | Slope 2 | I_min |
|-------|---------|---------|-------|
| 87B   | 20–30%  | 40–60%  | 0.15–0.25 pu |
| 87T   | 20–30%  | 40–60%  | 0.15–0.25 pu |
| 87G   | 5–15%   | 20–30%  | 0.05–0.15 pu |

Generator relays use lower slopes because generator CTs are closely matched and fast clearing
is essential to limit stator winding damage.

---

## CT Ratio Mismatch

For a two-winding transformer zone, the secondary CT currents on each side must be equalized at the relay. The **tap factor** is:

```
tap = (N_transformer × CT_secondary) / CT_primary
```

where `N_transformer = V_primary / V_secondary` is the transformer voltage turns ratio.

A `tap = 1.0` means the relay inputs are perfectly balanced. IEEE C37.91 §5.3 considers
mismatches ≤ 10% acceptable without additional compensation. For 87B and 87G zones, use
`xfmrTurnsRatio = 1`.

---

## Harmonic Restraint (87T only)

Two conditions can produce a differential current in a healthy transformer:

1. **Magnetizing inrush** (transformer energization): the inrush current contains a high
   2nd harmonic component (typically 15–60% of fundamental). The relay blocks operation if:
   ```
   I_2nd / I_diff ≥ threshold₂ₙd (default 20%)
   ```

2. **Overexcitation** (transformer overfluxing, e.g. during load rejection): the current
   contains a high 5th harmonic. The relay restrains if:
   ```
   I_5th / I_diff ≥ threshold₅ₜₕ (default 35%)
   ```

Harmonic restraint has priority over the operate decision. If either condition is active, the
relay returns **BLOCKED** regardless of `I_diff`. 87B and 87G relays do not use harmonic restraint.

---

## Decision Logic

```
if (diffType === '87T') {
  if (I_2nd / I_diff ≥ threshold₂ₙd OR I_5th / I_diff ≥ threshold₅ₜₕ)
    decision = BLOCKED
}
if (I_diff ≥ characteristic_threshold(I_rest))
  decision = OPERATE
else
  decision = RESTRAIN
```

---

## API Reference

### `percentDifferentialCharacteristic(restraintMultiple, settings?)`

Returns `{ threshold, slope, region }`.

| Setting | Default | Description |
|---------|---------|-------------|
| `slope1Pct` | 25 | Slope 1 (%) |
| `slope2Pct` | 50 | Slope 2 (%) |
| `minPickupMultiple` | 0.2 | Minimum differential pickup (pu) |
| `breakpointMultiple` | 3.0 | Restraint current at slope transition (pu) |

### `ctRatioMismatch(primaryCTRatio, secondaryCTRatio, xfmrTurnsRatio?)`

Returns `{ tapFactor, mismatchPct, correction, withinLimit }`.

### `harmonicRestraintCheck(iDiffPu, i2ndPu, i5thPu, settings?)`

Returns `{ blocked, reason, inrushBlocked, overexcitationBlocked, ratio2ndPct, ratio5thPct }`.

| Setting | Default | Description |
|---------|---------|-------------|
| `restraint2ndPct` | 20 | 2nd harmonic block threshold (%) |
| `restraint5thPct` | 35 | 5th harmonic restraint threshold (%) |

### `protectionZoneCheck(diffType, iDiffPu, iRestraintPu, settings?, harmonics?)`

Returns `{ decision, reason, thresholdPu, margin, characteristic, harmonicCheck }`.

### `buildCharacteristicCurve(settings?, maxRestraint?)`

Returns an array of `{ restraint, threshold }` sample points for plotting.

### `runDifferentialProtectionStudy(inputs)`

Unified entry point. Returns a serialisable result object suitable for
`studies.differentialProtection` in `dataStore.mjs`:

```json
{
  "diffType": "87T",
  "zoneLabel": "TR-1 HV Differential",
  "settings": { ... },
  "iDiffPu": 0.40,
  "iRestraintPu": 1.00,
  "zoneCheck": {
    "decision": "OPERATE",
    "reason": "I_diff (0.400 pu) >= threshold (0.250 pu) — relay operates (trip)",
    "thresholdPu": 0.25,
    "margin": 0.15,
    "characteristic": { "threshold": 0.25, "slope": 1, "region": "slope1" },
    "harmonicCheck": { "blocked": false, ... }
  },
  "ctMismatch": { "tapFactor": 1.0, "mismatchPct": 0.0, ... },
  "characteristicCurve": [ ... ],
  "timestamp": "2026-04-18T..."
}
```

---

## TCC Integration

Differential relay devices appear in a dedicated **"Differential Relays (87B/T/G)"** group in
the TCC device library. On the TCC chart, differential curves are rendered in **orange** with
a dashed stroke (`5,3`) to distinguish them from phase protection (blue) and ground fault relays
(purple). Enable them with the **"Differential Protection (87B/T/G)"** view toggle.

---

## References

- IEEE C37.91-2008 — IEEE Guide for Protecting Power Transformers
- IEEE C37.97-2012 — IEEE Guide for Protective Relay Applications to Power System Buses
- IEEE C37.101-2006 — IEEE Guide for Generator Ground Protection
- NERC PRC-001-2 — Protection System Coordination
- Blackburn & Domin — *Protective Relaying: Principles and Applications*, 4th ed.
