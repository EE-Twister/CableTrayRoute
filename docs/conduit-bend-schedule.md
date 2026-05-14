# Conduit Bend & Pull-Box Schedule

## Purpose

The Conduit Bend & Pull-Box Schedule tool calculates the geometry of conduit bends
(90°, offset, kick, 3-bend saddle) and validates NEC 358.24 cumulative bend limits
between pull points. It also sizes pull boxes and junction boxes per NEC 314.28(A).

This tool is the standard construction deliverable required before conduit is
fabricated or field-bent. It eliminates manual lookup from bending charts and
provides a printable/exportable CSV schedule.

## Calculation Basis

### Bend Geometry

All geometry follows standard electrician practice documented in:
- **Tom Henry's Conduit Bending Manual** — multiplier and shrink tables
- **Mike Holt's Illustrated Guide to the NEC**
- IBEW / NECA standard bending practice

#### 90° Stub-Up

The bender arrow is placed at a distance equal to the **take-up** from the finished
end of the stub. Take-up varies by conduit trade size:

| Trade Size | Take-Up |
|---|---|
| ½" | 5" |
| ¾" | 6" |
| 1" | 8" |
| 1¼" | 11" |
| 1½" | 13" |
| 2" | 16" |

#### Two-Bend Offset

Two bends at the same angle, separated by the **mark spacing**:

| Angle | Multiplier (mark spacing = height × M) | Shrink per inch |
|---|---|---|
| 10° | 5.76 | 0.094" |
| 22.5° | 2.60 | 0.213" |
| 30° | 2.00 | 0.250" |
| 45° | 1.414 | 0.375" |

#### Kick

A single bend at the specified angle. No shrink; mark spacing = height × multiplier.

#### 3-Bend Saddle

Centre 45° bend with two outer 22.5° bends. Outer-to-centre spacing = **2.5 × height**.
Total span = **5 × height**. Shrink ≈ 0.213" per inch of height.

### NEC 358.24 — Cumulative Bend Limit

NEC 358.24 (EMT) — and the equivalent sections for IMC (342.24), RMC (344.24),
and LFMC (350.24) — prohibit more than **360° of bends** between pull points. Each
run is checked against this limit; a red badge appears if the limit is exceeded.

**Remediation:** Add a pull box or junction box between the bend-dense section and
the next pull point to reset the degree count.

### NEC 314.28 — Pull-Box Sizing

#### Straight Pulls — NEC 314.28(A)(1)

Minimum box length = **8 × trade size of the largest conduit** entering the box.

Example: Largest conduit = 2" → minimum length = 16".

#### Angle and U Pulls — NEC 314.28(A)(2)

For each wall with conduits:
minimum dimension = **6 × largest trade size + sum of other trade sizes on the same wall**

Example: Wall A has 2", 1½", 1½" conduits → 6 × 2 + 1.5 + 1.5 = 15".

## Input Fields

### Conduit Run

| Field | Description |
|---|---|
| Run label | Identifier for the conduit run |
| Trade size | Conduit trade size in inches (½" to 4") |
| Bend type | 90°, Offset, Kick, or 3-Bend Saddle |
| Dimension | Primary bend dimension in inches (stub height / offset rise / kick height / obstacle height) |
| Angle | Bend angle in degrees - used for Offset and Kick types only |
| Start / End X, Y, Z | Optional physical run endpoints in feet for the 3D layout view |
| Heading | Initial run heading in degrees, measured in plan from the positive X direction |
| End tolerance | Allowed distance between the modeled path and entered endpoint before a warning is shown |
| Bend station | Distance in feet from the run start to the bend marker |
| Bend plane | Horizontal or vertical bend plane |
| Bend direction | Left/right for horizontal bends or rise/drop for vertical bends |

### Pull Box

| Field | Description |
|---|---|
| Label | Identifier for the pull point |
| Pull type | Straight, Angle, or U pull |
| Box X, Y, Z | Optional physical pull-box coordinates in feet for the 3D layout view |
| Wall A / Wall B label | Optional physical wall orientation labels used in the 3D callouts |
| Largest trade size | For straight pulls: the largest conduit entering |
| Wall A / Wall B | For angle/U pulls: comma-separated list of all conduit trade sizes on each wall |

## Output

- **Bend schedule table** — per-bend: type, dimension, degrees, mark spacing, shrink, notes
- **Cumulative degree total** with NEC 358.24 pass/fail badge
- **Pull-box sizing card** — minimum required dimensions and nearest standard box size
- **3D run layout** - code-native SVG isometric view showing run endpoints, bend stations, bend direction, pull-box positions, and endpoint mismatch warnings

## Export

Click **Export CSV** to download a bend schedule CSV suitable for submittals, coordination
packages, or field installation documents.

## 3D Layout Notes

The manual layout fields are optional and backward compatible. Existing studies without
layout data render with generated defaults so older calculations can still be reviewed,
but those generated defaults are not written back into the study until the user recalculates
and saves the page.

The isometric view uses the entered coordinates as physical feet. If the bend stations,
planes, and directions do not produce a path that lands within the entered endpoint
tolerance, the panel shows an endpoint mismatch warning instead of silently adjusting
the run.

## References

- **NEC 358.24** — Maximum number of bends (EMT)
- **NEC 342.24 / 344.24 / 350.24** — Equivalent limits for IMC / RMC / LFMC
- **NEC 314.28(A)** — Pull-box and junction-box sizing
- Tom Henry's Conduit Bending Manual
- Mike Holt's Illustrated Guide to the National Electrical Code
