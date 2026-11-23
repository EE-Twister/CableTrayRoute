# REM610 motor thermal-setting alternative

Overall review class: **Screening only**. This optional screen evaluates an
ABB REM610 ANSI DOL setting alternative from explicit motor and operating
inputs. Relay-specific context: it is separate from the Siemens 3RU overload-
relay research candidate, does not represent an installed setting, and never
enables motor Apply.

Add `motor.rem610Thermal` to an explicit motor record in Advanced equipment
JSON. The required references identify the supplied setting basis, motor
safe-stall time, reference start current, and prior load current. The numeric
inputs also specify configured ambient temperature, permitted hot/cold starts,
and the start-time margin. `candidateT6xSettingS` is optional; if omitted, the
screen reports the smallest available t6x setting that passes its
tolerance-aware checks. The advanced equipment JSON retains all values through
draft saves, reloads, and exports.

The screen requires the final motor acceleration result from the supplied
speed/current/power-factor/torque and load-torque curves. Its final calculated
acceleration time becomes the start time in the relay setting equations. The
explicit constant reference-start current must cover both the supplied
performance-curve current envelope at the canonical nominal-voltage ratio and
the maximum current observed on the final network timeline. It is used as a
constant setting-screen current basis; the screen does not integrate the
variable acceleration current trajectory. Missing, malformed, incomplete, or
nonconvergent acceleration inputs block this dependent screen.
Before using a supplied acceleration result, the thermal screen reruns the
bounded acceleration calculation on the finalized network and compares the
motor's duration, exposure, and timeline with that fresh result. A missing,
duplicate, changed, or non-reproducible case is blocked. The input fingerprint
alone does not establish that result values were produced by that network.
This comparison detects result inconsistencies; it does not authenticate the
underlying project inputs or establish physical motor behavior.

### Optional start-up exposure comparison

The same `rem610Thermal` input may include a `startupSupervision` object:

```json
{
  "reference": "Source of proposed relay configuration",
  "relayFlaPrimaryA": 20,
  "relayFlaReference": "Source of primary-equivalent relay FLA",
  "pickupMultipleOfFla": 5,
  "settingTimeS": 2,
  "pickupMode": "motor-start-condition",
  "startConditionActiveEntireTrajectory": true,
  "speedSwitchBlocking": false
}
```

The numbers shown are illustrative, not a recommendation. The final-network
acceleration calculation supplies a modeled phase-current integral in A²s. The
comparison divides that integral by `(relayFlaPrimaryA × pickupMultipleOfFla)²
× settingTimeS`, the nominal reference associated with the REM610's separate
start-up supervision element. For example, 20 A × 5 and 2 s give a 20,000 A²s
reference; a 5,000 A²s modeled integral is 25% of that reference. ABB's
manual specifies a 1–10 × FLA current-setting range and a 0.30–80 s time-setting
range. This implementation requires the explicit start-condition mode, assumes
that condition holds over the entire simulated acceleration, and requires the
speed-switch blocking input to be absent. Unsupported or incomplete conditions
block the requested comparison rather than extrapolate it.

The output is **nominal comparison only**, even if the percentage is below
100%. The integration error estimate is not a guaranteed physical bound; the
calculation does not validate setting increments or model actual start detection, relay tolerance, the 300 ms
minimum operating time, reset, CT configuration, a speed switch, contactor
clearing or motor thermal damage. It provides no trip prediction, protection
pass, approved setting, or alternative to the existing motor Apply gate. The
configuration references are supplied and unverified. The source is the
[ABB REM610 ANSI manual](https://library.e.abb.com/public/4774d1ee2bf67901c12579f7002d4e9e/REM610_TRM_755537_ENe_ANSI.pdf),
printed pp. 38–39 and 61.

This implementation follows the ABB *REM610 Motor Protection Relay Technical
Reference Manual — ANSI Version*, document 1MRS755537, version E / IED revision
C, dated 18 November 2011. The manual's equations 6–8 and stated 50% weighting
factor define the REM610 operation coefficients. The documented t6x range is
2.0 through 120.0 seconds in 0.5-second steps. For each setting, the result
reports nominal hot/cold operating times, the configured start requirements,
and an assumed timing envelope. The manual states ±5% of set operate time or
±1 second when current exceeds 1.2×FLA, and its printed p. 23 conditions that
accuracy on a phase-current/protected-unit scaling factor of 1.0. Accordingly,
the screen requires an explicit `currentScalingFactor: 1`; a nonunit factor
blocks setting recommendations while retaining nominal calculations for
inspection. This is important because the manual's p. 143 worked example uses
a CT/current scaling factor of 2000/1650 = 1.212, so that example does not
qualify for the stated operation-time accuracy.

The implementation uses the assumed envelope
`max(5% of predicted operate time, 5% of t6x setting, 1 second)` for each
hot/cold time. This is an explicit conservative model assumption to cover the
manual's wording ambiguity, not a guaranteed ABB timing tolerance. It is used
only for the unit-scaling case and must not be described as manufacturer
accuracy. The reference current must also exceed 1.2× both the calculated
internal relay FLA and nameplate FLA; otherwise the setting calculation is
blocked. Tolerance-aware feasibility uses the assumed envelope around
operation time: hot/cold lower bounds must cover the requested starts and the
cold upper bound must remain within the supplied safe-stall time. An explicit
candidate is checked against the same conditions. The reference PDF, inspected
pages, hashes, and research notes are archived under
`output/design-synthesis-motor-thermal-2026-10-21/sources/`; the source record
identifies ABB's [original manual PDF](https://library.e.abb.com/public/4774d1ee2bf67901c12579f7002d4e9e/REM610_TRM_755537_ENe_ANSI.pdf).

The manual's printed p. 143 example also shows why the prior-current basis must
be explicit. It gives 1650 A nameplate current at 50 °C, where the internal FLA
is 0.9×nameplate, and describes the relay curve at a prior load of 1×FLA. Using
1×internal FLA produces an approximately 11.096 s hot operate time; using
1×nameplate current produces approximately 8.948 s. Those example currents
have scaling factor 1.212, however, so the manual's stated accuracy condition
is not met and they cannot qualify an ABB setting recommendation here.

As a counterfactual calculation with explicit unit scaling, `q = 6/0.9` and
prior current 1485 A (1×internal FLA), the equations give about 11.096 s hot
and 20.189 s cold for `t6x = 25 s`. The cold nominal value is below the 21 s
safe-stall time, but the assumed envelope is 1.25 s and its upper bound is
21.439 s, so it fails. With that explicit prior current and this assumed
envelope, only `t6x = 24 s` is feasible; `24.5 s` is not. These are
source-inspired counterfactual values used to check the equation and envelope,
not an evaluated ABB example or a verified motor setting.

This is a relay-family-specific screen, not a generic thermal model. It does
not calculate actual motor thermal damage, integrate start current over time,
retain winding thermal state, model cooling between starts, or verify overload
and short-circuit coordination, CT configuration, start supervision, restart
inhibit, or protection adequacy. An ABB REM610 candidate cannot substitute for
a Siemens 3RU relay or any other relay family. The display and JSON/TXT reports
retain the relay manual reference, per-motor input references, acceleration
time, reference and observed current bounds, ambient/nameplate/prior-current
basis, current scaling factor and qualification status, required start times,
nominal and assumed-envelope operate times,
feasible settings, candidate result, model fingerprint, issues, and
limitations.

The supplied safe-stall time is a comparison limit at the referenced current
and conditions; it is not a universal hot/cold motor rating. Applicable motor
data must identify those conditions. The relay timing band does not account
for uncertainty in the acceleration model, a contactor's opening delay, or
unmeasured thermal history. The explicit start-time margin and these remaining
limitations must be reviewed separately.

**Load motor thermal relay sample** uses the existing 25-load synthetic DOL
starter example with one synthetic motor and explicit synthetic acceleration
curves. The safe-stall value, reference start current, prior load, ambient,
start counts, margins, curve inputs, and references are illustrative UI data.
They do not describe an ABB relay or an installed motor and are not drawn from
manufacturer motor data. The ABB manual supplies the relay equations only; it
does not authenticate the sample's motor values. Replace all synthetic inputs
with applicable motor and operating evidence, then have the exact relay
selection and full protection design reviewed by a qualified engineer.
The manual's 900 kW, 380 V worked example is a source benchmark, not an
available motor preset or a supported preset for the low-voltage synthesis
catalog.
Its factor of 1.0 is an explicit unit-scaling assumption for a counterfactual
normalized reference, not CT or field configuration evidence. A real nonunit
CT/current scaling factor blocks recommendations until the applicable relay
accuracy evidence supports that configuration.

See the [acceleration screen guide](design-synthesis-motor-acceleration.md),
[motor starting guide](design-synthesis-motors.md), and [Design Synthesis
overview](design-synthesis.md) for adjacent model boundaries.

Further manufacturer research identified [WEG product 12070752](https://www.weg.net/catalog/weg/RS/en/compare/12070752),
a 10 HP, 460 V, 60 Hz motor whose exact product page lists 30 s cold and 17 s
hot locked-rotor times and motor inertia. This is separate motor evidence;
the exact product's test conditions and speed curves remain incomplete. No
WEG preset or substitution into the synthetic example has been introduced.
The source observations and remaining gaps are retained under
`output/design-synthesis-motor-data-2026-10-23/`.

Verification completed October 23, 2026: all 460 Node test files, 62 focused
cases across eight files, and 49 selected Edge journeys across twelve files
passed, along with build, lint, the 80-route page-contract audit and whitespace
checks. Independent checks use an exponential threshold solution rather than
the implementation's logarithmic equation, and cover final revised 25/50-load
networks. Browser evidence covers draft reload, invalidation, missing references,
nonunit scaling, failing and off-grid candidates, and JSON/TXT consistency.
The readable report's per-circuit routing rows were also restored and verified
through the cooler-bypass save journey. Logs, source hashes and inspected
artifacts are retained in
`output/design-synthesis-motor-thermal-2026-10-21/verification.json`.
These checks establish the bounded screening feature; the complete motor
protection and motor-containing project integration goal remains unfinished.
