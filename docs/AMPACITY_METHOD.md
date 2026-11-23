# Ampacity Method

> **Screening limitation:** This is a calibrated steady-state estimator, not a
> complete Neher-McGrath, IEC 60287, or IEEE 835 compliance implementation.
> Final ampacity requires actual cable construction, installation geometry,
> mutual heating, soil/backfill properties, and an accepted engineering method
> or manufacturer study. Calibration against a few reference cases does not
> validate other conductor sizes or installation arrangements.

The application estimates conductor ampacity using the Neher‑McGrath method. This approach was introduced in the 1957 paper *The Calculation of the Temperature Rise and Load Carrying Capability of Cable Systems* by J. H. Neher and M. H. McGrath. It forms the basis of ampacity guidance in **NEC 310‑15(C)** and the calculation procedures detailed in **IEEE Std 835**.

## Equation

The allowable current **I** in amperes is obtained from:

```
I = sqrt( (T_c - (T_a + ΔT_d)) / ( R_dc × (1 + Y_c) × R_ca ) )
```

where `R_ca = R_cond + R_ins + R_duct + R_gap + R_soil`. In the Ductbank Route
estimator, heat loss is also scaled by `N_c`, the current-carrying conductor
count for the cable.

### Variable Definitions

- **T_c** – maximum conductor temperature rating in °C.
- **T_a** – ambient temperature of the surrounding medium (earth or air) in °C.
- **ΔT_d** – dielectric loss temperature rise in °C.
- **R_dc** – dc resistance of the conductor at temperature `T_c` (Ω/m).
- **Y_c** – ac resistance correction factor for skin and proximity effects.
- **R_cond** – thermal resistance internal to the conductor.
- **R_ins** – thermal resistance of insulation.
- **R_duct** – thermal resistance of the duct wall (and concrete envelope when selected).
- **R_gap** – thermal resistance of the air gap between the cable(s) and the inside of the duct,
  IEC 60287-2-1 §4.2.7.2 for PVC/PE ducts in earth:
  `R_gap = 1.87 / (1 + 0.1 (0.312 + 0.0037 θ_m) D_e)` with `θ_m = 60 °C` and `D_e` in mm.
  `D_e` is the cable diameter (×2.16 for a three-conductor cable), or the bundle diameter
  `D_e·√n` (limited to the duct inside diameter) when `n` cables share the conduit. For a
  23 mm cable this is about 0.84 °C·m/W. Earlier versions omitted it and rated a single
  500 kcmil cable in a PVC duct at 993 A instead of about 680 A.
- **R_soil** – thermal resistance of the surrounding soil. It is calculated using
  a cylindrical model:

  `R_soil = (ρ_m / (2π)) · ln(4·d / D)`

  where `ρ_m = ρ / 100` converts resistivity from °C·cm/W to °C·m/W,
  `d` is the burial depth of the conduit in meters and `D` is the conduit
  diameter in meters.
- **N_c** - current-carrying conductor count used for heat-loss scaling in the
  Ductbank Route estimator.

These terms follow the notation of NEC 310‑15(C) and Clause 4 of IEEE Std 835.

## AC Resistance Correction

The factor **Y_c** is derived from IEEE Std 835 Table 4. The implementation
converts the conductor size to kcmil and linearly interpolates the table so
that **Y_c** varies smoothly with cross‑sectional area.

The dielectric loss temperature rise **ΔT_d** follows IEEE Std 835 Table 9 with
simple interpolation. Typical values are around 5 °C at 5 kV and 10 °C at
15 kV.

## Soil Resistivity Ranges

Typical soil resistivity values per IEEE Std 835 Table 1:

- **40 °C·cm/W** – very wet clay
- **60 °C·cm/W** – moist clay or sand
- **90 °C·cm/W** – average native soil
- **120 °C·cm/W** – dry sand
- **150 °C·cm/W** – dry sand and gravel

## Calibration

The resistance constants were tuned so that selected calculated ampacities approximate IEEE 835 table values; this is benchmark fitting, not general validation.

The library now exposes a `calibrateAmpacityModel` function which performs a grid
search over reasonable model parameters. The routine compares the calculated
ampacity of three common cables against their IEEE 835 free‑air ratings:

- **4/0 AWG Cu THHN (90 °C)** – 260 A
- **500 kcmil Cu THHN (90 °C)** – 430 A
- **250 kcmil Al THHN (75 °C)** – 215 A

`calibrateAmpacityModel` adjusts the assumed insulation thermal conductivity,
default duct resistance and the air thermal resistance until the maximum
deviation from these reference values falls below ±10 %. Typical calibrated
values are an air resistance near **3.4 °C·m/W** and an insulation thermal
conductivity of about **0.31 W/m·°C**.

The original Neher‑McGrath paper provides additional discussion on how soil conditions influence ampacity.

## IEEE 835 Underground Benchmarks

The automated test suite validates the dedicated underground ampacity solver using published
values from IEEE Std 835. A key benchmark is a **500 kcmil Copper conductor**
with a 90 °C insulation rating installed 36 inches deep in average soil
(90 °C·cm/W). IEEE 835 lists an ampacity of roughly **392 A** for this
configuration. The dedicated Neher‑McGrath implementation and the finite‑element solver
are calibrated so that the predicted ampacity and resulting conductor
temperature are within ±5 % of these values.

The Ductbank Route page also displays a separate simplified steady-state
screening estimate. That page-level value is an arithmetic screening aid and
is not covered by the ±5% IEEE 835 benchmark claim. It must remain labeled as
screening until a page-model fixture with the exact cable construction,
conductor arrangement, conduit geometry, and benchmark source is reconciled.

## References

- **NEC 310‑15(C)** – National Electrical Code, 2023 edition.
- **IEEE Std 835** – *IEEE Standard Power Cable Ampacity Tables*.
- J. H. Neher and M. H. McGrath, “The Calculation of the Temperature Rise and Load Carrying Capability of Cable Systems,” *AIEE Transactions*, 1957.


## Finite-Difference Thermal Solver

The heat map and conduit temperatures come from a two-dimensional finite-difference solution
of `k ∇²T = −q` (`thermalWorker.js`). Numerical details that matter for accuracy:

- **Heat conservation:** each conduit's loss is spread over the cells that represent it, so the
  total injected equals the cable loss at every resolution.
- **Far-field boundaries:** the side and bottom edges are held at the analytic temperature of the
  conduits treated as line sources with images above the isothermal grade
  (`T = T_earth + Σ P ρ / 2π · ln(d′/d)`), not at the undisturbed earth temperature. Edges only
  one burial depth away forced the domain too cool by 13–19%.
- **Convergence:** successive over-relaxation, iterated until the largest change per sweep is below
  1e-4 °C. The earlier Jacobi loop stopped at 0.01 °C per sweep or 2000 sweeps and returned
  under-converged results on finer grids (a single conduit read +20%, +8% and −47% at the 20, 40
  and 80 node settings).
- **Resolution:** the cell size resolves the smallest conduit with about four cells across its
  radius within a budget of roughly 120,000 cells, so the grid-size setting no longer changes the
  temperatures (it still sets the resolution of the displayed map).
- **Duct resistance:** each conduit temperature adds `P × (R_duct + R_gap + user duct resistance)`.

A single conduit agrees with the exact solution `ΔT = P ρ / 2π · [ln(2L/R) + ¼]` to within about
4%. Two conduits agree with the superposition of the single rise and the image-method mutual
heating. Uniform soil, an isothermal grade and no moisture migration (dry-out) are assumed.
