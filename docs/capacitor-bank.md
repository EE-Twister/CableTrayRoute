# Capacitor Bank Sizing & Power Factor Correction

**Page:** `capacitorbank.html`  
**Module:** `analysis/capacitorBank.mjs`  
**Standards:** IEEE 18-2012, IEEE 519-2022, NEMA CP 1-2000

---

## What is power factor correction and why does it matter?

Power factor (PF) is the ratio of real power (kW) to apparent power (kVA). A low lagging power factor means the electrical system is drawing more current than necessary to deliver the same useful work — the excess current flows back and forth as reactive power (kVAR), consuming conductor and transformer capacity without doing useful work.

**Practical consequences of low PF:**
- Utility power factor penalty charges (most tariffs penalise PF below 0.90 or 0.95)
- Higher currents → increased I²R losses in conductors and transformers
- Reduced available kVA capacity from transformers and switchgear
- Voltage sag under heavy load

A shunt capacitor bank injects leading reactive power to offset the lagging reactive demand of motors, transformers, and other inductive loads, correcting the power factor to the target value at the point of common coupling.

---

## Step-by-step workflow

### Step 1 — Determine real power and existing power factor

- **From Load Flow study:** Open `loadFlow.html`, run the study, and read the bus P (kW) and Q (kVAR) values. The existing PF = cos(atan(Q/P)).
- **From utility billing:** Use the monthly kWh demand ÷ operating hours to estimate kW, and read the billed "demand power factor" directly.
- **From a power quality analyser:** Most power quality meters report true power factor directly.

### Step 2 — Enter target power factor

Most utility tariffs in North America levy a penalty below **0.90** lagging; many set the threshold at **0.95**. A target of **0.95** is the most common engineering choice — it avoids the penalty, provides a margin against overcorrection to leading PF at light load, and does not require an excessively large bank.

> **Caution:** Correcting to unity (PF = 1.0) or above (leading PF) can cause voltage rise at light load, especially on long distribution feeders. Avoid targeting PF > 0.98 without checking the voltage impact in the Load Flow study.

### Step 3 — Size the capacitor bank

The required reactive compensation is:

```
Q_cap = P × (tan(cos⁻¹(pf_existing)) − tan(cos⁻¹(pf_target)))
```

For example, a 1000 kW load at PF 0.80 corrected to PF 0.95:
```
Q_cap = 1000 × (tan(cos⁻¹(0.80)) − tan(cos⁻¹(0.95)))
      = 1000 × (0.750 − 0.329)
      = 421 kVAR
```

The tool then selects the nearest standard NEMA bank size ≥ the required kVAR. Standard sizes (kVAR): 25, 50, 100, 150, 200, 300, 400, 600, 900, 1200, 1800, 2400.

**2-stage option:** For facilities with a variable load profile, a 2-stage switched bank (two equal halves) avoids leading PF at light load. Each stage is switched in and out by a power factor controller relay.

### Step 4 — Check for harmonic resonance

A capacitor bank installed on a bus with non-linear loads (VFDs, rectifiers, UPS, arc furnaces) can interact with the system inductance to create a **parallel resonance** at a harmonic order:

```
h_r = √(kVA_sc / kVAR_cap)
```

where `kVA_sc` is the short-circuit kVA at the bus (from the Short Circuit study) and `kVAR_cap` is the installed capacitor bank rating.

At parallel resonance, the system presents a high impedance at harmonic frequency `h_r`. If a harmonic source injects current at that frequency, the resulting harmonic voltage amplification can:
- Damage capacitors (IEEE 18-2012 §5.4 limits voltage THD to 120% of rated)
- Trip harmonic-sensitive equipment
- Cause IEEE 519-2022 violations

**Risk levels:**

| h_r distance from dominant harmonic | Risk level | Action |
|---|---|---|
| > 1.0 harmonic orders away | Safe | None required |
| 0.5–1.0 harmonic orders away | Caution | Measure harmonic levels before energizing |
| < 0.5 harmonic orders away | Danger | Install detuned reactor before energizing |

**Dominant harmonics** produced by common non-linear loads:
- **5th and 7th** — six-pulse VFDs, diode rectifiers (most common in industrial plants)
- **11th and 13th** — twelve-pulse drives, twelve-pulse UPS
- **3rd** — single-phase switched-mode power supplies, fluorescent lighting

### Step 5 — Specify a detuned reactor (if required)

A **detuned reactor** is a series inductor placed in the capacitor branch. The LC series circuit resonates at a tuning order `h_tune = 1/√p`, where `p` is the detuning factor (expressed as a fraction of 1). By setting `h_tune` below the nearest dominant harmonic, the parallel resonance of the capacitor bank with the system is shifted to a non-integer order where no significant harmonic source is present.

**Standard detuning factors:**

| Detuning factor p | Tuning order h_tune | Protects against |
|---|---|---|
| 5.67% | 4.30 | 5th harmonic resonance |
| 7% | 3.78 | 5th harmonic (wider margin) |
| 14% | 2.68 | 3rd harmonic resonance |

The detuned reactor increases the reactive power consumed by the capacitor branch (the net kVAR output is reduced by roughly the detuning percentage), so the bank must be sized slightly larger when a reactor is specified. Consult the manufacturer's datasheet for the exact correction factor.

---

## Integration with other studies

| Study | How it feeds Capacitor Bank sizing |
|---|---|
| **Load Flow** | Provides bus P (kW) and Q (kVAR) for the load being corrected; Q/P gives the existing PF |
| **Short Circuit** | Provides SC MVA at the bus — required for the resonance harmonic order calculation |
| **Harmonics** | Identifies which harmonic orders are dominant at the bus — determines which detuning factor to specify |

---

## Module reference

### `analysis/capacitorBank.mjs` exports

| Function | Purpose |
|---|---|
| `requiredKvar({ pKw, pfExisting, pfTarget })` | Compute required capacitor kVAR |
| `resonanceOrder({ kvaScMva, kvarCap })` | Compute parallel resonance order and risk level |
| `detuningRecommendation(harmonicOrder, riskLevel)` | Recommend detuning factor |
| `standardBankSizes(kvarRequired)` | Select nearest standard NEMA kVAR rating |
| `runCapacitorBankAnalysis(inputs)` | Run complete analysis and return unified result object |
| `STANDARD_KVAR_SIZES` | Array of standard capacitor bank kVAR ratings |

Results are saved to `studies.capacitorBank` in project storage and reload automatically on page revisit.
