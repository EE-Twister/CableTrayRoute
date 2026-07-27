# Lightning & Surge Protection

The Lightning & Surge Protection page performs a screening-level direct-strike assessment informed by **IEC 62305:2024** and **IEEE 998-2026**. It compares expected direct strikes with the entered tolerable frequency, translates the result into a Lightning Protection Level (LPL), and visualizes rolling-sphere, mast-coverage, and down-conductor concepts. For systems above 1 kV, it also provides a preliminary surge-arrester voltage screen under **IEEE C62.22 / IEC 60099-5:2018**.

## When to Use

- Utility substation direct-stroke shielding concepts.
- Structural lightning protection for control buildings, telecom huts, and BESS enclosures.
- Early comparison of air-terminal height and protected-equipment height.
- Preliminary medium- and high-voltage surge-arrester voltage screening.

This study is not a final IEC risk assessment, a scaled shielding drawing, or a low-voltage SPD selector.

## Quick Start

1. Navigate to **Studies → Grounding → Lightning & Surge Protection**.
2. Choose **Metric** or **Imperial**. Existing entries are converted when the unit system changes.
3. Prefer a mapped **ground strike-point density**. Use thunderstorm days only when direct density data is unavailable; that option uses a legacy keraunic estimate.
4. Choose a rectangular, circular/cylindrical, or custom plan footprint. Enter its dimensions, or the custom plan area, perimeter, and farthest protected point from the mast.
5. Enter the structure height, actual mast or air-terminal tip elevation above grade, and height of the equipment to protect.
6. Optionally enter a system voltage and grounding method. Voltages at or below 1 kV are routed to a low-voltage SPD review instead of receiving a medium-voltage arrester rating.
7. Review the live concept, risk comparison, and design guidance. Click **Save Assessment** to store the study, then export CSV if needed.

## Visual Workspace

The page keeps the inputs and engineering meaning together:

- The **protection concept** provides separate plan and elevation views. The plan compares the footprint with the coverage circle at the protected-plane height; the larger 3H collection result remains in the summary so it does not shrink the protection geometry into an unreadable inset. The elevation uses equal horizontal and vertical scales so the displayed rolling-sphere boundaries are circular arcs rather than a decorative parabola.
- The **live summary** reports ground strike-point density, collection area, expected strike frequency, and the selected LPL.
- The **risk comparison** shows the ratio of expected direct strikes `Nd` to the entered tolerable frequency `Nc`. A ratio above `1×` indicates that the screening calls for additional direct-strike risk reduction.
- The **design translation** explains the LPL geometry, whether the tip clears the protected equipment, the preliminary down-conductor layout, and the applicable surge-protection workflow.
- If `Nd <= Nc`, the page intentionally suppresses LPL geometry and down-conductor quantities rather than presenting an arbitrary default class.

The plan and elevation geometry is scaled within each view, but it is not an installation drawing. The rectangular and circular modes assume a centered mast. Custom mode uses the entered farthest-point radius and shows a schematic outline because area and perimeter alone do not uniquely define a polygon. Final mast placement, multi-mast shielding, shield wires, bonding, grounding, separation distance, side-flash control, and construction details require project-specific engineering.

## Unit Systems

- **Metric** accepts lengths in metres and direct density in ground strike points/km²/year. Length and area results are shown in metres and square metres.
- **Imperial** accepts lengths in feet and direct density in ground strike points/mi²/year. Length and area results are shown in feet and square feet.

Changing units converts values already present in the fields; it does not change the physical design. The selected unit system is saved with the study and is used by the diagram, guidance, results, and CSV export. Calculations use canonical SI units internally. IEC conductor areas remain in mm², with an in² equivalent shown in Imperial mode.

## Direct-Strike Screening

When mapped ground strike-point density is unavailable, the page can estimate density from thunderstorm days using the legacy relationship:

```text
NSG = 0.04 · Td^1.25
```

The remaining screening calculations are:

```text
Ad = Af + (3H)P + π·(3H)²
Nd = NSG · Ad · Cd · 1e-6
E  = 1 - Nc/Nd
```

`Af` is plan footprint area, `P` is plan perimeter, `Ad` is equivalent collection area, `Cd` is the location factor, and `E` is required interception efficiency. For a rectangle, `Af = L·W` and `P = 2(L+W)`. For a circle, `Af = πD²/4` and `P = πD`. Custom mode accepts `Af` and `P` directly and validates that the pair is geometrically possible. IEC 62305-2:2024 uses lightning ground strike-point density `NSG`; direct mapped data should be preferred over the thunderstorm-day estimate.

The page selects the least restrictive LPL whose nominal interception probability meets the calculated efficiency:

| LPL | Nominal interception probability |
| --- | ---: |
| IV | 84% |
| III | 91% |
| II | 97% |
| I | 99% |

If the required efficiency exceeds 99%, LPL I alone does not satisfy the calculated target and the page warns that additional risk-reduction measures are needed.

The location factor represents the structure surroundings: taller surrounding objects (0.25), equal or shorter surrounding objects (0.5), isolated structure (1.0), or isolated hilltop/knoll (2.0).

## Rolling-Sphere and Mast Coverage

The screening uses these LPL parameters:

| LPL | Rolling-sphere radius (m) | Minimum current (kA) | Down-conductor spacing (m) |
| --- | ---: | ---: | ---: |
| I | 20 | 3 | 10 |
| II | 30 | 5 | 10 |
| III | 45 | 10 | 15 |
| IV | 60 | 16 | 20 |

For an entered air-terminal tip height `h`, protected-object height `hx`, and rolling-sphere radius `R`, the single-mast radius is:

```text
rp = √(h(2R - h)) - √(hx(2R - hx))
```

The heights are limited to the applicable rolling-sphere radius. If the protected equipment is at or above the tip, coverage is zero and the page calls for a taller or different arrangement. In plan, the resulting `rp` is compared with the farthest protected point from the assumed centered mast: half the plan diagonal for a rectangle, half the diameter for a circle, or the user-entered radius for a custom footprint. A negative coverage margin is shown as a shortfall rather than implying that the whole footprint is protected. The IEEE 998 electrogeometric striking-distance relationship shown by the study is `r = 10·I^0.65` m.

## Down-Conductors

When an LPS is indicated, the preliminary conductor count is the structure perimeter divided by the LPL spacing, rounded up, with a minimum of two. The screening uses minimum material cross-sections of copper 16 mm², aluminium 25 mm², and steel 50 mm². Confirm conductor class, routing, corrosion compatibility, bonds, test joints, and local code requirements during detailed design.

## Surge Protection

IEEE C62.22 and IEC 60099-5 cover surge arresters on systems above 1 kV. For those systems, the page estimates:

```text
Effectively or solidly grounded: Uc >= 1.05 · VLL / √3
Ungrounded or resonant-grounded: Uc >= 1.05 · VLL
Preliminary rated voltage:       Ur ≈ Uc / 0.8
```

The reported MCOV and nearest built-in duty-cycle rating are screening values only. Verify maximum system voltage, temporary overvoltage duration and amplitude, insulation coordination, energy duty, protective levels, lead length, and manufacturer data. Systems at or below 1 kV are labeled for a separate low-voltage SPD selection and coordination workflow.

## Limitations

- This is a simplified direct-strike frequency screen, not the complete IEC 62305-2:2024 risk calculation with all risk components, loss types, zones, and protection measures.
- The protection visualization represents one centered vertical air terminal. Offset terminals, multiple terminals, and shield-wire layouts need a dedicated geometric study.
- A custom footprint outline is schematic. Import or analyze surveyed polygon geometry in a dedicated shielding study when exact edge coverage is required.
- The collection-area expression and keraunic conversion are retained as transparent screening assumptions; use current mapped strike-point data and the governing standard for final design.
- Verify the result against the project grounding study, equipment insulation coordination, adopted code edition, authority requirements, and a qualified lightning-protection design.

## References

- IEC 62305-1:2024, *Protection against lightning – Part 1: General principles*.
- IEC 62305-2:2024, *Protection against lightning – Part 2: Risk management*.
- IEC 62305-3:2024, *Protection against lightning – Part 3: Physical damage to structures and life hazard* (rolling-sphere details are in Annex D).
- IEEE Std 998-2026, *Guide for Direct Lightning Stroke Shielding of Substations*.
- IEEE Std C62.22 and IEC 60099-5:2018, surge-arrester application guidance for systems above 1 kV.
