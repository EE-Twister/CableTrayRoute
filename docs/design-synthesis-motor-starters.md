# Motor starter assembly research candidate

Overall review class: **Screening only**.

This guide describes the manual-controller topology. The separate
[inverse-time branch-breaker integration](design-synthesis-motor-branch-breakers.md)
uses a larger 3RT2027 contactor and a 3VA51 breaker under a different certificate
table. Its ratings and installation conditions must not be mixed with those
below.

The motor review may show one exact-part Siemens direct-on-line assembly
candidate. It is an evidence-backed catalog fit screen with status
`researchStatus: "candidate"`, `libraryStatus: "screening"`, and
`protectionStatus: "blocked"`. It is never an approved starter, selected device,
or basis to apply a motor design. A candidate remains visible with its failed
or unevaluated checks so a reviewer can see why it does not fit or what evidence
is still missing.

## Input contract

The pure selector receives one normalized motor load, supply, and explicit
starter criteria:

```js
{
  load: {
    id: "P-101",
    voltage: 480,                 // motor circuit line-to-line volts
    phases: 3,
    frequencyHz: 60,              // effective motor-circuit basis
    motor: {
      ratedVoltageV: 460,         // retain the nameplate voltage separately
      nameplateCurrentA: 12.8,
      nameplateHorsepower: 10,    // explicit nameplate hp; never convert input kW
      nameplateFrequencyHz: 60,
      starterType: "dol"
    }
  },
  supply: {
    voltage: 480,
    phases: 3,
    frequencyHz: 60,
    availableFaultCurrentKA: 20,
    voltageSystem: {
      connection: "wye",
      grounding: "solid",
      lineToGroundVoltageV: 277,
      reference: "Project source voltage-system basis"
    }
  },
  criteria: {
    motorStarter: {
      controlVoltageV: 24,
      controlCurrentType: "DC",
      enclosureMm: { height: 610, width: 305, depth: 205 }
    }
  }
}
```

The generator normalizes the load and supply effective frequency from its
validated project basis. Motor nameplate frequency is a distinct required input
for this candidate. Existing motor records without explicit horsepower or
nameplate frequency remain valid for other motor calculations, but the assembly
selector reports those missing fields and does not claim a fit. An explicitly
supplied motor nameplate frequency must match the supported
60 Hz basis. A supplied 50 Hz motor blocks generation before a starting study
can return a passing result; it is not treated as a missing frequency.
The direct starting evaluator enforces this independently of the generator.
Its v3 validity contract checks supplied frequency aliases on the source,
project supply, criteria, canonical loads and one-line source/load records,
including their physical records. Conflicting aliases, null, numeric strings
and unsupported frequencies return a blocked result with no cases. Omitted or
undefined frequency fields retain the existing 60 Hz model basis, which is
stated in exported limitations. Source/load frequency values participate in
the starting evidence fingerprint.
The source and
motor circuit must both be directly 480 V, three-phase, 60 Hz, with no
transformer referral for the local fault bound. A motor rated 460 V remains
identified as a 460 V nameplate motor on the 480 V network. The supported
voltage-system basis is explicitly referenced, solidly grounded 480Y/277 V
wye, represented by nominal 277 V or the calculated 480/√3 value within machine
roundoff.

The compact UI sample is synthetic. It uses a 460 V, 10 hp, 12.8 A,
60 Hz nameplate on a direct 480 V circuit; the 14 A design full-load current
remains a separate conductor-design input. Its source voltage-system basis is
synthetic 480Y/277 V solidly grounded wye, source bound 20 kA, 24 V DC control,
and enclosure dimensions 610 × 305 × 205 mm. These values demonstrate the
candidate screen and do not describe an installed motor or starter.

## Candidate and bounded fit

The exact candidate comprises:

- Contactor **3RT2025-1BB40**: three-pole, S0, screw terminals, 24 V DC coil;
  product data lists a 14 A UL/CSA three-phase motor FLA at 480 V and 10 hp at
  460/480 V.
- Overload relay **3RU2126-4AB0**: S0, contactor-mounted, screw terminals,
  Class 10, adjustable 11–16 A.
- Manual motor controller **3RV2021-4AA10**: S0, screw terminals, 10–16 A
  adjustment range, 208 A instantaneous N-release; product data lists a 16 A
  UL/CSA three-phase motor FLA and 10 hp at 480 V.

Accordingly, the narrow numerical fit screen is limited to explicit motor
nameplate current from 11 through 14 A, explicit nameplate horsepower no greater
than 10 hp, and a 460 V or 480 V motor nameplate on a direct 480 V circuit.
Contactor FLA, relay range, and controller adjustment range are checked
independently. These catalog limits are not overload or short-circuit settings.
No horsepower is inferred from the equipment electrical-input kW.

For a 12.8 A motor-nameplate example, the candidate relay dial is 12.8 A. The
2025 certificate says relay trip current is 125% of the dial FLA, yielding a
published nominal calibration relation of 16 A. This relation is not an
overload code limit, a permitted field setting, or a time-current curve. The
controller actual setting remains unspecified; the selector never silently
sets it to 16 A. Its certificate row lists a 16.0 A controller condition, so
equivalence of the exact part and its applied setting to that tested condition
remains unresolved.

The 2025 certificate's Type 1, 480 V, 65 kA value is a conditional rating for
the listed combination and conditions. The helper compares a supplied
positive fault-current bound with 65 kA only when the local motor circuit is
explicitly direct 480 V, three-phase and the source has that same basis. If the
local basis is unsupported, the comparison is `unevaluated`; it does not
reinterpret a source-side bound across a transformer. The 65 kA figure is not
an assembled panel SCCR, complete interrupting-duty study, or declaration of
Type E/self-protected installation.

The certificate states a minimum enclosure dimension triplet of
610 × 305 × 205 mm but does not label its axes. Numeric comparison in entered
height/width/depth order is only a screening check. Orientation and actual
enclosure applicability remain unresolved. The Type 1 row does not establish
Type E accessories. Siemens lists 3RV2928-1H terminal blocks and 3RV2928-1K
phase barriers for relevant screw-terminal S0 Type E installations; their need
and installation are not selected here.

Every failed and unevaluated check is included in the review and text/JSON
report. Other unresolved items include branch-protection selection, local
motor fault contribution, ground-fault and asymmetrical duty, conductor
withstand, overload application and thermal protection, DOL starting ride
through, acceleration, installation conditions, and coordination. No clearing
times, curves, or standards-compliance conclusions are fabricated. A passing
screening check cannot clear the existing motor protection block on Apply.

The standalone overload-range selector may identify an S00 relay as its own
alternative. That candidate and the assembly's S0 relay describe alternative
proposals; they must not be read as two installed overload relays.

## Source evidence

The controlling combination evidence is [UL Certificate of Compliance E44653,
issued March 17, 2025](https://cache.industry.siemens.com/dl/files/299/40223299/att_1326996/v1/3RU2126_CoC_202505131337157102.pdf): page 8 lists the Type 1 combination, 480 V,
65 kA conditional rating, 16.0 A controller condition, and enclosure minimum;
page 2 states the relay's 125% trip calibration; pages 12–13 give branch
protection notes/table and exact suffix nomenclature. The exact article mapping
from the certificate families to the selected catalog articles is derived
using the product data below and is identified as such in the evidence record.

Siemens product records provide the individual exact-part data:

- [3RT2025-1BB40 contactor datasheet](https://support.industry.siemens.com/teddatasheet/?caller=SIOS&format=pdf&language=en&mlfbs=3RT20251BB40)
- [3RU2126-4AB0 overload relay datasheet](https://support.industry.siemens.com/teddatasheet/?caller=SIOS&format=pdf&language=en&mlfbs=3RU2126-4AB0)
- [3RV2021-4AA10 manual motor controller datasheet](https://support.industry.siemens.com/teddatasheet/?caller=SIOS&format=pdf&language=en&mlfbs=3RV2021-4AA10)
- [Siemens IC12, 2023 Type E terminal accessories](https://cache.industry.siemens.com/dl/files/824/109747824/att_1115550/v1/IC12_EN_2023_WEB_II_202209141408233539.pdf)

The 480Y/277 slash-voltage context is drawn from Siemens UL voltage-system
guidance and a G120D-specific 3RV2021 family application. The application
reference does not establish universal standalone use. The selector therefore
requires explicit source-system information and keeps system/grounding
applicability visible as a check; it does not treat an IEC 690 V insulation or
AC-3 rating as proof of a UL 480 V motor rating.

## Verification — October 19, 2026

Root review integrated Luna's selector and independently checked the source
row, calculation boundaries, generator output, rendered review and downloaded
reports. Overall readiness remains **Screening only**.

- All 430 Node test files passed on the final source state. All 42 focused
  cases passed, including the independent physical-voltage/current motor-start
  and mixed-voltage oracles, 25/50-load candidate integration, exact inclusive
  current and horsepower boundaries, input immutability and frequency bypasses.
- The full build and lint passed. The validation manifest records 430 suites,
  12,856 assertions and 25 benchmarks; these counts do not establish complete
  industrial-design readiness. Page-contract and whitespace checks passed.
- All 62 selected Edge cases passed on the final build. The new sample journey
  covers candidate identities, nominal relay calibration, unresolved controller
  setting and enclosure orientation, report/source evidence, horsepower
  rejection, control and grounding failures, edit invalidation, saved-draft
  reload, 50 Hz rejection and recovery. Apply stays disabled for motor designs.
- The final rendered starter review and actual downloaded text report were
  inspected. The report labels the standalone relay and assembly relay as
  alternatives. An earlier 61/62 run found an obsolete report-heading assertion;
  it was updated to the explicit conditional-comparison wording while retaining
  numeric and blocked-state assertions. The final 62-case run passed.
- Source review re-read the downloaded 2025 certificate's Type 1 HIC row,
  distinguishing it from the 5 kA table above it, checked the PDF hash and
  inspected the rendered page. Exact-part mapping remains derived, enclosure
  axes remain unlabeled and the actual controller setting remains unspecified.
  Individual Siemens datasheet fields were checked against primary cached
  search text; direct retrieval returned HTTP 403. No local copy of those
  individual datasheets is claimed.
- A separate synthetic 50-motor batch produced five panels, 55 circuits,
  50 converged individual starting cases and 50 research starter candidates.
  Its operating and initial starting screens passed; the proposal correctly
  remained blocked by unresolved motor protection. This is a batch integration
  check using synthetic motor inputs, not a manufacturer motor qualification.

Evidence is retained under
`output/design-synthesis-motor-starters-2026-10-19/`: `node-verified.log`,
`focused-verified.log`, `build-release.log`, `lint-release.log`,
`browser-verified.log`, the corresponding browser artifacts,
`source-row-review.json` and `motor-batch-review.json`. Earlier build and browser
logs are superseded by those final files. Firefox was not verified in this
milestone.

This closes the candidate-integration milestone. Complete branch protection,
the certificate's exact controller condition, motor overload application,
starting/thermal withstand, local fault contributions and coordination remain
open before a complete motor design can be applied. The full equipment-to-design
goal remains active.
