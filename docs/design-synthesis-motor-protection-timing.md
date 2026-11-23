# Motor protection timing comparison

The comparison reruns the final-network acceleration calculation before using
its duration and current timeline. A supplied result with an unchanged input
fingerprint but altered duration, exposure, timeline, or duplicate motor case
is blocked. This is a consistency check, not authentication of the supplied
motor data or proof of motor protection.

Overall review class: **Screening only**.

Design Synthesis accepts optional `equipment[].motor.protectionTiming` inputs
for the existing `inverse-time-breaker` starter topology. Version 1 compares a
single reference current; version 2 also compares separately supplied constant-stall current bounds. Motor proposals remain blocked from
Apply and `completeProtectionStatus` remains `blocked` even when these explicit
comparisons pass.

Schema version `1.0.0` retains the reference-current comparison described below. Version `2.0.0` adds a separate constant-stall current-range comparison; it does not reinterpret or replace v1. Each model requires an `initialState` of `hot` or
`cold`, `ambientTemperatureC`, `frequencyHz: 60`, `phases: 3`, a positive
`referenceStartCurrentA`, its reference, a referenced `currentEnvelopeA` with
positive `minimumA` and `maximumA`, and an explicit nonnegative `startMarginS`.
The reference current must be at least the declared envelope maximum. The
envelope must contain every supplied performance-curve current and current in
the final acceleration timeline; performance currents are scaled from motor
rated voltage to canonical circuit voltage. The selected hot/cold conditions
must match the comparison. The other condition is retained structurally but is
reported as unevaluated.

For v2, `stallCurrentRangeA` is a separately referenced positive
`{minimumA,maximumA}` interval for constant-current stalled conditions. It is
not inferred from the acceleration performance curve or fault-current study.
Both hot and cold withstand records replace scalar times with monotone
`hotMinimumSafeStallCurve` and `coldMinimumSafeStallCurve` arrays of
`{currentA,minimumSafeStallTimeS}` points; each must cover the complete declared
range without extrapolation. The explicitly selected state is compared, while
the other remains unevaluated. V2 also recomputes the nominal network
locked-rotor current from the final one-line model, requires it inside the
declared range, and checks that the fresh result matches the acceleration
timeline at zero speed. Canonical `lockedRotorCurrentA`/power factor and the
zero-speed performance point must agree; contradictory model bases block the
range comparison rather than being reconciled.

In v1, `motorWithstand` supplies `referenceCurrentA` equal to the comparison current,
positive `hotMinimumSafeStallTimeS` and `coldMinimumSafeStallTimeS`, and separate
hot and cold condition records. Each condition record identifies initial state,
ambient temperature, positive frequency and phase count, a voltage interval, and
a source reference. The selected condition must match the comparison's 60 Hz,
three-phase conditions. The opposite-state record is retained but not evaluated
for applicability. Each device also carries matching condition fields and a voltage
interval that covers the canonical motor circuit voltage and every final
acceleration timeline voltage.

Exactly one `branch-breaker` and one `overload-relay` are required. The breaker
identity and `{fixedIrA, instantaneousPickupA}` settings must match the final
candidate; the overload identity and `{dialSettingA}` must match its exact
candidate. Both devices provide strictly current-ordered `minimumTrip` and
`maximumTotalCircuitClearing` curves as `{currentA,timeS}` points. Times must be
positive and nonincreasing with current. Curves cover the declared current
reference without extrapolation, and minimum-trip bounds may not exceed
maximum-total-clearing bounds throughout their overlapping supplied support.
V1 does not require finite coverage below the reference current; v2 requires both device curves to cover the complete stall interval as well. Overload total-clearing input must explicitly
include contactor opening time; relay operating time alone is insufficient.

Both devices' minimum-trip times at the reference current must exceed final
acceleration duration plus the explicit margin. In v1, at that same reference current,
the comparison's earliest supplied maximum total-clearing time is compared with
the motor minimum safe-stall time for the explicitly selected hot or cold state.
The other state is reported as unevaluated. Interpolation is log-log and occurs
only inside supplied bounds. The result retains device identities, settings,
source references, interpolated values, margins, and fingerprints for final
motor, network, acceleration, and evidence inputs.

The v1 selected-state clearing/withstand comparison applies only at the declared
reference current. It does not bound longer clearing at lower actual stall or
fault currents and does not prove actual motor stall protection. Bounding
startup currents with the reference current supports only the stated startup
trip comparison; it does not extend the clearing comparison across those
currents.

All evidence is supplied and unverified. `evidenceClass: "synthetic"` is
allowed for demonstration and remains marked synthetic; `manufacturer` records
remain user-supplied source claims and are not authenticated by the application.
The comparison is not a current-trajectory or thermal-memory model. It does not
establish current-limiting behavior, cooling, conductor damage, timed fault
duty, grounding protection, coordination, installation suitability, assembly
SCCR, a guaranteed setting, or complete motor protection. Missing evidence,
stale acceleration, invalid bounds, condition mismatches, or uncovered ranges
block numeric results.

The workspace's separate synthetic timing and stall-range examples supply illustrative curves for the
selected breaker and overload identities. It does not supply manufacturer curve
data for those parts. Save/reload retains the explicit inputs; edits invalidate
the result until regeneration. JSON and readable reports retain the complete
comparison, including failures, conditions, sources, numeric margins and the
unresolved complete-protection status. The displayed reference current is
separate from the supplied current envelope; it may exceed that envelope's
maximum. Clearing values are upper bounds, not predicted actual clearing times.

In v2, each device's maximum total-circuit-clearing bound is compared with the
selected-state supplied withstand curve at the merged in-range breakpoints,
the freshly recomputed network locked-rotor point, and analytical interior
minimum-margin points for the log-log segments. A passing status means only
that every compared bound in this declared constant-stall interval is below the
selected supplied withstand limit with positive margin. It does not establish
that every real stall current or voltage is represented. It does not bound
clearing at currents below the declared interval, qualify a trajectory whose
current changes with slip, or prove actual motor stall protection.

Independent acceptance checks use geometric-mean curve knots and a separate
network/mechanical oracle for revised 25- and 50-load cases. They cover equality
boundaries, crossing bounds, incomplete or stale acceleration, changed device
settings, malformed input, selected-state applicability and finite curve support
at the reference current. Evidence and final verification results are retained in
`output/design-synthesis-motor-protection-2026-10-23/verification.json`.

Exact manufacturer curve and test-condition evidence remains incomplete. The
public WEG investigation is retained under that folder's `sources/` directory;
no original PDF archive or hash is claimed and no researched value replaces the
synthetic example. Complete motor protection, coordination, fault duty, assembly
SCCR and motor-containing canonical project integration remain unfinished.

V2 independently verifies finite, converged network results and agreement with
the saved starting case as well as the acceleration timeline. Missing, duplicate,
stale or malformed cached results block the comparison. A single-current interval
is accepted when both endpoints equal the recomputed point; the supplied curves
still require at least two ordered points. Mixed v1/v2 projects retain each
motor's own comparison scope in the page and both exports.

The v2 acceptance suite includes an independent complex-network solution,
power-law arithmetic, a reference-current pass that fails at lower actual stall
current, interior extrema of the seconds margin, steep finite curves, equality,
selected-state applicability, invalid coverage and revised 25/50-load networks.
Evidence is retained in
`output/design-synthesis-motor-stall-range-2026-10-23/verification.json`.

Public methodological references are the [ABB motor protection handbook,
section 8.11.2.4](https://library.e.abb.com/public/58df388d653856c0c125795f00432d0c/DAHandbook_Section_08p11_Motor-Protection_757291_ENa.pdf)
and [SEL's motor thermal model paper](https://cdn.selinc.com/assets/Literature/Publications/Technical%20Papers/6276_OptimizingThermalModels_SZ_20070226_Web.pdf).
These support considering current-dependent clearing and distinguishing static
curves from dynamic motor thermal behavior. They do not supply exact curves for
the selected motor or devices. Original PDFs, URLs, SHA-256 hashes and a bounded
source assessment are retained under the new evidence folder's `sources/`.

The [manufacturer evidence review](design-synthesis-motor-evidence.md) records
the exact relay and contactor PDFs retrieved October 24, 2026. It distinguishes
component delays, schematic loading curves and class test points from the
complete bounds required by this comparison. Those sources do not fill the
missing manufacturer curves or change motor Apply eligibility.
