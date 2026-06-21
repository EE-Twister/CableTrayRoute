# Overhead Conductor Sag-Tension

The Sag-Tension study computes the sag and tension of an overhead conductor across a line section using the ruling-span method, NESC ice/wind loading districts, and the elastic/thermal change-of-state equation. It produces a contractor **stringing table** for the bare conductor over an installation-temperature range, per IEEE 524.

## When to Use

- **Substation yard** bus and shield-wire stringing.
- **Overhead distribution getaways** and yard lighting tie-ins.
- **Ground-clearance checks** under maximum-sag (hot or iced) conditions.
- Producing a **stringing table** at the day's installation temperature for the line crew.

## Quick Start

1. Navigate to **Studies → Structural → Conductor Sag-Tension**.
2. Select a conductor from the library.
3. Enter the **span lengths** in the section (the ruling span is computed automatically).
4. Choose the **NESC loading district** and the **design tension** (% of rated strength).
5. Set the **stringing temperature range**.
6. Click **Run Sag-Tension**, review the loading cases and stringing table, then **Export Results (CSV)**.

## Geometry

```
Ruling span   RS = √(Σ Sᵢ³ / Σ Sᵢ)
Parabolic sag  D = w·S² / (8·H)
Catenary sag   D = (H/w)·(cosh(w·S / 2H) − 1)
Support tension T = H + w·D
```

The **ruling span** is the single equivalent span whose tension governs the whole section — all spans between dead-ends share one horizontal tension. The parabolic approximation is used for the stringing math; the catenary form is used to flag when a span is in the large-sag regime (the two diverge by more than 5%).

## NESC Loading Districts (IEEE C2 §250)

| District | Radial ice (in) | Wind (lb/ft²) | Constant K (lb/ft) | Temp (°F) |
|----------|-----------------|---------------|--------------------|-----------|
| Heavy | 0.50 | 4 | 0.30 | 0 |
| Medium | 0.25 | 4 | 0.20 | 15 |
| Light | 0.00 | 9 | 0.05 | 30 |

Ice is modelled as a radial annulus at **57 lb/ft³**. The resultant unit load combines the vertical (conductor + ice) and transverse (wind) components and adds the district constant K:

```
w_ice   = π·t·(d + t)/144 · 57          (lb/ft)
w_wind  = P · (d + 2t)/12                (lb/ft)
w_result = √((w_bare + w_ice)² + w_wind²) + K
```

## Change of State

The horizontal tension at a new condition (load `w₂`, temperature `t₂`) is found from the known design condition (`H₁`, `w₁`, `t₁`) by the parabolic change-of-state equation:

```
H₂²·[H₂ − H₁ + αEA(t₂−t₁) + EA·w₁²S²/(24H₁²)] = EA·w₂²S²/24
```

solved as a cubic for the positive root (`E` = modulus, `A` = area, `α` = thermal coefficient). The design (limiting) tension is set as a percentage of the conductor's rated strength (UTS) at the selected loading district; the bare-conductor stringing table is back-calculated at each installation temperature.

## Interpreting Results

- **Design sag** — the sag at the loaded design condition; use it for clearance checks.
- **Loading cases** — tension and sag at each NESC district, with the percentage of UTS consumed (NESC final-tension limits are typically 60% loaded / 35% unloaded).
- **Stringing table** — the bare-conductor horizontal and support tension and sag at each temperature, for the installation crew. Sag rises and tension falls as temperature increases.

## Limitations

- Level spans and final-modulus behaviour (no separate initial/creep stress-strain curve).
- No galloping, aeolian-vibration, or inclined-span correction.
- Single conductor type per run.
- Screening-level — verify against a manufacturer sag-tension chart before construction.

## References

- IEEE Std 524 — Guide to the Installation of Overhead Transmission Line Conductors.
- NESC (IEEE C2) §250 — Loading districts and load factors.
- ASCE Manual 74 — Guidelines for Electrical Transmission Line Structural Loading.
