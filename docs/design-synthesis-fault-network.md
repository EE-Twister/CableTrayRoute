# Explicit initial fault-network screening

Overall review class: **Screening only**. This optional Design Synthesis study
calculates balanced positive-sequence, three-phase bolted-fault initial
symmetrical RMS current. It does not complete motor protection, select devices
from total fault duty, or enable motor Apply.

The subsequent [proposed-device current screen](design-synthesis-device-fault-screen.md)
adds explicit proposed source-end locations and separate line-terminal and
through-device initial-current comparisons. It retains these scope limits.

The [operating-scenario extension](design-synthesis-fault-scenarios.md) repeats
this study for two through four supplied source conditions and records observed
bus/device envelopes. It does not derive standards-based fault extrema or change
the legacy single-study input.

## Workflow and input

Choose **Load motor fault network sample**, then expand **Advanced fault network
JSON**. The sample has 25 loads and explicitly synthetic utility and motor
equivalents. Its references are demonstration labels, not field or manufacturer
data. Generate, inspect the fault-bus cases and separate contribution/terminal
tables, and download the JSON or readable report. Editing the input invalidates
the previous result. Blank JSON omits the optional study. Invalid JSON is retained
for correction and produces blocked diagnostics rather than numeric results.

The optional top-level `faultStudy` input is:

```js
{
  networkBaseMVA: 1,
  sourceInventory: { status: 'complete', reference: 'Inventory document' },
  sources: [{
    equipmentId: 'S',
    emfPhaseV: { re: 480 / Math.sqrt(3), im: 0 },
    impedance: { rOhm: 0.006, xOhm: 0.015 },
    inService: true,
    reference: 'Explicit initial-current equivalent and applicability'
  }],
  // Optional faultBusIds: otherwise every generated bus is studied.
  // Required when a transformer exists, including for a zero-degree assumption:
  // transformerPhase: { degrees: 0, reference: 'Referenced phase assumption' }
}
```

Numbers above illustrate units only. Every known generated motor and the utility
must have exactly one explicit equivalent, including an explicit out-of-service
record for a stopped source. Unknown sources, missing known motors, incomplete
inventory, invalid types and unknown fields block the study. A complete inventory
is supplied metadata; its verification status remains `not-verified`. Sources
outside the supplied equipment list cannot be discovered by the application.

EMF is a complex phase-to-neutral RMS voltage in volts, with magnitude equal to the
utility nominal or motor rated-voltage basis. Source R/X is in ohms on its own
bus base. The adapter requires passive R/X and a nonzero impedance. The utility
source-only implied current is checked against the supplied external utility
fault-current bound; the combined motor-plus-utility result is a different
quantity. Starting source R/X, locked-rotor current and generic motor multipliers
are never substituted for missing fault-source data.

## Network and calculation basis

`analysis/designSynthesisFaultStudy.mjs` builds the network from the final proposal
after operating and starting revisions. It uses actual conductor selections,
routed lengths, sourced cable R/X and the final transformer series model. It
crosschecks the generated one-line representation. A transformer phase assumption
is explicit; winding connection labels do not supply a clock displacement.

`analysis/faultNetwork.mjs` exports `solvePositiveSequenceBoltedFault(input)`.
It uses a common three-phase MVA base, each bus's nominal line-to-line voltage,
complex nodal admittance equations, and a zero-voltage fault bus. In ohmic units,
`Zbase = VLL² / (MVA × 10⁶)` and `Ibase = MVA × 10⁶ / (sqrt(3) × VLL)`.
Finite branches support meshes and a from-side complex off-nominal tap. Branch
impedance is specified on a named nominal endpoint voltage base and converted
to per unit; its series element is on the to-side of the ideal tap. The nominal
reference convention does not recalculate a physical off-nominal winding's R/X.

Exact zero-impedance, same-voltage, unity-tap tie forests are contracted. Original
fault location is retained and unique tie currents are recovered using KCL.
Ideal tie cycles, unfed islands, singular equations and unrepresentable values
block the calculation; no epsilon impedance is introduced. Bounds are 250 buses,
1,000 branches and 250 sources. The core accepts a supplied partial/unknown
inventory as metadata; the synthesis adapter requires complete coverage.

Per-source fault contributions use superposition with the other in-service
source EMFs set to zero and their internal impedances retained. Contributions
sum as complex phasors, not as magnitudes. Actual source-terminal currents are
reported separately. Branch terminal signs point into the branch; source current
points into the network. Different voltage levels have different ampere bases.
Out-of-service sources are open circuits. Ordinary load current is omitted from
this initial short-circuit network. The core solver also accepts an in-service
zero-EMF source for explicit source-history evaluation; its internal impedance
remains connected. The synthesis adapter still requires every initial source
equivalent to have its positive canonical rated-voltage magnitude.

Row scaling, pivot checks, equation residuals, KCL and complex superposition
checks guard the solve. Rounding budgets use pre-cancellation equation terms;
healthy unloaded branches and nearly opposing sources must not fail just because
their resulting current is small.

## Results, persistence and limits

`faultStudyValidation` retains method, scope, source coverage, source references,
a model fingerprint and per-bus cases. Each evaluated case includes complex fault
current, per-source contributions, source-terminal currents, branch-terminal
currents and bus voltages. The full downloaded JSON retains these details.

For otherwise eligible nonmotor proposals, Apply writes a compact
`designSynthesisFaultStudyValidation` record through the shared project APIs in
the same undoable mutation. It retains explicit source inputs, fingerprint,
limitations, per-bus fault/source magnitudes and every branch-terminal magnitude.
A shared `branchIds` list and exact Float64 value dictionary identify the branch
matrix. Directly persisted fault-study records encode the little-endian Float64
dictionary, branch indexes, and source-terminal currents with the versioned
UTF-15 byte encoding. Branch indexes use a bounded LZ byte stream before
encoding; the original floating-point values are preserved. Legacy Base64
records remain readable. Fault studies nested in packed scenarios retain their
Base64 inner encoding.
`resolveDesignSynthesisFaultBranchCurrents(savedStudy, savedCase)` restores each
branch identity and its from/to magnitudes. Actual source-terminal magnitudes
are retained separately in a versioned Float64 matrix; use
`resolveDesignSynthesisFaultSourceTerminalCurrents(savedStudy, savedCase)` to
restore their source identities and values. Invalid encodings return `null`.
These are initial RMS currents, not interrupting or thermal duty. Repeated bus
voltages and complex output phasors remain in the complete proposal export.
Magnitudes must not be arithmetically summed as source contributions. Regenerating without
the study removes its saved summary; undo restores it. Failed durable saves
roll back Apply.

The saved summary describes the applied generation. Regenerate after editing
project data to obtain current fault-network evidence.

The existing legacy short-circuit API keeps its local-equivalent behavior. This
new explicit study does not reinterpret old projects or change legacy calculations.
It does not establish maximum/minimum cases, voltage factors or impedance
tolerances, motor decay, drive behavior, negative/zero sequence, grounding,
peak/momentary or timed interrupting current, thermal withstand, protective
clearing, coordination, assembly SCCR, or code compliance. Exact motor/device
data and those additional checks remain necessary for complete protection.

The additive `preparePositiveSequenceNetworkLinearResponse(input)` API shares
the same strict network validation, ideal-tie contraction, per-unit bases and
admittance stamps. It accepts explicit original `responseBusIds` and
`targetBranchIds`, with no fault or probe-source records. One elimination solves
all source and unit-current injection columns under the existing pivot and
residual tolerances. Its serializable output includes per-source unfaulted
voltage and branch-current contributions, port impedance columns, original-node
ideal-tie current transfers, and all bus voltage/current bases. Out-of-service
sources have explicit zero rows. Identical voltage ports in a contracted group
can have different ideal-tie current transfers because injection location is
retained. The [continuous cable thermal screen](design-synthesis-cable-fault-withstand.md)
uses this transient operator; the original bolted-fault API and output contract
remain unchanged.

## Evidence and verification

Independent analytical fixtures cover remote infeed, shared-path current division,
complex mixed-voltage taps, finite meshes, exact ideal ties, out-of-service
sources, invalid coverage, numerical cancellation and MVA-base invariance.
The earlier reproduction now has a network result of 15.988161301 kA upstream
and 8.313843876 kA at the motor bus, using explicitly stated synthetic inputs.
Generated 25/50-load checks independently use final bypass lengths and conductor
R/X. Storage acceptance exercises expansion, 50 mixed-voltage loads, exact
branch/source-current recovery, undo/redo, study omission and rollback under a
5 MiB budget. Long-stream codec checks cross the 65,535-byte back-reference
window. Numerical-range checks prevent unrepresentable source injection or
current conversion from appearing as an evaluated zero. Browser and full regression results are recorded
in the evidence directory after final verification.

Final verification on October 20, 2026 passed all **441 Node test files**, **42
focused cases**, and **66 selected Edge browser cases**, plus build, lint and
whitespace checks. The final manifest indexes 441 suites, 13,301 static assertions
and 25 benchmarks; these indexing counts are not a runtime accuracy claim.
All 14 frozen source/test hashes matched after verification. The rendered
fault-current tables and downloaded readable report were inspected. The
nonmotor browser journey verifies named-project Apply and reload; the motor
journey verifies blocked Apply, changed-input freshness and invalid-input
diagnostics.

The bounded storage fixtures use 4,079,328 bytes for the 25-to-50-load expansion
and 5,230,028 bytes for the 50-load mixed-voltage project, including canonical
and named snapshots, against a 5,242,880-byte test budget. These are fixture
measurements, not a storage guarantee for projects with additional data.

Final logs are `node-confirmed.log`, `focused-confirmed.log`,
`browser-confirmed.log`, `build-confirmed.log`, and `lint-confirmed.log`.
`verification.json` records scope, hashes, storage measurements and superseded
attempts. Earlier browser failures involved an ambiguous dialog locator and a
test-only URL mode during project creation; the final normal journey passed.
The source range and storage regressions remain covered by the added tests.

Evidence directory: `output/design-synthesis-fault-network-2026-10-19/`.
See also the [original fault integration review](design-synthesis-fault-integration-review.md).

Primary sources used to define the model boundary:

- [Thurner and Braun, 2018](https://arxiv.org/html/1802.01502), source/branch
  network modeling and distinct fault-current quantities. Published equations
  were checked against independently derived circuits rather than copied blindly.
- [ABB QT2, 1SDC007101G0202](https://library.e.abb.com/public/2c522f583c884a4fbdf3968e1fdf1481/1SDC007101G0202.pdf),
  printed pages 15 and 25: motor infeed and approximate examples. Its typical
  multipliers are not exact motor data or guaranteed maximum-current bounds.
- [Pandapower motor model documentation, 3.5.6](https://pandapower.readthedocs.io/en/v3.5.6/elements/motor.html),
  explicit motor model inputs. No cross-tool validation is claimed here.
- [ABB motor-protection input guidance](https://new.abb.com/medium-voltage/digital-substations/protection-relays/motor-protection-and-control),
  separate starting and thermal-withstand inputs beyond initial current.
