# Motor integration in equipment-to-design generation

Overall review class: **Screening only**. It does not complete automatic motor protection or the full industrial
design goal. Motor circuit diagnostics remain blocked from Apply while those
requirements are unresolved, even when operating and starting voltage pass.

## Current and power bases

Equipment `kw` remains three-phase electrical input power, with explicit running
`powerFactor`, `duty: "continuous"`, and `ratingsBasis: "electrical-input-kW"`.
It is not shaft output. A motor adds:

```json
{
  "motor": {
    "ratedVoltageV": 460,
    "fullLoadCurrentA": 14,
    "fullLoadCurrentBasis": { "reference": "Synthetic example; replace with applicable sourced design current" },
    "nameplateCurrentA": 12.8,
    "lockedRotorCurrentA": 90,
    "lockedRotorPowerFactor": 0.3,
    "starterType": "dol"
  }
}
```

These example values are synthetic, not a manufacturer preset. The design
full-load current controls a minimum branch ampacity of 1.25 times that current;
larger operating, thermal, terminal, and protective-candidate requirements still
control. Nameplate current is retained separately for future overload selection.
The generator does not substitute calculated running current for a sourced
design-current requirement. Present feeder sizing conservatively retains the
existing continuous allowance while adding motor design-current floors; it is
not an optimized multi-motor feeder calculation.

A 460 V motor rating and a 480 V network nominal voltage are different inputs.
The starting admittance uses the motor rating. Their presence does not prove
voltage suitability or adoption of a particular motor code-table row.

Eaton's [motor circuit protection tables](https://www.eaton.com/content/dam/eaton/products/electrical-circuit-protection/fuses/solution-center/bus-ele-tech-lib-motor-protection-tables.pdf),
printed pages 145–146, distinguish tabulated design currents, conductor sizing,
branch short-circuit protection, and separate overload protection. Its
[feeder guidance](https://www.eaton.com/content/dam/eaton/products/electrical-circuit-protection/fuses/solution-center/bus-ele-tech-lib-feeder-circuit-protection.pdf)
distinguishes largest-motor and remaining-load contributions. These historical
manufacturer explanations were inspected October 18, 2026; they do not establish
the governing edition or the applicability of an arbitrary supplied current.

## Initial starting-voltage screen

Starting requires a source impedance with a reference:

```json
{
  "supply": {
    "voltage": 480,
    "phases": 3,
    "availableFaultCurrentKA": 20,
    "motorStartingImpedance": {
      "rOhm": 0.006,
      "xOhm": 0.015,
      "reference": "Synthetic phase ohms at 480 V; nominal source-only current 17.153801 kA within the 20 kA bound"
    }
  },
  "criteria": { "motorStarting": { "minimumVoltagePu": 0.8 } }
}
```

These objects extend the existing supply and criteria, rather than replacing
their required fields. R and X are per-phase positive-sequence ohms on the source
voltage base. Available fault-current magnitude alone does not establish R/X.
The example voltage limit is an explicit project assumption, not a code default.

The Supply card's **Review starting source impedance** action can derive R and X
when a source-only three-phase symmetrical fault current and X/R ratio are
available for the same explicitly identified starting case at the stated source
voltage. Enter a reference for both values and confirm that case. The action
does not assume that the available-fault upper bound is the starting case. It
requires the case current to be at or below the separately entered bound and
previews the result before copying it into the draft.

If an advanced fault study already contains exactly one in-service equivalent
for the supply ID, **Copy supply equivalent from fault study** fills the starting
case from its referenced phase EMF and R/X. The source EMF must match the supply
voltage base, R must be positive, X nonnegative, and its implied source-only
current must satisfy the independently entered bound. The copied values are an
independent snapshot, not a live connection: later edits to the fault study do
not update the starting case. Editing a copied current or X/R clears its copied
reference, and editing any case field clears the confirmation. Review the
reference and explicitly confirm that
the source condition applies to starting; a fault case is not automatically a
starting case. This action does not establish the fault inventory's completeness
or make motor protection ready.

For line-to-line volts `V`, case current `I` in kA and `q = X/R`, the conversion
uses `|Z| = V / (sqrt(3) × I × 1000)`, `R = |Z| / sqrt(1 + q²)`, and `X = qR`.
These follow the [Schneider Electric impedance method](https://www.electrical-installation.org/enwiki/3-phase_short-circuit_current_%28Isc%29_at_any_point_within_a_LV_installation).
The equivalent is conditional on the starting model's 1.0 pu internal voltage
and the supplied case; it is not a worst-case starting assessment, full fault
duty, or protection coordination. The current, X/R, reference, source voltage,
phases and bound are retained in a derived basis. Editing those values or the
derived R/X blocks generation until the basis is reviewed again. The converter
does not overwrite independent or manually modified impedance data.

Each motor is started individually. The model replaces that motor's running
constant-power demand with a balanced locked-rotor admittance:

`Y = sqrt(3) × I_locked / V_rated × (PF_locked − j sqrt(1 − PF_locked²))`.

The shared AC network solver includes the source impedance, generated feeders,
branches and transformer, with other loads still at their running P/Q values.
The source internal open-circuit voltage is fixed at 1 pu. Reported voltage pu
uses each bus's network nominal voltage; motor current changes with terminal
voltage. The result checks all modeled bus voltages against the explicit limit.
It is an initial locked-rotor snapshot, not a time-domain acceleration study.

The starting model is restricted to 60 Hz. Supplied motor nameplate frequency
must be numeric 60 Hz; it is not inferred from horsepower or operating kW.
The v3 direct evaluator also checks supplied network frequency aliases at
the canonical input and one-line boundaries, so bypassing generation cannot
turn a 50 Hz case into a passing 60 Hz study. Omitted frequency fields retain
the documented legacy 60 Hz model basis. The motor starter guide records the
complete frequency contract and regression evidence.

Motor records may also retain an explicit `rotorType`: `squirrel-cage`,
`wound-rotor`, or `synchronous`. It is not inferred from DOL starting. The
separate [inverse-time branch-breaker method](design-synthesis-motor-branch-breakers.md)
supports only explicit squirrel-cage records and requires nameplate hp/Hz,
control supply and the stated NEC screening basis. Its exact breaker current
adds a conservative branch conductor floor; motor design FLC and feeder demand
remain separate. Unsupported combinations stay unresolved without substituting
a generic breaker. The manual-controller candidate remains the legacy default.

Schneider's [voltage-drop worked example](https://www.electrical-installation.org/enwiki/Calculation_of_voltage_drop_in_steady_load_conditions)
uses distinct starting current and power factor and accounts for upstream
voltage drop. This supports keeping the complex network and starting power
factor explicit; it is not a validation of this application's entire model.

## Source fault-bound consistency

For a motor proposal, the declared `supply.availableFaultCurrentKA` must bound
the nominal source-only symmetrical three-phase current implied by the starting
impedance: `I_source_kA = V_LL / (sqrt(3) * hypot(R, X) * 1000)`. This applies to
the source voltage base and the starting model's fixed 1.0 pu internal voltage.
[Schneider Electric's impedance method](https://www.electrical-installation.org/enwiki/3-phase_short-circuit_current_%28Isc%29_at_any_point_within_a_LV_installation)
distinguishes line-to-line voltage from per-phase impedance and combines R/X
as a complex magnitude. This arithmetic check is not a complete fault study.

The example above implies 17.153801 kA, below its explicit 20 kA external-source
bound. Lower implied current is permitted: a weaker starting source case can
be covered by a larger maximum fault bound. Missing or nonnumeric bounds,
negative/zero impedance, missing references, unsupported phases, unrepresentable
arithmetic, or implied current above the bound block the starting screen. Only
machine roundoff is allowed in the comparison; no engineering percentage margin
is introduced. The generator never increases a fault bound or changes R/X to pass.

`proposal.sourceFaultConsistency` and its dedicated check retain numerical
values, comparison, assumptions, limits and diagnostic reasons. The UI and text
report expose those values alongside the JSON evidence. The direct starting
evaluator also enforces the gate, checks canonical and modeled source voltage
bases, and fingerprints the bound and source ratings. A contradiction produces
no passing start cases. Input edits invalidate downloads until regeneration.
Other input failures do not relabel a separately passing source consistency
check as failed.

Maximum/minimum fault studies, voltage correction factors, motor/generator
contributions, asymmetrical duty, grounding, assembly SCCR and coordination
remain separate requirements. Passing this source check cannot clear the
existing motor protection block on Apply.

## Public data availability

The [ABB/Baldor GNEM2332T product record](https://www.baldor.com/catalog/GNEM2332T)
publishes 10 hp, 460 V, 60 Hz performance with 16.8 A rated current, 121 A starting
current, direct-on-line starting, and 0.61 full-load PF. It labels performance
as typical, not guaranteed. The inspected page does **not** provide locked-rotor
PF. Its 0%-load PF is a running no-load point, not locked-rotor PF. Accordingly
these values do not form a complete calculation preset and are not mixed with
the synthetic example above. An October 21 acquisition of its separate
[manufacturer information packet](https://www.baldor.com/api/products/GNEM2332T/infopacket)
found locked-rotor PF and rotor inertia that were absent from that HTML page.
The packet still lacks complete startup speed curves and driven-load data; see
the [acceleration evidence review](design-synthesis-motor-acceleration.md).
Missing values are not inferred or tuned to a desired pass.

## Manufacturer overload relay range candidates

Generation returns `motorOverloadCandidates.cases`, keyed by motor ID. A case
contains a sourced Siemens SIRIUS 3RU2 relay candidate whose published current
setting interval contains the explicit `motor.nameplateCurrentA`. Its
`dialSettingA` equals that nameplate current, following the Siemens operating
manual section 9.1; the referenced design-table FLC is never substituted.

The bounded inventory contains 44 screw-terminal, contactor-mounted S00/S0/S2
records spanning 0.11–73 A. Exact article numbers, setting intervals, sizes and
trip classes come from [Siemens IC10 2021, pages 7/98–7/99](https://cache.industry.siemens.com/dl/files/999/109771999/att_1058579/v1/SIRIUS_IC10_chap07_English_2021_202103301020326928.pdf).
The 62–73 A 3RU2136-4KB0 is Class 10A; the other included records are Class 10.
This historical catalog does not establish current availability. Exact product
data-sheet links remain identified as uninspected follow-up references.

For overlapping intervals, selection uses the narrowest interval, then its
lowest upper bound, then the article number. This is a deterministic range
choice, not a cost or complete-starter optimization. For example, a synthetic
12.8 A nameplate selects 3RU2116-4AB0, with an 11–16 A interval and a 12.8 A dial.
The review table and downloaded report show this distinction and retain sources,
field provenance and unresolved requirements. Input edits invalidate the result;
regeneration recomputes the range from the changed nameplate.

Range compatibility does not prove the permitted overload trip limit, starting
ride-through, motor thermal protection, contactor compatibility, starter system
voltage, ambient/installation applicability, SCGF protection or SCCR. The dial
number is not interpreted as an NEC maximum trip current. No curve is fabricated
and no record is promoted to the governed protective-device library. Missing or
out-of-inventory currents retain diagnostics; all motor proposals remain blocked
from Apply while complete motor protection is unresolved.

## Independent verification — October 19, 2026

The design synthesis now exposes a separate, exact-part motor-starter research
candidate. Its evidence, input contract, field provenance, and unresolved
conditions are documented in the [motor starter assembly research guide](design-synthesis-motor-starters.md).
The earlier 2018 certificate is superseded as the controlling research lead by
Siemens-hosted UL Certificate E44653 dated March 17, 2025. The current
certificate identifies a conditional combination row; exact article mapping,
controller setting, branch protection, enclosure application, starting duty,
and installation remain review conditions. This is not an assembly approval
and it is not applied to the separate S00 overload-range candidate. The
assembly's 3RU2126 relay is an S0 alternative, not a second installed relay.

All 426 Node test files, the full build, and lint passed. The seven independent
motor-start oracle cases cover a separately derived complex voltage divider,
460/480 V bases, source depression, starting power factor, malformed or incomplete
networks, 25/50-load mixed-voltage networks with other loads running, and real
conductor revisions. A separate physical-current/voltage network solution checks
every modeled bus and cable receiving current; convergence is required before
numeric agreement is accepted.

The 50-load network includes exact zero-impedance tie contraction and KCL-based
current reconstruction. This avoids an ill-conditioned Newton network without
changing the physical impedance, solver tolerance, or iteration budget.

A corrected synthetic 25-load case at a 0.970 pu starting criterion uses
0.002 + j0.014 ohm source impedance, implying 19.595918 kA under its 20 kA bound.
It initially produces 0.955609 pu with a #4 AWG motor branch. Seven conductor
revisions produce 0.970740 pu with a 4/0 AWG branch and a passing operating study.
The original ratings, locations, corridors, and voltage criterion remain intact.
A weaker consistent 0.006 + j0.015 ohm source instead reaches 0.969377 pu at
750 kcmil after 12 revisions and correctly fails without relaxing the 0.970 pu
criterion or raising the budget. Earlier fixture results (0.959925/0.971327 pu)
used contradictory source/fault inputs and are superseded by these corrected
cases. The synthetic inputs remain synthetic; numerical consistency does not
authenticate an installed source.
A separate 50-load case confirms that one operating revision consumes a shared
one-revision budget; starting trials cannot silently obtain another budget.

Final Node, build, lint and independent-oracle logs are retained under
`output/design-synthesis-motors-2026-10-18/` as `node-verified.log`,
`build-verified.log`, `lint-verified.log`, and `oracle-budget.log`.

All 61 selected Edge cases passed in the final run (`browser-verified.log`).
The motor browser case checks preservation through table edits, conductor
ampacity, starting results, blocked Apply, JSON/text exports, readable nested
input evidence, and stale-result invalidation. The rendered motor review table
and actual downloaded report were inspected. The earlier 60/61 run exposed a
test editing a collapsed JSON field; its selector flow was corrected. Report
inspection also exposed nested evidence rendered as `[object Object]`; the
renderer was corrected before the final build and 61-case run. Firefox was not
verified in this milestone.

The subsequent overload range-candidate integration passed all 427 Node test
files and lint on the final source state. Its 18 focused checks include independent
starting oracles, generated nameplate-based relay changes, out-of-catalog
diagnostics, endpoint inclusion, strict inputs and detached source metadata. A
50-load case starts three motors individually across both voltage levels and
compares all bus voltages and cable currents with the independent physical
network solution while the other motors remain at running demand.
The catalog source audit independently compared all 44 entries against extracted
PDF rows and inspected rendered pages 7/98–7/99. The source PDF SHA-256 is
`0f9bd5ec76a0d5dbc84816dc53472b88aa2b748030c937e0aa05ea1166611dfe`.
Audit evidence is retained in
`output/design-synthesis-overload-2026-10-19/catalog-independent-verification.json`;
final Node and lint logs are `node-final.log` and `lint-final.log` in that folder.
The final full build passed (`build-final.log`), including bundle, asset and
validation-manifest gates. All 61 selected Edge cases passed (`browser.log`).
The expanded motor browser case checks actual relay identity/range/dial in
JSON, the rendered review and downloaded report; it invalidates those outputs
after a nameplate edit and checks the new range after regeneration. The final
rendered table and downloaded report were inspected, including explicit
uninspected-source labels. Page-contract and diff-whitespace checks also passed.
Firefox remains unverified.

Regardless of those results, complete overload protection, motor-compatible
short-circuit protection, starting ride-through, acceleration/torque, thermal
starting withstand, motor fault contribution, SCCR, and coordinated settings
remain necessary to permit a complete motor design. Passing voltage alone
cannot clear these requirements.

The nominal source/fault consistency gate is implemented. The corrected test
fixtures satisfy it, while deliberately contradictory inputs remain covered by
blocking tests. Site source cases still require documented provenance and a
complete fault study before motor protection can be cleared. Current motor
Apply remains blocked pending that study and the assembly-protection work.

Source-consistency verification is retained under
`output/design-synthesis-source-fault-2026-10-19/`. The 28 focused cases pass,
including independent 3-4-5 impedance arithmetic, direct-evaluator bypass
checks, 25/50-load physical-network oracles, and both successful/exhausted
revisions under unchanged limits. All 428 Node test files, full build and lint
passed (`node.log`, `build.log`, `lint.log`). All 61 selected Edge cases passed
(`browser.log`). Page-contract, validation-manifest and whitespace checks passed.

The expanded motor browser case verifies a passing 20 kA source bound, editing
it to a contradictory 10 kA bound, stale-output invalidation, blocked generation
with all 25 equipment rows retained, JSON/text evidence, and recovery after an
explicit user edit restoring the bound. It also confirms motor Apply remains
blocked throughout. The actual blocked report and rendered review table were
inspected. `numerical-review.json` retains the final successful, exhausted and
source-inconsistent revision cases. Firefox remains unverified.

Initial review caught missing arithmetic-range guards and a canonical/model
voltage-base mismatch path; both now block explicitly. Correcting synthetic
source values also exposed an exhausted 0.970 pu case; it was retained as a
failure case, alongside a stronger consistent source case, rather than raising
the revision budget or weakening the voltage criterion. These corrections close
the nominal source consistency milestone, not complete motor engineering.
