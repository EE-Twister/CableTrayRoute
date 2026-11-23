# Equipment-to-design contract audit — September 18, 2026

Overall review class: **Screening only**. This audit checks the original
[equipment-to-design contract](design-synthesis-acceptance.md), including
integration and iteration. It does not redefine the broader industrial design
vision around the currently supported cable catalog or topology.

## Findings corrected in this audit

- A corridor with `permitted: "false"` could be traversed. Supplied `permitted`
  and `allowed` values must now be booleans; contradictory aliases block.
- An otherwise valid frequency could hide an invalid second frequency field.
  Every supplied `frequency` and `frequencyHz` is now independently checked
  against the supported 60 Hz model, including supply, criteria, and equipment.
- Fault-current booleans and numeric strings could be coerced into a rating.
  A supplied `availableFaultCurrentKA` now requires a finite positive number.
- Unknown criteria could silently disappear from calculations. Unknown keys
  now block, including misspellings. The externally supplied
  `minimumConductorAmpacity` field also blocks because that value is derived
  internally from protective selection, rather than implemented as an override.
- Inserting an earlier-sorted group could renumber unchanged panels and move a
  location override to another load group. Generation now retains identity
  history: exact membership matches retain their IDs first, remaining groups
  match unused prior groups by overlap, and unrelated groups receive new IDs.
  Removed IDs are not reused while that history is retained. Changed group
  membership still requires review; this is not a load-assignment lock.
- Human-readable output now lists supplied design criteria and units outside
  its embedded JSON. Omitted criteria are not represented as supplied values.

Identity history is validated as input and retained in successful proposal
output and applied snapshots. Invalid history blocks rather than silently
redirecting panel overrides. Canonical storage preserves the history through
undo/redo and project export/import. The allocation counter must remain safe
to serialize and replay; allocation at its numerical limit blocks.

## Requirement-by-requirement evidence map

This audit records the baseline before automatic load-flow revision. The later
[operating-study revision review](design-synthesis-study-revision.md) supersedes
the study-iteration boundaries below and records its separate verification.

The tests below contain independent assertions of the named behavior. Their
coverage is bounded as shown; a passing test is not a claim of complete
industrial-design readiness.

| Contract requirement | Authoritative implementation and acceptance evidence | Remaining boundary |
| --- | --- | --- |
| Equipment-first input | `designSynthesis.mjs`; `designSynthesisAcceptance.test.mjs` checks 25/30/50 inputs without supplied panels or cables. | Requires supply data, physical corridors, ratings, and supported criteria. |
| Input integrity | `designSynthesisInput.mjs`, input-evidence adapter; contract-audit and input-evidence acceptance tests. | References are retained, not independently authenticated; sample data is synthetic. |
| Distribution arrangement | Grouping and identity plan; stable-identity and disposition acceptance tests. | Heuristic same-voltage grouping; no transformer or whole-network optimization. |
| Electrical connectivity | One-line adapter; connected-proposal, load-flow, and integration acceptance tests compare branches, identities, impedance, and physical coordinates. | Radial supported topology. |
| Feeder selection | Sourced cable catalog, route thermal adapter; independently transcribed R/X and thermal arithmetic, terminal and route-length cases. | Supported copper multicore MC construction, fixed frequency, no motor-start sizing. |
| Protective devices | Protection adapter; governed-candidate acceptance verifies identities, applicable ratings, evidence, and conductor bounds. | Limited screening catalog; no calculated fault contribution, coordination/settings, or assembly SCCR. |
| Permitted routing | Routing acceptance checks closed edges, feasible bypasses, endpoint bounds, stable geometry and route decisions. | Supplied corridors; no obstacle survey or joint congestion optimization. |
| Raceway capacity | Raceway and endpoint adapters; acceptance checks whole-cable dimensions, tray limits, EMT fill, and installation coverage. | Fill screening excludes supports, bends, pulling, and clearances. |
| Design iteration | Thermal, routing, override, and core acceptance change loads, locations, temperatures, terminals, lengths, and permissions. | Studies do not automatically revise a proposal. |
| Project integration | Apply adapter; real-storage integration and 50-load storage-budget acceptance. | Named save required; unrelated unsaved navigation remains a separate workflow limitation. |
| Regeneration and overrides | Reconciliation and identity helpers; explicit-location browser journey plus engine/storage acceptance. | Only panel-location overrides are supported; unrelated edits and ambiguous ownership block. |
| Freshness | UI raw-input freshness plus Apply project/scenario fingerprint; context tests and browser stale-download checks. | Study-to-design revision automation remains absent. |
| Reports | Workspace JSON/text exports; browser assertions for supplied criteria, selections, checks, sources, and blocked diagnostics. | Preliminary reports, not issued construction packages. |
| User journey | Synthesis, overrides, and study-handoff browser suites exercise named creation, Apply, navigation, reload, regeneration, conflicts, and export. | Browser evidence must be recorded for the current build; Firefox previously failed before navigation. |
| Regression | Full Node, build, lint, and affected browser suites, with separate arithmetic expectations. | See current verification below; historical passes do not validate new changes. |

## Current verification

Verified on September 18, 2026:

- `npm test`: all 412 discovered Node test files executed and passed.
- Full `npm run build` and `npm run lint`: passed.
- Edge: all 50 selected cases passed across the synthesis workspace, contract
  audit, panel overrides, study handoff, workflow contracts, and analysis pages.
- A strengthened browser rerun passed both selected cases: criteria display
  and repeated panel allocation followed by normal named-project creation,
  Apply, reload, and regeneration. The fixture allocates DP-06, retires it,
  allocates DP-07, and retains `nextPanelNumber: 8` through the saved round trip.
  The DP-01 override and load membership remain intact.
- Independent storage checks compare the applied identity history to the
  generated history and include it in undo/redo and export/import assertions.
  The 50-load project still fits the existing 5 MiB storage budget.
- The supplied-criteria table and restored panel-override screenshots were
  inspected. The displayed criteria and units are readable; saved coordinates
  remain 42 / 17 / 3 ft for DP-01 in the history fixture.
- Page-contract audit, test syntax checks, and `git diff --check`: passed.

Evidence is under `output/design-synthesis-contract-audit-2026-09-18/`:
`node-final.log`, `build-final.log`, `lint-final.log`, `browser-final.log`,
`browser-history-final.log`, and the corresponding browser result folders.
The first strengthened history attempt used an ambiguous project-name selector;
the second used the test-only URL during a normal project-creation journey.
Both earlier failed logs are retained. Scoping the field to its dialog and
running the ordinary page corrected the test; production code did not change
between the 50-case run and the final strengthened rerun.

Firefox was not revalidated in this audit. Its earlier blank-page startup
failure remains an unverified browser boundary, not a passing result.

## Remaining work toward the full vision

At this audit's September baseline, generated proposals and downstream
load-flow handoff were implemented, but study failures did not drive revised
designs. Later milestones added [operating-study revision](design-synthesis-study-revision.md),
[sourced mixed-voltage transformer synthesis](design-synthesis-mixed-voltage-review.md),
[initial motor starting](design-synthesis-motors.md), and
[supplied-curve acceleration with bounded design revision](design-synthesis-motor-acceleration.md).
Their current acceptance evidence and limitations are recorded in the linked
guides and [acceptance log](design-synthesis-acceptance.md).

Complete motor protection, coordinated settings, grounding, assembly SCCR, and
complete physical drawing packages remain open. The detailed direct-burial
thermal model also needs matching construction data before it can drive the
generator's cable selections. This historical audit does not declare the full
goal complete.
