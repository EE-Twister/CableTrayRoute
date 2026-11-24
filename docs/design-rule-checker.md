# Design Rule Checker

The Design Rule Checker reviews the current project for supported routing, fill, segregation, grounding, ampacity, conduit-fill, and related data-quality conditions. Findings remain engineering screening results and do not replace a complete code or AHJ review.

## Running a review

The **Run Options** panel opens by default so the primary **Run Design Rule Check** action, tray-fill limit, and optional rule exclusions are immediately available. Run the checker after routing or schedule changes, then review active errors and warnings in the results section above the options.

The export action remains disabled until a review has produced results. Accepted-risk findings require an engineering note and remain stored with the project until they are cleared.

## DRC-03 — Ampacity of cables in cable tray

DRC-03 checks multiconductor power cables routed through cable tray under NEC 392.80(A)(1)(a) and Table 310.15(C)(1):

- The ampacity adjustment applies only to cables with **more than three** current-carrying conductors, and the factor is based on the conductors **in that cable**, not on the total number of conductors in the tray. A 3/C feeder gets no adjustment no matter how many other cables share the tray, and produces no DRC-03 finding unless its load exceeds its ampacity.
- Factors by current-carrying conductors in the cable: 4–6 → 0.80, 7–9 → 0.70, 10–20 → 0.50, 21–30 → 0.45, 31–40 → 0.40, 41 or more → 0.35.
- The Cable Schedule **Conductors** value is counted as current-carrying conductors. Equipment grounding conductors are entered separately as the EGC size. A neutral that carries only unbalanced current (NEC 310.15(E)) does not need to be counted, so the result is conservative for a 4/C cable whose fourth conductor is such a neutral.
- **Parallel Runs** multiplies the cable's ampacity but not its conductor count, because each parallel cable is a separate cable.
- The adjusted ampacity is compared with the first load current found in the design current, load amps, or Cable Schedule **Est Load (A)** fields. A load above the adjusted ampacity is an error. When an adjustment is applied and the load is within limits, the checker reports an informational note with the factor used.

DRC-03 does not apply the single-conductor cable rules of NEC 392.80(A)(2); single-conductor cables in tray are compared against their unadjusted ampacity. It also does not apply covered-tray reductions or ambient-temperature correction. The Auto-Size Equipment page can apply ambient-temperature and single-conductor tray factors when sizing conductors.
