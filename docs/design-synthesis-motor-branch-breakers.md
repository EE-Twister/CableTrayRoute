# Motor branch-breaker research integration

## Additional 40 hp research candidate

For an explicit 40 hp, 460/480 V, 60 Hz, three-phase squirrel-cage DOL motor
on a direct 480 V circuit, a separate S2 research candidate considers Siemens
3RT2036-1NB30, 3RU2136-4HB0 (40–50 A) and 3VA5170-6EC31-0AA0 (70 A fixed
breaker pickup). The contactor's published UL/CSA motor rating is 52 A and
40 hp at 480 V. The [2023 Siemens-hosted UL certificate](https://cache.industry.siemens.com/dl/files/763/103200763/att_1148449/v1/3RU2136_CoC_202307191454405318.pdf?download=true)
lists the 3RT203. / 3RU2136-4H combination with a maximum 70 A 3VA51 breaker
and a conditional 25 kA rating at 480 V (PDF page 8). This is not the
standalone breaker's 65 kA interrupting rating, nor a complete panel SCCR.
Confirm the current certificate and installation applicability independently.
The same certificate states a trip-current calibration of 125% of the dial
FLA (PDF page 3). The candidate reports that published nominal calibration
separately from the proposed dial: for a 48 A dial it is 60 A. This is not an
installed setting, permitted overload limit, time-current curve, or clearing
time. The exact 70 A SIMARIS graphic is now located, with its displayed
415 V conditions and 480 V applicability qualification retained in the
[source review](design-synthesis-protection-curve-research.md#candidate-specific-source-availability).
The 30 A graphic is not transferred or scaled to the 70 A breaker.

The screen requires 24 V DC control, an explicit 40–50 A nameplate current,
referenced design current, a positive source-only fault bound no greater than
25 kA, and a 70 A breaker within both the 125% project screening floor and
historical 250% reference ceiling. The 70 A fixed pickup also enters branch
conductor screening. The 70 A TM230 candidate has listed settings of 350,
420, 490, 560, 630 and 700 A in the [Siemens SPEEDFAX catalog](https://cache.industry.siemens.com/dl/files/309/109983309/att_1316107/v1/SF-17-Sect-07-ALL-web.pdf?download=true),
printed page 7-53. These are proposed settings only. Starting tolerance, complete local
fault duty, grounding, the breaker time-current curve, protection coordination,
enclosure, terminals, and installation remain unresolved. This candidate is
not selected for Apply; motor Apply stays blocked.

Overall review class: **Screening only**. Motor proposals remain blocked from
Apply. This integration proposes an exact breaker/contactor/overload topology
and carries its current requirement into branch conductor sizing; it does not
establish complete motor protection or an assembled-panel SCCR.

The [curve source and geometry guide](design-synthesis-protection-curve-research.md)
records the matching 30 A manufacturer graphic now retained in candidate review
and reports. The 25 A candidate keeps a separate missing-source result. Offline
geometry transcription does not supply a qualified protective envelope or
change the motor Apply block.

## Inputs and supported topology

An optional `motor.instantaneousPickupA` sets a proposed pickup for that motor.
Omitting it inherits `criteria.motorStarter.instantaneousPickupA` for legacy
drafts; explicit `null` suppresses the inherited value. Each chosen setting is
checked against the exact candidate breaker's listed values, and is not a
verified installed setting or starting-tolerance calculation. The per-motor
selector in Design Synthesis exposes these choices. In Equipment List, the
corresponding `motorInstantaneousPickupA` field accepts a numeric value, `none`
to suppress inheritance, or blank to inherit; review and re-adopt changed
project equipment before generating a proposal.

Select the inverse-time breaker branch method explicitly. The existing manual
controller candidate remains a separate alternative, with its own conditions.
The new method does not install a 3RV controller alongside the branch breaker.

```js
{
  supply: { voltage: 480, phases: 3, availableFaultCurrentKA: 20 },
  equipment: [{
    id: 'M-01', kw: 9, voltage: 480, phases: 3, powerFactor: 0.86,
    duty: 'continuous', ratingsBasis: 'electrical-input-kW',
    motor: {
      ratedVoltageV: 460, fullLoadCurrentA: 14,
      fullLoadCurrentBasis: { reference: 'Identify the actual design-current source' },
      nameplateCurrentA: 12.8, nameplateHorsepower: 10,
      nameplateFrequencyHz: 60, rotorType: 'squirrel-cage', starterType: 'dol',
      lockedRotorCurrentA: 90, lockedRotorPowerFactor: 0.3
    }
  }],
  criteria: {
    code: 'NEC',
    motorStarter: {
      branchProtectionMethod: 'inverse-time-breaker',
      controlVoltageV: 24, controlCurrentType: 'DC',
      instantaneousPickupA: 150
    }
  }
}
```

These values are synthetic examples, not an installed motor specification.
The complete generation input also needs locations, permitted corridors,
installation criteria, and the referenced source impedance and minimum voltage
criterion for the separate starting study. Effective source and circuit
frequency must be 60 Hz. A nameplate of 460 V is permitted on the direct 480 V
circuit; a transformed 208 V circuit cannot borrow this certificate row or its
primary-source fault bound.

The exact research assembly is:

| Component | Identity and relevant limit |
| --- | --- |
| Contactor | Siemens **3RT2027-1BB40**, S0, screw terminals, three poles, 24 V DC coil; UL 480 V motor FLA 27 A and UL/CSA 460/480 V motor rating 20 hp. |
| Overload | Siemens **3RU2126-4AB0** (11–16 A) or **3RU2126-4BB0** (14–20 A), S0, contactor mounted, screw terminals, class 10. |
| Branch breaker | Siemens **3VA5125-6EC31-0AA0** (25 A) or **3VA5130-6EC31-0AA0** (30 A), three-pole 125 A frame, HEAS/H interrupting class, TM230 FTAM. Frame current is not the trip rating. |

The supported relay ranges limit this research assembly to 11–20 A nameplate
current, even though the contactor has a 27 A UL FLA rating. In the overlap,
the 11–16 A relay is selected first. Horsepower and nameplate current are
checked independently; neither is inferred from input kW.

## Selection and conductor sizing

The selector uses the separately referenced design FLC, not nameplate current,
for its conservative inverse-time breaker ceiling. It evaluates only the two
exact catalog parts above, in ascending trip-current order:

- Running current is electrical input watts divided by `sqrt(3) × V × PF`.
- The application imposes a conservative minimum fixed breaker pickup of
  `1.25 × max(nominal running current, referenced design FLC, retained operating-study current when available)`. This is a project
  screening policy, not a claimed NEC minimum breaker rating.
- The maximum is `min(2.5 × referenced design FLC, certificate limit)`:
  30 A for the 3RU2126-4A row or 40 A for the 3RU2126-4B row. Only the
  separately sourced 25 A and 30 A breaker articles are screened for this S0 route.
  No next-standard-size or starting exception is implemented.
- The selected breaker current becomes a conservative minimum for the
  branch's available conductor ampacity after route derating and terminal caps.
  It does not replace the motor's design current or inflate feeder demand by
  summing branch-breaker ratings.

A retained operating-study current carries an explicit reference and can
advance the exact candidate from 25 A to 30 A during bounded design revision.
It is not written back into nameplate current, design FLC or electrical input
kW. Final assembly evidence must use the same retained current basis that
produced the actual circuit selection. A known candidate whose continuous
rating is too small fails the operating check even while complete protection
remains unevaluated. An unsupported combination with no candidate can still
receive a separate numerical operating assessment; that does not clear its
failed protection check or allow Apply.

For a 14 A design FLC and 9 kW/0.86 PF at 480 V, running current is approximately
12.59 A. The branch-breaker interval is 17.5–30 A, so the exact 25 A part is the
first eligible research candidate. A branch conductor with only 24.375 A
available ampacity cannot satisfy this project's 25 A floor, even if it exceeds
the motor's 17.5 A conductor-design floor. This conservative policy does not
claim that all code-permitted motor conductor/protection combinations require
conductor ampacity equal to the breaker rating.

Both parts have the discrete instantaneous pickup choices **150, 180, 210,
240, 270, 300 A**. A value such as 151 A is invalid. An omitted pickup remains
unspecified; a supplied value is a proposed setting only. Its ability to ride
through starting and coordinate with upstream devices is unevaluated.
The workspace offers these choices in a dropdown and preserves imported
unsupported values with an explicit label so they can be corrected. A supplied
TM230 pickup with the manual-controller method blocks generation instead of
being silently ignored; clear the pickup before using that alternative.

An explicitly requested combination that fails these conditions retains its
rejection evidence and cannot silently fall back to the ordinary breaker
catalog. The otherwise supported operating and starting studies remain
separate from this unresolved protection selection.

## Certificate and source evidence

The [2025 UL certificate E44653](https://cache.industry.siemens.com/dl/files/299/40223299/att_1326996/v1/3RU2126_CoC_202505131337157102.pdf),
dated March 17, 2025, **PDF page 12 lower table**, scopes this row to
**3RT2027/3RT2028** contactors with 3RU2126. Its -4A row permits a maximum
30 A 3VA51 HEAS breaker and a conditional **Type 1, 65 kA at 480 V** combination
rating. The adjacent -4B row permits a maximum 40 A 3VA51 HEAS breaker at the
same conditional rating; the [exact 3RU2126-4BB0 product record](https://sieportal.siemens.com/en-be/products-services/detail/3RU21264BB0)
identifies its 14–20 A S0 class-10 relay. The application does not select a
35 A or 40 A breaker merely because the certificate permits it. The separate 3RT2023/2024/2025/2026 heading on page 11 and continuation
at the top of page 12 are not the basis for this 3VA51 combination.
Page 13 maps the exact relay suffix into the family. The page 12 notes retain
application-specific BCPD selection requirements; they do not establish
complete field suitability.

The [Siemens SPEEDFAX breaker catalog](https://cache.industry.siemens.com/dl/files/309/109983309/att_1316107/v1/SF-17-Sect-07-ALL-web.pdf?download=true)
provides HEAS 65 kA straight-480 V and 50/60 Hz ratings on PDF page 50,
the exact ordering numbers on page 51, and discrete TM230 settings on page 53.
These PDF pages match printed 7-50, 7-51 and 7-53. The breakers ship without
lugs; the application does not silently supply connection hardware.

Exact-article contactor evidence includes the
[English datasheet](https://support.industry.siemens.com/teddatasheet/?caller=SIOS&format=pdf&language=en&mlfbs=3RT20271BB40)
for 27 A UL FLA and the
[Spanish datasheet](https://support.industry.siemens.com/teddatasheet/?caller=SIOS&format=pdf&language=es&mlfbs=3RT2027-1BB40)
page 5 for 20 hp. Indexed primary-source text was inspected; direct retrieval
of those PDFs was unavailable. No accessory-suffixed article is substituted
as proof of the base contactor's rating.

The [Eaton/Cooper Bussmann motor circuit note](https://www.eaton.com/content/dam/eaton/products/electrical-circuit-protection/fuses/solution-center/bus-ele-tech-lib-motor-circuit-notes.pdf)
is historical **2005** manufacturer guidance, printed page 142. It supports the
250% squirrel-cage inverse-time reference and distinction between design FLC
and nameplate current. It does not establish the project's adopted NEC edition
or all applicable conditions and exceptions.

Certificate SHA-256:
`c55126215a47084e9d40a8f0e11589a083285798a294c2ff32ce1ef00e55d45d`.
SPEEDFAX SHA-256:
`0ccebc370709cac0e919b99369693e64722183d0c27fdaeb766215722396f6cb`.
Original PDFs, extracted tables and rendered source inspections are retained
under `output/design-synthesis-motor-starters-2026-10-19/sources/` and
`output/design-synthesis-motor-branch-protection-2026-10-19/sources/`.

## Remaining requirements

This straight-480 V breaker route does not inherit the separate manual
controller's slash-voltage or minimum enclosure conditions. Grounding and
ground-fault application still need evaluation. The 65 kA comparison uses the
declared external source bound only; motor contribution, minimum fault duty,
asymmetry, conductor withstand, exact TCC clearing behavior, starting thermal
limits, selective coordination, control circuit protection, lugs, enclosure,
ambient/enclosure derating, assembly listing and adopted-code application
remain open. The 50 C conductor regression verifies the cable table adjustment;
it does not qualify the starter or breaker for that ambient.

Research records retain `researchStatus: candidate`, `libraryStatus: screening`,
`protectionStatus: blocked`, and `selectedForApply: false`. Neither a successful
fit screen nor a passing starting-voltage result clears motor Apply. The full
equipment-to-design objective remains active.

## Verification record

Independent review on October 19, 2026 checked the rendered certificate/table,
source hashes, exact contactor family, discrete pickup settings and arithmetic
bounds. It corrected a mismatched contactor-family draft before integration,
numeric overflow, unsupported-input display, silent pickup/method mismatch,
and loss of operating-current floors during starting revisions.

Completed gates:

- `npm test`: **432 Node test files passed**. The motor/helper/starting suites
  include 54 focused test cases, including 12 independently authored branch
  acceptance cases. Expected calculations use separate current/thermal
  arithmetic and exact boundary inputs.
- `npm run build`: passed, including catalog validation, bundle budgets and
  asset-reference checks. The generated manifest records 432 suites, 12,998
  assertions and 25 benchmarks; these counts do not establish full engineering
  coverage or protection qualification.
- `npm run lint` and `git -c core.safecrlf=false diff --check`: passed.
- **63 selected Edge browser cases passed**, covering the new branch sample,
  exact cable/one-line identity, proposed-setting changes, imported invalid
  151 A display, rejected rotor type, reload/recovery, manual-method mismatch,
  existing manual-controller workflow, and broader design/apply handoffs.
  The first run had 62 passes and one outdated SCCR wording assertion; the
  assertion now matches the explicit assembled-panel wording, with its numeric
  checks retained. The final full selected run passed. Firefox was not run
  because its Playwright executable is absent.
- The rendered candidate review and exported successful-fit/rejected reports
  were inspected. They retain exact parts, primary sources, unresolved checks
  and the motor Apply block. The final screenshot has the same SHA-256 as the
  inspected first-run screenshot.
- Synthetic 25/50-load cases with one motor and a separate **50-motor** case
  passed operating/starting checks. The 50-motor case generated five panels,
  55 circuits, 50 converged individual starting cases and 50 exact 25 A branch
  candidates, while remaining blocked for unresolved protection.
- A synthetic 14.2 kW boundary case initially calculated 20.064938112 A and
  rejected the 25 A operating-current screen. Bounded revisions selected the
  exact 30 A breaker, retained that current floor through a starting revision,
  and improved the initial 0.977090431 pu result to 0.980335158 pu against the
  unchanged 0.98 pu starting criterion. Cable and final assembly evidence agree.
- At 50 C and an explicitly assumed 20 grouped conductors, the independent
  0.375 factor gives #6 copper 24.375 A and #4 copper 31.875 A. The proposal
  selects #4 for its 25 A floor; it does not stop at the 17.5 A motor floor.

Evidence is retained under
`output/design-synthesis-motor-branch-protection-2026-10-19/`:
`verification.json`, `source-review.json`, `batch-review.json`, `node.log`,
`build.log`, `lint.log`, `browser-verified.log` and `browser-verified/`.
`browser.log` and `browser/` are the superseded first browser run. The exact
selected command, source hashes and remaining scope are in the verification
record. These gates establish this integration milestone, not completion of
the full equipment-to-design objective or complete motor protection.

## Breaker ambient evidence for the 40 hp research candidate

The exact 70 A manufacturer graphic is now located in SIMARIS, with archived
350 A and 490 A setting exports. Its displayed 415 V conditions remain
unqualified for the 480 V proposal; see the [curve source review](design-synthesis-protection-curve-research.md#candidate-specific-source-availability).
This replaces the earlier missing-source search outcome without changing
the unresolved numerical timing and protection status.

The indexed October 29, 2025 [Siemens 3VA5170-6EC31-0AA0 product data sheet](https://support.industry.siemens.com/teddatasheet/?caller=SIOS&format=pdf&language=en&mlfbs=3VA5170-6EC31-0AA0)
lists operating currents of 70 A at 40 °C, 69 A at 45 °C, 68 A at
50 °C, 67 A at 55 °C, 66 A at 60 °C, 65 A at 65 °C and 64 A at
70 °C (page 1). It also identifies the device as not marked as a 100%-rated
breaker. The synthesis candidate's 70 A fixed trip setting is not an
assessment of its installed operating current at the enclosure temperature.
The source does not by itself establish a suitable installed temperature,
enclosure, loading, trip time or conductor rating. A separate
[Siemens datasheet hosted by a distributor](https://my.goagilix.com/assets/f3/d8/f3d80715-800d-46a1-a55a-b841b5dfbe99/Sentron_3VA51706EC310AA0_Specification_Sheet.pdf)
reports different 45–65 °C values, including 68.9 A at 45 °C and 64.7 A at
65 °C. Its date and the reason for the difference are not established. The
applicability of either table to the installation must be reconciled.

For this exact 70 A candidate, the motor starter controls optionally accept a
breaker enclosure temperature and a nonblank reference. They must use one of
the seven listed temperatures. The screening compares the project's existing
125%-of-current sizing floor with the 2025 table value; exceeding that value
rejects this research candidate. A result within the table remains
**unevaluated**, with both source versions and their difference disclosed. No
interpolation, actual installation rating, code approval, or complete
protection is inferred. Missing temperature remains unevaluated. Do not
substitute cable-corridor ambient for breaker enclosure ambient. This control
does not apply the 70 A table to other breaker models.

Individual 40 hp motors can instead supply a temperature and its own reference
in Equipment List or the motor-nameplate table. A motor override replaces the
project temperature **and** its reference; partial overrides are blocked. The
explicit **Not specified for this motor** selection suppresses project
inheritance, so the comparison remains unevaluated for that motor. Blank
selection inherits the project basis. Project mapping, proposal JSON and the
candidate evidence retain which basis was used. The separate 25 A and 30 A
breakers cannot use this 70 A table.

## 25 hp S2 research combination

For an explicitly identified 25 hp, 460/480 V, 60 Hz squirrel-cage DOL motor
on a direct 480 V, three-phase, 60 Hz circuit, the research selector also
screens **3RT2036-1NB30 + 3RU2136-4EB0 + 3VA5150-6EC31-0AA0**. The motor's
nameplate current, independently referenced design FLC, electrical-input kW,
power factor, and 24 V DC control basis must be supplied. The overload's dial
range is 22–32 A; the proposed dial uses the supplied nameplate current. The
contactor's published 480 V FLA is 52 A and its 460/480 V three-phase hp rating
is 40 hp. The proposed breaker is 50 A with the listed 250, 300, 350, 400, 450,
and 500 A TM230 instantaneous settings. A project-wide pickup can be selected
from supported values, but each individual candidate must support the selected
value; per-motor overrides and explicit no-setting choices remain available.

The [Siemens-hosted 2023 UL certificate](https://cache.industry.siemens.com/dl/files/763/103200763/att_1148449/v1/3RU2136_CoC_202307191454405318.pdf?download=true)
page 8 lists the 3RT203. / 3RU2136-4E family at 22–32 A with a 50 A maximum
3VA51 breaker and 25 kA at 480 V. This is a conditional combination value;
the coordination type is not established and it is not assembled-panel SCCR.
The [exact relay data sheet](https://support.industry.siemens.com/teddatasheet/?caller=SIOS&format=pdf&language=en&mlfbs=3RU2136-4EB0)
identifies the 3RU2136-4EB0 as an S2 class-10 relay. The Siemens SPEEDFAX
catalog linked above identifies the 50 A HEAS ordering number, standalone 65 kA
interrupting rating at 480 V, and the listed TM230 settings. The 25 kA comparison
uses the declared source-only upper bound; motor contributions and complete
local fault duty remain unresolved. The certificate downloaded for this review
has SHA-256 `123647d6ab60ec11b41fc21f4a4e52c66814d7a4769fbd0c9ad57733fdc83ed6`;
it is a separately retrieved file from the previously archived certificate bytes.

As a source-data example, [WEG product 13129039](https://www.weg.net/catalog/weg/PY/en/compare/13129039)
lists a 25 hp, three-phase, 60 Hz motor at 230/460 V with 59.0/29.5 A rated
current and 366/183 A locked-rotor current at those voltages. These are product
values, not evidence that this motor is installed at a particular site. They do
not supply the locked-rotor power factor, project design FLC, operating load,
or starting/withstand curves required by the wider workflow. The regression
fixture uses independently labeled synthetic values for those missing inputs.

The 125%-of-current lower screening floor and historical 250%-of-design-FLC
upper reference are applied without inferring code adoption or exceptions.
The candidate's breaker Ir is retained as an additional conductor-ampacity
floor. Missing or unsupported component data, mismatched pickups, unsupported
starter classifications, fault bound above 25 kA, and incompatible motor
ratings reject the candidate. A 70 A breaker ambient table is never applied to
this 50 A device. The exact 50 A curve has not been qualified or reviewed; no
30 A or 70 A curve is transferred. Starting ride-through, ambient/enclosure
suitability, full fault duty, conductor withstand, coordination and complete
motor protection remain unresolved. **Motor Apply remains blocked.**


## Additional S2 research combinations

The S2 shortlist also screens motors up to the contactor's 40 hp rating against
additional exact relay and breaker combinations. The existing smaller starter
is retained when it fits; an eligible S2 combination can be considered when it
does not. The 25 hp 50 A combination above remains preferred when it fits; the
separately evaluated 40 hp combination retains its own criteria.

| Relay | Dial range | Exact HEAS breaker | Certificate maximum | Listed TM230 instantaneous settings |
| --- | --- | --- | --- | --- |
| 3RU2136-4DB0 | 18–25 A | 3VA5135-6EC31-0AA0, 35 A | 35 A | 175, 210, 245, 280, 315, 350 A |
| 3RU2136-4EB0 | 22–32 A | 3VA5150-6EC31-0AA0, 50 A | 50 A | 250, 300, 350, 400, 450, 500 A |
| 3RU2136-4FB0 | 28–40 A | 3VA5160-6EC31-0AA0, 60 A | 60 A | 300, 360, 420, 480, 540, 600 A |
| 3RU2136-4GB0 | 36–45 A | 3VA5160-6EC31-0AA0, 60 A | 60 A | 300, 360, 420, 480, 540, 600 A |

The [Siemens-hosted UL E44653 certificate](https://cache.industry.siemens.com/dl/files/763/103200763/att_1148449/v1/3RU2136_CoC_202307191454405318.pdf?download=true),
page 8, identifies these 3RT203. / 3RU2136 / 3VA51 family combinations and the
25 kA conditional value at 480 V. The exact relay data sheets are
[4DB0](https://support.industry.siemens.com/teddatasheet/?caller=SIOS&format=pdf&language=en&mlfbs=3RU2136-4DB0),
[4EB0](https://support.industry.siemens.com/teddatasheet/?caller=SIOS&format=pdf&language=en&mlfbs=3RU2136-4EB0),
[4FB0](https://support.industry.siemens.com/teddatasheet/?caller=SIOS&format=pdf&language=en&mlfbs=3RU2136-4FB0), and
[4GB0](https://support.industry.siemens.com/teddatasheet/?caller=SIOS&format=pdf&language=en&mlfbs=3RU2136-4GB0).
The SPEEDFAX catalog cited above supplies the breaker order numbers and settings.
Each proposed part must meet its own nameplate, sizing, source fault, control,
and pickup checks. An entered 70 A ambient basis is not applied to these
breakers. A motor may explicitly suppress its applicable project ambient basis. The independent 35–60 A project basis and candidate-specific tables are described below. The exact [Siemens 60 A SIMARIS graphic](https://curves.simaris.siemens.com/curves/3VA51606EC310AA0#trip) has now been located. Its viewer displays 415 V and 40 °C, so its applicability to the 480 V proposal is unqualified. Separate archived PDF exports under `output/motor-s2-exact-data/` identify 300 A and 480 A instantaneous settings (SHA-256 `510a94e7894c321ead74edf7a755d27718d002d5a095fefc2b9ff8db9fec7d22` and `0ac65017ced1114fdb41af5a5557dedbd95ca333612a65756546579d7dc4844b`). The viewer URL does not encode the chosen pickup; verify it after reopening. The graphics do not provide qualified numerical minimum-trip or total-clearing envelopes. The 35 A and 50 A graphic availability has not been reviewed; existing 30 A and 70 A graphics are not transferred. The same outstanding fault, starting,
installation and coordination limitations apply; **motor Apply remains blocked**.


## Larger S3 research candidate

The inverse-time selector also screens a **3RT2046-1NB30 contactor,
3RU2146-4JB0 overload relay, and 3VA5290-6EC31-0AA0 breaker** for a directly
supplied 480 V, three-phase, 60 Hz squirrel-cage DOL motor above 40 hp and no
more than 75 hp. The relay requires a nameplate current from 45 to 63 A. The
contactor has a published 96 A UL/CSA three-phase FLA at 480 V and 75 hp at
460/480 V; its 20–33 V AC/DC coil is screened here only against the explicitly
selected 24 V DC control basis. Electrical-input kW, referenced design FLC,
nameplate current, and nameplate horsepower remain independent inputs.

The [Siemens-hosted UL E31519 certificate](https://cache.industry.siemens.com/dl/files/233/109742233/att_1348606/v1/UL_CoC_3RT2_4-2025_202511121349065039.pdf),
generated October 28, 2025, lists the 3RT204 / 3RU2146-4J family with a 3VA52
HFAS/CFAS breaker up to 200 A and a conditional 65 kA at 480 V (PDF page 17).
The exact [contactor data sheet](https://support.industry.siemens.com/teddatasheet/?caller=SIOS&format=pdf&language=en&mlfbs=3RT2046-1NB30),
[relay product record](https://mall.industry.siemens.com/mall/en/EN/Catalog/Product/3RU21464JB0),
and [Siemens SPEEDFAX catalog](https://cache.industry.siemens.com/dl/files/309/109983309/att_1316107/v1/SF-17-Sect-07-ALL-web.pdf?download=true)
provide the part-specific fit limits, HFAS breaker and its fixed 90 A Ir and
450, 540, 630, 720, 810, and 900 A instantaneous settings. The HFAS breaker's
standalone interrupting rating and the certificate's conditional combination
value are distinct claims. The family-to-exact-part mapping is a preliminary
comparison, not confirmation of a complete listed starter or panel SCCR.

The conservative breaker screen requires 90 A to be no less than 125% of the
largest referenced design, calculated running, or supplied operating current,
and no more than the historical 250%-of-design-FLC reference. These are
screening bounds, not a code determination. The selected breaker adds a 90 A
conductor-ampacity floor. An explicitly supplied motor-specific temperature
basis for the other breaker families rejects this candidate; their tables are
not transferred. No S3 relay nominal trip calibration or breaker timing envelope
is inferred. Local fault duty, starting withstand, installation, coordination
and complete motor protection remain unresolved; **motor Apply stays blocked**.

## 35–60 A breaker enclosure-temperature screening

An optional **35–60 A S2 breaker enclosure temperature** and reference provide
an explicit project basis for the 35, 50, and 60 A candidates. In input JSON,
set `criteria.motorStarter.s2BreakerAmbientTemperatureC` and
`criteria.motorStarter.s2BreakerAmbientReference` together. The existing
70 A project basis remains independent and applies only to the separately
screened 70 A candidate; older projects are not reinterpreted. Each motor may
supply a referenced override, inherit the applicable project basis, or choose
not specified to suppress inheritance. The 25 and 30 A breaker candidates do
not use these tables. Enclosure temperature is not cable ambient temperature.

The selector compares the existing 125%-of-current screening floor against the
exact-part published operating current at one of the seven listed temperatures.
It rejects a candidate whose floor exceeds the comparison value; a value within
the table remains **unevaluated**, not an installed rating, 100%-rated breaker
claim, code determination, or protection approval. There is no interpolation.
A missing, partial, unsupported or unreferenced input cannot become a pass.
An alternate candidate is screened against its own table and combination limits.

| Enclosure °C | 35 A: 2024 | 35 A: 2020 | 50 A: 2020 | 60 A: 2023 |
| --- | --- | --- | --- | --- |
| 40 | 35 | 35 | 50 | 60 |
| 45 | 34 | 34.4 | 49.1 | 59 |
| 50 | 34 | 33.9 | 48.3 | 58 |
| 55 | 33 | 33.4 | 47.5 | 57 |
| 60 | 33 | 32.9 | 46.7 | 56 |
| 65 | 32 | 32.4 | 46 | 55 |
| 70 | 32 | 31.9 | 45.2 | 54 |

The Siemens-authored [35 A 2024 sheet](https://docs.rs-online.com/9ab1/A700000011979558.pdf)
and [35 A 2020 sheet](https://datasheet.octopart.com/3VA5135-6EC31-0AA0-Siemens-datasheet-180754463.pdf)
report different values at several temperatures. The selector retains both and
uses the lower value for preliminary rejection only; the reason for the
revision differences and applicability to the actual breaker remain unresolved.
The other rows use the exact-part [50 A 2020 sheet](https://datasheet.octopart.com/3VA5150-6EC31-0AA0-Siemens-datasheet-141221825.pdf)
and [60 A 2023 sheet](https://media.distributordatasolutions.com/siemenscomplete/2023q1/documents/5e2548dca669afb232592124109988fe4c9941f7.pdf).
These older data sheets need to be reconciled with the installed device and its
current manufacturer information. The inspected PDFs and page renders are
archived under `output/motor-s2-exact-data/`, and proposal evidence includes
source revisions, document hashes, both 35 A values and the selected basis.
No temperature comparison qualifies the complete assembly or resolves fault
current, starting, installation or selective coordination. **Motor Apply remains
blocked.**
