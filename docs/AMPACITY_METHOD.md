# Ampacity Method

The application estimates conductor ampacity using the Neher‑McGrath method. This approach was introduced in the 1957 paper *The Calculation of the Temperature Rise and Load Carrying Capability of Cable Systems* by J. H. Neher and M. H. McGrath. It forms the basis of ampacity guidance in **NEC 310‑15(C)** and the calculation procedures detailed in **IEEE Std 835**.

## Equation

The allowable current **I** in amperes is obtained from:

```
I = sqrt( (T_c - (T_a + ΔT_d)) / ( R_dc × (1 + Y_c) × R_ca ) )
```

where `R_ca = R_cond + R_ins + R_duct + R_soil`.

### Variable Definitions

- **T_c** – maximum conductor temperature rating in °C.
- **T_a** – ambient temperature of the surrounding medium (earth or air) in °C.
- **ΔT_d** – dielectric loss temperature rise in °C.
- **R_dc** – dc resistance of the conductor at temperature `T_c` (Ω/m).
- **Y_c** – ac resistance correction factor for skin and proximity effects.
- **R_cond** – thermal resistance internal to the conductor.
- **R_ins** – thermal resistance of insulation.
- **R_duct** – thermal resistance of any raceway or duct.
- **R_soil** – thermal resistance of the surrounding soil. It is calculated using
  a cylindrical model:

  `R_soil = (ρ_m / (2π)) · ln(4·d / D)`

  where `ρ_m = ρ / 100` converts resistivity from °C·cm/W to °C·m/W,
  `d` is the burial depth of the conduit in meters and `D` is the conduit
  diameter in meters.

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

The resistance constants were tuned so that calculated ampacities match IEEE 835 tables.

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

The automated test suite validates underground calculations using published
values from IEEE Std 835. A key benchmark is a **500 kcmil Copper conductor**
with a 90 °C insulation rating installed 36 inches deep in average soil
(90 °C·cm/W). IEEE 835 lists an ampacity of roughly **392 A** for this
configuration. The Neher‑McGrath implementation and the finite‑element solver
are calibrated so that the predicted ampacity and resulting conductor
temperature are within ±5 % of these values.

## References

- **NEC 310‑15(C)** – National Electrical Code, 2023 edition.
- **IEEE Std 835** – *IEEE Standard Power Cable Ampacity Tables*.
- J. H. Neher and M. H. McGrath, “The Calculation of the Temperature Rise and Load Carrying Capability of Cable Systems,” *AIEE Transactions*, 1957.
