# Supplied source-history fault-current comparison

Overall review class: **Screening only**. This optional study evaluates the
existing explicit positive-sequence fault network at user-supplied complex
source-EMF histories and attaches the resulting signed histories to the exact
final proposed device current paths. It does not calculate device operation or
enable motor Apply.

## Input contract

The top-level optional `faultEvolution` input is used with one existing
`faultStudy`; it cannot be combined with `faultScenarios`. Each explicit source
equivalent requires exactly one history:

```js
{
  schemaVersion: '1.0.0',
  horizonS: 0.1,
  reference: 'Referenced operating-condition study',
  profiles: [{
    equipmentId: 'MOTOR-1',
    source: { reference: 'Source-history evidence', evidenceClass: 'external-study' },
    conditions: {
      ambientTemperatureC: 40,
      frequencyHz: 60,
      phases: 3,
      voltageRangeV: [400, 500],
      reference: 'Applicability conditions'
    },
    points: [{ timeS: 0, emfMultiplier: 1 }, { timeS: 0.1, emfMultiplier: 0.4 }]
  }]
}
```

Every history starts exactly at time zero with multiplier 1, ends at the common
positive horizon, and has strictly increasing time and finite nonnegative
multipliers. Profiles are interpolated linearly in time only between supplied
points; the union of source knots is evaluated without extrapolation. Conditions
must describe 60 Hz, three-phase operation, ambient temperature above absolute
zero, and a voltage range covering both the canonical source/motor rated voltage
and the generated source bus voltage. References and evidence classes are
supplied metadata. Manufacturer or external-study labels are not authenticated.

A multiplier scales only the source's complex internal EMF. The source remains
connected through the original nonzero internal impedance and retains its
in-service status. Therefore a multiplier of zero represents a suppressed
Thevenin EMF, not an opened source. No decrement constant or motor decay curve is
inferred from acceleration, locked-rotor, nameplate, or research geometry data.

## Network and device calculation

`analysis/designSynthesisFaultStudy.mjs` exports
`buildDesignSynthesisFaultNetwork({ proposal, faultStudy })`, shared by the
initial and history evaluators. It retains the final generated cable R/X,
transformer model, one-line checks and exact source list. For each source knot,
`analysis/designSynthesisFaultEvolution.mjs` solves the same balanced
three-phase bolted fault at every generated bus with source EMFs scaled by their
histories. It then reuses the final initial device screen's exact source-end,
aggregate-main and immediate load-side current-reference/KCL records. Signed
complex currents are retained per fault case and placement; phasor magnitudes
are never added.

Under a fixed positive-sequence network, each branch current is linear between
the supplied source-EMF knots. For endpoint phasors `I0`, `I1` in amperes and
interval duration `dt`, the reported RMS phasor exposure is the analytic
integral:

```text
integral |I(t)|^2 dt = dt * (|I0|^2 + Re(I0 * conjugate(I1)) + |I1|^2) / 3
```

The result retains source multipliers, every branch-terminal and proposed
device phasor history, each
placement-by-fault-case `currentSquaredExposureA2S`, interval contributions, and
analytically located minimum/maximum RMS current and times. It is a mathematical
history of the supplied model, not an operating-time or damage check.

The evaluator recomputes and compares the canonical initial fault cases and
device placements before producing values. Missing source histories, incomplete
fault coverage, stale/tampered initial or device evidence, malformed inputs,
out-of-range conditions, nonfinite arithmetic, or incomplete placement
references block all temporal current and exposure values. History input and
final network/device/source evidence contribute to a deterministic fingerprint.

## Computation and output bounds

Each source profile is limited to 64 points and the union of all source knots is
limited to 64 times. The runtime also caps `faultBusCount × timeKnotCount` at
12,000 network solves and `(faultBusCount + 1) × placementCount × timeKnotCount`
at 150,000 placement-history samples. A request exceeding either temporal budget
is blocked before returning numeric history. The existing fault-network limits
of 250 buses, 1,000 branches, and 250 sources still apply. Branch terminal rows
are retained at each solved bus/time pair, so their output volume also scales
with the final network's branch count.

## Limits

The `supplied-source-quasi-steady-rms-phasor-history` scope describes the
calculation boundary. These profiles do not claim to be physically guaranteed
motor or utility fault-current envelopes. The model does not include rotor/stator
electromagnetic dynamics, detailed dq motor behavior, DC offset, peak or
asymmetrical duty, frequency transients, switching transients, or changing
network topology. Research on motor fault-current decay explains why those
effects cannot be inferred from a generic source multiplier; see the retained
[source note](../output/design-synthesis-timed-fault-2026-10-23/sources/induction-motor-fault-current-decay-sources-2026-10-23.md).

No relay/device state evolution, current limiting, trip, contactor opening,
maximum total clearing time, actual clearing current, conductor damage, motor
safe-stall withstand, coordination, installation suitability, interrupting
duty qualification, or assembly SCCR is calculated. Current-squared exposure
cannot qualify protection. `protectionAdequacy` remains `unevaluated`, complete
motor protection remains blocked, and motor Apply remains guarded.

## Persistence and verification boundary

The editor saves the explicit history inputs with the existing workspace draft;
edits invalidate the generated output. Proposal JSON and TXT reports retain the
complete supplied input, calculated histories, extrema, exposure and limitations.
The canonical project stores evaluated history in
`designSynthesisFaultEvolutionValidation`, a lossless bounded compressed record.
It contains the exact initial fault-study input, supplied history input, and
complete evaluated result, including signed current rows, extrema, interval
exposures, coverage, model fingerprint and limitations. Apply recomputes the
history from the proposal and compares the complete result before storing it;
an inconsistent evaluated result rolls the whole Apply back. Requested history
with missing or unevaluated results is rejected before mutation. A proposal with
neither history input nor validation removes the previous record.

The saved record is bound to the named project and scenario, a stable canonical
engineering-input fingerprint, and fingerprints of the exact saved initial
fault and device-fault records, plus the separate saved device-evidence map
that resolves the selected device records. The stable snapshot omits only the observed
volatile project `updatedAt` and one-line `activeSheet` view fields. On reload,
the resolver returns history only when all context fields still match. A
canonical engineering edit or replacement of either prerequisite study makes
the saved history unavailable until a new proposal is applied. This read path
does not rerun the network study and does not upgrade the evidence's status.

The packed JSON is limited to 12,000,000 decoded UTF-8 bytes and 1,500,000
compressed bytes. The decoder enforces both bounds, exact decoded lengths,
complete compressed-stream consumption, valid UTF-8/JSON, and an integrity
fingerprint before exposing history. These limits keep the optional record
bounded during encoding and decoding; they do not enlarge or guarantee space
within the 5 MiB project-storage quota. The complete project transaction still
has to fit the existing storage budget. A record that cannot fit is rejected
and Apply rolls back rather than dropping or truncating rows.

Independent acceptance covers separate complex circuit arithmetic, exact
quadratic integration by midpoint circuit solves, 25/50-load generation, reverse
feed, passive zero-EMF sources, interior current cancellation, ideal feeder ties,
transformer current/exposure bases and rejected stale or malformed evidence.
Final verification evidence is retained under
`output/design-synthesis-timed-fault-2026-10-23/verification.json`.

The subsequent canonical persistence and saved-view journey is independently
verified for 25 and 50 loads with three source-profile knots, exact JSON/TXT
exports, current-context checks, stale numerical suppression, undo/redo and
failed-save rollback. Its final evidence is under
`output/design-synthesis-history-persistence-2026-10-23/verification.json`.
The saved record completes the compact history persistence prerequisite; it
does not close the motor-protection or motor-containing integration gaps.
