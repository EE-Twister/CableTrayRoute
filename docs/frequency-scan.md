# Harmonic Frequency Scan — Inputs, Equations, and Limits

**Page:** `frequencyscan.html`  
**Module:** `frequencyscan.js` → `analysis/frequencyScan.mjs`

This guide documents the engineering basis used by the Harmonic Frequency Scan study.

## Purpose

A frequency scan sweeps the Thevenin driving-point impedance Z(h) from the 1st to the 50th harmonic order. Peaks in the impedance magnitude indicate **parallel resonance** (voltage amplification risk); troughs indicate **series resonance** (current amplification risk).

Results are used to:
- Verify that capacitor bank resonance does not coincide with dominant harmonic orders (5th, 7th, 11th, 13th)
- Select detuned reactor percentage to shift resonance safely below the 5th harmonic
- Provide input impedance data for harmonic current injection and THD calculations

## Inputs

| Input | Symbol | Units | Notes |
|-------|--------|-------|-------|
| Base frequency | f₀ | Hz | 50 or 60 Hz |
| System voltage | V_sys | kV L-L | Nominal voltage at the scanned bus |
| Short-circuit MVA | S_sc | MVA | Thevenin SC capacity looking back from the bus |
| Source X/R ratio | XR | — | Fundamental source reactance-to-resistance ratio |
| Capacitor bank size | Q_cap | kVAR | Shunt capacitor(s) at the bus |
| Filter reactor | % | % | Detuned reactor as % of capacitor reactance |
| Filter kVAR | Q_filt | kVAR | Filter capacitor bank rating |
| Cable R | R | Ω/kft | Series cable resistance |
| Cable X | X | Ω/kft | Series cable reactance at fundamental |
| Cable length | l | kft | Circuit length |
| Harmonic range | h_min, h_max | — | Integer bounds (default 1–50) |

## Network Model

Single-bus Thevenin model:

```
Z_dp(h) = Z_source(h) ‖ ΣZ_cap_i(h) ‖ ΣZ_filter_j(h)
```

Where `Z_source` includes all series cable impedances:

```
Z_source_eff(h) = Z_source(h) + ΣZ_cable_k(h)
```

## Equations

### 1) Source base impedance

```
Z_base = V_sys² / S_sc     [ohms]
R_s    = Z_base / √(1 + XR²)
X_s1   = XR × R_s           [fundamental reactance]
```

At harmonic h:
```
Z_source(h) = R_s + j × h × X_s1
```

### 2) Capacitor bank impedance

```
X_c1 = V_sys² × 1000 / Q_cap_kVAR   [ohms at fundamental]
Z_cap(h) = −j × X_c1 / h
```

### 3) Detuned filter impedance (series L-C)

```
X_C  = V_sys² × 1000 / Q_filt_kVAR
X_L1 = (reactorPct / 100) × X_C        [reactor at fundamental]
h_tune = √(100 / reactorPct)           [series resonance order]

Z_filter(h) = j × (h × X_L1 − X_C / h)
```

Z_filter is capacitive below h_tune and inductive above h_tune. The series resonance at h_tune is a trough (low impedance path for that harmonic current).

### 4) Cable impedance

```
Z_cable(h) = R_cable + j × h × X_cable1
```

R is assumed frequency-independent at power-frequency harmonics.

### 5) Driving-point impedance (parallel combination)

Admittances are summed and inverted:

```
Y_total = 1/Z_source_eff + Σ(1/Z_cap_i) + Σ(1/Z_filter_j)
Z_dp = 1 / Y_total
```

### 6) Simplified parallel resonance formula (single cap bank)

For a single cap bank and no cables, the parallel resonance order is approximately:

```
h_r ≈ √(S_sc_kVA / Q_cap_kVAR)
```

This is the formula used in `analysis/capacitorBank.mjs` `resonanceOrder()`. The frequency scan computes this rigorously across all harmonic orders.

## Resonance Risk Classification

| Risk | Criterion |
|------|-----------|
| **DANGER** | Parallel resonance within ±0.5 of a dominant harmonic order |
| **CAUTION** | Within ±1.0 of a dominant harmonic order |
| **LOW** | More than 1.0 harmonic orders from any dominant harmonic |

**Dominant harmonics:** 5, 7, 11, 13, 17, 19, 23, 25 (IEEE 519-2022, characteristic harmonics of 6-pulse and 12-pulse non-linear loads).

## Typical Detuning Reactor Percentages

| Reactor % | h_tune | Protects against |
|-----------|--------|-----------------|
| 5.67% | ≈ 4.20 | 5th harmonic |
| 7% | ≈ 3.78 | 5th harmonic (wider margin) |
| 14% | ≈ 2.68 | 3rd harmonic |

## Assumptions and Limits

- Single-bus model. Multi-bus systems with distributed harmonic sources require a full Y-bus frequency sweep.
- Resistance is treated as frequency-independent. Skin effect increases conductor resistance at higher harmonics; this is conserved for preliminary screening.
- Loads are treated as open circuits. Actual load admittance damps resonance peaks; real systems have lower peak impedances than the model predicts.
- Transformer magnetizing branch is not modelled.
- Intended for screening-level filter design and resonance identification, not detailed harmonic power flow.

## Standards References

- **IEEE 519-2022** — Harmonic Control in Electric Power Systems
- **IEEE 18-2012** — IEEE Standard for Shunt Power Capacitors
- **IEC 61000-3-6** — Assessment of emission limits for distorting loads in MV and HV power systems
