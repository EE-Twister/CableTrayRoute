# Motor acceleration screening in design synthesis

Overall review class: **Screening only**. This extends the equipment-to-design
workflow; it does not complete the full goal or qualify motor protection.

Design Synthesis can screen a direct-on-line motor acceleration profile when a
motor has an explicit `motor.acceleration` input. The optional JSON editor on
the workspace accepts an object keyed by equipment ID and merges each value
into that motor's input. Draft edits, imports, and invalid JSON are retained;
editing an input invalidates the current proposal and its downloads.

Each model supplies motor and coupled-load inertia with separate references, a
target speed, a performance curve with speed/current/power factor/torque, and a
load-torque curve. Both curves must start at zero speed, be strictly ordered,
contain 2–65 points, and cover the target speed without extrapolation. A model
reference and a reference for each curve and inertia value are required. The
performance curve's zero-speed current and power factor must agree with the
existing locked-rotor inputs. The motor nameplate frequency must explicitly be
60 Hz; the legacy starting-screen frequency fallback does not apply. Only
squirrel-cage motors with a DOL starter are supported. If any motor acceleration
is requested, each motor in the input must have a complete model. Curve points
are also checked between supplied knots for mechanical shaft power exceeding
the corresponding rated-voltage electrical input power.

The engine evaluates each supplied speed point on the finalized proposed
network, adjusts current by the computed terminal-voltage ratio and motor
torque by its square, and integrates acceleration time and current-squared
exposure over speed with bounded adaptive Simpson refinement. The method is a
quasi-steady balanced screen. It is not a time-domain motor, drive, or transient
network simulation. A nonpositive motor-minus-load torque is reported as a
stall at that speed; a solver or refinement limit is reported as blocked. The
adaptive calculation is bounded to 512 network evaluations per motor case and
25,600 evaluations across the study. The
optional `criteria.motorAcceleration.maximumTimeS` is an explicit user limit.
If it is absent, duration is reported without a pass claim.
When the supplied duration limit fails or the model finds a known positive-
speed torque deficit, automatic trials may reevaluate acceleration alongside
operating load flow and motor starting. Missing or malformed curves and
solver/refinement nonconvergence block the requested study immediately. Trials
first advance sourced conductor choices on the affected motor path; an eligible
transformer profile is considered only on that affected path after its sourced
conductor choices are exhausted. These trials consume the same
`criteria.loadFlow.maxRevisions` budget as the other studies. Every trial keeps
the supplied criteria, including `maximumTimeS`, unchanged; the engine does not
relax the duration limit to make a candidate pass. The review and reports retain
each shared revision number, operating and starting status, acceleration case
time/status, changed circuits, transformer profile, and stop reason. A zero
revision budget therefore reports the original candidate and its unmet limit
without a trial. This bounded search does not promise that a feasible design
exists outside the candidates it tests.
The target is a specified acceleration threshold. Exact torque equilibrium has
no positive accelerating torque and is not a finite-time endpoint of this
integral. Timeline voltage pu uses the modeled bus nominal voltage; torque and
current adjustments instead use actual terminal volts divided by the motor's
`ratedVoltageV`. A 480 V network and 460 V motor therefore retain distinct bases.

The result records the method, input fingerprint, duration criterion, case
status, timeline values for terminal voltage/current/motor torque/load
torque/net torque, convergence refinement, electrical I²t exposure, issues,
and limitations. Electrical I²t exposure is not conductor damage, motor
thermal withstand, protective clearing, overload coordination, or protection
adequacy. The supplied curves and references are input evidence, not
independently authenticated data. The built-in sample contains one synthetic
motor case in an existing 25-load synthetic starter sample; its curves, inertia,
references, and illustrative time criterion are not manufacturer or field
data.

Motor protection remains blocked, so a passing acceleration-duration screen,
including one reached after a bounded revision, does not enable Apply. Revision
history describes candidate selection only; it does not establish thermal
withstand, overload protection, fault coordination, or transient performance.
See the [motor starting and protection guide](design-synthesis-motors.md)
and the [Design Synthesis overview](design-synthesis.md) for the surrounding
review limits.

## Calculation basis and acquired data

The mechanical equation is `J_total dω/dt = T_motor - T_load`, with both inertias
and the resisting torque referred to the motor shaft. The app integrates its
inverse over speed; it does not substitute an average torque or a generic
starting-time multiplier. ABB's [Motor Guide, printed page 42](https://library.e.abb.com/public/891764f173c5494b82b7e66e0b2d6080/9AKK105285%20REV%20C%2010-2018.pdf)
states this relation. Its [Technical Guide No. 7, printed pages 14–17](https://library.e.abb.com/public/e555e5106a3c44e882f48b75a44f6807/Technical_guide_No_7_3AFE64362569_RevD_EN_lowres.pdf)
provides constant-inertia examples and explains shaft-referred load data.

At each speed the supplied rated-voltage current/PF point defines a balanced
admittance. The finalized network determines terminal voltage. Current scales
with that voltage ratio and torque with its square. The square-voltage relation
is described in [Baldor's Cowern Papers, printed page 44](https://www.baldor.com/Shared/manuals/pr2525.pdf).
These voltage adjustments and linear interpolation of supplied points are
model approximations; numerical integration tolerance does not establish their
machine accuracy. The reported electrical exposure integrates **line current
squared**, without a three-phase multiplier or an inferred thermal limit.

Exact Baldor packets for [GNEM2332T](https://www.baldor.com/api/products/GNEM2332T/infopacket)
and [CCPX32446T](https://www.baldor.com/api/products/CCPX32446T/infopacket) were
acquired. They provide locked-rotor PF, starting current, rotor inertia and
operating-load data, labeled typical rather than guaranteed. They do not provide
the complete standstill-to-target current/PF/torque curves or the driven-load
torque and inertia needed here. Running-load points are not interpolated into
missing startup data, and motor inertia is not substituted for load inertia.
Accordingly, these packets are research evidence rather than a complete preset.

Five manufacturer PDFs, SHA-256 hashes, source URLs and inspected page renders
are archived under
`output/design-synthesis-motor-acceleration-2026-10-21/sources/`. Root independently
checks the software with constant-torque and logarithmic time integrals, complex
voltage-divider arithmetic, a 480/208 V transformer case and generation tests.

## Initial calculation verification — October 21, 2026

Luna implemented the calculation and workflow; root independently checked the
complex voltage-divider, constant and logarithmic torque integrals, transformer
voltage-base referral and 25/50-load regeneration. A separate 65,536-interval
midpoint calculation with varying current, PF and torque agreed within relative
errors of 1.1e-8 for time and 1.9e-7 for current exposure. These are numerical
checks of the stated model, not validation of an installed motor.

Review corrected unstable result fingerprints, missing canonical source-bound
coverage, finite-range handling, inadequate work limits for detailed curves,
silently ignored editor IDs and a shared starting-model voltage-base mismatch.
The latter now rejects canonical loads whose voltage disagrees with the modeled
one-line instead of calculating at a stale voltage. A 65-point varying curve and
25/50-motor cases exercise the computation limits.

Final gates passed 452 Node test files, 34 focused cases, 45 selected Edge
journeys, build, lint, page-contract audit and whitespace checks. Nineteen frozen
source/test hashes matched, five source-PDF hashes matched, and the protected
device catalogs remained unchanged. Root inspected the readable export and clean
per-motor render. Logs, source evidence, independent numerical checks and exact
gate scope are retained in
`output/design-synthesis-motor-acceleration-2026-10-21/verification.json`.

For an installation-specific review, obtain complete applicable motor curves
and the driven-machine torque/inertia, verify the voltage-scaling model, then
evaluate thermal limits and the selected protective devices' clearing and
coordination. The full design goal remains active; motor Apply remains blocked.

## Automatic revision verification — October 21, 2026

Luna connected failed duration and torque results to actual affected-path
candidate revisions. Independent 25/50-load checks use a separate physical-V/A
network solution, independently transcribed cable impedances and a closed-form
mechanical integral. Fixed limits of 2.03 s and 2.045 s respectively require
exactly one #8 AWG to #6 AWG feeder/branch revision; unrelated paths retain
their sizes. The 25-load case changes from 2.05114 s to 2.01040 s under the
unchanged 2.03 s criterion.

A secondary-motor fixture exhausts conductor choices before testing the sourced
30/75/150 kVA transformer profiles and meets its original 2.05 s limit. A direct
480 V motor cannot consume a larger unrelated secondary transformer. Other
checks cover shared operating-revision budget consumption, known torque-deficit
recovery, malformed/numerically blocked models, and rejected regenerated
networks. Combined revision status cannot claim success when operating or
starting constraints remain unresolved. Final numerical evidence describes the
returned candidate; earlier candidates remain in compact history.

Verification passed 454 Node test files, 62 focused cases, 46 selected Edge
journeys, build, lint, page-contract audit and whitespace checks. One additional
run verified the saved revised JSON, text report and history image. Root
inspected the rendered history and readable export and compared the exported
JSON evidence. Device catalogs and runtime source hashes remained unchanged
during verification. Evidence is retained under
`output/design-synthesis-motor-acceleration-revision-2026-10-21/verification.json`.
This completes the bounded acceleration-driven revision milestone; the full
design goal and complete motor protection remain open.
