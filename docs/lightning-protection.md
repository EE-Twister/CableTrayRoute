# Lightning & Surge Protection

The Lightning & Surge Protection page performs a screening-level direct-strike assessment informed by **IEC 62305:2024** and **IEEE 998-2026**. It compares expected direct strikes with the entered tolerable frequency, translates the result into a Lightning Protection Level (LPL), and visualizes rolling-sphere, mast-coverage, and down-conductor concepts. For systems above 1 kV, it also provides a preliminary surge-arrester voltage screen under **IEEE C62.22 / IEC 60099-5:2018**.

## When to Use

- Utility substation direct-stroke shielding concepts.
- Structural lightning protection for control buildings, telecom huts, and BESS enclosures.
- Early comparison of air-terminal height and protected-equipment height.
- Preliminary medium- and high-voltage surge-arrester voltage screening.

This study is not a final IEC risk assessment, a scaled shielding drawing, or a low-voltage SPD selector.

## NFPA 780 / UL 96A Design Workflow

The **NFPA 780 + UL 96A design checks** workflow separates calculable design requirements from field-dependent requirements. For a rectangular control building, the automatic layout:

- places the regular terminal grid within 2 ft (0.610 m) of the roof edges;
- limits terminal spacing to a conservative 20 ft (6.096 m) throughout the grid;
- requires at least 10 in (254 mm) terminal projection above the protected surface;
- checks rolling-sphere coverage of the entered reference plane;
- provides at least two independent paths to ground and an interconnected perimeter network;
- limits entered roof and down-conductor support spacing to 3 ft (0.914 m);
- carries the 8 in (203 mm) bend-radius reference and selects a Class I or Class II component basis from the structure height.

When all calculable checks pass, the result is labeled **Design checks pass — inspection excluded**. This means the geometry and entered takeoff assumptions are ready for detailed design; it is not a UL certification or Master Label.

Requirements the page cannot establish from numerical inputs are listed as required project assumptions, including UL 96 Listed components, structural support for tall terminals, bonding of rooftop metal and services, qualifying ground-grid connections, coordinated SPDs, separation distance, corrosion compatibility, flashing, and weatherproofing. Survey verification, structural calculations, ground-grid engineering, product catalog selections, permits, commissioning, and the final UL field inspection are explicitly excluded.

Circular, custom, irregular, multi-level, and obstructed roofs require a project-specific NFPA/UL layout. They remain available in screening mode but do not receive the automatic rectangular-roof design-ready status.

## Quick Start

1. Navigate to **Studies → Grounding → Lightning & Surge Protection**.
2. Choose **Metric** or **Imperial**. Existing entries are converted when the unit system changes.
3. Prefer a mapped **ground strike-point density**. Use thunderstorm days only when direct density data is unavailable; that option uses a legacy keraunic estimate.
4. Choose a rectangular, circular/cylindrical, or custom plan footprint. Enter its dimensions, or the custom plan area, perimeter, and farthest protected point from the mast.
5. Choose a **single centered mast** or **roof air-terminal array**. For an array, enter the number of columns, rows, and edge setback. Array coverage requires a rectangular or circular footprint with known boundaries.
6. Enter the structure height, actual mast or air-terminal tip elevation above grade, and height of the equipment to protect.
7. Optionally enter a system voltage and grounding method. Voltages at or below 1 kV are routed to a low-voltage SPD review instead of receiving a medium-voltage arrester rating.
8. Review the live concept, risk comparison, design guidance, and preliminary material takeoff. Click **Save Assessment** to store the study. Use **Export BOM CSV** for the live material schedule, **Export PDF Report** for a visual engineering report, or **Export CSV** for the saved calculation values.

## PDF Report Export

**Export PDF Report** creates a client-side report from the current visible inputs, so the page does not need to send study data to a server. The report uses the selected Metric or Imperial display units and includes:

- The current scaled plan/elevation protection graphic, including the point-terminal array and rolling-sphere envelope arcs.
- The risk result, required LPL, terminal arrangement, and pass/shortfall coverage margin.
- Structure dimensions, lightning exposure inputs, calculated collection area, strike frequency, and protection efficiency.
- Rolling-sphere, air-terminal, reference-plane, down-conductor, and surge-protection values.
- The preliminary grid-protection bill of materials when a roof array is selected and a structural LPS is indicated.
- Calculation warnings, study basis, and engineering limitations.

The PDF button is available for a valid live preview; saving the assessment first is not required. The exported report documents the screening state shown on screen and remains subject to the limitations described below.

## Visual Workspace

The page keeps the inputs and engineering meaning together:

- The **protection concept** provides separate plan and elevation views. Single-mast mode compares the footprint with one coverage circle. Roof-array mode places every terminal at its generated coordinate, clips the combined coverage discs to the roof, marks the worst roof point, and shows a representative array row in elevation. The elevation uses equal horizontal and vertical scales and emphasizes true radius-R envelope arcs. Full sphere positions are intentionally omitted so the protection boundary remains legible.
- The **live summary** reports ground strike-point density, collection area, expected strike frequency, and the selected LPL.
- The **risk comparison** shows the ratio of expected direct strikes `Nd` to the entered tolerable frequency `Nc`. A ratio above `1×` indicates that the screening calls for additional direct-strike risk reduction.
- The **design translation** explains the LPL geometry, whether the tip clears the protected equipment, the preliminary down-conductor layout, and the applicable surge-protection workflow.
- If `Nd <= Nc`, the page intentionally suppresses LPL geometry and down-conductor quantities rather than presenting an arbitrary default class.

The plan and elevation geometry is scaled within each view, but it is not an installation drawing. Single-mast mode assumes a centered mast. Roof-array mode uses a regular coordinate grid on rectangular or circular boundaries. Custom mode remains a single-mast schematic because area and perimeter alone do not uniquely define a polygon. Final terminal coordinates, roof penetrations and obstructions, shield wires, bonding, grounding, separation distance, side-flash control, and construction details require project-specific engineering.

## Unit Systems

- **Metric** accepts lengths in metres and direct density in ground strike points/km²/year. Length and area results are shown in metres and square metres.
- **Imperial** accepts lengths in feet and direct density in ground strike points/mi²/year. Length and area results are shown in feet and square feet.

Changing units converts values already present in the fields; it does not change the physical design. The selected unit system is saved with the study and is used by the diagram, guidance, results, CSV export, and PDF report. Calculations use canonical SI units internally. IEC conductor areas remain in mm², with an in² equivalent shown in Imperial mode.

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

### Roof Air-Terminal Arrays

For a roof array, the protected reference plane is the higher of the structure roof or the entered protected-equipment height. If a terminal projects by `p` above that plane, its rolling-sphere coverage radius on the plane is:

```text
rp = √(p(2R - p))
```

`p` is capped at `R`. The page generates a regular grid using the entered columns, rows, and edge setback. It then evaluates the union of all terminal coverage footprints rather than treating the array as one oversized mast.

For a rectangular roof, the worst distance to the nearest terminal is evaluated exactly at the regular grid's Voronoi-cell corners and footprint boundaries. Circular roofs use a dense interior and perimeter screen with a conservative half-cell allowance. The plan marks the controlling roof point and reports:

```text
coverage margin = per-terminal rp - worst nearest-terminal distance
```

A nonnegative margin means the complete horizontal reference plane is covered by at least one terminal in this screening model. The elevation shows the radius-R arcs for one representative terminal row. It does not replace a three-dimensional check of rooftop equipment, parapets, sloped surfaces, side exposure, conductive features, or separation distance.

## Down-Conductors

Downconductors are independent discharge paths; they are not assigned one-for-one to point air terminals. The intended topology is:

```text
point air terminals → common roof grid / perimeter ring
                    → corner-first distributed downconductors
                    → project earth-termination network
```

For rectangular structures, the preliminary layout starts with all four corners and divides each wall into enough equal segments to meet the selected LPL spacing. This can require more routes than simply dividing the total perimeter by the spacing, particularly when several individual walls are slightly longer than the spacing. Circular structures use an evenly distributed perimeter layout. Custom footprints report a preliminary count but require surveyed perimeter coordinates before locations can be shown.

The count calculation includes a small numerical tolerance so switching between Metric and Imperial cannot add a spurious conductor at an exact spacing boundary. The plan view distinguishes corner routes from intermediate routes and shows them separately from the roof terminal grid.

The screening uses minimum material cross-sections of copper 16 mm², aluminium 25 mm², and steel 50 mm². Keep lightning-current paths short and direct. The page carries an 8 in (203 mm) minimum bend-radius coordination reference with no turn sharper than 90 degrees where UL 96A / NFPA 780-style requirements govern. Confirm the adopted standard, listed system instructions, conductor class, routing, corrosion compatibility, bonds, test joints, separation distance, and local requirements during detailed design.

## Grid Protection Bill of Materials

When the screening indicates a structural LPS and **Roof air-terminal array** is selected, the page creates a live preliminary BOM from the entered geometry. The schedule includes point terminals, bases, terminal connectors, grid and perimeter conductors, roof supports, down conductors and clips, test joints, earth-interface clamps, and identification labels.

The takeoff traces every horizontal and vertical segment between adjacent array terminals. It can also include a roof perimeter ring. Down-conductor length uses the independent corner-first/perimeter route count and structure height—not the air-terminal quantity. A topology strip and installation notes explain the relationship between the point terminals, common roof grid, down paths, earth interface, and bend-radius reference. The following assumptions are editable and convert with Metric/Imperial units:

- Conductor waste/routing allowance percentage.
- Maximum roof conductor support spacing.
- Maximum down-lead clip spacing.
- Extra routing and termination length per down conductor.
- Inclusion or exclusion of the roof perimeter ring.

**Export BOM CSV** downloads the current live schedule without requiring the assessment to be saved. The PDF report includes the same BOM as an additional page. When rolling-sphere coverage is incomplete, the BOM remains visible for design iteration but is explicitly marked unsuitable for procurement.

The BOM is a concept-estimating takeoff, not a product specification or issued-for-construction material schedule. In NFPA/UL mode it reports the applicable Class I or Class II listed-component basis and includes the complete assumption/exclusion register. It still excludes the project grounding-grid design, final rooftop equipment bonds, weatherproofing and structural calculations, product selections, labor, testing, certification, and manufacturer-specific spare parts. Verify final routes, listed components, material compatibility, roof attachment, bonding, grounding, adopted code requirements, and installed quantities with the qualified lightning-protection designer.

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
- The roof-array method represents a regular grid of equal-height point terminals on one horizontal reference plane. Irregular coordinates, unequal terminal heights, mesh conductors, catenary wires, shield wires, sloped roofs, parapets, and side surfaces need a dedicated three-dimensional geometric study.
- A custom footprint outline is schematic. Import or analyze surveyed polygon geometry in a dedicated shielding study when exact edge coverage is required.
- The collection-area expression and keraunic conversion are retained as transparent screening assumptions; use current mapped strike-point data and the governing standard for final design.
- Verify the result against the project grounding study, equipment insulation coordination, adopted code edition, authority requirements, and a qualified lightning-protection design.

## References

- IEC 62305-1:2024, *Protection against lightning – Part 1: General principles*.
- IEC 62305-2:2024, *Protection against lightning – Part 2: Risk management*.
- IEC 62305-3:2024, *Protection against lightning – Part 3: Physical damage to structures and life hazard* (rolling-sphere details are in Annex D).
- IEEE Std 998-2026, *Guide for Direct Lightning Stroke Shielding of Substations*.
- IEEE Std C62.22 and IEC 60099-5:2018, surge-arrester application guidance for systems above 1 kV.
