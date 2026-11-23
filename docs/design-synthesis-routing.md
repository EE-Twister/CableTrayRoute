# Feasible routing and protective sizing verification

Overall review class: **Screening only**. This extends the preliminary,
same-voltage radial design generator; it does not establish a complete
industrial design or issue-ready package.

## Corrections

The previous generator selected the shortest geometric route before sizing.
It could reject a feeder on a hot corridor even when a cooler permitted bypass
would work. It now searches a thermally eligible graph for each sourced
conductor size, checks route voltage drop and terminal ampacity, and selects
the shortest feasible result. Equal-length choices prefer the smaller sourced
conductor. By default, endpoint anchors remain the nearest nodes and are subject
to the supplied attachment limit. Search count is bounded by the 15-size catalog, not the
number of possible simple paths through the corridor network.

## Explicit alternative endpoint connections

The **Alternative endpoint connections** criterion may explicitly allow the
generator to try other corridor nodes within `maxEndpointAttachmentFt` when
the nearest-node route has no feasible conductor and path or cannot meet the
specified endpoint conduit assumptions. In JSON, set
`criteria.allowAlternateEndpointAttachments` to `true`; omission or `false`
retains the nearest-only behavior. Non-boolean values block generation. A
nearest-node route with complete endpoint installation coverage is unchanged
when the option is enabled.

The retry considers at most the eight closest nodes at each endpoint, orders
their pairs by total field-attachment distance with stable identity ties, and
selects the shortest feasible route across the bounded anchor pairs. Once a
feasible route exists, pairs whose unfiltered shortest route already exceeds
it can be skipped; trial, skipped and disconnected counts are retained. Ties
prefer smaller supported conductor sizes, then stable path and anchor IDs.
This is a bounded screening search, not a global cost optimum. Each trial retains permitted-edge routing,
shared-tray capacity, thermal ampacity, terminal and voltage-drop checks. For
each electrically feasible conductor/path candidate, the retry also uses the
same sourced MC outside diameter and dedicated EMT fill screen as the final
endpoint evaluator. It can choose another feasible conductor/path on the same
anchors or reject an anchor pair whose candidates do not fit. The final route
still receives the full endpoint installation and load-flow checks. Selected
node IDs, attachment lengths, nearest-node failure, trial
count, anchor counts, and truncation status are retained in the proposal,
report, canonical cable, and saved route. A same-anchor conduit retry records
the original and selected conductor and the original issue codes. If no retry
works, an electrically feasible nearest route is retained so the final endpoint
screen reports its specific blocker. Exhaustion of the bounded search does not
prove that no feasible path exists.

The option permits candidate straight-line field connections within the stated
distance; it does not model obstacles or prove permission to cross a closed
corridor. Users must review those field connections and installation conditions
before use. Closed edges are never selected as corridor segments. This remains a
preliminary screen, not an approval or a global routing optimization.

Protective minimum ampacity previously considered devices that were ineligible
at the supplied fault duty. It now uses the same applicability selector as
final device selection. In a 10 kW, 480 V example with 50 kA available fault
current, the 20 A FD3020 cannot qualify at its 35 kA rating. The bundled 80 A
HFD3080 candidate requires at least 80 A conductor ampacity; the selected
75 C copper #4 AWG table value is 85 A. Eaton's
[HFD3080 product page](https://www.eaton.com/us/en-us/skuPage.HFD3080.html),
inspected September 18, 2026, identifies the 80 A, three-pole device and
65 kA interrupting rating at 480 V AC. Candidate evidence status and unresolved
coordination requirements remain unchanged.

## Independent checks

- The 30-load sample with E01 at 45 C and a cooler two-edge bypass generates
  all 34 circuits. The first feeder length independently evaluates to
  `50 + sqrt(6100) = 128.102496759 ft`, with 600 kcmil copper.
- At 40 C, the original 60 ft route remains preferred with 750 kcmil.
  Prohibiting a required bypass edge at 45 C still blocks selection.
- Reversing graph input order preserves physical routes. Agent tests also
  exercise tied paths and a twenty-stage mesh without exhaustive enumeration.
- The selected route, conductor, thermal factors, combined voltage drop,
  canonical cable/route evidence, and one-line connections are checked together.
- The fault-duty example above selects HFD3080 and #4 AWG for both circuits.
- The 50-load storage acceptance keeps the existing 5 MiB budget. Per-circuit
  persisted decisions are compact so repeated search diagnostics do not
  exhaust the saved-project quota.

## Boundaries

The route search does not globally optimize panel grouping, placement, or
endpoint anchors, or minimize installed cost. The subsequent
[capacity-aware routing extension](design-synthesis-capacity-routing.md) adds
shared tray reservations and permitted bypass selection. Final tray dimensions
are checked after routes and conductors are selected.
Field attachments inherit global thermal assumptions. The subsequent
[endpoint installation integration](design-synthesis-endpoints.md) adds
explicit dedicated EMT conduit proposals and fill coverage for these legs.
Mechanical installation, supports, bends, and pulling checks remain outside
that screen. Detailed burial thermal modeling remains separate.

## Regression results — September 18, 2026

- `npm test`: all 397 discovered Node test files passed, including independent
  route geometry, equal-edge/anchor ordering, protection applicability,
  canonical Apply/undo/redo, and the unchanged 5 MiB storage-budget gate.
- `npm run build` and `npm run lint`: passed.
- Edge browser coverage: all 20 affected cases passed across the initial suite
  and one focused rerun. The initial run passed 19 cases; the new bypass case
  had already verified its screen and downloads but its saved-cable assertion
  incorrectly looked up a generated ID after canonical ID normalization.
  Correcting the harness to use the preserved schedule tag made the saved
  cable/route evidence assertions pass. No application assertion was removed.
- The new routing evidence table was visually inspected. The browser fixture
  confirms the 128.102 ft / 600 kcmil bypass decision in the screen, JSON,
  human-readable report, canonical cable, and saved route result.
- `git diff --check`: passed. Firefox acceptance remains unestablished because
  of the previously recorded environment failure before app navigation.

Logs are under `output/design-synthesis-routing-2026-09-18/`:
`node-final.log`, `build-final.log`, `lint-final.log`, `browser-final.log`,
`browser-bypass-verified.log`, and `diff-check.log`. The earlier
`acceptance.log` was captured during the agent's refactor and is superseded by
the completed full Node run.
