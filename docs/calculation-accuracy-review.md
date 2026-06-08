# Calculation Accuracy Review

Review of the engineering calculation modules for formula/numerical errors and
for clarity of the inputs and assumptions each calculation makes. Findings are
grouped into **corrected errors** (output was wrong) and **clarified
assumptions** (output unchanged, but a simplification/limitation is now
documented so users are not misled).

## Corrected errors

| Module | Issue | Fix |
| --- | --- | --- |
| `analysis/groundGrid.mjs` | `Kii` corner-weighting factor was **inverted** vs IEEE 80-2013 Eq. 82 (returned `1` for grids without rods and `1/(2n)^(2/n)` for grids with rods — backwards). This skewed the mesh factor Km and therefore the mesh voltage Em used for the touch-voltage safety check. | `Kii = hasRods ? 1 : 1/(2n)^(2/n)` |
| `analysis/harmonics.js` | IEEE 519 **voltage THD limit table was wrong**: 69–161 kV was checked against 8 % (should be 2.5 %), > 161 kV against 12 % (should be 1.5 %), and < 1 kV was not distinguished from MV. The high-voltage limits were far too lenient — a 138 kV bus would pass at 8 % when the standard requires 2.5 %. | IEEE 519-2022 Table 1: ≤1 kV → 8 %, ≤69 kV → 5 %, ≤161 kV → 2.5 %, > 161 kV → 1.5 % (test copy corrected too). |
| `analysis/seismicBracing.mjs` | Vertical seismic force applied the importance factor `Ip` in the bracing-required branch (`0.2·SDS·Ip·Wp`) but not in the no-bracing branch. ASCE 7 §12.4.2.2 defines `Ev = 0.2·SDS·D` with **no Ip**. | Both branches now use `0.2·SDS·Wp`. |
| `cabletrayfill.js` | NEC Table 392.22(A) **Column 2 ladder-tray allowable fill areas for 30″ and 36″ trays were wrong** (32.5 / 39.0 in², breaking the linear width × 7/6 progression), producing false "exceeds allowable" warnings. | 30″ → 35.0 in², 36″ → 42.0 in² (both lookup tables). |
| `conduitfill.js` | The per-row **Count column was collected but ignored** — fill area and the 1/2/over-2 conductor fill limit (NEC Chapter 9 Table 1) were based on the number of table rows, not the number of conductors. A row with Count = 3 was treated as one conductor. | Each row is expanded into `count` conductors before area, limit selection, packing, and jam-ratio checks. |
| `analysis/arcFlash.mjs` | PPE banding assigned a non-existent **"Category 5"** above 40 cal/cm². NFPA 70E defines categories 1–4; above 40 cal/cm² energized work is prohibited (no category). | Capped at Category 4; > 40 cal/cm² is communicated via the existing note and the "DANGER" label signal word. |
| `analysis/capacitorBank.mjs` | 7th-harmonic detuning rationale text said "shift resonance below h=5" (copy/paste from the 5th-harmonic branch). | Corrected to "below h=7". |

## Clarified assumptions (no numeric change)

| Module | Assumption now documented |
| --- | --- |
| `analysis/arcFlash.mjs` | The model is an **IEEE 1584-2002-style screening estimate, not a standard-conformant IEEE 1584-2018 implementation**. It does not use the 2018 coefficient tables, the three-current voltage interpolation, or the enclosure-size correction polynomials, and the distance exponent is fixed at 2 (the real exponent is equipment/voltage dependent). Hardcoded defaults (gap 25 mm, working distance 455 mm, 508 mm cube enclosure, 0.48 kV, 0.2 s clearing time) are listed in the docstring and surfaced per-result when an input is missing. A full IEEE 1584-2018 study is required for final PPE/labeling. |
| `analysis/seismicBracing.mjs` & `analysis/seismicWindCombined.mjs` | The component-force equation is the **ASCE 7-16 §13.3.1 form** (`Fp = 0.4·ap·SDS·Wp·(1+2z/h)/(Rp/Ip)`); the revised ASCE 7-22 §13.3.1 equation (Hf, Rμ, Car, Rpo) is **not** implemented. The 12 ft / 40 ft brace spacings are NEMA VE 2 guidance values, not literal ASCE 7 limits. SDC E/F are derived from conservative SD1 thresholds as a stand-in for the §11.6 `S1 ≥ 0.75` rule, because the tool collects SD1 but not S1. |
| `src/voltageDrop.js` & `analysis/voltageDropStudy.mjs` | Voltage drop is a **resistive, unity-power-factor estimate**: `Vd = factor·I·R·L`, conductor **reactance neglected** (full form is `R·cosθ + X·sinθ`). This is non-conservative for low-PF loads and large conductors. Resistance is DC resistance corrected to the insulation rating (or 20 °C when absent). |

## Verified correct (audited, no change needed)

`analysis/iec60909.mjs` (c-factors, κ, K_T, ip, Ik1/Ik2/Ik3), `analysis/dcShortCircuit.mjs`
(Stokes-Oppenlander arc voltage, Lee/Ammerman DC incident energy, PPE bands),
`analysis/iec60287.mjs` (ampacity, thermal resistances, dielectric loss),
`analysis/windLoad.mjs` (`qz = 0.00256·Kz·Kzt·Ke·V²`, Kz profile),
`analysis/structuralLoadCombinations.mjs` / `loadCombinations.mjs` (ASCE 7 §2.3/§2.4 combos),
`analysis/supportSpan.mjs` (5wL⁴/384EI span scaling),
`analysis/cableFaultBracing.mjs` (single- and three-phase electromagnetic force),
`analysis/conduitFill.mjs` (NEC Chapter 9 fill limits — correctly multiplies by conductor count),
`analysis/intlCableSize.mjs` (IEC/AS-NZS ampacity tables and correction factors),
`analysis/motorStartCalc.mjs` (FLA, reduced-voltage starter currents),
and the grounding tolerable touch/step voltage equations in `groundGrid.mjs`.
