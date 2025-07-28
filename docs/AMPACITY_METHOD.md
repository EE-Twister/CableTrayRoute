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

## Soil Resistivity Ranges

Typical soil resistivity values per IEEE Std 835 Table 1:

- **40 °C·cm/W** – very wet clay
- **60 °C·cm/W** – moist clay or sand
- **90 °C·cm/W** – average native soil
- **120 °C·cm/W** – dry sand
- **150 °C·cm/W** – dry sand and gravel

The original Neher‑McGrath paper provides additional discussion on how soil conditions influence ampacity.

## References

- **NEC 310‑15(C)** – National Electrical Code, 2023 edition.
- **IEEE Std 835** – *IEEE Standard Power Cable Ampacity Tables*.
- J. H. Neher and M. H. McGrath, “The Calculation of the Temperature Rise and Load Carrying Capability of Cable Systems,” *AIEE Transactions*, 1957.
