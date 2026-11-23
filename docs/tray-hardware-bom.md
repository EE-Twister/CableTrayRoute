# Tray Hardware BOM — Fitting Detection

The Tray Hardware BOM derives fittings, supports and straight/cover sections from tray geometry.

## Fittings

Tray endpoints within 0.5 ft of each other form a junction:

| Trays meeting | Result |
|---------------|--------|
| 2, collinear (≤ 10° bend), same width | Splice plate |
| 2, collinear, different width | Reducer |
| 2, angled | Elbow (angle reported) |
| 3 | Tee |
| 4 | Cross |

**Branches off a continuous run.** A tray whose end lands on the *interior* of another tray
(a side branch off a long run) has no matching endpoint on that run, so it is detected
separately: one branch end is a **tee**, and two branch ends meeting from opposite sides at the
same spot are a **cross**. These fittings carry `basis: "branch-on-run"`. Branches whose
ends are not within 0.5 ft of any other tray produce no fitting.

## Supports and sections

Supports are placed at each end plus intermediate supports so no span exceeds the NEMA VE 1
maximum span for the selected load class (reduced when a cable weight per foot is supplied).
Straight and cover sections are counted in standard lengths (12 ft by default).
