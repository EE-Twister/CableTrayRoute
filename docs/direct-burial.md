# Direct Burial Circuit Sizing

`directburial.html` answers two questions for cables laid directly in soil, with no conduit or concrete envelope:

1. How many circuits of a given current can sit side by side in one trench at a chosen cover depth?
2. Which conductor size and circuit spacing gives the lowest installed cost per foot?

Use the Ductbank page when cables run in conduits. Use this page when they are direct buried.

## Inputs

| Input | Notes |
| --- | --- |
| Current per circuit | Default 102 A. |
| Continuous-load multiplier | Multiplies the current to get the target ampacity (for example 1.25 for continuous loads). |
| Model margin | Percent added to the target ampacity. Default 10%. Spot checks against published tabulated ratings (for example IEC 60364-5-52 Table B.52.4) showed the thermal model reading roughly 5-15% high, so the margin is explicit and editable. |
| Circuits needed | Leave blank to find the maximum each option can carry; enter a count to rank options for that count. |
| Cover to top of cable | Default 24 in. Cable centre depth is cover plus half the cable or circuit height. |
| Material, insulation, arrangement | Three single-conductor cables in trefoil or flat, or one three-conductor cable. |
| Soil thermal resistivity and temperature | Default 1.0 K·m/W and 20 °C. Use a measured value where available. Thermal backfill is modelled by lowering the resistivity. |
| Conductor sizes and spacings | Candidate sizes (6 AWG to 1000 kcmil) and clear spacing between circuits. |
| Cost allowances | Trench excavation and backfill in $/yd³ and an aluminum price factor. |

## Method

- Each cable is rated with `calcAmpacity` from `analysis/iec60287.mjs` (IEC 60287-1-1), using Kennelly's formula for its own external thermal resistance.
- Mutual heating from every other cable in the trench is added to the external thermal resistance with the IEC 60287-2-1 image method: `ΔT4 = (ρ / 2π) · Σ ln(d′ / d)`, where `d` is the distance to the neighbouring cable and `d′` the distance to its image above the soil surface. It is passed to `calcAmpacity` as `externalT4Extra`.
- Circuits are assumed identical and equally loaded. The circuit rating is the lowest cable rating in a centre circuit of the row, which is the hottest position.
- Cable prices come from `DEFAULT_PRICES.cable` in `analysis/costEstimate.mjs`. Trench cost is trench cross-section times the $/yd³ allowance. The trench is the row width plus 6 in each side, and reaches 4 in below the cable.

## Results

The table lists every size and spacing with the single-circuit ampacity, the maximum circuit count that still meets the target, the ampacity at the evaluated count, trench width and cost per foot. The highlighted row is the cheapest feasible option. The CSV export contains the same table.

## Limitations

- Steady state at 100% load factor; no cyclic rating and no soil dry-out.
- Uniform soil, single horizontal row, no other heat sources or crossing duct banks.
- No sheath, screen or armour losses; suited to non-metallic-jacketed low-voltage cables.
- Not calibrated against the NEC 310.14 tables or Annex B. Confirm the selected design against the governing code or a full Neher-McGrath study before issuing for construction.
- Cost figures are conceptual allowances for ranking options and are not quotations.
