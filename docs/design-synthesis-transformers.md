# Transformer foundation for mixed-voltage design

Overall review class: **Screening only**.

This work corrects the shared load-flow transformer model and its result
presentation. Automatic Design Synthesis now supports bounded screening for
480 V delta to 208Y/120 V mixed-voltage proposals, using the dated 2020 copper
profiles at 30, 75 and 150 kVA. It generates separate primary and secondary
feeders and protective-device selections, then checks the connected network
against the original source-to-load voltage criterion. These features remain
screening only and do not establish installation suitability, coordination,
or code compliance.

## Corrected calculation behavior

Transformer branches report separate `fromCurrentA` and `toCurrentA`, using
each terminal's voltage base. Legacy `amps` remains the from-terminal current.
`fromPowerKW`, `fromPowerKvar`, `toPowerKW`, and `toPowerKvar` are signed into
the branch. Their sums are branch real losses and reactive absorption, including
shunts. The source totals must balance these same powers.

The complex off-nominal tap is `t = ratio * exp(j * angle)`. Terminal currents
use the two-port branch equations documented in
[MATPOWER makeYbus](https://matpower.org/docs/ref/matpower7.0/lib/makeYbus.html).
The from shunt is behind the ideal tap: both its admittance contribution and
its current transform with the tap. Earlier flow reporting omitted the conjugate
tap divisor; independent review additionally found inconsistent shunt placement
between the admittance matrix and reported flows.

`fromKV` and `toKV` retain actual physical terminal voltages. Voltage drop now
compares `Vm_from / |t|` with `Vm_to`; `dropKV` expresses this difference on
the receiving voltage base. `dropBasis` retains those per-unit values. Normal
480-to-208 V transformation therefore is not reported as approximately 57%
voltage drop. Transformer result rows identify both currents and the drop basis.

## Explicit input fields

Transformer components may carry `coreLossKw`, `magnetizingKvar`, and
`phaseShiftDeg`. The two loss inputs must be nonnegative finite values and are
constant-admittance excitation powers at rated internal voltage. Their actual
power scales with `|Vm_from / t|²`; they are not fixed-power loads and do not
represent saturation or inrush. A supplied explicit shunt cannot be combined
with these named losses. Missing values remain unmodeled; no manufacturer
magnetizing current or loss is inferred.

Positive `phaseShiftDeg` means unloaded secondary voltage leads primary
voltage. It maps to `tap.angle = -phaseShiftDeg`. Winding connection names
alone do not determine this sign. Explicit tap angle and named phase shift
cannot both be supplied. Invalid values are rejected rather than extracted
from partial text or silently replaced. Imported/project component data uses
these fields; adding complete transformer property-editor controls remains
part of the later design integration.

Existing percent-impedance input fallback behavior is retained for legacy
models. Its assumed resistance split must not be presented as sourced
manufacturer X/R in future automatic selection.

## Independent evidence and verification

`tests/transformerFoundationAcceptance.test.mjs` independently solves the
two-bus constant-power circuit with a scalar voltage quadratic on the secondary
side. It checks nine combinations of 0.95/1.00/1.05 tap and -30/0/+30 degree
phase shift at two system MVA bases. Assertions cover both currents, physical
voltage, phase angle, terminal powers, excitation and series losses, source
power balance, and input immutability. An unloaded case checks excitation and
zero series drop. The fixture is synthetic and is not a manufacturer benchmark.
The established solver tolerance remains 1e-6 pu. At the largest tested 1 MVA
base, this permits 1 W residual in each power component; the 0.005 A current
tolerance accounts for that residual at the lowest tested secondary voltage.

Focused adapter tests cover malformed inputs and orientation. Lifecycle
revisions invalidate earlier saved load-flow and directly dependent study
results. The synthesis solver fingerprint also advances to `load-flow-v4`.

The load-flow solver contracts cables only when their modeled series impedance is explicitly finite and exactly zero on both axes. Supported same-voltage-base cable ties are solved as ideal node equivalences, with each original bus retained in results and tie currents recovered from KCL over a forest. Tiny but finite cable impedances remain in the physical network model. Tie cycles, incompatible bases, or merged voltage controls are reported as unsupported and cannot pass the study.

Verification completed September 25, 2026:

- All 418 discovered Node test files passed, including the independent
  transformer arithmetic and tap-review freshness checks. Full lint passed.
- The full build completed bundling and bundle-budget checks, then failed
  opening `docs/asset-manifest.json` during asset copying. Retrying the asset
  step succeeded; the remaining HTML rewrite, validation-manifest generation,
  and HTML asset audit also passed. No production source changed between the
  failed asset step and recovery. This is a recovered staged build, not a
  claim that the initial `npm run build` exited successfully.
- All 58 selected Edge regression cases passed, covering load-flow/short-
  circuit pages, Design Synthesis, study revision/handoff, and workflow
  contracts. The additional transformer tap-review case passed after correcting
  two ambiguous test-only Close-button selectors. It verifies stale evidence
  before approval, evidence changing while the dialog is open, and successful
  application after a fresh review.
- The actual downloaded one-page PDF was parsed and rendered for visual
  inspection. Its branch row retains both terminal currents (36.2 A / 83.5 A),
  the 0.22% (0.5 V) drop, and the complete rated-voltage terminal basis. No
  corrupted arrow/Delta characters remain in that row. The report still uses
  a plain text layout with detailed lifecycle metadata.
- Page-contract and architecture checks, plus `git diff --check`, passed.
  Browser verification is for Edge; it does not establish Firefox acceptance.

Evidence is retained under
`output/design-synthesis-transformers-2026-09-25/`: `node-final.log`,
`lint-final.log`, `build-final.log` (including the original asset failure),
`assets-retry.log`, `browser-verified.log`, the `tap-browser-agent/` results,
and `pdf-verified-1.png`. The downloaded PDF is in `browser-results/`.

The September 25 completion review also covers the exported report and saved
tap recommendations. Reading the actual downloaded PDF exposed unsupported
symbols that corrupted the branch row and disrupted its extracted text.
Report text must retain both
terminal currents and the complete voltage-drop basis in the generated file.
Checking only a successful download does not establish that evidence.

Transformer Tap Review calls the same load-flow solver through the One-Line
worker. Its stored calculation revision must therefore change with these
corrections. A matching drawing revision alone is insufficient to authorize an
old recommendation: the stored study must be current, and the recommendation
must still match it when the user confirms Apply. This workflow remains
distinct from automatic transformer selection and retains its separate
review/apply guard.

## Data sourcing and remaining integration

Eaton's public
[Basics of Power System Design, Table 32](https://www.eaton.com/content/dam/eaton/products/design-guides---consultant-audience/eaton-basics-of-power-system-design-dg081001en.pdf)
provides typical impedance data for a 600 V primary-class dry-type family.
These family values are not certified data for a selected catalog unit.
Separately sourced loss and product-identity data require reconciliation before
creating a selection record; values from different editions must not be merged
as though they describe a tested unit. No magnetizing-current data has yet been
verified for the candidate units.

The coupled network, stable transformer identity, separate primary/secondary
cable/protection bases, core-loss contribution, catalog profile evidence,
bounded profile and cable revision, and independent 25/50-load voltage/current
acceptance are implemented as screening features. Ground-fault and
asymmetrical duty, motor starting, coordination, grounding design, installation
details, and construction deliverables remain outside this model and part of
the full industrial-design objective.
