# Fault-network integration review — October 19, 2026

Overall review class: **Screening only**. Complete generated-design fault duty
is blocked by missing motor-source models, operating cases and device-duty
evidence. The findings below describe the original legacy-path review. The
subsequent [explicit initial fault-network implementation](design-synthesis-fault-network.md)
adds a separate bounded model without changing that legacy path or clearing motor Apply.

## Findings

### High: local source equivalents do not represent remote motor infeed

`analysis/shortCircuit.mjs:977` recursively sums the single upstream path.
Its `runShortCircuit` handling at approximately line 1364 parallels `sources`
only into the result at the component carrying that array. The recursive path
does not use those local equivalents to calculate faults at other buses.
Consequently a successful local calculation is insufficient evidence of a
complete network contribution calculation.

Root independently reproduced this with explicit synthetic positive-sequence
data: 480 V line-to-line, unity voltage factor, source reactance 0.02 ohm,
branch A–B reactance 0.03 ohm, and a motor-source equivalent at B of 0.10 ohm.
All internal source voltages are aligned and equal; resistance is zero. This
is an algebraic topology fixture, not manufacturer motor data.

| Three-phase fault location | Engine, no added local source | Engine, B local source added | Independent network with motor at B |
| --- | ---: | ---: | ---: |
| A | 13.86 kA | 13.86 kA | 15.988161301 kA |
| B | 5.54 kA | 8.31 kA | 8.313843876 kA |

With phase voltage `E = 480 / sqrt(3)` volts, the independent expressions are
`I_A = E * [1/0.02 + 1/(0.03 + 0.10)]` and
`I_B = E * [1/(0.02 + 0.03) + 1/0.10]`. The local shortcut matches B but
omits approximately 2.13 kA at A. The engine rounds displayed kA to two
decimals. The initial reproduction incorrectly compared the engine's default
1.05 ANSI voltage factor with unity-voltage arithmetic; the final case supplies
`v_factor: 1` explicitly on every component. No engine default was changed.

Evidence: `output/design-synthesis-fault-integration-2026-10-19/topology-reproduction.json`.
Existing source-only and local-equivalent tests do not detect remote infeed
omission. This fixture must become an acceptance case for a network solver;
propagating a local parallel impedance down the parent chain would still miss
reverse feed and shared-path current division.

### High: generated motor data is a starting model, not a fault-source model

`analysis/designSynthesisOneLine.mjs` creates load components and projects
nested motor data onto their cables. `analysis/shortCircuit.mjs:256` recognizes
utility sources, generators, PV inverters and UPS equipment as sources, but
does not turn that nested motor record into an induction-motor infeed. Locked
rotor current/PF and source starting impedance therefore do not establish
maximum/minimum fault cases or time-dependent breaker duty.

Current synthesis preserves the boundary: source consistency explicitly
excludes motor contributions; motor protection remains unresolved; the exact
breaker candidate is blocked and is not selected for Apply. The correction
must add real network/source modeling while retaining that block until the
complete protection checks are supported.

### High: initial symmetrical current alone cannot complete protection

`analysis/iec60909.mjs` can evaluate explicit sequence equivalents and several
fault-current quantities. Its existing decrement treatment is for a synchronous
generator share, not induction-motor decay. Reusing it does not establish motor
interrupting duty, minimum pickup sensitivity, ground-fault behavior, thermal
withstand, or exact protective-device clearing. Generated cable-nested breaker
candidates are also not equivalent to installed TCC-linked protective nodes.

## Public sources and usable evidence

- [ABB Technical Application Paper No. 2, 1SDC007101G0202](https://library.e.abb.com/public/2c522f583c884a4fbdf3968e1fdf1481/1SDC007101G0202.pdf),
  printed page 15, explains short-lived motor feed and gives a typical 4–6
  times rated-current approximation. Page 25 uses 160 A and a factor of four
  to obtain 640 A. These are approximation examples, not an exact motor model
  or guaranteed upper bound for this application's motors. Its IEC examples
  do not establish NEC application approval.
- [Thurner and Braun, 2018, arXiv:1802.01502](https://arxiv.org/html/1802.01502),
  sections III–IV, describes source/branch equivalents and a nodal-admittance
  network calculation. It distinguishes minimum/maximum source data and
  different current quantities. This supports the network architecture, not
  substituting one displayed bus impedance for an entire multi-infeed study.
  Printed resistance coefficients/equation indices must not be copied without
  independent dimensional and numerical checks.
- [Pandapower motor documentation, version 3.5.6](https://pandapower.readthedocs.io/en/v3.5.6/elements/motor.html)
  distinguishes rated-voltage, rated-efficiency/PF, locked-rotor ratio and motor
  R/X inputs for short-circuit calculation. Demonstration inputs are not
  manufacturer evidence for an installed motor. A cross-tool fixture needs
  recorded versions and matching assumptions.
- [ABB motor-protection input guidance](https://new.abb.com/medium-voltage/digital-substations/protection-relays/motor-protection-and-control)
  identifies hot/cold locked-rotor and acceleration limits, starting curves,
  starting frequency and supply/environment conditions as relevant inputs.
  These remain separate from an initial fault-current calculation.

These references provide calculation/model evidence. They do not supply the
exact Siemens 25/30 A clearing curves or an exact field motor's fault and damage
characteristics. No generic multiplier, synthetic impedance, or missing
sequence value has been promoted into the protective-device library.

## Required implementation and acceptance evidence

1. Define source equivalents attached to actual buses, with explicit units,
   voltage/frequency bases, operating state, motor/drive type, provenance and
   fault-case applicability. Reject missing/incompatible data rather than
   inheriting a starting model or fabricating another sequence impedance.
2. Solve the connected network, including remote sources, cable/transformer
   paths, voltage-base transformations, current splits and ideal ties. Preserve
   source identity and per-branch duty. Keep local legacy-equivalent semantics
   distinct rather than silently reinterpreting saved projects.
3. Distinguish maximum initial symmetrical, peak/momentary, interrupting at a
   stated time, thermal equivalent/withstand, and minimum fault/pickup checks.
   Add negative/zero sequence and grounding paths for unbalanced faults; a
   three-phase positive-sequence result cannot imply those checks passed.
4. Compare duty at each actual device terminal and drive candidate selection
   or retain explicit unresolved issues. Preserve manufacturer settings,
   tolerances, let-through and assembly conditions. Do not clear motor Apply
   from an initial-current or source-only comparison.
5. Verify published examples and independent circuits, including this reverse
   infeed fixture, multiple motors, shared paths, mixed voltage, disconnected
   equipment, stopped motors, missing data, numerical singularities and
   25/50-load cases. Verify edit freshness, reports and eventual Apply/reload.

## Verification scope

Luna performed the code-path review; root checked the paths and executed the
independent synthetic reproduction. This is a read-only calculation review
and documentation change. No production calculation was changed. The preceding
capacity milestone now has 434 passing Node test files, 235 focused cases,
64 Edge cases, build and lint. The user-approved outside-sandbox Node run
resolved the earlier automatic-review timeouts and local-server EACCES.
Those gates validate the preceding routing milestone. Verification of the
subsequent explicit network is recorded separately in
`output/design-synthesis-fault-network-2026-10-19/` and the linked implementation
guide. Starting data still does not become a fault-source equivalent; explicit
new equivalents are required. Complete protection findings remain open.
