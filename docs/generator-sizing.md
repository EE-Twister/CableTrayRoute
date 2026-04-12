# Generator Sizing — NFPA 110 / NEC 700–702

**Page:** `generatorsizing.html`  
**Module:** `analysis/generatorSizing.mjs`  
**Standards:** NFPA 110-2022, NEC Articles 700/701/702, IEEE 446-1995, ISO 8528-1

---

## What generator sizing is and why it matters

Facilities with life-safety, legally required standby, or optional standby systems must include a generator (or other on-site power source) sized to serve all connected loads without overloading or stalling. Undersizing causes voltage collapse or generator shutdown when critical loads are energized; oversizing wastes capital and results in wet-stacking (unburned fuel fouling) at light load.

**Regulatory drivers:**

- **NEC Article 700** — Emergency systems (egress lighting, fire pumps, hospital essential loads) require automatic transfer in ≤ 10 seconds — an NFPA 110 **Type 10** generator.
- **NEC Article 701** — Legally required standby systems (HVAC, elevators, industrial processes) require automatic transfer in ≤ 60 seconds — **Type 60**.
- **NEC Article 702** — Optional standby systems (data centers, commercial operations) use **Type 120** or a customer-specified transfer time.
- **NFPA 110-2022** — Defines testing, maintenance, installation, and capacity requirements including a minimum runtime (§8.3.1) of 2 hours for Type 10 systems.

---

## NFPA 110 Type Classification

| Type | Max Transfer Time | NEC Article | Typical Applications |
|---|---|---|---|
| **Type 10** | 10 seconds | NEC 700 | Hospital essential, egress lighting, fire pumps, elevators in hospitals |
| **Type 60** | 60 seconds | NEC 701 | HVAC, elevators, industrial processes, heating equipment |
| **Type 120** | 120 seconds | NEC 702 | Data centers, commercial operations, optional comfort systems |

> The Authority Having Jurisdiction (AHJ) may impose stricter transfer times regardless of the NFPA 110 type classification.

---

## Step-by-step workflow

### Step 1 — List all connected loads

Compile every load that will be served by the generator:

- **From the Load Flow study:** Open `loadFlow.html` and read bus P (kW) for each load bus. This gives running demand at the operating point.
- **From the Load List / Panel Schedule:** Use `loadlist.html` or `panelschedule.html` to export load totals per panel.
- **From equipment nameplates:** Multiply nameplate kVA × operating power factor to obtain running kW.

Apply a **demand factor** (0–1) to loads that are unlikely to operate simultaneously at full rating. For example, a 200 kW HVAC system running at 80% demand contributes 160 kW to the generator requirement.

### Step 2 — Apply site altitude derating (NFPA 110 Annex B)

Generator output decreases with altitude because thinner air reduces combustion efficiency:

```
altitudeFactor = 1 − derating_rate × max(0, (altitude_ft − 500) / 1000)
```

| Engine type | Derating rate | Example: 5,000 ft |
|---|---|---|
| Naturally-aspirated | 3% per 1,000 ft above 500 ft | 1 − 0.03 × 4.5 = **0.865** (13.5% derating) |
| Turbocharged | 1% per 1,000 ft above 500 ft | 1 − 0.01 × 4.5 = **0.955** (4.5% derating) |

No derating applies below 500 ft MSL. Most generators above 150 kW are turbocharged.

### Step 3 — Apply ambient temperature derating (ISO 8528-1)

Generators are rated at a standard ambient of **40 °C**. Each degree above 40 °C reduces output by approximately 1%:

```
tempFactor = 1 − 0.01 × max(0, ambientC − 40)
```

For a site with a design summer temperature of 50 °C: `tempFactor = 0.90` (10% derating).

**Combined derating:** Apply altitude derating first, then apply temperature derating to the altitude-derated value:

```
siteDeratedKw = continuousKw × altitudeFactor × tempFactor
```

The generator must be sized so that its **site-derated output** meets or exceeds this value.

### Step 4 — Check the largest motor step load

Starting a large motor across-the-line creates a momentary high-current demand (locked-rotor current, LRC) that can cause a transient voltage dip. Per **IEEE 446-1995 §5.3**:

```
startingKVA = (HP × 0.746) / (PF × efficiency) × LRC_multiplier
```

Typical LRC multipliers:

| Starting method | LRC multiplier |
|---|---|
| Across-the-line (NEMA Design B) | 5–7× |
| Star-delta (wye-delta) reduced voltage | 2–3× |
| Solid-state soft starter | 2–4× |
| Variable frequency drive (VFD) | 1–1.5× |

The resulting transient voltage dip (IEEE 446 §5.4):

```
dip% = (startingKVA / genKVA) × X'd%
```

where `genKVA = selectedKw / 0.80` (assuming 0.80 pf nameplate rating) and `X'd` is the generator's subtransient reactance (typically 20–30%).

NFPA 110 Type 10 systems must keep voltage dip **≤ 35%** during the largest motor start. If the dip exceeds this limit, either:
- Select a larger generator (lowers `startingKVA / genKVA`)
- Install a soft-starter or VFD on the motor (reduces `LRC_multiplier`)
- Specify a generator with a lower X'd (higher short-circuit capacity)

### Step 5 — Select a standard generator size

The tool selects the smallest standard nameplate kW that is ≥ the site-derated required kW:

```
requiredKw = max(siteDeratedContinuousKw, motorStepLoadRecommendedKw)
selectedKw = smallest standard size ≥ requiredKw
```

Standard generator nameplate sizes (kW): 15, 20, 25, 30, 40, 50, 60, 75, 100, 125, 150, 175, 200, 250, 300, 350, 400, 500, 600, 750, 1000, 1250, 1500, 1750, 2000.

### Step 6 — Calculate fuel runtime

```
fuelRate (gal/hr) = loadKw × 1.341 [hp/kW] × SFC [lb/hp-hr] / 6.791 [lb/gal]
runtime (hr)      = tankCapacity_gal / fuelRate
```

Default SFC = **0.38 lb/hp-hr** (diesel, approximately 75% load, modern Tier 4 engine).

**NFPA 110 minimum runtime requirements:**
- Type 10 systems: minimum **2 hours** of fuel on-site (§8.3.1)
- Many AHJs require 4–8 hours; hospitals and data centers typically specify 24–72 hours

---

## Example calculation

**Site:** 5,000 ft altitude, 45 °C ambient, naturally-aspirated diesel, Type 10 system

| Step | Value |
|---|---|
| Continuous loads | Emergency lighting: 50 kW × 1.0 = 50 kW<br>HVAC critical: 150 kW × 0.80 = 120 kW<br>Fire pump: 75 kW × 1.0 = 75 kW<br>**Total: 245 kW** |
| Altitude derating | factor = 1 − 0.03 × 4.5 = **0.865** → 245 × 0.865 = 212.0 kW |
| Temperature derating | factor = 1 − 0.01 × 5 = **0.95** → 212.0 × 0.95 = 201.4 kW |
| Largest motor step load | 100 HP, LRC ×6, PF 0.85, eff 0.92: startingKVA ≈ 572 kVA → recommend 458 kW |
| Required kW | max(201.4, 458) = **458 kW** |
| Selected standard size | **500 kW** |
| Fuel runtime (500 gal, SFC 0.38) | fuelRate ≈ 30 gal/hr → runtime ≈ **16.7 hours** |

---

## Integration with other studies

| Study | How it feeds Generator Sizing |
|---|---|
| **Load Flow** | Provides bus-level kW demand for each load group; most accurate source of continuous load data |
| **Motor Start** | Provides detailed motor starting analysis — use the `motorStart.html` LRC multiplier for the largest motor |
| **Battery / UPS Sizing** | UPS charger load should be included in the generator load schedule; generator + battery = ride-through plus extended runtime |
| **Short Circuit** | Provides system impedance data; the generator short-circuit contribution depends on X'd |

---

## Module reference

### `analysis/generatorSizing.mjs` exports

| Export | Purpose |
|---|---|
| `STANDARD_GEN_SIZES_KW` | Array of standard generator nameplate kW ratings |
| `NFPA110_TYPES` | Object of NFPA 110 type classifications with response times |
| `DIESEL_SFC_LB_PER_HP_HR` | Default SFC constant (0.38 lb/hp-hr) |
| `derateForAltitude(ratedKw, altitudeFt, aspiration)` | Altitude derating per NFPA 110 Annex B |
| `derateForTemperature(ratedKw, ambientC)` | Temperature derating per ISO 8528-1 |
| `largestMotorStepLoad({ motorHp, powerFactor, efficiency, lrcMultiplier })` | Motor starting kVA demand (IEEE 446 §5.3) |
| `estimateVoltageDip({ stepLoadKva, genKva, xdPrimePct })` | Transient voltage dip check (IEEE 446 §5.4) |
| `continuousLoad(loads)` | Sum all loads with demand factors |
| `fuelRuntime({ loadKw, fuelCapGal, sfcLbPerHpHr })` | Fuel consumption rate and runtime |
| `selectStandardSize(requiredKw)` | Select nearest standard kW rating |
| `runGeneratorSizingAnalysis(inputs)` | Run complete analysis and return unified result object |

Results are saved to `studies.generatorSizing` in project storage and reload automatically on page revisit.
