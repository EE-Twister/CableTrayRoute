# Substation Layout Generator

The Substation Layout Generator auto-stamps a screening-level 2D physical arrangement from the one-line topology. Equipment is grouped into voltage lanes, placed with electrical working-clearance envelopes per **IEEE 1119 / NESC §124**, and enclosed by a security fence and a ground-grid perimeter that seeds the **Ground Grid** study.

## When to Use

- Concept-stage **substation and switchyard** sizing.
- Estimating **fenced area and land take** for a given equipment list.
- **Seeding the ground-grid perimeter** from the physical extent of the yard.

## Quick Start

1. Navigate to **Studies → Structural → Substation Layout Generator**.
2. Build the equipment list:
   - **Import from One-Line** — pulls transformers, breakers, switchgear, and other apparatus from the project diagram (buses and cables are excluded).
   - **Load Sample Yard** — a 138/13.8 kV demonstration substation.
   - Or add rows manually with a tag, type, and voltage.
3. Click **Generate Layout** and review the plan view, fenced area, and ground-grid perimeter.
4. **Export Results (CSV)** for the placement schedule.

## Method

Equipment is grouped into **lanes by voltage level** (highest voltage at the top). Within each lane, items are placed left-to-right, each surrounded by a working-clearance envelope:

```
Envelope = footprint + 2 × clearance(voltage)
```

Working clearances follow IEEE 1119 / NESC §124 by maximum system voltage:

| Voltage (kV) | Clearance setback (ft) |
|--------------|------------------------|
| ≤ 15 | 3 |
| 35 | 4 |
| 69 | 6 |
| 115 | 8 |
| 138 | 9 |
| 230 | 13 |
| 345 | 18 |
| 500 | 25 |

The **security fence** is offset from the equipment bounding box by the highest-voltage clearance plus 10 ft. The **ground-grid perimeter** extends 3 ft beyond the fence — these dimensions carry directly into the Ground Grid study.

### Equipment Footprints

Typical screening footprints (plan, feet) are used per equipment class — power transformer 25×22, switchgear/MCC 30×12, circuit breaker 8×6, disconnect 6×4, capacitor bank 16×12, control building 40×20, and so on. Refine against vendor general-arrangement drawings for final design.

## Interpreting Results

- **Plan view** — footprints (coloured by voltage) inside dashed working-clearance envelopes, the security fence (orange), and the ground-grid perimeter (green).
- **Fenced area** — overall yard size and approximate land take in acres.
- **Ground grid** — the perimeter dimensions to carry into the Ground Grid study.
- **Equipment placement table** — each item's position, footprint, and clearance.

The layout is **deterministic**: the same equipment list always yields the same geometry.

## Limitations

- Single row per voltage level; multi-row yards need manual arrangement.
- No bay-internal phase spacing, road/crane access, or oil-containment sizing.
- A concept starting point for civil/structural and grounding design, not a final general-arrangement drawing.

## References

- IEEE Std 1119 — Guide for Fence Safety Clearances in Electric-Supply Stations.
- NESC (IEEE C2) §124 — Working clearances.
- IEEE Std 605 — Bus design and substation physical layout practice.
