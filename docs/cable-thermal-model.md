# Detailed cable thermal modeling

The IEC 60287 page includes a detailed **direct-burial thermal screen** alongside
the existing simplified ampacity calculator. It calculates steady-state current
from explicit cable dimensions, material thermal resistivities, electrical loss
inputs, and installation geometry. Overall readiness remains **Screening only**.

## Start with public reference data

No private cable data is needed to run the two included examples. Select a
published reference profile, review its inputs, and run the thermal screen:

| Reference | Supplied sheath loss factor | Published current | Thermal calculation |
| --- | ---: | ---: | ---: |
| 132 kV, 630 mm² Cu, both-end bonding | 0.2939 | 821.78 A | 821.774 A |
| Same construction, single-point bonding | 0.0777 | 886.18 A | 886.173 A |

These are comparisons with Cableizer's publicly downloadable reports for its
CIGRE TB 880 examples: [both-end bonding](https://www.cableizer.com/static/pdf/tb880/CIGRE_TB_880_Case_0-1.284dc317ccef.pdf)
and [single-point bonding](https://www.cableizer.com/static/pdf/tb880/CIGRE_TB_880_Case_0-1_4.6.3_ssb.aa98687bf91c.pdf).
The reports identify software version `51cac` and are dated May 14, 2025.
The application uses their published loss inputs; it does not independently
calculate or validate the reports' electromagnetic losses. The original paid
CIGRE brochure was not obtained, so this is not a claim of verification against
its full text. Source URLs, page references, retrieval date, hashes, dimensions,
and expected results are recorded in
[`data/cableThermalReferenceProfiles.json`](../data/cableThermalReferenceProfiles.json).

The reference construction has a 30.3 mm conductor diameter, three specified
screen/insulation layers, a 68.5 mm jacket inner diameter, and 75.5 mm outside
diameter. Both examples use touching trefoil, 1,000 mm mean centre depth,
1 K·m/W soil resistivity, 20 °C soil, and 50 Hz. AC resistance is 0.039522 Ω/km
at 90 °C; dielectric loss is 0.385 W/m. Single-point bonding retains the
published eddy-current sheath loss rather than assuming all sheath loss is zero.

## Supported inputs and geometry

The cable model represents one conductor per cable, contiguous radial insulation
layers, a metallic sheath whose radial thermal resistance is neglected, and an
outer jacket. Enter actual layer diameters and thermal resistivities. AC
resistance, dielectric loss, and sheath loss factor must be supplied for the
stated maximum conductor temperature and frequency. Resistance temperature and
frequency must match the study; the model does not extrapolate them.

The supported formations are:

- **Isolated:** one directly buried cable.
- **Flat spaced:** three identical cables at equal centre depth and spacing.
- **Trefoil spaced:** three identical cables in an equilateral triangle;
  entered burial depth is the mean of the three centre depths.
- **Trefoil touching:** a separate group approximation for metallic-sheathed
  cables, with centre spacing equal to the outside diameter and `2L/D ≥ 4`.

Spaced formations require centre spacing greater than 1.05 outside diameters;
every cable must lie below the soil surface. They use geometric mutual heating,
without an additional scalar grouping factor. Electrical loss inputs stay fixed
when geometry changes. Recalculate those losses externally when an installation
change affects proximity or sheath losses.

## Thermal equations and checks

For each radial layer, `T = ρ/(2π) × ln(Dout/Din)`, in K·m/W. Layer resistances
sum to T1; the jacket produces T3. The isolated external resistance is
`T4 = ρsoil/(2π) × acosh(2L/D)`. Spaced cables use this self term and the mutual
term `Tij = ρsoil/(2π) × ln(dimage/dreal)`, following the image-source relationship
described in [Cableizer's mutual-heating documentation](https://www.cableizer.com/documentation/Deltatheta_kp/).
Each matrix row sum is the external resistance for equal heat output from the
three cables; the hottest phase limits the common current.

For touching trefoil, `T4 = 3ρsoil/(2π) × [ln(4L/D) − 0.63]` and the effective
jacket resistance is `1.6 × T3`. The applicability restriction and jacket factor
are documented in [Cableizer's touching-trefoil model](https://www.cableizer.com/documentation/T_4iii/)
and [jacket-resistance documentation](https://www.cableizer.com/documentation/T_3/).
Its single equivalent group resistance is not a resolved three-by-three matrix.

With `Rac` in Ω/m, `Wd` in W/m, `λ` the supplied sheath loss factor, and effective
resistances for the limiting phase:

```text
I² = [Tmax − Tambient − Wd × (T1/2 + T3 + T4)]
     / [Rac × (T1 + (1 + λ) × (T3 + T4))]
Wc = I² × Rac
Ws = λ × Wc
Wtotal = Wc + Ws + Wd
Tconductor = Tambient + (Wc + Wd/2) × T1 + Wtotal × (T3 + T4)
Tsheath = Tambient + Wtotal × (T3 + T4)
Tsurface = Tambient + Wtotal × T4
```

The reference cases check intermediate thermal resistances and final current;
reverse temperature calculation returns 90 °C. The current tolerance is 0.05 A
to allow rounding of published inputs, not to fit unknown cable properties.

## Manufacturer records and remaining data gaps

The source catalogue also records three Eland N2XSY 12/20 kV copper sizes
(95, 240, and 630 mm²), including published dimensions, resistance, capacitance,
dielectric loss, and tabulated current. The
[manufacturer's datasheet](https://www.elandcables.com/media/l3lbgopw/n2xsy-xlpe-pvc-12-20-24-kv-cable-datasheet.pdf)
specifies trefoil, 50 Hz, 90 °C conductor temperature, 15 °C ground, 500 mm
burial, and soil resistivity of 120 °C·cm/W, converted to 1.2 K·m/W.

These are **source-only records**, not complete calculation presets. They lack
conductor/screen diameters, layer thermal resistivities, exact spacing/depth
reference, and bonding/loss details. Published ampacity is retained as source
data and is not used to infer or tune those missing properties.

## Saved studies and exports

The detailed screen uses its own `cableThermalDetailed` study record, separate
from the simplified `iec60287` result. Use a named project to retain results.
Editing inputs makes the old result stale; rerun before exporting. Reopening
restores the saved input set and shows historical results pending rerun.
CSV output carries the calculation inputs, thermal resistances, losses,
temperatures, reference provenance, and screening limitations. It also retains
the calculation revision, run timestamp, input fingerprint, project/scenario
provenance, and evaluated/current status from the shared study lifecycle. A changed
reference profile is identified as customized rather than presented as an
unchanged published example.

## Boundaries and further evidence

This implementation assumes homogeneous soil, steady balanced current, identical
cables, and constant supplied losses. It does not cover duct banks, engineered
backfill regions, soil drying, crossings, multiple unequal circuits, arbitrary
bonding arrangements, full electrical-loss calculation, or detailed transient
ratings. Spaced arrangements have independent analytical matrix checks; the
published cross-tool comparisons presently cover touching trefoil only.

The separate legacy load-profile screen remains a lumped RC approximation. Its
core-count and heat-capacity unit defects have been corrected, but it is not an
implementation of [IEC 60853-1](https://webstore.iec.ch/en/publication/3709) or
[IEC 60853-2](https://webstore.iec.ch/en/publication/3711) cyclic/emergency rating
methods. IEC 60287-2-2 concerns free-air group reduction, not cyclic ratings.
The approximation counts conductor heat capacity only, floors the time constant
at 60 seconds, starts the profile at ambient temperature, and uses the highest
ampacity installation from its comparison as the profile reference. It does not
resolve insulation/soil heat storage or a repeating-cycle initial condition.

See the [verification record](cable-thermal-verification-2026-09-18.md) for test
evidence. Project-specific construction data, measured soil conditions, suitable
electrical loss calculations, and qualified review are still needed for final
cable selection.
