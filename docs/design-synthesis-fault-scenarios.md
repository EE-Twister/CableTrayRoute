# Explicit fault operating scenarios

Overall review class: **Screening only**. This advances the
[equipment-to-design workflow](design-synthesis-acceptance.md) by comparing
initial symmetrical RMS currents under multiple supplied source conditions.
It does not complete motor protection or enable motor Apply.

## Input and workflow

Choose **Load fault scenarios sample** for 25 synthetic nonmotor loads and two
explicit utility equivalents. The Advanced fault scenarios JSON editor accepts
top-level `faultScenarios`, containing two through four entries shaped as:

```js
{ id: 'strong-source', reference: 'Referenced operating condition', study: {
  networkBaseMVA: 1,
  sourceInventory: { status: 'complete', reference: 'Source inventory' },
  sources: [{ equipmentId: 'S', emfPhaseV: { re: 480 / Math.sqrt(3), im: 0 },
    impedance: { rOhm: 0.006, xOhm: 0.015 }, inService: true,
    reference: 'Synthetic equivalent; replace with project evidence' }]
} }
```

Each `study` follows the [explicit network contract](design-synthesis-fault-network.md),
including all known utility/motor equivalents, stopped-source records and a
transformer-phase reference where required. IDs must be unique; references must
be nonblank and may cite the same document. Scenario input and legacy
`faultStudy` are mutually exclusive. Invalid JSON remains visible. Editing
inputs invalidates downloads and Apply.

Each condition uses the final conductors, actual routes and transformer model.
Results retain source references, network and proposed-device evidence. Bus
rows identify observed low/high values and scenario IDs. Device rows distinguish
available line-terminal current from the highest observed per-scenario maximum
through-device current across fault locations. Different buses can have different
limiting scenarios. Equal values retain input order.

An incomplete condition prevents complete aggregate envelopes; it is not dropped.
A rating exceedance retains valid numbers and blocks the proposal. A
non-exceeded initial-current comparison is not a complete protection result.
Readable and JSON reports retain these distinctions.

## Engineering boundary

These are extrema over supplied cases only. Nominal source EMF and the catalog's
75 °C cable impedance basis remain unchanged. No voltage factors, temperature
cases, impedance tolerances or complete operating-configuration set are derived.

[Schneider Electric's guidance](https://www.electrical-installation.org/enwiki/3-phase_short-circuit_current_%28Isc%29_at_any_point_within_a_LV_installation)
distinguishes conductor-temperature bases and motor contributions.
[ABB's DOC manual](https://library.e.abb.com/public/a7a540898e0685bdc1257e1a0048b3ef/DOC_UserManual_EN_SLD.pdf),
page 61, describes further assumptions for its maximum/minimum studies. These
explain why observed envelopes here are not verified physical fault extrema;
their particular factors are not adopted silently for other project criteria.
Ground faults, timed/asymmetrical duty, thermal withstand, protective clearing,
coordination and assembly SCCR remain separate requirements.

## Persistence

Eligible nonmotor Apply retains `designSynthesisFaultScenarioValidation` through
the shared project transaction. A versioned lossless wrapper packs compressed
UTF-8 JSON into 15-bit Unicode code units, reducing overhead in UTF-16 browser
storage. Use `resolveDesignSynthesisFaultScenarioValidation(saved, inputs)` to
validate and expand it. Treat its packed string as opaque.

Saved evidence retains each input, exact branch/source-terminal magnitudes,
device evidence and limiting-case identities. Full export also retains phasors
and detailed solver outputs. The resolver checks payload fingerprints and
recomputes envelopes from expanded currents. Applying without scenarios removes
their summary; undo restores it. Scenario and legacy summaries replace each other
in the same transaction. Compaction or durable-save failure rolls back Apply.
The existing 5 MiB fixture budget remains unchanged; other project data can
still exhaust actual storage capacity. Undo history is session-only and resets
on navigation or reload; a saved summary remains persisted across reload.

## Independent verification

A separately derived two-bus circuit operates utility and motor sources
individually. Its utility condition limits the source-bus fault; its motor
condition limits the motor-bus fault. Root's 25/50-load mixed-voltage checks sum
final routed cable and transformer impedances on each fault voltage base.
A whole-integer bit oracle independently checks the storage wire format.

The 50-load mixed-voltage growth fixture uses 5,099,410 bytes for canonical and
named-project storage, with a measured transaction peak of 5,144,576 bytes against
the unchanged 5,242,880-byte budget (98,304 bytes of peak headroom). Earlier raw
and base64-packed attempts exceeded that budget; the accepted Unicode format
retains exact evidence. A separate four-condition fixture checks all source-bus
currents against direct complex-impedance arithmetic.

Final verification passed 450 Node test files, 18 focused cases, all 42 selected
Edge journeys, build, lint, page-contract audit and whitespace checks. Root
inspected rendered scope and bus/device rows plus the readable report. All 18
frozen source/test hashes match; production files remained unchanged while
browser test navigation and history assumptions were corrected. The browser
checks confirm durable evidence across reload and the session-history boundary;
Node tests separately verify same-session undo/redo and failed-save rollback.

Logs, storage measurements, rendered/report inspection and superseded failures
are retained in `output/design-synthesis-fault-scenarios-2026-10-21/verification.json`.
The complete goal remains active.
