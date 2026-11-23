# Bounded equipment protection-curve comparisons

Review class: **Screening only**. This correction strengthens the protection
calculation path needed by the [equipment-to-design goal](design-synthesis-acceptance.md).
It does not establish complete motor protection, verify clearing-time semantics,
or enable motor Apply.

Subsequent [motor curve-source research](design-synthesis-protection-curve-research.md)
archives and transcribes a matching Siemens 30 A graphic. Its separate nominal
thermal and instantaneous fragments remain research geometry; they do not alter
the bounded comparisons or their readiness limits described here.

## Corrected behavior

The TCC equipment checks previously called a helper that clamped currents to the
nearest curve endpoint. A motor start or damage comparison outside the available
curve domain could therefore report an evaluated result using an unsupported
endpoint time. Damage checks also selected the shorter time at duplicate-current
points, and examined only the equipment curve's points. A longer protective time
at a vertical boundary, a protective knot between equipment points, or an
interior limiting difference could be missed.

`analysis/tcc/equipmentConstraintModel.mjs` retains topology and association,
with bounded mathematics in `equipmentCurveConstraintModel.mjs` and pure check
formatting in `equipmentConstraintPresentationModel.mjs`. Existing module-size
limits are retained; the new pure modules have their own bounded, DOM-free checks.
The calculation now uses bounded curve evaluation.
Ride-through compares the lower protective boundary with the stated start or
inrush duration at the stated current. Damage comparison uses the upper
protective boundary against the lower damage-reference boundary over the full
explicit damage-reference current domain. An exact single-current reference can
be evaluated without claiming coverage of an interval.

Missing, malformed or out-of-domain evidence returns `status: review`,
`screeningStatus: unknown`, null time and margin, and a reason with required and
available current ranges. Invalid interior points cannot disappear to create a
passing interpolated segment. A valid overlap does not establish coverage of an
uncovered part of the equipment-reference domain. Ambiguous or missing upstream
device associations retain their existing review status.

Evaluated results retain the legacy `tripTime` and `margin` fields for consumers;
the former is the selected protective-curve time, not a new assertion of physical
clearing time. Damage evidence names `damage-limit-vs-upper-protective-curve` and
`limitingComparison.protectiveUpperTimeS`. Coverage records the checked interval
and candidate count. No manufacturer data, default instantaneous delay, generic
curve tolerance, device approval or catalog readiness is created by this module.
It consumes already-scaled curves and does not independently validate upstream
curve normalization, synthesized instantaneous branches or tolerance assumptions.

The chart's equipment metrics and review-package HTML show unknown checks with
coverage details and no numeric time or margin. Evaluated wording describes the
plotted curve and equipment reference, with an explicit caveat that this does not
verify clearing time or complete protection. Existing candidate and export
readiness gates remain in place.

## Continuous comparison and independent checks

Between knots, both curves use the existing log-current/log-time interpolation.
On each common interval they are power functions, `D(I) = A I^p` and
`P(I) = B I^q`. The minimum difference `D - P` occurs at an interval endpoint or
an interior point satisfying `A p I^(p-1) = B q I^(q-1)`. The implementation
examines combined equipment/protective knots, conservative vertical-boundary
values, and any valid stationary point. It does not rely on a sparse current
sweep or clamp outside either curve.

The root acceptance tests independently derive examples, including:

- Protective current domain 100–1,000 A: 50 A and 1,500 A requests remain unknown.
- A 500 A vertical upper boundary at 1 s exceeds a 0.4 s damage reference by
  0.6 s, even when the lower boundary is 0.2 s.
- A 300 A protective knot at 2 s exceeds a flat 1 s damage reference although
  both endpoints appear below it.
- With `x = I / 100`, `D = 4/x²` and `P = 4/x`, the worst margin is −1 s at
  200 A, rather than the endpoint-only −0.36 s at 1,000 A.
- A further 147 combinations of independently normalized power-law slopes and
  scales check interval minima. These are mathematical fixtures, not manufacturer
  curve or installation validation.

## Manufacturer source discovery

The [Eaton F-frame collection, TC01200002E, April
2022](https://www.eaton.com/content/dam/eaton/products/electrical-circuit-protection/molded-case-circuit-breakers/series-c-molded-case-circuit-breakers/f-frame-time-current-curves-tc01200002e.pdf)
identifies these multi-pole curve locations:

| Candidate | Curve | PDF page |
| --- | --- | ---: |
| FD3020 | TC012037EN | 32 |
| HFD3080 | TC012046EN | 41 |
| FD3125 | TC012031EN | 45 |
| HFD3150 | TC012032EN | 46 |
| FD3175 | TC012033EN | 47 |
| HFD3200 | TC012034EN | 48 |
| FD3225 | TC012035EN | 49 |

These are source locations, not digitized numeric data. The plots distinguish
minimum/maximum tolerances and single-pole trip-time annotations, with stated
test conditions. An upper tolerance boundary must not silently become a
guaranteed total-clearing-time envelope. Exact configuration, applicability and
curve semantics need verification before numeric use.

[Eaton K-frame TD012034EN, September
2015](https://www.eaton.com/content/dam/eaton/products/electrical-circuit-protection/molded-case-circuit-breakers/series-c-molded-case-circuit-breakers/k-frame-time-current-curves-td012034en.pdf),
PDF page 17, identifies SC-4118-87B for the relevant KDB/KD/HKD/DK family and
250/400 A scope. Its percentage-current axis and pickup applicability require
exact-part review; it is not a substitute for the installed KDB3400 configuration.

The [Siemens 3VA selectivity guide](https://cache.industry.siemens.com/dl/files/282/109983282/att_1316082/v1/SIE_PG_3VA_SelectivityGuide.pdf)
links EasyTCC and provides curve-comparison examples. Its tables assume maximum
adjustable settings; they cannot be transferred to the proposed 150 A TM230
instantaneous setting without individual evaluation. The referenced EasyTCC
package returned HTTP 403 in this research attempt. The guide was archived at
`output/design-synthesis-protection-curves-2026-10-20/sources/siemens-selectivity-guide.pdf`
(SHA-256 `a5d85c29241b5589804f3f8b49ace3185a9f3cad8488d12052af80054e95f0cd`).

The [Siemens 3RU2/3RB3 manual, September
2014](https://cache.industry.siemens.com/dl/files/164/60298164/att_95533/v1/manual_overload_relay_3RU2_3RB3_en-US.pdf)
labels its 3RU21 time-current diagram as schematic and discusses different hot,
cold and phase-loading behavior. It does not supply an exact numerical trip band
for the selected relay and setting here.

Eaton documents were accessible through web text retrieval, but local archival
downloads failed at DNS/transport. Their graphics have not been independently
digitized or spot-checked in this step. No numeric curve points were added to
`data/protectiveDevices.json`, and no research record was promoted. The next data
step is an exact-configuration, source-geometry transcription with independent
spot checks and verified trip-versus-clearing semantics. Motor acceleration,
thermal limits, fault-duty cases and coordination still require their own data
and evaluation.

## Verification record

Current evidence is retained under `output/tcc-equipment-protection-2026-10-21/`.
Final verification passed all 446 Node test files, 16 focused Node cases, and
25 distinct selected Edge cases. The equipment coverage/export journey also
passed a repeat run that retained its screenshot and downloaded HTML. Build,
lint, architecture and whitespace checks passed with existing budgets intact.
Root independently reproduced four old caller defects and inspected the rendered
unknown checks and exported coverage wording. The source snapshot records 17
files; final test-only changes retained screenshots and clarified curve semantics.

Earlier failures are retained in the evidence directory: the first lint run
exceeded existing module limits before helper extraction; an initial full Node
run found stale generated page-contract documentation; and the first browser run
attempted Export Review before opening its menu. The canonical audit generator
updated source locations, and the browser test now opens Export through normal
navigation. The final runs supersede those failures. No engineering expectation
or module budget was weakened to obtain a pass.

The full equipment-to-electrical-design objective remains active. This milestone
corrects bounded comparisons of supplied curves; it does not complete source
curve qualification, motor protection or issued-design readiness.
