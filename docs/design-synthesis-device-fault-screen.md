# Proposed device locations and initial-current screening

Review class: **Screening only**. This step connects the optional
[explicit fault network](design-synthesis-fault-network.md) to proposed protective
device locations. It does not complete fault duty or motor protection. All motor
proposals remain blocked from Apply.

## Workflow and output

Generate a proposal with `faultStudy`, or choose **Load motor fault network
sample**. After the network cases, **Proposed device locations and initial-RMS
screen** shows the proposed location, applicable standalone interrupting rating,
line-terminal available current, and maximum current through the device among the
modeled cases. These are different quantities. Reports and proposal JSON retain
the same distinctions. Editing inputs invalidates the previous result.

Each generated cable has a proposed device at its source end. The transformer
primary device alias resolves to its primary feeder's source-end device; it is
not a second physical device. A proposed aggregate secondary main covers all
outgoing secondary panel feeders at the transformer secondary terminals. This
requires an explicit, unambiguous cut and matching transformer aliases. Locations
are generated proposals, not verified installed facts. This step records placement
metadata; it does not add separate breaker vertices to the canonical one-line.

`analysis/designSynthesisDeviceFaultScreen.mjs` exports
`evaluateDesignSynthesisDeviceFaultScreen({ proposal, faultStudyValidation })`.
The generator attaches `proposal.deviceFaultValidation` only when the optional
fault study is requested. Its method is
`design-synthesis-proposed-device-initial-rms-screen-v1` and its scope is
`initial-symmetrical-rms-only`.

The output retains a combined `modelInputFingerprint`, a separate
`networkModelInputFingerprint`, and `deviceInputFingerprint`. Device evidence,
placement endpoints and protection aliases participate in the device identity.
The evaluator recomputes the network and compares the supplied case content as
well as its input identity; an unchanged fingerprint alone cannot validate edited
cached current values. These fingerprints identify revisions, not authenticity.

## Calculation basis

All generated bus faults must be evaluated. A partial `faultBusIds` request can
still calculate its selected network cases, but cannot produce a complete device
screen. Stale cases, inconsistent endpoints or ambiguous transformer protection
locations suppress device comparisons. Missing ratings remain `not-compared`.

For an ordinary proposed source-end device on branch A to B, the current through
the device for each original bus fault is the branch's signed from-terminal
complex current. A separate fault immediately on the device's load side assumes
an ideal closed device with zero impedance. KCL gives:

```
Idevice(load-side fault at A) = Ifault(base fault at A) + Ibranch,from(base fault at A)
```

This addition uses complex phasors in kA, not magnitudes. Contributions entering
the fault from downstream can bypass that device. An original bus fault at A is
on the upstream side and can drive a different current through it. Complex signs
follow the stated terminal orientation; the sign of a single component does not
by itself establish physical reverse-feed suitability.

For the aggregate secondary main, feeder currents are summed as phasors at the
same voltage. KCL permits the negative transformer secondary-terminal current to
represent this cut for faults away from that bus and for its immediate load-side
fault. The original secondary-bus upstream-side fault separately retains the
downstream feeder backfeed sum. Primary and secondary currents are never added
across their different voltage bases.

The standalone comparisons are line-terminal available initial RMS and maximum modeled
through-device initial RMS against a documented, voltage-applicable standalone
breaker interrupting rating. Status is `not-exceeded`, `exceeds-rating`, or
`not-compared`. An exceedance adds a blocking proposal issue and clears the
distribution baseline. A non-exceeded result is limited to the supplied initial
model; `protectionAdequacy` always remains `unevaluated`. Existing conservative
device selection from the supplied external fault bound is retained. Separately,
for the exact supported motor research combinations, the line-terminal
initial-RMS value is compared with the value cited in the candidate's certificate
row: 25 kA at 480 V for the supported S2 combinations, and 65 kA at 480 V for
the supported smaller 3RT2027 / 3RU2126 / 3VA51 HEAS combinations. The result is either
`above-cited-value`, `not-above-cited-value-unqualified`, or `not-compared`.
An above-value result blocks the proposal and identifies the relevant case; a
not-above result is not an assembly rating or protection approval. This check
requires matching candidate identity, contactor, overload, breaker, cited
certificate data and provenance, location voltage, complete fault-bus coverage,
and a fresh network. For the smaller combinations the 2025 certificate's HEAS
class, exact 25 A or 30 A breaker, relay family and setting range, contactor,
three certificate field references and archived source hash must match. Other
motor combinations are not compared. Candidate evidence participates in the
device fingerprint.

## Source basis and limits

ABB's handbook explains that the arrangement and fault location producing the
highest current involving a device must be considered, including motor
contributions. Its examples consider faults on either side of a breaker. This
supports examining device current separately from a single bus total; the KCL
transformation above is independently tested against explicit ideal breaker
branches. See [ABB Electrical installation handbook, Volume 2, Annex C, printed
pages 220–223](https://library.e.abb.com/public/a5861200ea7c59fec1256dc50039e0ed/1SDC010001D0201.pdf).

Eaton distinguishes individually rated breakers from tested series combinations
and discusses separate motor-contribution restrictions. We use that distinction
to keep standalone rating comparisons separate from conditional combination
ratings, not to infer a series rating or current adopted-code compliance. See
[Eaton Bussmann series-rated systems guide, PDF pages 1 and 3](https://www.eaton.com/content/dam/eaton/products/electrical-circuit-protection/fuses/solution-center/bus-ele-tech-lib-circuit-breakers-series-rating.pdf).

For the exact motor research breaker, the standalone 65 kA at 480 V rating has
separate field provenance in [Siemens SPEEDFAX, printed 7-50 through
7-53](https://cache.industry.siemens.com/dl/files/309/109983309/att_1316107/v1/SF-17-Sect-07-ALL-web.pdf?download=true).
The [E44653 combination certificate, PDF page
12](https://cache.industry.siemens.com/dl/files/299/40223299/att_1326996/v1/3RU2126_CoC_202505131337157102.pdf)
is separate evidence for a conditional assembly combination. Neither one
establishes complete motor protection or an approved assembly SCCR here.

The 35, 50, 60, and 70 A S2 research breakers now include explicit source
references for both the 65 kA standalone interrupting value and its 480 V
rating basis. Previously the missing voltage field source caused these devices
to be marked not comparable even with a complete modeled fault network. The
screen can now evaluate their initial symmetrical RMS values at the proposed
source-end locations. Removing or changing the rating or voltage provenance
still blocks standalone comparison. The distinct cited-value comparison uses
[E44653, PDF page 8](https://cache.industry.siemens.com/dl/files/763/103200763/att_1148449/v1/3RU2136_CoC_202307191454405318.pdf?download=true).
Another [Siemens-hosted certificate E31519, PDF pages 22–23](https://cache.industry.siemens.com/dl/files/318/106485318/att_1121598/v1/UL_CoC_3RT2_3_202211231447066894.pdf)
lists other combinations and short-circuit values. Its indexed text indicates
65 kA rows, but the original table layout could not be independently inspected
from this environment, so those rows are research leads and do not change the
candidate comparison. The 25 kA figure is the selected cited entry, not a
claim that no other documented combination could apply. Neither comparison
qualifies an assembled panel.

The small-motor combination record names the declared external value
`sourceAvailableFaultCurrentKA`. It is a source-only input, not a calculated
local fault current; the optional network result is reported separately.

Known gaps include maximum/minimum operating cases and voltage factors, motor
decay, contact-parting time, asymmetrical/peak duty, ground faults and grounding,
thermal withstand, clearing times, TCC coordination, installation/reverse-feed
qualification, and full assembly SCCR. The sourced device library remains
screening evidence. Inventory completeness is supplied metadata and remains
`not-verified`. No licensed-engineer approval is implied.

## Saved evidence

Eligible nonmotor Apply saves an evaluated screen under
`designSynthesisDeviceFaultValidation` in the same undoable transaction as the
fault-network summary and schedules. Omitted or unevaluated screens remove the
previous saved screen. Durable named-project save failures roll the transaction
back. This does not grant eligibility to a blocked proposal.

Canonical storage retains magnitudes, as with the fault-network summary. Ordinary
device cases refer to its existing branch-terminal stream; immediate load-side
values and the aggregate upstream-side exception retain exact Float64 values.
Packed placement references avoid duplicating the full case matrix. Immutable
device-evidence references keep the rating associated with the saved result.
`resolveDesignSynthesisDeviceFaultValidation(saved, faultStudy, deviceEvidence)`
expands those references and returns `null` for malformed or missing evidence.
Full signed phasors and detailed assumptions remain in the proposal JSON export.
Canonical magnitudes alone cannot reconstruct complex phasors.

## Verification

Independent acceptance tests insert explicit zero-impedance breaker branches in
the network and compare signed currents for faults on both sides, all original
bus cases, and the maximum among the expanded fault locations. They include two
motor infeeds with different phase angles and a 480/208 V transformer with a
30-degree complex tap, plus primary-alias and aggregate-main checks. Additional
tests cover stale result content, missing standalone rating, conditional-rating
separation, partial coverage, and changed rating identity.

Two synthetic independent fixtures illustrate why the quantities stay separate
(kA RMS; these are test values, not project design data):

| Proposed device | Upstream-side fault, through device | Immediate load-side fault, through device | Available at line-terminal bus |
| --- | ---: | ---: | ---: |
| 480 V feeder AB | 1.109993 | 17.153801 | 18.189876 |
| 208 V aggregate secondary main, 30-degree transformer tap | 0.501910 | 3.034796 | 3.455697 |

The bounded persistence fixtures use 4,088,442 bytes for the 25-to-50-load
expansion and 5,240,166 bytes for a fresh 50-load mixed-voltage named project,
against the unchanged 5,242,880-byte test budget. The latter leaves 2,714 bytes;
this is a fixture measurement, not a guarantee for projects with additional
data. Its 58 fault cases and 57 proposed placements retain every device-current
magnitude exactly, in addition to the existing branch and source-terminal
streams. Corrupt indices, kind flags, counts and altered rating evidence return
`null`; undo/redo, omission and deliberate named-save failure are checked.

Final regression and persistence evidence for this step is recorded under
`output/design-synthesis-device-fault-2026-10-20/`. Final October 20 checks passed
444 Node test files, 60 focused cases and 67 selected Edge browser cases, plus
build, lint and whitespace checks. All 20 frozen source/test hashes matched.
The final manifest indexes 444 suites, 13,430 static assertions and 25 benchmarks;
these indexing counts do not establish engineering accuracy.

The final readable device card and report provenance were inspected. Browser
checks include changed-source freshness, complete versus partial coverage,
separate 65 kA standalone and conditional motor ratings, blocked motor Apply,
and nonmotor named-project save/reload. An earlier browser attempt passed 66/67
but failed a screenshot clip outside the viewport; locator screenshots fixed
the test. Visual review also replaced the cramped placement table with per-device
cards. The subsequent complete run verifies the final rebuilt layout.

Final evidence is in `verification.json`, `source-snapshot.json`,
`node-confirmed.log`, `focused-confirmed.log`, `browser-confirmed.log`,
`build-confirmed.log`, `lint-confirmed.log`, and `whitespace.log`.
Firefox acceptance is not established by this Edge run. This bounded step does
not complete the full equipment-list-to-electrical-design goal.
