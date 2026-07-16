# Generator Sizing — NFPA 110 / NEC 700–702

**Page:** `generatorsizing.html`  
**Module:** `analysis/generatorSizing.mjs`  
**Standards:** NFPA 110-2022, NEC Articles 700/701/702, IEEE 446-1995, ISO 8528-1

> **Screening limitation:** This workflow uses generic environmental factors,
> a reduced motor-step model, and an estimated fuel-consumption rate. Final
> selection requires manufacturer generator/alternator performance data and the
> project-specific NFPA 110 Class, Type, load-acceptance, and ride-through basis.

---

## What generator sizing is and why it matters

Facilities with life-safety, legally required standby, or optional standby systems must include a generator (or other on-site power source) sized to serve all connected loads without overloading or stalling. Undersizing causes voltage collapse or generator shutdown when critical loads are energized; oversizing wastes capital and results in wet-stacking (unburned fuel fouling) at light load.

NFPA 110 separates **Type** (restoration time), **Class** (minimum operating
time), and **Level** (consequence of failure). The application code, owner, and
AHJ establish the required combination; the Type alone does not determine the
served application or fuel runtime.

---

## NFPA 110 Type Classification

| Type | Restoration time |
|---|---|
| **Type 10** | 10 seconds |
| **Type 60** | 60 seconds |
| **Type 120** | 120 seconds |

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

**Combined capacity factor:** The factors reduce the output available from a
nameplate rating. Therefore, the required standard-condition nameplate is found
by division—not by reducing the load:

```
combinedFactor = altitudeFactor × tempFactor
requiredNameplateKw = continuousKw / combinedFactor
```

For a selected generator, `availableSiteKw = nameplateKw × combinedFactor` must
meet or exceed the site load.

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

The default **35%** value is a preliminary, user-adjustable screen—not a
universal NFPA 110 limit. Establish the acceptance threshold from connected
contactor, relay, drive, and control ride-through requirements. If the dip
exceeds that project threshold, either:
- Select a larger generator (lowers `startingKVA / genKVA`)
- Install a soft-starter or VFD on the motor (reduces `LRC_multiplier`)
- Specify a generator with a lower X'd (higher short-circuit capacity)

### Step 5 — Select a standard generator size

The tool selects the smallest standard nameplate kW that is ≥ the site-derated required kW:

```
requiredKw = max(continuousKw / combinedFactor,
                 motorStepLoadRecommendedKw / combinedFactor)
selectedKw = smallest standard size ≥ requiredKw
```

Standard generator nameplate sizes (kW): 15, 20, 25, 30, 40, 50, 60, 75, 100, 125, 150, 175, 200, 250, 300, 350, 400, 500, 600, 750, 1000, 1250, 1500, 1750, 2000. Requirements above 2,000 kW return no selection instead of silently selecting an undersized unit.

### Step 6 — Calculate fuel runtime

```
fuelRate (gal/hr) = loadKw × 1.341 [hp/kW] × SFC [lb/hp-hr] / 6.791 [lb/gal]
runtime (hr)      = tankCapacity_gal / fuelRate
```

Default SFC = **0.38 lb/hp-hr** (diesel, approximately 75% load, modern Tier 4 engine).

Compare the estimated runtime with the separately specified NFPA 110 **Class**,
applicable NEC requirements, owner criteria, and AHJ requirements. Type 10
describes restoration within 10 seconds; it does not itself specify two hours of
runtime.

---

## Example calculation

**Site:** 5,000 ft altitude, 45 °C ambient, naturally-aspirated diesel, Type 10 system

| Step | Value |
|---|---|
| Continuous loads | Emergency lighting: 50 kW × 1.0 = 50 kW<br>HVAC critical: 150 kW × 0.80 = 120 kW<br>Fire pump: 75 kW × 1.0 = 75 kW<br>**Total: 245 kW** |
| Environmental factors | altitude = **0.865**, temperature = **0.95**, combined = **0.82175** |
| Continuous-load nameplate requirement | 245 / 0.82175 = **298.1 kW** |
| Largest motor step load | 100 HP, LRC ×6, PF 0.85, eff 0.92: startingKVA ≈ 572 kVA → base recommendation 458 kW |
| Site-adjusted motor screen | 458 / 0.82175 = **557.3 kW** |
| Required kW | max(298.1, 557.3) = **557.3 kW** |
| Selected standard size | **600 kW** |
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
