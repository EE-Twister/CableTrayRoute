# Shared tray capacity in generated routes

Overall review class: **Screening only**. This extension addresses a physical
constraint in equipment-to-design generation. It does not complete industrial
design, protection coordination, or construction readiness.

## Behavior

Previously, individually feasible circuits could all use the shortest tray,
then fail its aggregate fill check despite an available permitted bypass.
Generation now checks shared tray capacity during each conductor-size search.
Selected feeders, branches, and transformer-primary cables reserve their actual
selected construction once per unique corridor edge. Each regeneration starts
with empty reservations, including operating/starting study revision trials.

The capacity probe calls the same `evaluateTrayFill` implementation as the final
raceway assessment. It uses the largest listed ladder width within the supplied
corridor allowance; it does not widen the corridor or interpolate an unlisted
width. The final assessment still selects the smallest fitting listed width.
Cable diameters and the existing NEC screening basis are documented in
[engineering basis](design-synthesis-engineering-basis.md).

Thermal ampacity, terminal limits, permissions, endpoint attachment limits,
conductor floors, and voltage drop continue to apply to bypass candidates.
The capacity-qualified conductor becomes a minimum size for final electrical
sizing. This matters at the 4/0 tray-fill category boundary: smaller conductors
are not always easier to fit under the mixed-cable rule. Independent tests use
existing diameters totaling 10.099 inches in a twelve-inch tray: adding 3/0
fails its 1.8812 square-inch allowance, while adding 4/0 passes the all-large
diameter rule at 11.882 inches. These values use the selected stock IDs and
dimensions from the archived Southwire PDF. The generated cable must retain
the larger size.
Generated cable lengths, impedance, one-line connections, load-flow inputs,
route results, and reports use the selected route. Compact `routingDecision`
records identify capacity exclusions and `shared-tray-capacity` when capacity
rejects the shortest thermally eligible path for the selected conductor.
Capacity method/exclusion fields are optional when no edge was excluded for
the selected candidate; omitting repetitive empty metadata preserves the
existing 5 MiB saved-project budget. Capacity-affected records retain their
method and exclusions through Apply and saved-project reload.

Selection starts with deterministic greedy reservation in stable generation
order. If a branch, panel feeder, or transformer primary has no capacity-feasible
route, generation can retry up to eight times with the blocked circuit and its
panel group prioritized.
Panel membership and identities are assigned before routing priority is applied;
the returned panel order remains canonical for partitioning and regeneration.
Each trial rebuilds reservations, routing, conductor sizing, and raceway checks
from the original inputs; a recovered design is then regenerated with the normal
connected-network study. A successful retry records its attempts and prioritized
load IDs in `routingRetry`, the review, report, and applied-project snapshot.
When the only remaining blocker is missing existing-tray reconciliation or
reuse evidence, a physically passing retry is also retained for screening and
reporting. Its route, voltage-drop, tray-capacity, installation-coverage, and
route-thermal checks must pass; the existing-tray blocker and disabled Apply
remain. Other blocking issues are not waived. In a 25- or 50-load example, two
six-inch existing trays each contain five 0.833-inch cables, leaving room for
seven new cables under the stated screening allowance. Prioritizing the load
at the scarce corridor midpoint recovers all routes while preserving the
separate unverified-reuse limitation. A closed bypass remains blocked.
When reservation order moves a panel group, `prioritizedPanelIds` records it
with method `prioritize-capacity-blocked-panel-groups-v2`. The source-end feeder
and branches for that group reserve space before flexible earlier groups.
An affected transformer primary can be reserved before panel groups on a retry;
`prioritizedTransformerPrimaryId` identifies that circuit and method
`prioritize-capacity-blocked-transformer-primary-v4` records the recovery.
The retry does not backtrack individual
paths, or optimize all assignments together. Failure is not proof that no
globally feasible arrangement exists. It does not design bends, supports,
pulling operations, or physical obstacle clearances.

The feeder extension records `prioritizedFeederPanelIds` and method
`prioritize-capacity-blocked-feeders-v3` when a blocked panel feeder is
prioritized. For 25 and 50 loads, independent regression cases locate the
second panel at the scarce corridor midpoint, with earlier flexible branches
using the same corridor. Reserving the 10 ft second-panel feeder first leaves
space for it and sends excess flexible branches onto the permitted bypass.
The same checks still reject a closed bypass.

For a mixed 480/208 V fixture with 25 or 50 loads, the transformer primary
needs the 10 ft scarce corridor while flexible direct-load branches can use
the bypass. The retry reserves that primary before panel circuits, rebuilds
the complete route and size selections, and retains all fault, protection,
voltage and fill checks. The recovered proposal, retry evidence and stable
panel identities survive named Apply and reload. A closed bypass remains
blocked. This is a bounded reordering, not proof of global feasibility.

The cross-panel regression starts with 25 or 50 loads grouped in sets of at
most 12, all panels explicitly located at the source. The last load needs a
scarce six-inch corridor whose other endpoint is halfway to the flexible
loads. Earlier groups can use a permitted bypass. Previously, retries inside
the last group could not release the space already consumed by earlier groups.
Prioritizing the last group now gives the constrained branch its 10 ft route;
the remaining allocations still fit exactly 12 #8 MC cables on the short tray,
using `floor(7 / (pi * 0.833² / 4))`, and send the rest via the permitted bypass.
Closed or thermally disqualified bypasses remain blocked. Tests verify stable
memberships and IDs, graph/input-order independence, the connected load-flow
check, canonical Apply, named reload, and retained retry evidence.

## Existing-tray occupancy screen

Choose **Load existing tray screening sample** for a synthetic, non-field example. A corridor edge can declare the actual ladder tray and a complete, explicitly sourced occupancy inventory:

```json
{
  "id": "SHORT", "from": "N0", "to": "N1", "widthIn": 6, "depthIn": 6,
  "permitted": true,
  "existingTray": {
    "trayId": "EXISTING-TRAY-01", "construction": "ladder",
    "inventoryReference": "Synthetic complete inventory for illustration only",
    "cables": [{ "id": "EXISTING-CABLE", "use": "power", "conductorSize": "#8 AWG", "conductorCount": 3, "voltageRatingV": 600, "outsideDiameterIn": 0.833, "quantity": 5, "reference": "Synthetic example; replace with verified data" }]
  }
}
```

Use the corridor graph JSON to supply or revise this structure. The inventory must include every existing cable, or an explicitly empty `cables` array, and a reference for the inventory. Each cable requires a distinct ID on that tray, explicit `power` or `lighting` use, recognizable conductor size, at least two conductors, voltage rating at most 2,000 V, positive outside diameter, positive integer quantity, and a reference. Invalid or incomplete input blocks evaluation; values are not inferred from the selected new-cable catalog. Only listed widths and explicit ladder construction are modeled. Single conductors, control or signal cables, other tray construction, and higher-voltage cable are outside this screen.

Routing probes and the final fill assessment both include the supplied existing cables at the fixed existing width. In the example, five 0.833-inch existing cables and seven new cables occupy the 6-inch, 7 in² screening allowance; subsequent branches use the permitted bypass. A collision between an existing cable ID and a generated cable ID blocks the final tray evaluation. The [NFPA code-development public-input report](https://docinfofiles.nfpa.org/files/AboutTheCodes/70/70_A2022_NEC_P08_FD_PIReport_rev_1008.pdf) describes considering all cables in a tray for the relevant multiconductor fill cases; it is not evidence of the adopted code edition or installation-specific compliance.

This is a geometry and fill screen only. Inventory references are not independently verified, and existing cables are not included in a detailed thermal model. Tray condition, available spare space, segregation, supports, grounding, load rating, and installation suitability require separate review. The standalone synthetic example remains blocked from Apply. The [project tray handoff](design-synthesis-project-trays.md) can build a reviewed draft from stored tray geometry and assigned cables; preliminary Apply requires explicit, bound user-supplied thermal and installation references and current project reconciliation.

## Public reproducible example

Choose **Load tray congestion sample** in Design Synthesis. The synthetic input
is `samples/design-synthesis-tray-congestion.json`: 25 packaged 2 kW loads,
480 V three-phase supply, one panel at the supply, and a short six-inch tray
with a longer permitted bypass. No panels, cables, or source/load relationships
are preassigned; the panel position is an explicit location override.

For the selected #8 MC cable, the archived Southwire SPEC45301 rev1.000.008
PDF (SHA-256 `d01fb6ec8ab42ea8b6144ea982ccf23ee662190c818621ea9d1d16f7735d3341`)
lists stock 606939 with nominal outside diameter 0.833 inch. The six-inch
ladder screening allowance is 7 square inches, so
`floor(7 / (pi * 0.833^2 / 4)) = 12` cables fit. Twelve branches use the
20 ft short route; the remaining thirteen use the two-edge bypass, whose length
is `50 + sqrt(20^2 + 50^2) = 103.851648071 ft`.

The same fixture expanded to 50 loads retains twelve short branches and
routes thirty-eight through the bypass. Independent tests check fill geometry,
voltage-drop arithmetic, graph/input ordering, closure and thermal restrictions,
excessive bypass length, regeneration, and motor evidence preservation. Motor
proposals remain blocked for unresolved motor protection.

## Verification

Final source verification passed:

- 235 focused Design Synthesis tests, including 15 capacity cases, real-storage
  Apply/undo/redo, mixed-voltage save rollback, and the unchanged 5 MiB budget.
- `npm run build`, full `npm run lint`, and whitespace checks.
- All 64 selected Edge browser cases. The new journey checks the 25-load sample,
  twelve bypass reasons, downloaded report, normal named-project creation,
  Apply, reload, and retained cable/one-line/route evidence.
- The built and documentation-site copies of all three synthesis JSON samples
  match their source files. Frozen production hashes also match.
- The rendered routing table and actual downloaded report were inspected.

**Full Node regression passed: all 434 test files.** After the user explicitly
approved the outside-sandbox run, `npm test` completed with exit code zero;
`node-approved.log` records the final run. Earlier automatic approval review
timed out twice, and the sandboxed attempt stopped on a local-server
`connect EACCES 127.0.0.1`. Those execution failures remain recorded in the
history; the successful approved run resolves the pending regression gate.

Evidence is under `output/design-synthesis-capacity-routing-2026-10-19/`:
`verification.json`, `source-snapshot.json`, `batch-review.json`,
`focused-final.log`, `build.log`, `lint.log`, `node-approved.log`, and
`browser-verified.log`. Browser artifacts are in `browser-verified/`.
Firefox acceptance remains unestablished.

The earlier `focused.log` exposed discarded capacity evidence during Apply;
`focused-verified.log` exposed the subsequent storage-budget regression.
Both were corrected without weakening the deep-equality or storage limits.
The initial browser run passed 63 cases and failed the new test's status count:
the UI counts 25 loads plus the source and panel, or 27 equipment records.
Only that expectation was corrected; explicit 25-branch and fill checks remain.
The final 64-case run supersedes that initial browser result. Review also
corrected final sizing at the mixed-fill boundary and inconsistent floating-point
ampacity comparisons. The complete industrial-design goal remains active.

## Separate protection data dependency

Manufacturer research has not yet supplied the exact 25/30 A Siemens TM230
clearing curves or exact overload curves needed to complete motor protection.
Catalog trip-class bounds and illustrative curves for other current ratings
are not substituted. This routing extension does not resolve starting thermal
withstand, motor-contributed fault duty, assembly SCCR, or coordination. See
[motor branch-breaker evidence](design-synthesis-motor-branch-breakers.md).
