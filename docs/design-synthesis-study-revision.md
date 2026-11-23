# Automatic operating-study revision

Overall review class: **Screening only**.

This milestone connects equipment-to-design generation to balanced load flow.
The intended behavior is to evaluate a generated network's operating voltage,
circuit current with its duty allowance, and source apparent power including
cable losses. A failed operating constraint can drive a revised conductor and
protective selection, with routes, raceways, and the one-line regenerated
together. It does not provide fault coordination or motor starting. The later
[mixed-voltage extension](design-synthesis-mixed-voltage-review.md) adds sourced
transformer trials and primary/secondary conductor revisions under the shared
revision budget.
The later [motor starting and acceleration extensions](design-synthesis-motor-acceleration.md)
also consume this same absolute budget. An unmet starting-voltage, acceleration
duration, or supplied-curve torque constraint can drive affected-path trials;
the operating study is rerun on each candidate. Passing those screens does not
qualify complete motor protection or enable motor Apply.
The optional [cable fault thermal screen](design-synthesis-cable-fault-withstand.md)
also uses this same absolute budget when an evaluated comparison fails. It
raises only failed generated conductors to sourced sizes and regenerates the
design before reevaluating; a zero budget is evaluate-only. Incomplete history,
infeasible routing, or exhausted revisions remains blocked.

As of October 25, 2026, the operating-study method is
`balanced-load-flow-screening-v6`, with solver revision
`load-flow-v4-exact-ideal-cable-tie-contraction`. Supported exact zero-ohm cable
forests are contracted before solving, with original bus loads and individual
cable currents recovered afterward. A group may include one slack bus; cycles,
incompatible voltage bases, merged PV/IBR controls or multiple slack buses are
unsupported and cannot pass. Tiny finite cable impedances remain physical.
This changes numerical conditioning without increasing the iteration,
mismatch, voltage or revision limits. Earlier saved results become stale.

In the synthetic 50-load mixed-voltage regression, the first solution converges
at 0.956361688 pu and fails the original 0.97 pu limit. The existing revision
process then selects the sourced 150 kVA transformer and passes at
0.975462540 pu. This demonstrates the bounded screening workflow, not equipment
qualification. Current numerical examples use the archived Southwire PDF
identified in [the engineering basis](design-synthesis-engineering-basis.md);
earlier verification logs retain their original source/model context.

## Criteria and result interpretation

The additional input is `criteria.loadFlow`:

```json
{ "loadFlow": { "minimumVoltagePu": 0.995, "maxRevisions": 12, "maxIterations": 60 } }
```

The voltage control displays percent; 99.5% corresponds to `0.995` in JSON.
Omitting the minimum uses `1 - voltageDropLimitPct / 100`, with the existing
3% drop default when absent. An explicit minimum cannot loosen that drop
criterion. The default revision budget is 12, adjustable from 0 through 64;
the default solver iteration budget is 60, adjustable from 1 through 200.
Zero revisions evaluates the initial proposal without permitting a retry.
Unknown fields, null values, and nonnumeric values are diagnostics rather than
requests to silently use a default.

The loop operates on the supported balanced three-phase network. Unsupported
phase arrangements, nonconvergence, incomplete model coverage, and nonfinite
results must remain unresolved and block application. An attempt that exhausts
its revision budget is not proof that no feasible physical design exists.
History must identify the stopping condition and retain the tried selections.

Cable changes use successive sourced sizes and preserve terminal/thermal
limits. Low-voltage changes target the source-to-load paths serving affected
buses; source-capacity loss reduction can affect multiple paths. This is a
bounded revision strategy, not a proof of globally minimum cost. It does not
change equipment ratings, source capacity, panel location overrides, permitted
corridors, or the user's limits to produce a pass.

## Engineering basis

The [MATPOWER constant-power load description](https://matpower.app/manual/matpower/Loads.html)
defines loads by real and reactive demand. Its
[AC power-flow formulation](https://matpower.app/manual/matpower/ACPowerFlow.html)
distinguishes solving network power balance from enforcing voltage and branch
limits. That distinction is essential here: convergence alone cannot make a
proposal pass its engineering criteria. These references support the model
basis; they are not a claim that this application was cross-validated against
MATPOWER.

Schneider Electric's
[conductor-sizing methodology](https://www.electrical-installation.org/enwiki/Conductor_sizing:_methodology_and_definition)
describes checking cabling and protection together throughout the distribution
path. This supports re-evaluating dependent selections after a study-driven
change. It does not replace a project's governing code or establish approval.
These primary references were inspected on September 18, 2026.

Nominal current and the existing sourced R/X voltage-drop estimate remain
separate from solved operating current and bus voltage. User load ratings,
source capacity, and design criteria must remain unchanged during revision.
The generator's existing continuous-duty allowance is applied to operating
current as a design check; this is not a protective trip-curve calculation.

## Independently calculated acceptance fixture

The synthetic [25-load input](../samples/design-synthesis-voltage-revision.json)
has one 10 kW, 0.9 power-factor, 480 V three-phase load on each of 25 independent
radial paths. Each path contains a 100 ft feeder and a 150 ft branch. Panel
locations are explicit overrides; permitted corridors are 48 inches wide.
The source is a fixed-voltage slack source. All input ratings are electrical
input power; motor shaft power and starting behavior are not inferred.

Before operating-study revision, each path selects #8 AWG and has 0.9062334521%
linear voltage drop. The shared power-flow solver calculates a minimum voltage
of 0.990847017 pu. Raising the operating criterion to 0.995 pu therefore
requires an actual cable selection change despite the passing 3% linear check.

For each path, independently transcribed Southwire SPEC45301 R/X values are
multiplied by each selected cable's one-way length in thousands of feet and
summed. With per-phase load `p = 10000/3 W`,
`q = p tan(acos(0.9))`, and `w` equal to squared receiving phase voltage:

```text
a = 480²/3 - 2(Rp + Xq)
b = (R² + X²)(p² + q²)
w = (a + sqrt(a² - 4b))/2
receiving voltage pu = sqrt(3w)/480
current A = sqrt(p² + q²)/sqrt(w)
three-phase loss kW = 3 I² R/1000
```

This is a separate quadratic power-balance calculation, not a copy of the
shared solver. It verifies all 25 final load voltages, circuit currents,
aggregate losses, and source power. The current comparison allows 0.004 A for
the shared solver's 1e-6 pu mismatch criterion on its 1 MVA base and two
downstream buses per path. Voltage tolerance is 3e-6 pu, bounded by the same
current residual across the initial #8 path. Aggregate loss tolerance is 1 W; these numerical
tolerances do not describe manufacturer or installation uncertainty.

Other independent cases check a source-capacity limit that includes losses,
continuous-current protective selection without changing unrelated circuits,
bounded revision exhaustion, nonconvergence, malformed criteria, and exact
study-model coverage. Project and browser acceptance must retain these decisions
through named save, undo/redo, and reload, while edits invalidate applicability.

## Corrections found during independent review

- Revision now steps through actual sourced conductor sizes on affected
  source-to-load paths. Thermal and terminal limits remain active; independent
  passing paths retain their selections. The 60 C boundary case reaches
  750 kcmil at its 400 A terminal limit. Independent arithmetic shows that
  600 kcmil narrowly misses the requested 0.99955 pu voltage criterion.
- Operating-current checks and protection preserve continuous/non-continuous
  duty. Accumulated current floors cannot decrease between attempts. Nominal
  current remains separately reported.
- Exhaustion returns the final attempted selections and matching study. If
  raceway capacity blocks regeneration, the attempted design has no inherited
  numerical study result; earlier evaluated attempts remain in history.
  Nonconvergence and incomplete model coverage stop sizing revisions.
- The general Newton solver had the wrong sign for off-diagonal real-power
  derivatives with respect to voltage angle. Differentiating
  `Vi Vj [Gij cos(theta_i-theta_j) + Bij sin(theta_i-theta_j)]` with respect
  to `theta_j` gives `Vi Vj [Gij sin(theta_i-theta_j) - Bij cos(theta_i-theta_j)]`.
  This agrees with the primary
  [MATPOWER power-injection derivatives](https://matpower.org/docs/ref/matpower7.1/lib/dSbus_dV.html).
  The corrected general solver is explicitly tested with radial optimization
  disabled against the independent circuit calculation.
- Exact-zero cable ties now contract only as same-voltage-base forests without
  merged voltage controls. Their original bus and branch identities remain in
  results, and tie currents are recovered by KCL across each unique tree cut.
  Cycles, conflicting bases, and unsupported control merges block the study;
  finite nonzero cable impedance stays in the physical model. The load-flow
  lifecycle and synthesis solver revisions advance so earlier results become
  stale.
- A former routing fixture used 266 kW at 480 V and unity power factor,
  giving 399.942 A at continuous duty before losses. Solved operating demand
  exceeds the catalog's 400 A protective selection and now correctly blocks.
  That case remains as a blocking regression. The routing-only fixture uses
  260 kW (390.914 A nominal design current), still above the hot-route 389.5 A
  limit while allowing a feasible cooler bypass.

Fingerprints include solver/method revision, model inputs, effective criteria,
source capacity, load duty, and cable/protective ratings. Compact project
evidence retains final metrics, bounded history, and actual conductor changes.
The load-flow, contingency, probabilistic-load-flow, and quasi-dynamic lifecycle
calculation revisions were incremented so saved results from the earlier solver
require recalculation.

The solver correction also exposed weak legacy evidence. The old IEEE-14 test
expected 6.9093 pu at bus 14 and did not require convergence. Its input omitted
transformer taps and the bus 9 shunt and contained a spurious branch. The
corrected fixtures transcribe the
[MATPOWER IEEE-14 case](https://github.com/MATPOWER/matpower/blob/master/data/case14.m)
and compare every bus against the
[ITI institutional PSS/E reference](https://raw.githubusercontent.com/ITI/models/master/electric-grid/physical/reference/ieee-14bus/models/ieee-14-bus.raw).
They use a flat PQ voltage/angle start, preserve PV voltage setpoints, and
require convergence with mismatch below 1e-6 pu. Voltage and angle comparison
tolerances are 1e-4 pu and 1e-3 degrees respectively, allowing the published
reference precision. This does not validate the unrelated IEEE-57 placeholder.

The probabilistic load-flow test formerly expected undervoltage from a network
whose voltage remained above 0.999 pu. It now retains that network as a control
and adds a weaker feeder with a separately calculated first-order drop that
crosses 5% in the upper load-distribution tail. Both runs must have converged
scenarios; the stressed case must produce actual voltage violations.

The solver correction also exposed weak legacy evidence. The old IEEE-14 test
expected 6.9093 pu at bus 14 and did not require convergence. Its input omitted
transformer taps and the bus 9 shunt and contained a spurious branch. The
corrected fixtures transcribe the
[MATPOWER IEEE-14 case](https://github.com/MATPOWER/matpower/blob/master/data/case14.m)
and compare every bus against the
[ITI institutional PSS/E reference](https://raw.githubusercontent.com/ITI/models/master/electric-grid/physical/reference/ieee-14bus/models/ieee-14-bus.raw).
They use a flat PQ voltage/angle start, preserve PV voltage setpoints, and
require convergence with mismatch below 1e-6 pu. Voltage and angle comparison
tolerances are 1e-4 pu and 1e-3 degrees respectively, allowing the published
reference precision. This does not validate the unrelated IEEE-57 placeholder.

The probabilistic load-flow test formerly expected undervoltage from a network
whose voltage remained above 0.999 pu. It now retains that network as a control
and adds a weaker feeder with a separately calculated first-order drop that
crosses 5% in the upper load-distribution tail. Both runs must have converged
scenarios; the stressed case must produce actual voltage violations.

## Verification status

Verified September 18, 2026:

- Full `npm test`: all 414 discovered Node test files executed and passed.
- Full `npm run build` and `npm run lint`: passed on the corrected production
  source, including calculation-revision invalidation.
- All 56 selected Edge cases were verified. The combined run passed 55/56;
  one new assertion incorrectly expected a placeholder after stale results
  had been removed. Correcting the assertion to require an absent study table,
  disabled downloads/Apply, and changed-input status yielded 6/6 passing new
  revision cases. No production code changed between those browser runs.
- Independent numerical, final-attempt, and lifecycle checks passed. A focused
  final rerun includes the flat-start IEEE-14 comparison, the probabilistic
  control/stress test, all 12 study-revision cases, and stale-result handling.
- The 25-load fixture changes all 50 conductors from #8 to #4 AWG in two
  revisions. With the frozen Southwire PDF values, minimum voltage improves
  from 0.990847017 to 0.996260870 pu; losses fall from 2.679712495 to
  1.079732821 kW. Final source demand is 278.820323285 kVA. The inputs retain
  their original ratings and limits.
- Named-project Apply/reload preserves compact evidence. Real-storage tests
  verify undo/redo, round-trip persistence, and quota-failure rollback; the
  50-load storage acceptance remains within its 5 MiB budget.
- The revision table screenshot was inspected: voltage, utilization, source
  demand/losses, revision count, and conductor changes are readable. Its tall
  capture includes an existing sticky-navigation overlay across budget rows;
  this capture is not evidence that the overlay behavior was changed.
- Page-contract audit and `git diff --check`: passed. Firefox was not
  revalidated; this browser evidence is for Edge.

Logs, screenshots, and numerical summaries are retained under
`output/design-synthesis-study-revision-2026-09-18/`: `node-verified.log`,
`build-verified.log`, `lint-verified.log`, `browser-verified.log`,
`browser-revision-final.log`, `independent-final.log`, and `numeric-final.json`.
Earlier failed/interim logs are retained to distinguish the review findings
from final outcomes. Fixture source metadata identifies the external reference
data; the synthetic 25-load case does not represent an installed facility.

This completes the balanced operating-study revision milestone. The overall
equipment-to-full-industrial-design goal remains open. The October 18
mixed-voltage verification separately establishes bounded 480/208 V transformer
synthesis; these September tests do not establish that extension. Arbitrary
voltage arrangements, motor/protection integration, detailed construction-matched
thermal selection, and construction drawing packages remain open. The overall
classification remains **Screening only**.
