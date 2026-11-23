# Design Synthesis study handoff and equipment accounting

Overall review class: **Screening only**. Generated drawings and schedules must
retain the electrical model needed by downstream studies. A successful diagram
render does not establish that its study model is correct.

## Verified defects and intended correction

An independent probe of the original 30-load generated drawing found 35 model
buses but 29 spurious branch records identified as the source and panels,
instead of the 34 generated cables. Cable lengths and impedance were missing
from the drawing projection. Load flow reported zero cable losses and nearly
unity voltage at every bus, with 63 ideal-tie warnings, despite an 876 kW load.

The corrected handoff gives source, panel, and load nodes explicit electrical
bus roles while preserving their drawing types. Direct cable connections form
one study branch per physical circuit. The source is the slack bus; constant
real/reactive load is retained at each load bus exactly once. Both component
connections and the sheet connection list describe the same graph and must
not create duplicate branches. Selected cable ampacity is retained as branch
rating metadata in the model and results; this change does not add an automatic
overload decision or imply that all generic branch ratings have ampere units.

The model carries cable length and sourced resistance/reactance. Per-conductor
series impedance in ohms is the manufacturer's ohms per 1,000 feet multiplied
by actual one-way route length in feet divided by 1,000. A genuinely zero-length
connection remains an ideal tie; positive-length cable must retain impedance.
The same information must survive Apply, named save/import, and ordinary
navigation to the Load Flow page.

Canonical cable identities are normalized during Apply. The model matches
case-variant connection references so they cannot create a second zero-impedance
connection for the same cable. Canonical cable ampacity takes precedence over
older drawing metadata.

Browser verification exposed the standalone study page's former 20-iteration
budget as insufficient for the generated sample. Its default budget is now
60 iterations with the same convergence tolerance, and effective options are
recorded in study provenance. An explicit smaller caller budget can still
produce a nonconverged, unsaved result.

The named-project browser check also exposed a freshly saved result becoming
stale because its hash included optional fields that JSON storage omits. The
Load Flow save boundary now hashes and stores the same JSON representation.
This preserves result-change detection and does not bypass stale-input export
guards. The browser acceptance uses real named-project creation, rather than
the synthesis page's test-only context, to exercise this path.

## Independent numerical evidence

Southwire [SPEC45301](https://cabletechsupport.southwire.com/en/tile/9/spec/45301/?country=US)
provides the construction-specific 75 C AC resistance and 60 Hz inductive
reactance used by the generator. The archived rev1.000.008 PDF lists stock
606939 #8 copper MC values of 0.810 and 0.052
ohm/1,000 ft. A 150 ft circuit therefore has `Z = 0.1215 + j0.0078` ohm per
phase. The 600 kcmil stock 890391 values are 0.024 and 0.039 ohm/1,000 ft.

For a balanced 10 kW, 0.9 lagging-power-factor load at a 480 V source, an
independent two-bus calculation uses phase quantities. Let `P` and `Q` be the
per-phase load watts and vars, `Vs = 480/sqrt(3)`, and `w = |Vr|²`. Power balance
gives:

```text
w² + [2(RP + XQ) - Vs²]w + (R² + X²)(P² + Q²) = 0
```

The high-voltage root determines receiving voltage; current is `|S|/sqrt(w)`
and three-phase copper loss is `3 I² R`. The acceptance test compares shared
solver voltage, current, and losses against these separately derived values.
For this fixture they are 477.450400 V line-to-line, 13.435957 A, and
0.063851670 kW. Numerical tolerances check the equation implementation with
fixed nominal inputs; they do not describe manufacturer or field tolerances.
The sample also checks total kW/kvar, exact branch identities, and source
power equal to load plus losses.

Named-project storage retains complete input evidence and selected-device
evidence. Repeated physical metadata in the derived drawing and repeated route
thermal detail are compacted; canonical cable records retain the full thermal
assessment. The 50-load storage acceptance budget remains 5 MiB, including the
named project snapshot.

[MATPOWER's load model](https://matpower.app/manual/matpower/Loads.html) describes
constant real and reactive demand at each bus, and its
[AC power-flow formulation](https://matpower.app/manual/matpower/ACPowerFlow.html)
describes the power-balance solution. These references support the model basis;
the application is not represented as cross-validated against MATPOWER.

## Rejected and deferred equipment

Every input equipment array entry receives a disposition, including invalid
objects, null entries, and duplicate identities. The JSON `inputIndex` is
zero-based; workspace and text report row numbers are one-based. Original
input values and applicable issues remain available for correction.

`accepted` means the generator incorporated that load in the proposal;
`rejected` identifies a row with blocking equipment issues; `deferred` means
generation cannot currently establish an accepted result, including global
input blockers. These are generation states, not engineering approvals.
Blocked drafts remain downloadable for diagnostic review and cannot be applied.

## Boundaries and verification

This section describes the handoff milestone's original verification. The later
[automatic operating-study revision](design-synthesis-study-revision.md) adds
generation-time balanced load-flow revision and supersedes the absence of an
automatic loop noted below. Separate study pages still require explicit design
regeneration. Its verification is recorded separately.

The handoff uses the existing balanced constant-power solver and stated cable
construction assumptions. It does not add motor-starting dynamics, source
impedance, automatic transformer synthesis, protective coordination, or an
automatic study-driven revision loop. Load-flow calculations do not replace
the explicit source fault-current basis used for protective-device candidates.

Final verification on September 18, 2026:

- `npm test`: all 405 discovered Node test files executed and passed.
- `npm run build` and `npm run lint`: passed on the final production source.
- Edge: 38/38 selected cases passed across Design Synthesis, the new study
  handoff/disposition cases, workflow contracts, and the analysis pages.
- The handoff case creates a real named project, applies the proposal, runs
  the ordinary Load Flow page, verifies a current saved result with 35 buses
  and 34 circuits, downloads a PDF, then verifies that editing an input
  disables export. It also checks cable ratings and power balance.
- Node coverage verifies saved/reloaded impedance, distinct circuit identities,
  25/30/50-load convergence at 1 and 100 MVA bases, explicit insufficient
  iteration limits, storage freshness, and the unchanged 5 MiB budget.
- The 30-load sample produces 876 kW of load, 6.629862 kW of cable losses,
  and a minimum bus voltage of 0.985179 pu. One actual zero-length circuit
  remains an explicitly identified ideal tie.
- The Load Flow and deferred-row screenshots were inspected. The tall result
  screenshot includes the existing sticky header at its top; the electrical
  result tables remain visible.
- Firefox could not create a blank page (`browserContext.newPage` failed
  before application navigation). Firefox acceptance remains unverified.
- `git diff --check`: passed.

Evidence is under `output/design-synthesis-handoffs-2026-09-18/`:
`node-lifecycle-final.log`, `build-lifecycle-final.log`,
`lint-lifecycle-final.log`, `browser-complete-final.log`,
`firefox-check.log`, and `sample-numerical-evidence.json`.
Earlier failed logs remain available: they document the insufficient page
iteration budget, result-serialization mismatch, and corrected test setup.
Earlier build attempts also encountered a transient asset-manifest filesystem
write error; the final complete build exited successfully.

The overall equipment-to-design goal remains open. This study-handoff review
predates the explicit panel-location override implementation. Its verification
is tracked separately in [panel-location overrides](design-synthesis-overrides.md)
and the [acceptance contract](design-synthesis-acceptance.md).
