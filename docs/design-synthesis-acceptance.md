# Equipment-to-design acceptance contract

## Objective

Given 25–50 industrial loads with ratings and locations, a known supply,
permitted routing corridors, and project criteria, generate a proposed
distribution arrangement, one-line, feeders, protective-device selections,
raceways, routes, and supporting reports.

This contract tracks the complete goal. Implemented subsets are progress,
not evidence that the whole goal is complete. Initial generated designs are
proposals for review; generation must not create engineering approvals.

## Required evidence

| Requirement | Evidence needed to demonstrate completion |
| --- | --- |
| Equipment-first input | A reproducible 25–50-load example starts with equipment ratings and physical coordinates, supply information, allowed corridors, and criteria. It does not require preassigned source relationships, cables, panels, or routes. |
| Input integrity | Missing, invalid, contradictory, unsupported, or duplicate inputs produce specific issues. Units, phase/voltage bases, duty, power factor, and external data provenance are explicit. |
| Distribution arrangement | The generator assigns loads and proposes distribution equipment with stable identities, locations, capacity checks, and explanations. Every input load is accounted for, including rejected loads. |
| Electrical connectivity | The generated one-line and schedules describe the same radial connectivity, equipment references, and feeder identities. Physical coordinates remain distinct from diagram layout. |
| Feeder selection | Operating and design currents, duty and installation adjustments, terminal limits, conductor selection, actual route lengths, and voltage-drop checks are traceable. Unsatisfied or unsupported selections are not returned as passing designs. |
| Protective devices | Outputs distinguish generic rating requirements from specific device candidates. Actual candidate identity, ratings, applicability, fault-duty basis, evidence status, and unresolved coordination requirements are retained. No source or curve data is invented. |
| Permitted routing | Routes follow allowed corridor edges and explicitly permitted endpoint connections. Disconnected or prohibited paths produce issues instead of fallback geometry presented as an acceptable route. |
| Raceway capacity | Assigned cables and proposed raceway dimensions are checked using stated cable-dimension evidence and an applicable capacity method. Missing dimensions or unsupported installation rules remain unevaluated. |
| Design iteration | Tests move equipment, increase loads, tighten criteria, and close corridors. Dependent routing, sizing, checks, and reports update together or explain why no feasible proposal exists. Per-circuit and combined path voltage-drop limits are evaluated. |
| Project integration | A reviewed proposal can populate canonical equipment, loads, panels, cables, one-line, raceways, and route results through existing storage APIs. Apply is undoable; unrelated work is preserved. |
| Regeneration and overrides | Regeneration reconciles prior generated records, detects manual edits and name collisions, preserves explicit overrides, and reports conflicts that prevent reliable regeneration. |
| Freshness | Editing inputs invalidates prior downloadable/applicable results. Project/scenario changes cannot apply a proposal to the wrong context. Existing study freshness mechanisms recognize changed canonical data. |
| Reports | Human-readable and machine-readable outputs identify inputs, criteria, decisions, selected records, routes, calculated checks, missing evidence, assumptions, and unresolved issues. Blocked and stale results cannot appear ready for issue. |
| User journey | Browser acceptance covers initial generation, review, apply, navigation to downstream schedules/one-line, regenerate, conflict handling, and exports. A JSON-only engine test is insufficient. |
| Regression | Required Node tests and build pass, along with the affected Playwright suite. Engineering checks include independently derived numeric expectations rather than merely mirroring the implementation. |

## Implementation status

The shared-tray capacity retry now also detects a blocked transformer primary
feeder and can reserve it before panel circuits. The verified 25/50-load mixed
480/208 V case retains its primary-device selection, one-line connection,
route, load-flow and fill checks, and named-project reload. Closed or hot
bypasses remain blocked. This is a bounded reordering, not a global-feasibility
proof; see [shared tray capacity](design-synthesis-capacity-routing.md).

The cross-panel capacity retry now prioritizes a blocked branch's panel group
after assigning stable memberships and identities. This recovers the verified
25/50-load case where earlier flexible groups consumed a scarce corridor.
Canonical panel order and location overrides survive regeneration and named
reload; route permissions, thermal limits, fill and connected load-flow checks
still apply. The search remains bounded and does not establish global
optimality. See [shared tray capacity](design-synthesis-capacity-routing.md).

The October 29 exact-device SIMARIS source discovery closes the earlier
70 A breaker graphic-location gap. Proposals now retain the exact device
source, 350/490 A archived-setting fingerprints, displayed 415 V/40 °C
conditions, and the unresolved 480 V applicability qualification. This is
source evidence, not a numerical timing envelope or completed motor
protection. See [curve source review](design-synthesis-protection-curve-research.md#candidate-specific-source-availability).

The preliminary generator and workspace were implemented on 2026-09-18.
The existing Auto-Build still serves supplied source/load relationships;
Design Synthesis proposes those relationships from equipment and criteria.

| Area | Independently observed evidence | Remaining boundary |
| --- | --- | --- |
| Equipment-first generation | The original 30-load case produces 4 panels, 34 circuits, and 10 trays. October 18 acceptance also verifies 25/50-load mixed 480/208 V generation with sourced transformer selection. | Radial balanced three-phase networks; the mixed-voltage extension supports one 480 V to 208 V transformer arrangement, not arbitrary voltage levels. |
| Electrical selection | Separate manufacturer R/X arithmetic matches branch current and voltage drop. Tripling route lengths resizes conductors while preserving the combined drop limit. Changing terminals from 75 to 60 C upsizes the example 400 A feeders from 600 to 750 kcmil. Retained motor feeder floors now reach routing and sizing independently of catalog selection. Feeder-aware partitioning serves the original 25/50-motor examples with 2/5 panels and the 50-load nonmotor example with 3 panels under unchanged criteria. DOL starting voltage and supplied-curve acceleration drive bounded revisions. An optional REM610 reference-current setting screen consumes the final acceleration time. | Cu MC construction at 60 Hz; electrical-input kW; complete motor thermal withstand and protection remain unresolved. Partitioning is bounded and deterministic, without a global optimality claim. The relay-specific setting alternative is not a dynamic thermal model or approval. |
| Protection | Selected candidate IDs, ratings, source documents, and field-source mappings are checked against governed records. Motor overload ranges, a manual-controller assembly and a separate inverse-time branch-breaker topology retain distinct evidence. An optional explicit network models initial RMS motor contributions, with proposed source-end placements and separate line-terminal and through-device initial-current comparisons. | Eight-record general circuit-breaker screening catalog, two exact motor branch-breaker parts, 44 overload-range records and two bounded starter topologies. Maximum/minimum and timed device duty, complete coordination/settings, and assembly SCCR remain unevaluated. |
| Physical routing/capacity | Explicit permitted routes, endpoint bounds, cable dimensions, tray fill, and dedicated EMT endpoint fill are checked. A 2-inch corridor restriction blocks the sample. Missing endpoint assumptions block Apply. | No physical obstacle survey, bend/pulling design, or cost optimization. |
| Reconciliation | Nonmotor generated records apply, undo, redo, and reapply in isolated Node storage. The feeder-partitioned 50-load browser journey retains 54 equipment records, 50 loads, 53 cables, 3 panels and one 54-component/53-connection drawing across downstream navigation, reload and reapplication. Panel Schedule shows assigned loads, sufficient circuit positions and connected totals. Panel-location overrides pass the accepted-edit, regeneration, save/reload, and removal journey. | Motor-containing proposals remain blocked from Apply pending protection qualification; their calculation/report tests do not prove canonical project integration. Other manual edits and ambiguous drawing-sheet identities still block Apply. Legacy records without selective location baselines remain protected. Proposed circuit capacity does not qualify a physical panel assembly. |
| Reports/UI | Edge tests inspect exported JSON/report content, capacity values, selected candidates, normal project creation, reload, and manual-edit protection. The exact 50-load check survives named-project creation and reload. | Engineering outputs remain preliminary; test completion does not constitute issue readiness. |

Independent review found and corrected defects missed by the initial tests:

- Unnamed Apply could report success despite rejected writes. It now requires
  a writable named project and hands the draft through project creation before
  regenerating it in the new context.
- Repeated device evidence could exhaust browser storage. Selected evidence is
  retained once per scenario, with explicit references on cables. The 50-load
  acceptance case fits a 5 MiB storage budget, including the named snapshot.
- The project template modal returned a boolean instead of template data.
  Blank and nonblank template creation now use the modal submission contract.
- The generated supply was not recognized by the drawing's source checks. It
  now uses the supported utility-source type and retains the supplied basis.
- Repeated Apply appended drawing sheets after sheet IDs were lost in the
  shared view. Reconciliation now matches the existing sheet, rejects ambiguous
  identities, and checks the graph before its own canonical mutations change
  derived references.
- Loading a blank project inserted an empty load record. Canonical import,
  load, and collection updates now retain empty load arrays.
- Importing into a named project updated its active state but could reopen the
  older saved snapshot on reload. The import flow now saves the named snapshot
  before reload and restores the prior transaction if that save fails.
- The voltage-drop page loaded separate study and project-manager data stores,
  allowing scenario selection and calculation inputs to diverge. Both now load
  in one module bundle. The recovery journey verifies the future scenario's
  numeric results and explicitly saves before report navigation.

Initial workspace verification on 2026-09-18 (before the thermal/routing additions):

- `npm test`: all 389 executed Node test files passed.
- `npm run build` and `npm run lint`: passed on the final source tree.
- Final Edge regression: 49/49 passed across Design Synthesis, project recovery,
  import/export, scenario impact, workflow contracts, review corrections, and
  next-feature smoke tests. This includes all 11 synthesis browser cases and
  future-scenario voltage-drop values in CSV, JSON, and XLSX reports.
- An earlier broader downstream Edge run passed 195/196; its recovery failure
  led to the import and shared-store corrections above. That recovery case
  passed in the final 49-case run, with an explicit Save Project before report
  navigation. This does not demonstrate automatic preservation of unsaved work.
- `git diff --check`: passed.

Logs are retained under `output/design-synthesis-2026-09-18/`, including
`node-verified-final.log`, `build-verified-final.log`, `lint-verified-final.log`,
and `browser-verified-final.log`. Firefox fails while creating a blank test page
before application navigation, so Firefox acceptance has not been established.

## Distance from the broader product vision

### Explicit panel-location overrides

The explicit-override path is implemented for panel locations. The workspace
accepts a generated panel ID, physical x/y/z in feet, and an optional note.
Regeneration applies the location before routing and sizing. Coordinates,
routes, conductors, protection, voltage drop, raceways, and drawing physical
metadata are regenerated together. Removing the override returns to automatic
placement. Infeasible proposals remain blocked and retain the requested
location for diagnosis.

A manually edited canonical panel location can be copied into an explicit
override only when selective ownership evidence supports it. An unchanged
equipment mirror can then be updated; unrelated or conflicting edits remain
blocked. Old records without the selective baseline are not silently accepted.
This does not add route locks, conductor overrides, or load reassignment controls.

Independent engine, real-storage, and browser acceptance tests pass. Final
verification includes 408 Node test files, full build and lint, and 42/42
selected Edge cases. Browser review also corrected input loss while tabbing
between editable fields; exact ratings and coordinates are now checked in
downloaded proposals. See
[panel-location override verification](design-synthesis-overrides.md).

### Broader engineering scope

This is an equipment-to-preliminary-design workflow within the stated scope.
The October 18 extension adds bounded 480/208 V transformer synthesis. It does
not yet synthesize a full industrial electrical design across arbitrary voltage
levels, complete motor protection, selective coordination and settings,
grounding, assembly SCCR, or issued drawing packages.
Route-specific tabulated ambient, grouping, and cover screening now drives
feeder selection and its downstream checks. The detailed cable thermal model
remains a separate single-core burial study; it does not yet drive matching
construction selection. Routing still requires permitted corridors and
explicit endpoint assumptions. Panel grouping is deterministic rather than a
cost, resilience, or constructability optimization. Supplied-curve DOL
acceleration and bounded conductor/transformer revisions are implemented; the
[REM610 reference-current setting screen](design-synthesis-motor-thermal.md)
adds a separately identified relay alternative with explicit assumptions.
Neither milestone clears the motor Apply gate. Consequently the current
motor-containing equipment-to-project journey remains incomplete, even when
all its numerical screening criteria pass.

Named-project navigation also reloads the saved snapshot. Save changed scenarios
and completed studies before navigating; automatic preservation of unsaved work
across this boundary remains a workflow gap. Design Synthesis Apply explicitly
saves its proposal before navigating.

The [automatic operating-study revision milestone](design-synthesis-study-revision.md)
connects balanced load flow to proposal revision, including voltage, duty-adjusted
operating current, and source losses. Its verification record distinguishes
implemented behavior from completed regression gates. Route and installation
conditions already feed tabulated thermal limits. Motor starting now drives
bounded conductor/transformer revisions; the inverse-time motor branch method
also retains operating-current floors when choosing its exact breaker. Complete
fault/coordination checks still need to drive feasible selections or retain
explicit unresolved issues. Broader catalogs and voltage
arrangements, manual override resolution, and drawing quality need acceptance
cases of their own before the full industrial-design vision can be claimed.

The first thermal integration step is recorded in
[Route thermal screening](design-synthesis-thermal.md). It also corrects use
of a single-conductor touching-tray multiplier for the multicore MC catalog.
Detailed physical thermal analysis remains explicitly outside that integration.

The verified routing correction is documented in
[Feasible routing verification](design-synthesis-routing.md): electrical
feasibility can select a cooler bypass, and applicable fault-duty candidates
now inform conductor minimum ampacity. This closes a selection gap within the
supported scope; it is not a whole-network optimization.

The endpoint and input-evidence follow-up addresses two further acceptance gaps:

- [Endpoint conduit proposals](design-synthesis-endpoints.md) make tray and
  endpoint installation coverage explicit. Positive endpoint legs require an
  installation method, receive independently checked EMT fill proposals, and
  persist in the conduit schedule. Blocked or missing routes cannot claim
  complete coverage. This is fill screening, not a complete physical design.
- [Input evidence](design-synthesis-input-evidence.md) records units, supplied
  values, effective defaults, and synthetic/user/document classifications.
  The sample is synthetic. Reference presence is never treated as verification.
  Evidence changes participate in proposal identity and are retained in the
  generated project.

Verification on September 18, 2026, after the endpoint and input-evidence changes:

- `npm test`: all 400 discovered Node test files executed and passed.
- `npm run build` and `npm run lint`: passed on the corrected production source.
- Edge: all 22 selected Design Synthesis and workflow-contract cases were
  verified. The combined run passed 21 cases; the endpoint case initially
  waited for an incorrect test label selector. Selecting the combobox by its
  accessible role/name corrected the test, and its focused rerun passed.
  No production code changed between those two browser runs.
- Browser checks verified input classifications/defaults, human-readable
  reports, endpoint size limits, generated conduit persistence, thermal
  resizing, cooler bypass selection, 30/50-load named saves, regeneration,
  manual-edit protection, downstream handoffs, and the mobile workflow shell.
- Input-evidence and endpoint-table screenshots were inspected. The tall
  endpoint-table capture includes the existing sticky navigation overlay;
  its visible rows retain the expected IDs, EMT sizes, fill, and status.
- `git diff --check`: passed.

Independent review corrected silent loss of generated conduits during Apply,
tray/conduit identity collisions, blocked-route coverage being presented as
complete, provenance changes missing from proposal identity, duplicated
evidence exceeding the storage budget, and a report-download regression.
The 50-load budget check retains complete input/device evidence and endpoint
conduits within the existing 5 MiB limit, including the named saved snapshot.

Logs are under `output/design-synthesis-endpoints-2026-09-18/`:
`node-report-fix-final.log`, `build-verified-final.log`,
`lint-verified-final.log`, `browser-verified-final.log`, and
`browser-endpoint-verified.log`. Earlier failed/interrupted logs are retained
to distinguish review findings from the corrected verification results.
The broader industrial-design limitations above remain unresolved; this
follow-up does not establish full-design or construction readiness.

## Study handoff and equipment accounting verification

The [study handoff review](design-synthesis-study-handoff.md) records the next
verified correction. Every original equipment row now receives an accepted,
rejected, or deferred disposition, including malformed and duplicate inputs.
Generated and persisted drawings retain the intended load-flow network,
source/load roles, cable impedance, and cable ampacity metadata. The ordinary
Load Flow page can converge, save a current result, and export the generated
sample; changing an input disables export again.

Final September 18 verification: 405 Node test files passed; full build and
lint passed; all 38 selected Edge cases passed. This includes independent
two-bus arithmetic, 25/30/50-load default study budgets, named-project
handoff, PDF export, input dispositions, and existing synthesis/workflow
regressions. Firefox still fails before application navigation and remains
unverified. Logs and exact model boundaries are linked from the review.

The study-handoff verification predates the panel-location override implementation.
See the override section above for its separate verification status. The
[contract audit](design-synthesis-contract-audit.md) maps every requirement to
its implementation, acceptance tests, and remaining boundaries. It also records
corrections to input validation, stable panel identity, and readable criteria.
The complete industrial-design objective remains open where this evidence does
not cover the broader engineering scope.

## Automatic operating-study revision verification

The [revision verification record](design-synthesis-study-revision.md) adds a
generation-time balanced load-flow check and bounded conductor/protection
revision. Voltage, duty-adjusted operating current, and source losses can drive
new selections. Failed or unstudied attempts retain explicit diagnostics and
cannot be applied. Independent review also corrected a shared Newton Jacobian
sign error and replaced misleading legacy IEEE-14 benchmark evidence.

September 18 verification: all 414 Node test files passed; build and lint passed;
all 56 selected Edge cases were verified across the combined run and corrected
six-case rerun on unchanged production code. Independent checks cover all 25
paths, 60 C terminal limits, source losses, duty, selective resizing, history,
model coverage, stale results, and durable save/reload. The full industrial
scope listed above remains open.

## Transformer calculation foundation verification

The [transformer foundation record](design-synthesis-transformers.md) documents
the September 25 corrections to terminal currents, tap/shunt accounting,
voltage-drop bases, strict transformer inputs, exported reports, and stale
tap-review application. Verification includes 418 passing Node test files,
lint, recovered build stages, 58 passing selected Edge cases and the separate
tap-review case, plus visual inspection of the actual downloaded PDF. The
record preserves the initial asset-copy failure and test-selector correction.

This September milestone closed calculation and report prerequisites. The
subsequent October milestone below verifies bounded transformer generation.

## Mixed-voltage generation verification — October 18, 2026

The [mixed-voltage review](design-synthesis-mixed-voltage-review.md) verifies
equipment-first 25/50-load generation with direct 480 V and balanced 208 V
loads, sourced 30/75/150 kVA transformer choices, primary and secondary feeders,
distinct protection bases, coupled network checks, and bounded revisions.
Independent physical-voltage/current calculations check the connected network.
Named save/reload, regeneration, undo/redo, rollback, full evidence retention,
and the existing 5 MiB storage budget are covered.

All 423 Node test files, build, and lint passed. All 60 selected Edge cases
were verified across the initial run and focused corrected reruns; the separate
tap-review case also passed. The downloaded four-page load-flow PDF was
rendered and inspected. See the linked record for interim failures, final
logs, and model boundaries. This closes the mixed-voltage milestone, not the
complete industrial-design objective.

## Motor conductor and initial starting verification — October 19, 2026

The [motor integration record](design-synthesis-motors.md) verifies distinct
running, referenced design, nameplate, and locked-rotor current bases;
motor-aware conductor floors; and an initial DOL starting screen using source
R/X and the generated mixed-voltage network. Starting failures can drive real
conductor/transformer trials within the shared operating-study revision budget.
Independent complex-divider and physical-network calculations check 25/50-load
cases, including ideal ties and other running loads.

All 426 Node test files, build, lint, and all 61 selected Edge cases passed.
The motor review table and downloaded report were inspected. The linked record
retains numerical examples, interim corrections, and evidence paths. Motor
proposals still cannot be applied: voltage success does not complete overload
selection, starting withstand, fault contributions, assembly SCCR, or
coordination. The complete industrial-design objective remains active.

## Manufacturer motor overload range candidates — October 19, 2026

Generation now retains nameplate-based Siemens 3RU2 overload relay range
candidates, with catalog identity, current interval, dial value, trip class,
source documents and field provenance. Root review checked all 44 inventory
entries against the downloaded official catalog and corrected a Class 10/10A
mapping. These candidates remain distinct from complete overload/starter
protection; they do not clear motor Apply.

All 427 Node test files, lint and the final full build passed. All 61 selected
Edge cases passed, including the expanded motor edit/regenerate/export case.
An additional independent 50-load, three-motor case and the remaining focused
checks passed (18 total). The rendered candidate table and actual report were
inspected. See the [motor record](design-synthesis-motors.md) for source hashes,
evidence paths, remaining source/fault consistency checks and assembly scope.

## Source impedance and fault-bound consistency — October 19, 2026

The [motor guide](design-synthesis-motors.md) now records the implemented
nominal source consistency gate. Motor proposals and the direct starting
evaluator block a missing, malformed or insufficient external-source fault
bound, arithmetic range failures, and canonical/model source voltage mismatches.
Dedicated evidence, review rows and report values retain the original source
data. No source impedance, fault bound, criterion or budget is automatically
changed to manufacture a passing result.

All 428 Node test files, full build, lint, and all 61 selected Edge cases passed.
The 28 focused cases include independent source arithmetic, 25/50-load network
solutions and both passing/exhausted revisions with source-consistent inputs.
The downloaded blocked report and rendered source review were inspected. Logs
and final numerical cases are under
`output/design-synthesis-source-fault-2026-10-19/`.

Earlier motor fixtures with contradictory source/fault inputs are superseded by
the corrected cases in the guide. Complete source operating-case provenance,
motor/generator fault contributions, starter/assembly protection, thermal
withstand and coordination remain unresolved. Motor Apply remains blocked and
the full industrial-design goal remains active.

## Exact-part starter research integration — October 19, 2026

Generation now returns `motorStarterCandidates` separately from standalone
overload-range candidates and generic circuit-breaker selections. The
[starter guide](design-synthesis-motor-starters.md) records the single bounded
Siemens combination, its 2025 UL certificate, exact-part mapping, input contract,
failed conditions and remaining protection requirements. The UI adds explicit
source-system, control and enclosure inputs, motor nameplate hp/Hz editors and
a synthetic 25-load sample. Reviews and reports preserve rejected candidates,
non-pass checks and source evidence; editing inputs invalidates outputs.

Independent review corrected a supplied 50 Hz motor nameplate reaching a
60 Hz starting screen, and a corresponding direct-evaluator bypass. The v3
starting contract now validates supplied frequency aliases at canonical and
one-line boundaries and fingerprints the supplied source/load frequencies.
Missing fields retain the documented existing 60 Hz model basis.

All 430 Node test files, 42 focused cases, the full build and lint passed.
All 62 selected Edge cases passed on the final build. The rendered starter review
and downloaded report were inspected. A separate synthetic 50-motor check
produced five panels, 55 circuits and 50 converged individual starts while
retaining blocked motor protection. Evidence and final log names are recorded
in the starter guide.

This establishes research-candidate integration, not complete motor circuits.
Branch protection and controller conditions, overload application, starting
withstand, motor fault contribution, assembly SCCR and coordinated settings
remain unresolved. The complete industrial-design goal remains active.

## Exact inverse-time motor branch-breaker integration — October 19, 2026

The [branch-breaker integration record](design-synthesis-motor-branch-breakers.md)
connects explicit squirrel-cage/NEC criteria to a separate exact Siemens
3VA51 / 3RT2027 / 3RU2126 research topology. Its 25/30 A choice drives branch
conductor sizing and one-line evidence. Referenced motor FLC and feeder demand
remain distinct, and unsupported combinations do not fall back to generic
devices. Operating-current floors survive starting revisions so final case
evidence agrees with the actual cable proposal. Known undersized candidates
fail their continuous-current screen even while complete protection remains
unevaluated.

Independent review checked the certificate's actual contactor-family heading,
discrete settings, arithmetic boundaries, thermal derating and combined
operating/starting revision behavior. Final gates passed: 432 Node test files,
build, full lint, whitespace checks and 63 selected Edge cases. The new and
existing starter browser journeys passed; Firefox's Playwright executable is
unavailable. Rendered review and downloaded reports were inspected. Synthetic
25/50-load cases and 50 individual motor starts retain a blocked protection
status. The linked record names the logs, hashes and superseded wording-only
browser failure.

This completes a branch-breaker integration milestone. Exact TCC/thermal
withstand, motor-contributed fault duty, grounding, complete installation,
assembly SCCR and coordination remain open. Motor Apply stays blocked and the
full equipment-to-design objective remains active.

## Shared tray capacity routing — October 19, 2026

The [capacity routing record](design-synthesis-capacity-routing.md) adds
shared-capacity filtering to conductor-specific route search. Actual selected
feeders, branches, and transformer-primary cables reserve space, so later
circuits can use permitted bypasses. Final raceway checks remain authoritative.
The public synthetic 25-load fixture previously blocked with all 25 branches
on its shortest tray; it now proposes thirteen short routes and twelve bypass
routes. Its 50-load expansion uses thirteen short and thirty-seven bypass
routes. Independent geometry and voltage-drop checks preserve the original
criteria. Selection remains greedy, with no global backtracking or optimality
claim. This milestone does not resolve the broader engineering scope above.

Verification passed all 434 Node test files, 235 focused cases, full build,
lint, whitespace checks and all 64 selected Edge cases, including named-project
Apply/reload of the bypass routes. The user-approved outside-sandbox Node run
resolved the earlier automatic-review timeouts and sandbox local-server error.
The linked record names the final evidence and retains the interim failures.

## Fault-network integration review — October 19, 2026

The [fault integration review](design-synthesis-fault-integration-review.md)
records primary-source research and an independently reproduced remote-infeed
gap. A local bus `sources` equivalent can give the correct current at that bus
while omitting its contribution at another bus: the synthetic case reports
13.86 kA upstream instead of the independently calculated 15.988 kA. Generated
motor starting records are not network fault-source equivalents. The
review specifies the required source models, duty distinctions and acceptance
cases. A subsequent separate implementation is described below; legacy behavior
and the motor Apply block remain unchanged.

## Explicit initial fault-network integration — October 19, 2026

The [initial fault-network guide](design-synthesis-fault-network.md) records the
new strict positive-sequence core, finalized-proposal adapter, optional JSON
editor, synthetic sample, per-source review and reports. Independent checks cover
the reproduced remote-infeed gap, shared paths, meshes, complex transformer taps,
ideal ties, invalid input, stopped sources, numerical cancellation and 25/50-load
final-route arithmetic. Eligible nonmotor Apply retains compact evidence through
the normal shared persistence path; all motor proposals remain blocked.

Root review caught and corrected cancellation-sensitive residual checks,
malformed-source display failures, one-line/provenance crosscheck gaps,
contradictory report wording and repeated branch metadata exceeding a 5 MiB
storage budget, including a 50-load mixed-voltage case. Compact shared branch
identifiers and exact floating-point encoding retain every branch and source
terminal-current magnitude. The deliberate durable-save failure still rolls back; recovery from
a session marked storage-unavailable is outside this milestone's acceptance.

This establishes initial symmetrical RMS screening for an explicit supplied
network. It does not complete maximum/minimum fault cases, timed interrupting or
thermal duty, grounding, device-terminal selection, coordination, assembly SCCR,
or the complete equipment-to-design objective. Final verification records are
in `output/design-synthesis-fault-network-2026-10-19/`.

Final October 20 verification passed 441 Node test files, 42 focused cases,
66 selected Edge cases, build, lint and whitespace checks. Frozen source/test
hashes matched. The linked guide records exact storage-budget measurements,
rendered/report inspection and the superseded failures. This completes the
bounded initial fault-network milestone; the full goal remains active.

## Proposed device placement and current screen — October 20, 2026

The [device-current guide](design-synthesis-device-fault-screen.md) records the
next bounded step: explicit proposed cable source-end placements, deduplicated
transformer primary protection, and an aggregate secondary main. Separate
line-terminal available and through-device initial-current comparisons include
faults on both sides of each ideal proposed device. Independent augmented-network
tests match signed currents, including a 480/208 V transformer and complex tap.
Rating exceedances block the proposal. Conditional combination ratings remain
distinct from standalone interrupting ratings, and protection adequacy remains
unevaluated for every device.

Exact saved magnitudes reuse existing fault streams and immutable rating-evidence
references. The fresh mixed 50-load fixture retains 58 fault cases and 57 device
placements at 5,240,166 bytes under the unchanged 5,242,880-byte test budget.
Malformed-reference, stale-case, source-provenance, undo/redo and failed-save
checks pass. All motor proposals remain blocked from Apply.

Final verification passed 444 Node test files, 60 focused checks, 67 selected Edge
cases, build, lint and whitespace checks; all 20 frozen source/test hashes
matched. Root inspected the readable per-device cards and report provenance.
Logs, screenshots and exact scope are retained in
`output/design-synthesis-device-fault-2026-10-20/`. Full maximum/minimum and timed
fault duty, grounding, thermal withstand, protective clearing, coordination and
assembly SCCR remain open. The complete goal remains active.

## Bounded equipment protection-curve checks — October 21, 2026

The [equipment protection-curve guide](tcc-equipment-protection.md) records a
prerequisite correction in the TCC path: comparisons reject uncovered current
ranges, preserve conservative duplicate-current boundaries, and inspect both
curves' knots and interior limiting differences. Unknown checks retain null times
and margins in the chart and review export. Wording distinguishes a plotted
protective curve from verified physical clearing time.

Luna implemented the corrections; root independently reproduced four prior
defects, derived continuous-comparison fixtures, and inspected the rendered
metrics and exported HTML. Verification passed 446 Node files, 16 focused cases,
25 distinct selected Edge cases, an additional screenshot/export repeat, build,
lint and whitespace checks. Existing module budgets and readiness gates remain
intact. Evidence and the manufacturer source map are retained under
`output/tcc-equipment-protection-2026-10-21/`.

Manufacturer document/page discovery did not produce qualified numeric curves or
establish total-clearing semantics. Exact-configuration curve evidence, motor
acceleration and thermal data, timed duty, coordination and assembly SCCR remain
open. All motor proposals remain blocked from Apply; the full goal remains active.

## Manufacturer curve acquisition and transcription — October 21, 2026

The [motor curve-source guide](design-synthesis-protection-curve-research.md)
records an archived Siemens graphic matched to the 30 A TM230 branch-breaker
configuration. Proposal review, JSON and readable reports retain its source,
conditions, proposed setting and unresolved qualifications. The 25 A candidate
retains a separate missing-source result; its curve is not inferred from 30 A.

Luna implemented a reproducible offline geometry extractor and candidate-specific
source metadata. Root required corrections to source fingerprinting, setting
propagation, path connectivity and full-range calibration, then independently
checked ten source-geometry correspondences. Six thermal centerlines and separate
instantaneous fragments remain research assets, outside runtime trip calculations.
The source does not establish a complete protective envelope or motor protection.

Final verification passed 446 Node files, 21 focused Node cases, five tracked and
three archived-source Python checks, seven selected Edge cases, build, lint,
page-contract audit and whitespace checks. Root inspected the rendered 30 A
review and its readable report. Evidence is retained under
`output/design-synthesis-protection-next-2026-10-21/`.
The full design goal remains active, with all motor proposals blocked from Apply.

## Explicit fault operating scenarios — October 21, 2026

The [fault-scenario guide](design-synthesis-fault-scenarios.md) records comparison
of two through four supplied operating conditions using the finalized routed
network. Bus envelopes retain their limiting scenario IDs; proposed-device rows
distinguish line-terminal available current from the highest observed
through-device maximum across fault locations. Incomplete evidence blocks
aggregate envelopes. Valid numeric rating exceedances remain visible and block
the proposal. These observed cases are not verified physical minimum/maximum
fault duty or a complete protection assessment.

Luna implemented the engine, UI and shared persistence path. Root independently
checked source/motor switching, different limiting conditions at different buses,
25/50-load mixed-voltage impedances, four supplied conditions and the exact
storage wire format. The 50-load growth fixture retains exact evidence with a
5,144,576-byte transaction peak under the unchanged 5,242,880-byte budget.
Save/reload, malformed evidence, undo/redo and failed durable-save checks cover
the new summary. Evidence is retained under
`output/design-synthesis-fault-scenarios-2026-10-21/`.

Final verification passed 450 Node files, 18 focused cases, 42 selected Edge
journeys, build, lint, page-contract audit and whitespace checks. Root inspected
the rendered results and readable report; 18 frozen source/test hashes match.
Browser coverage confirms durable reload and the existing session-only undo
boundary; Node coverage confirms one-transaction undo/redo before navigation.

The full design goal remains active. Motor Apply, protective clearing,
coordination, thermal duty and complete fault-duty qualification remain open.

## Network-coupled motor acceleration — October 21, 2026

The [acceleration guide](design-synthesis-motor-acceleration.md) records the next
equipment-to-design calculation chain: explicitly referenced motor speed/current/
PF/torque curves, shaft-referred motor/load inertia and resisting torque are
evaluated on the finalized proposed network. Bounded integration returns time
to a supplied speed threshold, torque/current/voltage timeline and electrical
current-squared exposure. Missing inputs, impossible shaft/electrical power,
stale voltage bases, torque deficits and numerical failures retain diagnostics.
An explicit duration criterion is separate from protection adequacy; its absence
does not become a pass. The sample is synthetic and motor Apply stays blocked.

Root independently checked constant and logarithmic integrals, a transformer
voltage-base case, variable electrical/mechanical curves and 25/50-load
generation/regeneration. Manufacturer originals establish the mechanics and
provide partial motor data; they do not supply complete startup curves or the
driven machine's data. No missing manufacturer values or human approvals were
invented.

Verification passed 452 Node files, 34 focused cases, 45 selected Edge journeys,
build, lint, page-contract audit and whitespace checks. Nineteen frozen
source/test hashes and five archived manufacturer PDFs were verified. Evidence
is retained under `output/design-synthesis-motor-acceleration-2026-10-21/`.
This completes the supplied-curve screening milestone. The full design goal
remains active, including complete motor protection, fault duty, thermal
withstand, clearing/coordination and assembly SCCR.

## Acceleration-driven design revision — October 21, 2026

The [acceleration guide](design-synthesis-motor-acceleration.md) now records
actual conductor and affected-path transformer trials driven by failed supplied
acceleration-duration or torque constraints. Operating, starting and acceleration
studies share the existing absolute revision budget. Trials retain ratings,
curves, inertia, corridors, overrides and the original criteria. The final result
describes the returned network, including a blocked regenerated candidate;
compact history retains earlier trials and the actual stopping reason.

Root independently checked 25/50-load fixed-limit cases against a separate
physical network solution and mechanical integral. Exactly the affected feeder
and branch change from #8 AWG to #6 AWG. Transformer tests cover successful
secondary-path profile trials and rejection of an unrelated transformer change.
Root required corrections to combined status reporting, blocked-study stopping,
trial descriptions and browser artifact capture before accepting Luna's output.

Verification passed 454 Node files, 62 focused cases, 46 selected Edge journeys,
build, lint, page-contract audit and whitespace checks. A further single browser
journey passed with both revised exports retained. Root inspected the history
image and readable report and checked the exported JSON. Evidence is retained
under `output/design-synthesis-motor-acceleration-revision-2026-10-21/`.
The full design goal remains active; motor protection, thermal withstand,
clearing/coordination, fault-duty qualification and assembly SCCR are unfinished,
and motor Apply remains blocked.

## REM610 reference-current setting alternative — October 23, 2026

The [thermal-setting guide](design-synthesis-motor-thermal.md) records a separate
ABB REM610 ANSI DOL setting screen. Explicit reference current, prior current,
ambient, safe-stall limit, hot/cold start counts and margin are evaluated using
the final acceleration duration and supplied/observed current bounds. Settings
are checked on the documented 0.5-second grid. Missing evidence, stale results,
invalid domains and unsupported current scaling block recommendations. A failed
explicit candidate retains its calculations for review.

Independent source review identified the manual's unit-current-scaling accuracy
qualification and ambiguous percentage-time basis. The implementation retains
nominal evidence for nonunit scaling without recommending a setting. Its
remaining timing envelope is explicitly assumed and cannot be represented as
guaranteed manufacturer accuracy. This relay-specific alternative does not
replace the Siemens candidates, model actual motor thermal history or complete
motor protection.

Final verification passed 460 Node files, 62 focused cases in eight files,
49 selected Edge journeys in twelve files, build, lint, the 80-route page-contract
audit and whitespace checks. The full Node run includes four tests added to the
workspace during the interruption; those unrelated changes were preserved.
Root inspected positive and failing thermal results and checked that each TXT
payload exactly matches its JSON export. A browser regression exposed omitted
per-circuit readable routing rows; the rows were restored, and the unchanged
cooler-bypass report/save assertions now pass. Frozen source hashes and protected
catalog/Apply-guard hashes match. Evidence is retained under
`output/design-synthesis-motor-thermal-2026-10-21/`.

Additional manufacturer research found an exact WEG motor with published hot/cold
locked-rotor times and inertia, but exact test conditions and speed curves remain
incomplete. It has not been substituted into the synthetic sample or promoted
to a preset. Research evidence is retained under
`output/design-synthesis-motor-data-2026-10-23/`.

Overall review class remains **Screening only**. The full goal remains active:
complete motor thermal withstand, clearing/coordination, fault-duty qualification,
assembly SCCR and the motor-containing canonical save/reload/regeneration journey
remain unfinished. Motor Apply remains blocked.

## Explicit motor protection timing comparison — October 23, 2026

The [timing guide](design-synthesis-motor-protection-timing.md) describes an
optional comparison using supplied minimum-trip and maximum-total-clearing
curves for the final exact breaker and overload candidates. Startup ride-through
uses final acceleration duration plus an explicit margin. The selected hot/cold
safe-stall comparison applies only at the declared reference current; it cannot
prove actual stall protection at lower currents. Evidence remains supplied and
unverified, and the example is synthetic. Complete protection and motor Apply
remain blocked even when both comparisons pass.

Root's ten independent acceptance cases cover log-log interpolation using
geometric-mean arithmetic, strict positive margins, merged-knot crossing checks,
finite curve support, exact identity/settings, conditions, contactor opening,
stale/incomplete acceleration and malformed inputs. Revised 25/50-load cases use
a separate physical network solution and mechanical integral. Review corrected
context/freshness checks, rounding boundaries, current applicability, imported
text escaping, a report callback regression and misleading reference/clearing
captions without relaxing criteria or revision budgets.

Final verification passed 461 Node files, 72 focused cases in nine files,
52 selected Edge journeys in thirteen files, build, lint, the 80-route
page-contract audit and whitespace checks. Root inspected positive/failing
images, verified each TXT payload exactly equals its JSON export and confirmed
readable routing decisions remain present. All 1,389 frozen runtime/test files
match, with a final 35-file scoped snapshot recording documentation updates.
Protected catalogs, the Apply guard and the acceleration solver are unchanged.
Evidence is retained under
`output/design-synthesis-motor-protection-2026-10-23/verification.json`.

Overall review class remains **Screening only**. This completes the supplied
reference-current timing milestone. The full design goal remains active:
applicable motor withstand and protection studies, clearing/coordination,
fault-duty qualification, assembly SCCR and a verified motor-containing canonical
project save/reload/regeneration journey remain unfinished. Additional exact WEG
curve/condition research has not closed those gaps or introduced a preset.

## Supplied source-profile fault histories — October 23, 2026

The [history guide](design-synthesis-fault-evolution.md) records an optional
fixed-network calculation using explicitly supplied piecewise-linear source EMF
multipliers. The initial and history studies share final cable/transformer and
one-line validation. Every bus fault and proposed device cut retains signed
complex current histories, exact interval current extrema and integrated
positive-sequence RMS current-squared exposure in A²s. Suppressing an EMF to zero
retains its passive internal impedance. This is a supplied quasi-steady model;
it does not infer a physical motor waveform, protective clearing or thermal
withstand, and does not change motor Apply eligibility.

Root's eleven independent acceptance cases use separate complex circuit
equations and midpoint circuit solves for exact quadratic integration. They
cover 25/50-load final networks, reverse feed, passive zero-EMF sources, interior
phasor cancellation, zero-impedance feeder ties, transformer voltage/current
bases, stale or tampered cached evidence and malformed profiles. Review corrected
the interior-minimum calculation, ideal-tie lookup, explicit-null versus omitted
context handling, source-option validation and a browser wording assertion.

Verification passed 462 Node files, 115 focused cases in thirteen files,
55 selected Edge journeys in fourteen files, build, lint and the 80-route
page-contract audit. Two sandboxed build attempts failed writing root HTML;
the required build passed outside the sandbox. The first browser run's wording
failure is retained, and the final suite passes without changing runtime code.
Root inspected evaluated/blocked images, checked exact TXT/JSON payload parity,
and independently recalculated all 840 exported example exposures. Frozen
runtime/test hashes and protected catalogs, Apply guard, acceleration and motor
timing modules match. Final evidence, hashes and whitespace checks are under
`output/design-synthesis-timed-fault-2026-10-23/verification.json`.

Additional synthetic 25/50-motor tests evaluate histories for 4/7 panels when
the inputs explicitly request an eight-load panel limit. They do not establish
successful default grouping: the original 50-load panel limit exposes a lost
feeder motor-current floor and a missing feasible-partition search. The blocked
default inputs, returned feeder details and exact cause are retained in
`output/design-synthesis-timed-fault-2026-10-23/next-distribution-correction.md`.
The largest full report payload is about 33.5 MB; canonical history persistence
also needs a compact contract before storing those complete results.

Overall review class remains **Screening only**. The full goal remains active:
correct feeder floor propagation and feasible panel grouping, complete motor
protection/clearing/coordination and fault-duty/SCCR qualification, and verified
motor-containing canonical integration remain unfinished. Source-profile inputs
and exported reports do not substitute for those requirements.

## Feeder-aware grouping and downstream panel schedules — October 23, 2026

The [partition guide](design-synthesis-distribution-partition.md) closes both
default-grouping findings from the preceding milestone. The retained feeder
design-current floor now reaches routing and conductor selection independently
of a selected breaker. A deterministic bounded search splits infeasible feeder
groups under the original panel-kVA and load-count ceilings. The original
25/50-motor inputs now form 2/5 panels with supported feeders and passing
operating/initial-starting screens. The corresponding 50-load nonmotor input
forms 3 panels (24/23/3). No criteria, revision budgets or catalog data were
relaxed. Disconnected and prohibited routes, unserviceable single loads,
identity exhaustion and later revision failures retain explicit blocking checks.

Root's downstream browser review found an additional integration defect that
record-count checks missed: Panel Schedule displayed no assigned loads, then
its automatic defaults made later reapplication appear manually edited.
Generation now supplies canonical panel assignments, nonoverlapping pole spans,
adequate proposed circuit capacity, candidate ratings and feeder references.
The named-project browser journey displays 24 assigned loads and 72 positions
on DP-01 and successfully reloads, regenerates and reapplies after visiting
Panel Schedule and One-Line. Independent arithmetic checks all 50 saved loads,
their phase positions and connected kW/kVA. Existing manual-edit guards remain.

Full schedule layout is retained on canonical panels. Equipment mirrors avoid
duplicating it; saved routes retain geometry/decisions while canonical cables
retain complete thermal and installation evidence. This fixes the resulting
storage regression without raising the existing 5 MiB acceptance cap or losing
named snapshots, source evidence or undo behavior. Complete proposal exports
remain unchanged in scope; full source-profile histories are not newly persisted.

Final verification passed 465 Node files, 17 focused acceptance cases in three
files, 60 selected Edge journeys in fifteen files, build, lint, the 80-route
page-contract audit and whitespace checks. Four final TXT payloads exactly
match their JSON exports; root independently checked eleven returned feeder
groups, the canonical layout and route/cable evidence. Runtime/test hashes match
1,399 frozen files, with a 58-file final scoped snapshot. Catalogs, acceleration,
motor timing and fault solvers are unchanged. The Apply module changed only its
route compaction block; its remaining logic and guards match the prior source.
Failed/intermediate checks and the canonical integration finding are preserved
alongside final evidence under
`output/design-synthesis-distribution-partition-2026-10-23/verification.json`.

Overall review class remains **Screening only**. This completes the feeder-floor,
feasible-grouping and related nonmotor schedule-integration corrections. The
full design goal remains active: complete applicable motor protection,
clearing/coordination, fault-duty and assembly SCCR qualification, a compact
canonical history contract and the motor-containing canonical integration
journey remain unfinished. Motor Apply stays blocked; source-profile calculations
and proposed panel positions do not establish engineering approval.

## Supplied motor stall-current range comparison — October 23, 2026

The [timing comparison](design-synthesis-motor-protection-timing.md) now supports
v2 constant-stall intervals and explicitly supplied hot/cold withstand curves.
V1 retains its reference-current scope. V2 freshly solves the final network's
nominal locked-rotor point, checks saved starting and acceleration evidence, and
requires that point inside the supplied interval. Each device's total-clearing
upper bound is compared with the selected-state withstand lower bound at all
relevant knots and analytical interior extrema. Neither the interval nor the
source claims are authenticated; acceleration and fault histories are not
reclassified as stalled conditions.

Independent acceptance covers a reference-current pass that fails at the actual
lower stalled current, exact power-law arithmetic, a separately solved complex
network, interior worst margins, steep finite curves, single-current intervals,
selected hot/cold applicability, invalid coverage, tampered cached data and
revised 25/50-load networks. Mixed-version page and report paths retain each
motor's comparison scope. The synthetic example persists across reload; editing
it invalidates prior exports. Official ABB and SEL methodological PDFs, hashes
and their limited applicability are retained with the verification evidence.

Root review corrected overflow in extrema calculations, incomplete cached-value
checks, single-current interval handling, mixed-schema presentation, blocked-v2
scope metadata and missing readable device-condition lookups. Final checks and
artifacts are recorded in
`output/design-synthesis-motor-stall-range-2026-10-23/verification.json`.

Overall review class remains **Screening only**. Supplied-bound comparisons do
not model changing-current relay memory, motor temperature or actual clearing.
Exact manufacturer applicability, complete protection, coordination, fault duty,
assembly SCCR and motor-containing canonical integration remain unfinished.
Motor Apply and `completeProtectionStatus` remain blocked; the full goal stays active.

Final verification passed 467 Node test files, 31 focused calculation cases,
64 selected Edge journeys across 16 files, the build, lint and the 80-route
page audit. Root independently checked 24 exported current-point calculations
and exact TXT/JSON payload equality for positive, failing, blocked and mixed
cases. Runtime and Node-test hashes remained frozen; the reviewed browser-only
assertion corrections and intermediate failures are retained in the evidence.

## Canonical source-history integration — October 24, 2026

The [source-history guide](design-synthesis-fault-evolution.md) now defines a
bounded, lossless saved record for the optional evaluated study. Eligible
nonmotor Apply retains the original fault-study input, supplied profiles and
complete signed current histories, extrema and current-squared exposures.
Fresh recomputation checks the proposed result before persistence; missing or
unevaluated requested results are rejected instead of being discarded.

Saved evidence is bound to the named project, scenario, canonical engineering
inputs, initial/device fault records and the separate device-evidence map.
The Design Synthesis page offers a read-only saved review and JSON/TXT study
downloads only when this context still matches. Detailed history tables are
built on request. Engineering edits hide stale numerical results and downloads;
ordinary reload does not require regenerating the proposal to review its study.

Independent acceptance verifies exact 25/50-load three-knot histories, a
separate complex-circuit and exposure calculation, named reload, idempotent
reapplication, undo/redo, removal when no history is requested and failed-save
rollback. The tests include the draft and named snapshot under the unchanged
5 MiB storage ceiling. No catalog, network solver or motor Apply eligibility
was changed. This remains retained screening evidence; complete motor
protection, coordination, fault duty/SCCR qualification and motor-containing
canonical integration remain unfinished. The full goal remains active.

Final persistence verification passed 469 Node test files, 21 focused cases,
66 selected Edge journeys across 17 files, the build, lint and the 80-route
page audit. The 25/50-load saved drafts and named snapshots used 2,223,366 and
4,692,822 bytes respectively against the unchanged 5,242,880-byte storage limit.
Root checked exact TXT/JSON payload equality, six signed current points and two
exposure integrals using a separate circuit calculation, and inspected all six
saved-view screenshots. The cases retain 728/2,703 complete device histories.

Browser review also corrected the controller's event subscriptions: canonical
storage emits `loadList`, `cableSchedule` and other storage keys, so listening
only for collection aliases did not immediately hide stale numerical results.
The page now observes both canonical keys and retained aliases. Final source
hashes match across 1,409 runtime/test files; eleven calculation, storage and
catalog files remain unchanged. Evidence and intermediate checks are retained in
`output/design-synthesis-history-persistence-2026-10-23/verification.json`.

## Motor manufacturer evidence — October 24, 2026

The [manufacturer evidence review](design-synthesis-motor-evidence.md) adds
archived, hashed Siemens-authored exact relay/contactor datasheets and an
overload manual, with independent visual inspection of the relevant pages.
This closes the original-file traceability gap for those retrieved editions.
It does not supply complete motor performance/withstand data, guaranteed relay
bands, control-path clearing, breaker coordination or assembly qualification.
No runtime, catalog, calculation or Apply gate was changed. The full goal stays
active. A separate approved full regression rerun passed all 469 Node files,
with all 1,409 frozen source/test files unchanged; evidence is retained in
`output/node-regression-approved-2026-10-24.json`.

## Existing project equipment handoff — October 24, 2026

The [project-equipment guide](design-synthesis-project-equipment.md) now covers
an explicit handoff from a named project's Equipment List and uniquely linked
Load List. Users select records, confirm the power/voltage/coordinate bases,
review the mapping and copy it into the draft. Supply, corridors and criteria
remain explicit. Generation and Apply reject stale or contradictory mappings.
Equipment IDs and load IDs may differ; both IDs and both tags are preserved.

Eligible nonmotor Apply selectively updates generated assignments and derived
load fields without taking ownership of the existing source records. Undo,
redo, named reload and regeneration retain those records and their owner data.
Omitting an adopted load restores or clears only unchanged generated fields;
it does not delete the equipment or load. Manual changes to owned fields or
the saved drawing remain protected. Raw stored-diagram baselines distinguish
actual diagram edits from owner fields inherited by the read-only view, with
the previous comparison retained for legacy snapshots until their next Apply.

Root review corrected numeric coercion, duplicate-row handling, incomplete
context checks, distinct load-tag linkage, classification substring matches,
and loss of malformed motor or VFD/soft-starter metadata. Such records cannot
be transferred as ordinary nonmotor loads. A current proposal in a named
project can request **Review Apply conflicts** for fresh diagnostics without
mutating the project. The unnamed-project creation flow remains available when
the missing project is its only precondition. Actual Apply still enforces all
source, ownership, project and protection guards.

Final verification passed all 471 Node test files, 24 focused cases in two
files, 70 selected Edge journeys across 18 files, the full build, lint, the
80-route page audit and whitespace checks. The browser fixtures apply 25/50
existing loads totaling 162.5/325 kW into connected 29/56-node drawings with
3/5 panels and 28/55 cables. Root independently checked graph reachability,
canonical ID/tag linkage, panel slots and exact TXT/JSON payload equality,
and inspected four final mapping/Panel Schedule captures.

Separate 25/50-load storage acceptance peaked at 2,122,326/4,227,678 bytes under
the unchanged 5,242,880-byte ceiling, including the draft and named snapshot.
All 1,413 frozen runtime/test hashes match. Eleven calculation, catalog and
storage files are unchanged; the synthesis engine differs only by adding the
review binding to its input signature. The saved-history screenshot helper
retries only a known DOM-detachment capture race after reasserting stale state;
a reconstructed source hash confirms its other numerical/freshness assertions
are unchanged. Intermediate failures and final evidence are retained in
`output/design-synthesis-project-equipment-2026-10-24/verification.json`.

Overall review class remains **Screening only**. Sources, panels, transformers
and previously generated equipment are outside this load-record adoption path.
Manufacturer curve/condition applicability, complete motor protection,
coordination, fault-duty/assembly qualification and motor-containing canonical
integration remain unfinished. Motor Apply stays blocked; the full goal remains
active.

## October 25, 2026: catalog, solver and saved-evidence correction

The Southwire MC catalog now follows the actual archived SPEC45301 PDF,
SHA-256 `d01fb6ec8ab42ea8b6144ea982ccf23ee662190c818621ea9d1d16f7735d3341`.
An indexed copy with the same printed revision contained different values.
All 15 R/X/diameter/stock rows were checked against the archived bytes. Exact
stock and catalog fingerprints pass through generated schedules, proposals,
reports, saved source metadata and the hydrated One-Line view. Existing owner
cable data is preserved until an eligible reviewed Apply.

The general load-flow solver contracts supported exact zero-ohm cable forests
and recovers original cable currents by KCL. Original bus loads, source power,
transformer taps/shunts and separate voltage bases remain represented. Tiny
finite impedances remain physical; unsupported ties cannot pass. The synthetic
50-load mixed-voltage case now converges, fails its original 0.97 pu voltage
criterion at 0.956361688 pu, then uses the existing revision process to select
the sourced 150 kVA transformer and pass at 0.975462540 pu. No iteration,
mismatch, voltage or revision limit was increased. Affected saved calculation
revisions become stale.

Apply deduplicates exact canonical cable fields in top-level drawing
projections using structural equality. Custom fields and original cable IDs
remain intact. An attempted ID omission exposed a saved-circuit regression
and was reverted. With explicit user authorization, direct fault-study binary
evidence now uses the existing UTF15 byte packing; legacy Base64 records remain
readable, and nested scenario records retain their existing inner format.
Independent literal-wire tests cover exact Float64 values, 16/32-bit indexes,
missing values and malformed streams.

Migration testing also found unprefixed legacy settings mirrors left behind
after a rejected named save. Transaction snapshots now include tracked settings
and internal storage-health state. Rollback verifies local/session writes and
removals separately. Transient failures permit a retry after verified recovery;
failed restoration leaves persistence blocked and reports incomplete rollback.
Old-record reload, migration, forced rejection, one-step undo/redo and new-record
reload retain exact evidence. The project schema, quota and history limits are
unchanged.

The previously failing 50-load mixed-fault fixture now peaks at 5,155,768 bytes;
the two-scenario growth fixture peaks at 5,155,802 bytes against the unchanged
5,242,880-byte ceiling. These are bounded fixture measurements, not a promise
that arbitrary project sizes or additional browser data will fit.

Final verification passed all **482 Node test files**, **93 selected Edge
checks across 26 files**, the full build and bundle budgets, lint/architecture,
the 80-route page audit and whitespace checks. Independent checks include
closed-form constant-power circuits, transformer terminal currents/losses,
original-bus KCL, PDF source transcription, exact legacy/new byte decoding and
failed-backend behavior. The motor browser test's two expected times changed
with the source data; reconstructing those two literals reproduces its baseline
hash, proving its 2.03 s limit, precision and revision budget are unchanged.

All 1,425 frozen code/test hashes match. Eight protected calculation/catalog
and storage files remain unchanged; two motor files differ only in their solver
revision literal. The separately reviewed project-storage change is the atomic
rollback correction above. Root inspected the routing and motor-revision
captures and rendered the transformer PDF. The routing capture retains the
existing sticky-navigation overlay across a few upper rows; this milestone does
not claim to fix that capture behavior. Firefox was not revalidated.

Evidence and intermediate failures are retained in
`output/design-synthesis-cable-fault-withstand-2026-10-24/verification.json`.
Overall class remains **Screening only**. A conductor fault-withstand evaluator
has not been implemented by this correction, and complete motor protection and
canonical motor Apply remain open. The full equipment-to-design goal stays active.

## October 25, 2026 — conditional cable fault thermal screen

The optional `cableFaultWithstand` request now compares final sourced copper MC
phase-conductor exposures against the Southwire CTS0002 (2023) 90 °C to 250 °C
adiabatic allowance. The implementation uses all 15 nominal Class B metal areas
from SPEC10080 and binds the exact archived SPEC45301 stock/construction data.
The separate Schneider installation-guide basis supplies the five-second upper
method domain; 0.1 seconds is the application's lower restriction. Source PDFs,
SHA-256 checksums, the area transcription and the independent calculations are
retained with the evidence. See the [method and input contract](design-synthesis-cable-fault-withstand.md).

Root independently verified constant-current exposure without a factor of three,
rotating and cancelling complex phasors, a clearing endpoint between knots,
and all 15 material allowances. A 250 kcmil conductor at 17,975 A for one second
produces exactly 323,100,625 A²s and passes at equality; 17,975.1 A fails. Review
corrected an upward rounding error by converting currents to amperes before
integration, without adding a comparison tolerance. A separate radial series-
impedance oracle matches all 702 cable/bus-fault comparisons in the failing
25-load example; its worst ratio is 1.1594384039418415.

Independent storage journeys cover 25 loads with all generated cables, 25 loads
with one selected cable, and 50 loads with all generated cables. The source
profile has three knots: 1 at zero seconds, 0.4 at 0.03 seconds, and zero at
0.1 seconds. They preserve the exact request/results through Apply, undo/redo
and named reload; forged allowances and altered network histories are rejected
before persistent mutation. Actual catalog changes and cable engineering edits
make saved evidence stale. Peak quota use is respectively 2,368,590,
2,318,730 and 5,052,806 bytes against the unchanged 5,242,880-byte limit.
Review corrected full-population bindings for selected-cable reload, the missing
canonical-context arguments at Apply, and optional undefined binding fields
that previously changed the payload fingerprint after JSON serialization.

Final terminal gates passed:

- Full `npm test`: all 485 Node test files.
- Full `npm run build` and `npm run lint`, including existing bundle budgets,
  architecture boundaries and cycle checks.
- 95 affected Edge tests across 27 files, covering synthesis, saved histories,
  transformer presentation, load-flow/contingency and shared study workflows.
- All 80 page-contract routes and whitespace checks.
- All 1,430 frozen code/test hashes match; all 12 protected solver, fault,
  motor-protection, catalog and core-storage paths remain unchanged.

The first Edge run had 94 passes and one incorrect test expectation for an
internal error code that the page does not display. Two browser expectations
were corrected: locate the existing human-readable reason in load dispositions,
and check the visible 1.159438 utilization in the thermal review. Reconstructing
those two original assertions reproduces the initial spec hash. No application
code changed after the passing build, lint and Node gates. The final complete
95-test rerun passed. Initial failures and the hash audit remain in the evidence.

Root visually inspected the selected-cable saved review: sources, condition and
clearing claims, coverage, actual/allowable A²s and unevaluated qualification are
readable. The failing-screen assertions verify its reason, utilization, disabled
Apply and absence of saved evidence. Its full-output screenshot is an unusually
tall diagnostic capture, not a readable single-view overview. Firefox was not
revalidated in this milestone.

Evidence: `output/design-synthesis-cable-thermal-withstand-2026-10-25/verification.json`.
This remains **Screening only**. Clearing and condition evidence are supplied and
unverified; only generated bus faults and insulated phase conductors are checked.
Cable near-terminal/interior faults, grounding/neutral/armor paths, actual device
clearing/let-through and repeated-event heating remain outside this model.
Automatic conductor resizing after failure is future work. Cable qualification
and protection adequacy remain unevaluated, motor Apply remains blocked, and
the full equipment-to-design goal remains active.

## October 25, 2026 — automatic cable thermal conductor trials

The conductor-trial gap noted above is now implemented for the optional
generated-bus-fault thermal screen. A complete numerical failure raises the
failed circuits' minimum sourced sizes, retains existing conductor/current and
transformer floors, and regenerates the dependent design. Operating and motor
studies, fault calculations, source histories and thermal comparisons use the
current candidate. Trials share the existing absolute `loadFlow.maxRevisions`
budget, including already-consumed operating/motor revisions. Defaults and
maximums are unchanged; zero explicitly requests evaluation without retries.
Incomplete evidence, infeasible routing, exhaustion and unavailable larger
stock keep the proposal blocked.

Independent acceptance verifies:

- 25/50-load all-modeled and selected-cable revisions using separate per-phase
  radial circuit equations, with source/profile/clearing inputs preserved.
- Zero/one/two-slot outcomes of #8/#6/#4 and the actual endpoint EMT change
  from 1¼ to 1½ inches, including its recorded OD and fill evidence.
- A larger cable exhausting a 12-inch tray: no bypass stays blocked; a permitted
  bypass reroutes and passes after fresh current/thermal evaluation.
- A shared operating/thermal budget. An independent constant-P quadratic gives
  0.9992346513868007 pu initially and 0.9994041531890981 pu after one operating
  revision. At the intervening 0.9993194022879495 pu criterion, one slot leaves
  thermal failure unresolved; two slots complete the selected thermal revision.
- A utility-plus-motor infeed case with an independent two-source current
  equation: thermal resizing can pass while motor protection still blocks Apply.
- Nine feeder trials reaching 350 kcmil, and a separate twelve-step catalog
  exhaustion retaining the final 750 kcmil failed exposure and explicit stop.
- Exact original criteria and trial history across atomic Apply, undo/redo,
  named reload, forced save rejection/retry, and stale-input invalidation.
  Altered voltage limits, budgets, source stocks and shrinking/overlapping
  trace changes are rejected. Pre-revision payloads without a trace remain readable.

Review corrected loss of the retained feeder design margin: 75.2333960411818 A
previously fell to 75.17581630073254 A on a thermal retry. The larger margin is
now retained. Review also added actual endpoint/tray deltas, final feeder/load
bindings, truthful un-clamped revision usage, and the exact original criteria
in saved review/TXT/JSON. Criteria are stored as trial provenance without
rewriting project design-basis settings.

Final terminal verification passed: all 488 Node test files; 14 focused
independent/trace cases; full build and lint; all 80 page-contract routes;
96 affected Edge tests across 28 files; and all three targeted thermal workflows
in Firefox. The three workflows were also rerun in Edge after a capture-only
test correction. All 1,435 frozen code/test hashes match, and all 12 protected
solver, fault, motor-protection, catalog and core-storage paths remain unchanged.
The broader Firefox suite was not rerun.

The revised three-knot 50-load case peaks at 4,993,898 bytes; the previous
50-load thermal-history case peaks at 5,065,038 bytes. Both fit the unchanged
5,242,880-byte quota. No stored evidence, criteria or limits were dropped.
The prior failing browser fixture now explicitly requests zero revisions;
hash reconstruction proves its physical source, clearing limit and assertions
are unchanged. Firefox's initial failure occurred only when capturing a
104,403-pixel diagnostic element. A bounded summary capture resolves its
32,767-pixel protocol limit. A separate hash audit proves that change modified
only the screenshot call, with all application code and assertions unchanged
after the passing build/Node/Edge gates. The corrected captures and all six
targeted browser reruns passed. Root inspected the automatic-trial review and
the readable Firefox failure summary.

Evidence: `output/design-synthesis-cable-thermal-revision-2026-10-25/verification.json`.
Overall class remains **Screening only**. Recorded trace structure and its final
engineering binding are validated; every historical network solve is not
independently replayed on reload. The feasibility strategy is bounded and is
not globally optimal. Full case matrices and protection-change lists remain
verbose. Near-terminal/interior faults, actual protective clearing/let-through,
repeated-event heating and complete motor protection remain open. Qualification
and protection adequacy stay unevaluated, motor Apply stays blocked, and the
full equipment-to-design goal remains active.

## October 26, 2026 — continuous generated cable-span fault coverage

The optional `all-generated-bus-and-cable-span-faults` mode now evaluates every
generated fault cable A against every selected phase conductor B over the
closed position interval [0,1], together with all generated bus faults. An
unselected A can govern a selected B. Missing bus coverage, an unresolved
span/target pair, a denominator zero, or exhausted root work blocks the screen.
Legacy `all-generated-bus-fault-cases` requests keep their explicit bus-only
scope. Failed B conductors feed the existing sourced-size revision loop under
the original shared budget; faulted A is not automatically resized instead.

The shared network core adds an unfaulted port-response API using its existing
strict validation, exact ideal-forest contraction, per-unit bases and stamps.
Source and original-node unit-injection responses share one elimination; no
probe sources, phantom faults or epsilon impedances are introduced. Root's
independent differential audit retains exact legacy output equality across
711 cases and matches 21 explicit split-cable current comparisons, including
mixed-voltage complex taps. The protected core exception is isolated and
recorded; the other 11 protected files remain unchanged.

Finite-span currents produce integrated rational exposure polynomials.
Complete exact-dyadic Sturm root isolation checks endpoints and every distinct
stationary root, including repeated roots and exact limit equality at an
irrational location. Independent SymPy integer-polynomial checks agree for 61
cases containing 41 interior roots, including a degree-six case with three
interior stationary roots. A synthetic radial two-source fixture reaches
3,853,249.467679 A²s at position 0.031388224894; its #6 allowance is
3,559,470.862336 A²s. Endpoint/midpoint samples miss that failure. Exact
zero-impedance fault spans retain separate half-conductor currents through
virtual-node KCL recovery.

The exact operations certify the supplied Float64 coefficient model, without
forward-error bounds on the upstream network solution or physical-input
uncertainty. The screen remains conditional and **Screening only**. Numeric
position enclosures are outward-rounded and exact dyadic endpoints are kept.
Overlapping candidate positions/spans remain explicit. A connected unloaded
tree with exactly one in-service source uses exact KCL structural zeros and
a reduced denominator; a second source, including a zero-EMF source, or a mesh
retains the general model. No current threshold removes a comparison. The
50-load three-candidate prototype decreased from about 44.8 to 4.9 seconds
after this structural reduction while retaining all 2,601 span-target pairs.

New focused acceptance covers 33 cases: core physical circuit reductions,
polynomial bounds, all-span coverage, multisource/ideal/transformer/reversed
paths, complete 25-selected and 50-all conductor trials, and governed storage.
The final Node run passed all **493 test files**. The broader affected Edge
suite passed **97 cases in 29 files**. The final thermal rerun passed **four
Firefox and four additional Edge cases**. Build, full lint, 80-route contracts
and whitespace checks also passed; the final verifier requires every terminal
gate to succeed.
The source freeze contains 1,443 code/test hashes with no unreviewed changes.

Saved records retain a lossless optional reconstruction context inside the
existing packed history payload. Reload requires its rebuilt initial-network
fingerprint to match the current study and recomputes the final continuous
screen. Explicit undefined fields and negative zero are preserved. Dense
response operators and per-position histories are not stored. Apply,
undo/redo, named reload, altered-context/coverage rejection, stale cable edits,
and exact rollback after a rejected durable save pass. The measured 25/50-load
peaks are 2,344,082 and 5,105,746 bytes under the unchanged 5,242,880-byte
quota; projects with additional owner data are not guaranteed that headroom.

Evidence: `output/design-synthesis-cable-span-faults-2026-10-25/verification.json`,
`core-independent-audit.json`, `polynomial-independent-audit.json`, source
integrity records, final logs, saved JSON/TXT downloads and reviewed browser
captures. The folder began October 25 and final checks ran October 26.
The first browser probes used the previous built bundle and are superseded
by rebuilt browser checks. The first saved reconstruction omitted explicit
undefined fields; the lossless context corrects that fingerprint mismatch.

Actual protective clearing/let-through, earth/neutral/armor/sheath fault paths,
repeated-event heating and complete motor protection remain open. Qualification
and protection adequacy stay unevaluated; motor Apply stays blocked. No device
catalog was promoted. The full equipment-to-industrial-design goal stays active.

## October 26, 2026 — Eaton clearing-source transcription

The [Eaton source review](design-synthesis-eaton-clearing-evidence.md) now maps
all eight actual default synthesis candidates to their exact source status.
The application guide supplies the general thermal-magnetic total-clearing
interpretation; exact F-frame charts supply six vector figures and the raster
125 A figure. KDB3400's fixed/adjustable magnetic applicability remains open.
No different ampere rating is rescaled to fill a missing curve.

Root corrected two defects in the new offline vector tool: infinite-line
flatness could miss collinear Bézier overshoot, and clipped paths could join
separate in-plot runs. Finite-chord bounds, exact endpoint sharing and run-wise
domain unions now preserve reversals and gaps. The original source paths,
axis-fit residuals, widths and separate voltage tails remain inspectable.
All gaps remain explicit; visible ink overlap does not become electrical
tolerance or an inferred complete curve.

The separate 125 A reader records 28 sparse pixel observations with PDF and
decoded-image hashes. It emits no interpolated curve or current/time values.
Root inspected the diagnostic plot against the original image. An independent
checker samples the raw vector cubic Bernstein forms and line midpoints
without importing the extractor. The focused Python checks cover both tools,
including ambiguous source readings and exact snapshot identity.

Evidence and final gate results:
`output/design-synthesis-device-clearing-evidence-2026-10-26/verification.json`.
The repository's full Node suite and production build remain required.
That milestone provided offline research tools and left application runtime and
catalog readiness unchanged. Actual clearing/let-through integration, complete motor
protection and motor Apply remain unresolved. Overall **Screening only**;
the full equipment-to-industrial-design goal remains active.

The follow-up surfaces that source research on generated breaker selections:
each exact matching default catalog record carries its figure and unresolved
conditions in proposal output, JSON, readable report and the existing shared
selected-device evidence after Apply. A saved review resolves the current
project's referenced devices and flags changed or missing evidence and changed
circuit voltage. Changed and custom records cannot inherit
the reviewed snapshot annotation. Source metadata remains screening evidence;
actual clearing, coordination and motor Apply are still unresolved.

The subsequent [evidence-storage change](design-synthesis-evidence-storage.md)
packs repetitive active device evidence without changing the decoded data
returned to application consumers. Legacy maps and full named-project exports
remain readable; damaged or future encodings are preserved and block automatic
replacement. A mixed-voltage 25-to-50-load fixture recovered 281,748 bytes under
the same storage limit. Full verification and the remaining scope are recorded
in the guide.

The [Eaton curve research](design-synthesis-eaton-clearing-evidence.md) now
includes bounded constant-current graphical readings for six exact F-frame
snapshot records where their original source segments cover the requested
current and voltage. It does not calculate protective clearing under a changing
fault current, coordination, or complete motor protection. Motor Apply remains
blocked and the full equipment-to-design goal remains active.
