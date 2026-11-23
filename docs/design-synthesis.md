# Design synthesis workspace

`designsynthesis.html` is a preliminary design workspace. It accepts a supply, equipment locations and ratings, a permitted corridor graph, and explicit design criteria, then calls `generateDesignProposal(input)` from `analysis/designSynthesis.mjs`.

For existing projects, the [project equipment handoff](design-synthesis-project-equipment.md) provides a reviewed Equipment List-to-design path. It joins existing loads by `equipmentId` or proposes a load from an equipment record's explicit electrical input kW; it preserves owner records, requires explicit basis acknowledgements, and reconciles generated assignments on Apply. Review and copying do not mutate canonical records, and the workflow does not relax motor Apply gates.

The input contract is:

```js
{
  supply: { id, voltage, phases, frequencyHz, capacityKva, availableFaultCurrentKA, x, y, z },
  equipment: [{ id, tag, kw, voltage, phases, powerFactor, duty, x, y, z }],
  corridors: { nodes: [{ id, x, y, z }], edges: [{ id, from, to, widthIn, depthIn }] },
  criteria: { maxPanelLoadKva, maxLoadsPerPanel, voltageDropLimitPct, conductorMaterial, temperatureRatingC }
}
```

Voltage is V line-to-line, capacity is kVA, power is kW, coordinates are feet, and corridor dimensions are inches. The validator accepts the explicit ft/in basis only; metric coordinates are not silently converted. The page persists the draft using `dataStore.mjs` under `designSynthesisDraft`. A qualified reviewer can use Apply to send a current, conflict-free proposal through the shared reconciliation helper as one undoable canonical mutation, including schedules and derived one-line/routes when present.

The corridor table editor lets users add, edit, and remove nodes and edges without editing JSON. New edges begin closed until explicitly opened. Existing edges without a permission value retain the generator's documented default of allowed; conflicting or non-boolean permission values require correction. Removing or renaming a node leaves its edge references untouched so the validator can identify broken connectivity rather than silently changing the route. The advanced JSON remains available for other fields, including edge thermal data. The route preview draws allowed corridors and omits closed or invalid edges. The [project tray handoff](design-synthesis-project-trays.md) can copy reviewed tray geometry and cable assignments into the draft; it does not verify a field obstacle survey.

The optional **Alternative endpoint connections** criterion permits a bounded
retry with other nearby nodes when the nearest-node route is infeasible. It is
off by default. Field connections are straight lines within the stated endpoint
distance and may cross obstacles or closed corridors; the user must review their
permission and installation. See [alternative endpoint connections](design-synthesis-routing.md#explicit-alternative-endpoint-connections).

The generated **Route preview** is an equal-scale x/y plan, so a given
distance has the same displayed length in either horizontal direction. Use
**Inspect circuit** to isolate a cable and see its ordered raceway segments,
three-dimensional endpoint coordinates, and recorded lengths. Elevation is
listed in the segment table, not shown by the plan; coincident plan lines do
not by themselves indicate a connection. The preview identifies co-located
zero-length endpoints and omits missing, duplicate, endpoint-mismatched,
blocked, invalid, or disconnected route geometry instead of presenting it as a
complete path. It checks segment endpoints and lengths against the generated
equipment coordinates and the corridor segments against the permitted input
edges. It is a preliminary representation of generated records, not a
survey or a substitute for route installation review.

The [existing-tray occupancy screen](design-synthesis-capacity-routing.md#existing-tray-occupancy-screen) accepts an explicit, referenced inventory in corridor JSON and accounts for those cables during route selection and final fill screening. Its standalone synthetic sample remains blocked from Apply. A [reviewed project-tray handoff](design-synthesis-project-trays.md) can support preliminary Apply when the user supplies and binds the required thermal and installation references and the owner records reconcile; those references are not independently verified.

Corridor edge endpoint references resolve node IDs without regard to letter case
or surrounding whitespace. The supplied input is retained, while routing and
raceway geometry use the uniquely matched node. Duplicate node IDs under that
comparison and unknown endpoints block generation.

An edit made while a draft import or sample is still loading supersedes that
pending load. The later response cannot overwrite the newer edit; start the
import or sample again if it is still wanted. Invalid advanced JSON remains in
the draft for correction and cannot be used as a valid study input.

An optional [motor acceleration screen](design-synthesis-motor-acceleration.md) evaluates explicitly referenced speed/current/torque curves on the finalized proposed network. Its quasi-steady result is screening evidence only; motor protection remains unresolved and Apply remains disabled for motors.
If the explicit acceleration-time criterion fails or the supplied curves show insufficient accelerating torque, the bounded motor-path revision process may test larger sourced conductors or an eligible transformer profile. It shares `criteria.loadFlow.maxRevisions` with operating and starting studies and retains the supplied criteria unchanged; the revision history and stopping reason appear in the review and reports. A revised duration pass still does not complete protection or enable Apply.
An optional [ABB REM610 thermal-setting alternative](design-synthesis-motor-thermal.md) uses the final acceleration time, a referenced constant start-current basis, and explicit safe-stall/start policy to screen REM610 ANSI t6x settings. The stated timing accuracy requires an explicit unit phase-current scaling factor; nonunit scaling retains nominal calculations but blocks recommendations. Its timing envelope is a disclosed conservative assumption, not a guaranteed ABB tolerance. It is relay-specific setting evidence only; it does not replace Siemens 3RU overload protection, model winding thermal history, or enable motor Apply.
An optional nested start-up exposure comparison uses explicitly supplied REM610
start-up settings and the final modeled phase-current integral. Its output is a
nominal percentage for review, not a trip prediction or protection pass.

The optional [motor protection timing comparison](design-synthesis-motor-protection-timing.md)
retains v1 reference-current inputs and adds v2 supplied constant-stall current
intervals with hot/cold withstand curves. **Load stall-range example** demonstrates
synthetic inputs. V2 recomputes the final network locked-rotor point and compares
each device's upper total-clearing bound across the declared interval, including
interior worst margins. The selected hot/cold state, source claims and comparison
scope remain explicit in the page and TXT/JSON reports, including mixed-version
projects. These bounded comparisons do not complete motor protection or enable Apply.

The current screening model is limited to 60 Hz, one- or three-phase supply/load combinations, feet coordinates, inch corridor dimensions, and supported 60 °C or 75 °C conductor/terminal tables. A known available-fault-current basis is required before protective interrupting ratings can be screened. The bundled sample includes a research library catalog, so proposals may show candidate manufacturer records with source/status metadata; a candidate remains a research/screening result and is not an approved procurement or coordination selection.

An optional top-level `faultStudy` enables the [explicit initial fault-network
screen](design-synthesis-fault-network.md) for supported three-phase proposals.
Use **Load motor fault network sample** and **Advanced fault network JSON** to
try explicitly synthetic utility/motor equivalents. The study uses final routes
and conductor/transformer selections, reports each source's contribution
separately from its terminal current, and preserves its fingerprint and input
references. Missing known source equivalents block the requested study. It does
not complete motor protection or enable motor Apply. Otherwise eligible nonmotor
Apply retains a compact study summary in the named project.

An optional top-level `faultEvolution` adds a supplied source-profile history
screen alongside that exact `faultStudy`.
Use **Load fault evolution example** for clearly synthetic piecewise-linear real
EMF multipliers on the sample network, or enter **Advanced fault evolution
JSON**. The workspace and TXT/JSON exports show RMS phasor histories and
current-squared exposure while retaining source impedances and in-service
states, including when an EMF multiplier reaches zero. Inputs are supplied and
unverified. This is not a measured motor decay or dynamic transient, and it
does not establish protective clearing, device adequacy, conductor damage,
thermal rating, or SCCR. Editing inputs invalidates the generated result.

After applying an eligible nonmotor proposal to a named project, the page also
shows a read-only **Saved source-history evidence** section. It displays the
saved numeric history and enables JSON/TXT downloads only when the current
project, scenario, canonical fault records, and study evidence still match the
saved context. Missing or stale records show a status without exposing stale
numbers. This is retained screening evidence only; it is not a new proposal,
does not change Apply eligibility, and leaves protection adequacy unevaluated.

The same optional study also adds the [proposed-device current
screen](design-synthesis-device-fault-screen.md). It records generated source-end
placement assumptions and separately compares line-terminal available current
and current through each device, including an immediate load-side fault.
Conditional assembly ratings do not substitute for standalone breaker ratings.
An initial-current exceedance blocks the proposal; a non-exceeded comparison
does not establish protection adequacy.

An optional [cable fault thermal screen](design-synthesis-cable-fault-withstand.md)
compares signed final cable branch histories at both terminals for every
generated bus-fault case against a supplied maximum total-clearing claim and a
single-event 90 °C to 250 °C copper adiabatic basis. Supplied clearing and
applicability references remain unverified. Choose
`all-generated-bus-and-cable-span-faults` to include cable-side endpoint limits
and all interior positions of every generated cable against every selected
conductor, including faults in other cables. Legacy bus-only requests retain
their exclusions. Exact polynomial extrema apply to the supplied rounded
coefficient model and do not enclose network forward error or physical input
uncertainty. The screen does not calculate actual clearing or let-through,
qualify a cable, or complete protection.
An incomplete comparison blocks Apply without a sizing trial. An evaluated
numeric failure starts bounded next-size conductor trials under the shared
`criteria.loadFlow.maxRevisions` budget (zero is evaluate-only); every candidate
regenerates routing, installation, protection, and dependent studies. An
infeasible candidate or exhausted budget remains blocked.

Alternatively, use **Load fault scenarios sample** and **Advanced fault scenarios
JSON** to compare two through four complete referenced source conditions. The
[scenario guide](design-synthesis-fault-scenarios.md) describes observed bus/device
envelopes, limiting conditions and saved evidence. Scenario input and the legacy
single `faultStudy` are mutually exclusive; neither completes motor protection.

Detailed proposal evidence is generated when its disclosure panel is opened.
Closing the panel releases its displayed JSON; opening it again rebuilds the
same evidence for the current proposal. Editing inputs clears the proposal and
its evidence. The JSON and readable-report downloads retain their complete
payloads, and saved-evidence exports retain their existing contents.
When a live proposal contains more than 50 device fault histories, the history
summary table shows 50 at a time. Use the device-history page selector to reach
any range; each row still opens its detailed time history and exact evidence.
The complete history remains in the downloads and saved-evidence review.

For mixed-voltage input, the page currently supports balanced three-phase 480 V direct loads and 208 V loads supplied through a selected 480 V delta to 208Y/120 V transformer. Use **Load mixed 480/208 V sample** for a synthetic example with no preassigned panels or cables. The generated review groups the transformer's 480 V primary and 208 V secondary ratings, currents, separate primary and aggregate secondary-main OCP candidates, device voltage and interrupting evidence, and transformer fault/model assumptions. Profile candidates are recorded with loading and an approximate transformer-only voltage drop (not total network drop); the connected load-flow revision process can advance to another eligible profile when the unchanged study criteria are not met. The report retains revision outcomes and the final profile. Candidate selection is tied to the current generated input signature; any input edit invalidates the proposal and requires regeneration.

Explicit motor records can be supplied through the equipment JSON or imported draft.
The [motor integration guide](design-synthesis-motors.md) defines separate design,
nameplate and locked-rotor current inputs, referenced source impedance, and the
starting-voltage criterion. Motor inputs affect conductor sizing and a balanced
initial DOL network screen. Starting-voltage failures can drive bounded conductor
and transformer trials within the operating-study revision budget. The review and
text/JSON reports retain results and unresolved requirements. Motor designs remain
blocked from Apply because overload selection, starting withstand, motor fault
contributions and coordination are not yet completed.

Generation also proposes manufacturer-backed overload relay current ranges from
44 Siemens 3RU2 catalog records. It uses explicit motor nameplate current for the
relay dial and retains the separate conductor-design current basis. A separate
exact-part starter assembly research candidate is shown when motor horsepower,
nameplate frequency, local circuit, supply, and explicit starter criteria are
available. The rendered review and downloaded report retain exact part numbers,
source provenance, every failed or unevaluated condition, and rejected-candidate
reasons. These candidates remain blocked and are never selected for Apply. The
standalone S00 range candidate and assembly S0 relay are alternatives, not two
installed relays. See the [motor guide](design-synthesis-motors.md) and [starter
assembly guide](design-synthesis-motor-starters.md) for the scope and evidence.

An explicitly selected [inverse-time motor branch-breaker method](design-synthesis-motor-branch-breakers.md)
proposes a separate Siemens 3VA51 breaker / 3RT2027 contactor / 3RU2126 overload
topology. Its exact 25 A or 30 A breaker current drives a conservative branch
conductor ampacity floor without replacing motor design FLC or feeder demand.
The method requires explicit squirrel-cage rotor data and retains rejected
combinations rather than falling back to a generic device. The proposed
instantaneous setting is discrete and does not establish starting ride-through
or coordination. Motor Apply remains blocked.

**Load manufacturer motor example** combines a synthetic 25-load plant and
source with ABB Baldor GNEM2332T nameplate and typical 460 V, 60 Hz starting
data. It selects the separately researched 14–20 A overload relay and retains
the manufacturer's reference. The 14 A design-current table choice, rotor type,
full-load operating assumption, source and installation are illustrative and
require independent applicability review; in particular, [Eaton's motor-current
table](https://www.eaton.com/content/dam/eaton/products/industrialcontrols-drives-automation-sensors/nema-contactors-and-starters-v5-t2-ca08100006e.pdf)
notes that low-speed motors can require higher running current. This example
does not establish protection, installation suitability, or Apply eligibility.

The **Load protection timing example** uses synthetic motor acceleration,
breaker, overload, and hot/cold safe-stall timing inputs attached to the motor
record. The bounded reference-current comparison reports acceleration plus
margin, interpolated supplied curve bounds, the selected motor-state stall
comparison, and the opposite state as unevaluated. The references and values in
that example are illustrative, not manufacturer data. This screen does not
integrate dynamic device response, establish device qualification or
coordination, complete motor protection, or enable Apply. The proposal JSON and
TXT report retain the timing evidence; editing inputs invalidates the generated
result and downloads. See the [motor protection timing guide](design-synthesis-motor-protection-timing.md)
for the input contract and comparison boundaries.

Motor proposals also compare the nominal source-only current implied by the
starting R/X with the declared external-source fault upper bound. Contradictory
or missing bounds block the starting screen and retain the original values for
review. The workspace and report expose the source voltage, R/X, implied current,
declared bound and diagnostic result. This check uses the starting model's 1.0 pu
source; it does not replace a complete maximum/minimum fault study or resolve
motor contributions and starter protection. The motor guide records the exact
basis and corrected synthetic examples.

Transformer profiles are restricted to the sourced March 2020 Schneider/Square D copper 30, 75 and 150 kVA rows (catalog pages 7, 13 and 20). This does not establish that the profile set covers all industrial transformer needs. Profile selection starts with connected 208 V load kVA and evaluates the connected network against the unchanged project load-flow criteria; a higher eligible profile may be selected when a prior revision fails those criteria. The transferred secondary fault estimate is three-phase symmetrical screening only. Ground faults, asymmetrical interrupting duty, motor/generator fault contribution, transformer phase displacement, magnetizing current, inrush, and coordination are not evaluated by that estimate. The magnitude-only load-flow report does not claim verified physical winding angle. Applied selected-device evidence is retained by content fingerprint so an identical catalog ID evaluated at different voltages or fault bases keeps distinct evidence; large repeated candidate catalogs are omitted from canonical generated records.

Every edit invalidates the displayed proposal and disables its downloads. A generated result is only downloadable while its source signature matches the current draft. Blocked results and issues remain visible for diagnosis. Generic protective requirements are calculation requirements for review; they are not selected manufacturer devices, settings, or approval. The result is screening information and requires qualified human review, field verification, applicable standards evidence, and coordination before procurement or construction.

**Create separate review project** saves a new local project from a current
motor proposal when its only blocking issue is unresolved motor protection and
its panel assignments, one-line, raceways, and routes are complete and
consistent. The source project remains open and unchanged; open the new
`PRELIMINARY REVIEW` project from the project manager to work with its equipment,
load and cable schedules, raceways, routes, and one-line. Reviewed source
equipment and linked-load identities and owner fields are retained. Selected
cable-device evidence is retained, and motor starter part numbers appear as
screening candidates in the one-line connection inspector when the saved
summary matches its project reference. Missing or changed summaries are shown
as unavailable; the match does not verify manufacturer applicability. The application
reproduces the proposal and checks the original project context before saving;
it does not overwrite an existing saved project. A failed storage write does
not create a review project.

The review project has a persistent banner and a non-reviewable issue gate,
which remain even if the generated motor rows are removed. This gate cannot be
approved away in the application. Its motor protection, fault duty, installation,
coordination and assembly ratings remain unresolved; the copy is not for issue.
Full study results, source histories, and trial histories are **not** copied into
the review project. Download the proposal JSON and human-readable report from
the original Design Synthesis result for that evidence. Some standalone exports
do not carry the preliminary notice, so include the review status when sharing
them. Existing-tray reuse cannot yet be copied into a review project because the
owner inventory and its thermal basis cannot safely be carried over by this
handoff. Resolve any other blocking issue before creating a review project.

**Download preliminary panel schedule CSV** exports every generated panel space,
including unassigned spaces, with circuit and load assignments, cable identity,
candidate ratings, input signature and proposal status. Multipole branches
appear once for each occupied circuit and retain the same branch start and pole
count. Each row is marked screening-only and not approved. The download is
available for a blocked motor proposal, but does not apply it to project
schedules or resolve motor protection, coordination, or assembly SCCR. The
export is disabled if the generated panel layout, load membership, or branch
cable identities are inconsistent, and after editing inputs until regeneration.

**Download preliminary cable schedule CSV** exports one row per generated
feeder or load cable, including endpoint IDs and tags, conductor and voltage
screening values, ordered route segments, installation coverage, and device
candidates. The proposal status, input signature, and screening designation are
repeated on every row. Motor starter parts appear only when an exact candidate is
present; motor protection remains unresolved. An alternative endpoint connection
includes its selected nodes, attachment distances, and field-review note; an
endpoint-conduit retry identifies the original and selected conductor. A missing, duplicated, or
endpoint-mismatched route is identified instead of being assigned to a cable.
The CSV remains available for blocked proposals with generated cable records,
but it does not waive any Apply blocker. Empty cells mean a value was not
available, not that a check passed. The JSON and readable report carry the full
issues, criteria, source evidence, and limitations needed for review. To prevent
spreadsheet formula execution, text beginning with a formula character is
prefixed with an apostrophe in the CSV.

**Download preliminary raceway schedule CSV** lists each generated tray and
endpoint conduit with its coordinates, routed length, assigned generated cable
IDs, and available fill-screening result. Tray utilization is expressed against
the evaluated limit; conduit area fill is reported separately. Existing-tray
inventory references and cable counts are included when supplied. Every row
retains the proposal status, input signature, and screening designation. The
assigned cable IDs are an array encoded as JSON in one spreadsheet cell, so
identifiers containing separators remain distinguishable. The
download is available for a blocked motor proposal when its raceways and all
generated cable routes form a complete, consistent projection. Missing,
ambiguous, mismatched, or unrouted segments prevent this schedule from being
downloaded; the proposal diagnostics remain available. Editing inputs requires
regeneration. This schedule does not apply the proposal or establish field
clearance, thermal interaction, supports, grounding, protection, or approval.

The proposal includes a scrollable **Preliminary one-line** and a downloadable
SVG for review, including blocked motor proposals when their generated topology
is complete. The drawing represents each generated source, panel, load, cable,
and transformer winding. Visible labels wrap full equipment tags and candidate
part numbers rather than shortening them; where available they also show cable
length, device continuous current and standalone interrupting rating at its
stated voltage. Motor contactor, overload and controller or breaker candidates
are identified separately. Cable labels and device names are screening candidates;
motor protection remains unresolved. The drawing does not represent physical
layout, installed settings, coordination, or approval. Missing, duplicated,
disconnected, inconsistent, or non-radial generated connectivity prevents the
drawing and download; the proposal diagnostics remain available. Editing inputs
invalidates the drawing and requires regeneration.

Applied cables retain device identities, technical ratings, and an explicit `protectiveDeviceEvidenceRef`. Complete selected manufacturer records are stored once in the scenario's `designSynthesisDeviceEvidence` map. `resolveDesignSynthesisDeviceEvidence` resolves a cable's reference; this retains source documents and field evidence without repeating the same catalog record for every circuit. The proposal JSON retains its complete selected records. Apply saves the named project before navigation and rolls back if a durable save fails. Ownership fingerprints identify manual changes during regeneration without storing a second copy of every generated record.

In the applied One-Line view, select a generated cable connection to see its
protective-device candidate in the connection inspector. The inspector reads the
current cable schedule and its referenced source record; it shows the candidate
and available ratings only when the cable identity, endpoints, stored reference,
and inline summary agree. Missing, ambiguous, changed, or mismatched evidence is
reported instead of showing an old candidate. Changes to the cable or evidence
refresh the selected connection. This is a read-only screening handoff, not an
installed breaker symbol, completed coordination, or an assembly SCCR.

To review all linked candidates on the drawing, open **View** and enable
**Proposed device candidates**. Cable labels then identify matching candidates
as proposed devices, with manufacturer, catalog number, and continuous current
when available. A missing or changed link is shown as unavailable, and cable or
evidence changes refresh the drawing. The option starts off on each page load;
it changes the view only and does not add protection components to the model.

The **Selected breaker curve-source review** identifies the source figure,
placement voltage, and remaining evidence for matching Eaton snapshot devices.
The proposal JSON and readable report retain this information. After Apply, the
saved review reopens the selected-device evidence for the active scenario and
flags missing or changed references and changed circuit voltage. Other device
sources remain in their candidate-specific reviews. These annotations do not
calculate clearing time or establish coordination; see the
[Eaton evidence guide](design-synthesis-eaton-clearing-evidence.md).
Selected-device evidence uses a lossless active-storage encoding when useful;
[storage behavior and limits](design-synthesis-evidence-storage.md) describe
legacy reads, named-project exports, recovery, and measured headroom.

Applying from an unnamed workspace opens project creation. The input draft is
held in project session storage, restored only after the new project is ready,
and regenerated for that project before it can be applied. Cancelling creation
keeps the current draft and allows another attempt. Reapplying an unchanged or
revised draft updates the generated drawing and schedules without adding a new
drawing sheet. Manual changes to generated records and ambiguous sheet matches
block Apply and leave the current project intact.

The workspace also supports [route thermal ampacity screening](design-synthesis-thermal.md).
Global conditions and per-corridor ambient, grouping, and solid-cover overrides
feed conductor selection. The result identifies the limiting segment for each
feeder and branch. Regeneration updates voltage drop, candidate protection, and
tray capacity using the selected cable dimensions. This tabulated MC cable
screen is separate from the detailed single-core direct-burial thermal study.

Routing now considers electrical feasibility for each sourced conductor size.
For fixed nearest corridor endpoints, it filters edges by the candidate's
route thermal ampacity and finds the shortest permitted path. It then checks
voltage drop and chooses the shortest feasible route, preferring the smaller
conductor when route lengths tie. There are at most 15 candidate searches per
circuit; it does not enumerate every possible path through a mesh. Endpoint
attachment limits and prohibited corridors still apply.

Each circuit and saved route carries a compact `routingDecision`: selected
edges, length and conductor, the original shortest path, any reason that path
was rejected, and the number of candidate searches. The workspace and text
report expose these decisions. Shared tray capacity also filters each candidate
graph using the actual previously selected cables. A later circuit can use a
permitted bypass when the shortest tray fills. Final raceway checks select the
smallest fitting listed width within the corridor allowance. See
[capacity-aware routing](design-synthesis-capacity-routing.md) for the synthetic
25/50-load example and verification evidence. Selection is greedy in stable
generation order; it does not backtrack earlier assignments. Panel placement,
cost, alternate endpoint anchors, and the complete network are not jointly
optimized.

Positive-length endpoint connections now require an explicit installation
method. The sample selects dedicated EMT, with one MC cable per conduit and
automatic trade-size selection within project bounds. The installation
coverage check accounts for both tray and endpoint segments; missing endpoint
assumptions or insufficient conduit capacity block Apply. Generated conduits
appear in the project conduit schedule and route results. See
[endpoint conduit proposals](design-synthesis-endpoints.md) for the criteria,
manufacturer sources, and limits of this fill screening.

The proposal also records [input evidence and effective assumptions](design-synthesis-input-evidence.md).
The workspace and report show units, input classification, supplied values,
defaults, and inherited frequency. The sample is labeled synthetic; attached
source documents are retained as references without claiming verification.

Every equipment input row now has an explicit accepted, rejected, or deferred
disposition, including malformed rows and duplicate identities. The workspace
and report retain original values and diagnostic reasons. Acceptance here means
incorporation in a generated proposal, not engineering approval.

Generated one-lines now retain source/load bus roles, cable lengths, sourced
impedance, and selected cable ampacity for downstream load-flow studies.
See [study handoff and equipment accounting](design-synthesis-study-handoff.md)
for the independent numerical checks and verification status. Generation now
evaluates balanced load flow and can revise affected conductors and protection
when operating voltage, duty-adjusted current, or source capacity including
losses fails. The Load-flow revision controls set minimum operating voltage,
revision budget, and solver iteration budget. See
[automatic operating-study revision](design-synthesis-study-revision.md) for
defaults, stopping conditions, evidence, and current verification status.
Running a separate study page does not automatically regenerate a proposal.

## Panel location overrides

The Panel location overrides table lets you add a generated panel ID, x/y/z
coordinates in feet, and an optional reason. Generate recalculates feeder and
branch routes, thermal conductor selection, protection, voltage drop, and
raceway checks from that location. Remove the row and regenerate to return to
automatic placement. Unknown panel IDs, missing coordinates, and unsupported
override fields block generation rather than being silently ignored.

The JSON draft represents these choices as:

```json
{ "overrides": { "panelLocations": { "DP-01": { "x": 120, "y": 50, "z": 0, "note": "Electrical room" } } } }
```

Reports retain automatic, requested, and effective coordinates. A blocked
proposal keeps the requested position for diagnosis and cannot be applied.
Overrides are part of proposal identity; editing them invalidates downloads
and Apply until regeneration. Generation retains panel identity history:
unchanged load groups keep their IDs even if a new group sorts before them.
Changed groups match prior groups by shared loads; unrelated new groups receive
new IDs. Removed IDs are not reused while that history is retained. Changing
grouping criteria can still change membership, so review assignments again.

Proposals with supported routed feeders also report a bounded feeder-aware
panel-grouping screen. When a routed feeder, conductor ampacity, voltage-drop
limit, or applicable protection candidate is not feasible, deterministic
bisection can split a panel under the original
maximum-kVA and maximum-load criteria. The review and TXT report retain each
original group, split reason, resulting membership, feeder design-current floor,
and final feeder conductor/ampacity/device outcome. The search does not relax
criteria, add parallel conductors, or establish complete protection.
Unserviceable single-load groups remain blocked with their diagnostic visible.
Regeneration retains the existing panel identity on the highest-overlap
descendant; its location override stays with that ID, and new descendants
receive new IDs.

After editing only a generated panel's canonical x/y/z coordinates, Generate
can offer **Use edited location as override**. The action copies the location
into the draft; it still requires regeneration and review before Apply. An
unchanged equipment mirror is updated by the proposal. Conflicting independent
mirror edits, changes to other panel fields, and legacy records without a
selective ownership baseline remain protected by conflict blocking. Route,
conductor, load assignment, and device overrides are not supported by this
editor. See [override verification](design-synthesis-overrides.md).

## Input checks and generation history

Corridor permissions must be actual booleans, not text such as `"false"`.
Both permission aliases must agree when supplied. Every supplied `frequency`
or `frequencyHz` must independently match the supported 60 Hz model. Available
fault current requires a finite positive numeric value. Unknown criteria,
including misspellings, block generation; the internal
`minimumConductorAmpacity` value is not a user override. The workspace and
human-readable report list supplied criteria with their units.

For API callers, optional `generationBaseline` carries panel membership and
the next unused panel number. Successful proposals return `distributionBaseline`
for the next generation:

```json
{ "generationBaseline": { "panels": [{ "id": "DP-01", "loadIds": ["LOAD-1"] }], "nextPanelNumber": 2 } }
```

The workspace maintains this history per scenario and carries it through named
project creation. Successful generations advance the history; blocked attempts
do not. Explicitly invalid imported history remains a blocking input. Applied
snapshots retain the history for saved-project recovery, including removed
panel numbers. Loading a new sample or importing a draft without explicit
history clears the draft history; existing applied-project ownership remains
available for reconciliation. Importing an older explicit history deliberately
restores that context, so review its assignments before applying it.

See the [contract audit](design-synthesis-contract-audit.md) for corrections,
acceptance evidence, and remaining engineering scope.

## Workspace readiness

The input area and toolbar become available after the project has initialized
and the initial draft has loaded or been restored. A preparation message is
shown meanwhile, preventing early clicks and edits from being lost before the
workspace is ready.

When a complete explicit fault network and an exactly matched Eaton F-frame
candidate are available, the device fault review can show a source-linked
hypothetical constant-current graphical reading. It does not calculate actual
clearing or coordination, and unsupported voltages, source gaps and changed
records return no time. See [curve evidence](design-synthesis-eaton-clearing-evidence.md).

