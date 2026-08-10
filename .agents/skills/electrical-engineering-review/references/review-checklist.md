# Electrical Engineering Review Checklist

Use only the sections relevant to the requested review.

## Universal calculation checks

- Inputs have labels, units, valid ranges, required/optional status, provenance, and explicit defaults.
- Default values are conservative or clearly presented as assumptions.
- Every conversion is explicit; no mixed SI/imperial, feet/metres, inches/feet, kW/W, kVA/VA, kA/A, or percent/fraction path remains.
- Phase basis is consistent: single-phase/three-phase, per-phase/total, line-line/line-neutral.
- Sign, direction, polarity, and source/load conventions are documented and tested.
- Temperature, frequency, material, installation, grounding, and code-edition bases are preserved through reports.
- Missing, zero, negative, NaN, infinite, and out-of-domain inputs fail safely.
- Interpolation and extrapolation rules are bounded and disclosed.
- Solver failure or nonconvergence cannot be mistaken for a physical boundary or passing result.
- Rounding occurs only for display, never before limit comparison.
- Saved results carry input provenance or a fingerprint and become stale after relevant changes.
- UI, worker, report, export, API, and validation paths use the same model and semantics.

## Cable, conduit, tray, and routing

- Conductor count, parallel sets, phases, neutrals, grounding conductors, and cable multiplicity are not collapsed.
- Ampacity temperature bases, terminal limits, ambient correction, bundling, installation method, soil conditions, and mutual heating are explicit.
- Conduit/tray fill uses the correct article/table, conductor or cable count, raceway type, dimensions, and applicable fill percentage.
- Length distinguishes plan, vertical, route, one-way circuit, and electrical loop length.
- Pulling checks cover direction, friction, bends, sidewall pressure, tension limits, section boundaries, equipment ratings, and manufacturer constraints.
- Route optimization constraints cannot be bypassed by missing IDs, incompatible cable groups, capacity, or geometry.

## Load flow, fault, stability, and dynamic studies

- Per-unit bases and impedance conversions are consistent across voltage levels.
- Bus types, slack behavior, PV reactive limits, transformer ratio/tap/phase shift, shunts, and ideal ties match the claimed scope.
- Fault type, sequence network, grounding, prefault voltage, contribution decay, and current basis are explicit.
- Network topology limitations—radial, meshed, balanced, unbalanced—are disclosed and enforced.
- Convergence criteria, iteration limits, initialization, singularity handling, and rejected scenarios are visible.
- A numerical sweep boundary is not labeled as a physical collapse point without the required method.
- Dynamic models state machine, inverter, control, protection, timestep, and event simplifications.

## Protection, TCC, and arc flash

- Device identity is exact enough to select the applicable curve and rating.
- Curve representation distinguishes minimum melt, total clearing, trip band, manufacturing tolerance, and relay equation.
- Current scaling, CT ratio, pickup, time dial/TMS, instantaneous settings, and breaker opening time are applied once and at the correct basis.
- Coordination interval uses consistent upstream/downstream curve semantics and includes relevant equipment damage/inrush/start constraints.
- Interrupting duty is checked at the applicable voltage and current type; frame, sensor, trip, and interrupting ratings are not interchanged.
- Arc-flash inputs cover voltage, electrode configuration, gap, enclosure, working distance, arcing-current variation, and device clearing time at arcing current.
- PPE category is not inferred from calculated incident energy.
- Screening curves cannot drive issued settings or arc-flash clearing times without source evidence and independent review.

## Grounding, lightning, and cathodic protection

- Fault-current split, clearing time, soil model, seasonal variation, grid geometry, conductor/rod properties, and body-weight assumptions are explicit.
- Touch, step, mesh, and ground-potential-rise quantities use consistent current and geometry bases.
- Simplified soil or geometry models are not presented as field acceptance.
- Lightning risk, shielding geometry, surge protection, bonding, and grounding scopes are separated.
- Cathodic-protection current density, coating degradation, utilization, life, rectifier/groundbed sizing, interference, and field criteria evidence are distinguished.
- Modeled potentials are never treated as commissioning measurements.

## Thermal, mechanical, and structural

- Steady-state versus transient scope is explicit.
- Heat sources, losses, boundary conditions, material properties, spacing, soil/ambient conditions, and temperature dependence are represented consistently.
- Load combinations use the claimed code edition, load signs, importance factors, and allowable/strength basis.
- Wind/seismic coefficients, exposure/site class, component amplification, response factors, spans, and units are traceable.
- Equipment/product capacity checks do not extrapolate beyond tested or tabulated configurations without disclosure.

## Protective-device promotion precheck

- Exact catalog number or trip-unit model and lifecycle/applicability are recorded.
- Voltage-specific AC/DC interrupting ratings include standard, poles, frequency, and source.
- Frame, sensor/rating plug, continuous trip, withstand, and setting ranges are not missing or conflated.
- Manufacturer curve document, revision/date, curve number/page, representation, units, frequency, ambient basis, and extraction method are recorded.
- Stored points include the relevant curve boundaries and at least three independently checked source points where required by repository governance.
- Every governed technical field maps to a primary source and has a verification status.
- Conflicting sources remain visible and unresolved values are not guessed.
- Independent human reviewer metadata remains empty during automated review.
- The result may be reported only as ready or not ready for qualified human review; the agent must not promote the record.

## Validation evidence quality

Strong evidence includes:

- a published standard worked example;
- a manufacturer example or curve spot check with exact configuration;
- an independently derived hand calculation;
- a recorded comparison against a recognized tool using identical inputs;
- sensitivity and boundary cases that would fail under common formula mistakes.

Weak evidence includes:

- expected values generated by the production function under test;
- snapshot-only tests with no engineering assertion;
- broad tolerances with no basis;
- tests of labels or object shape without numerical verification;
- a reference citation with no mapping to implemented equations;
- a single nominal case that does not exercise units, bounds, or conditional branches.

## Readiness decision questions

Before choosing an overall class, answer:

1. Is the intended use explicit?
2. Is the governing edition and jurisdiction known?
3. Are inputs complete and source-backed for that use?
4. Does the implementation cover the claimed model scope?
5. Is there independent numerical evidence?
6. Are limitations and assumptions preserved in every output?
7. Can stale or unsupported results be mistaken for current issued results?
8. What must a qualified engineer still verify?
