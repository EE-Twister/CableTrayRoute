# Pull Constructability Assurance

Pull Constructability Assurance is an opt-in evidence gate for route results that include cable-pull calculations. It packages existing pulling-tension, sidewall-pressure, direction, section, and field-equipment results with the minimum source and geometry evidence needed for qualified review. It does not change the pulling equations.

The gate is **Screening only**. It is not a field-constructability determination, installation instruction, manufacturer approval, or licensed-engineer approval.

## When the gate applies

Projects that do not enable pull checks retain their existing routing and deliverable workflow. Once any saved route result contains a `pull_check`, every successful routed result in that batch must have a current pull check and a complete constructability evidence package before Pull Cards or the Project Report can be issue-ready.

Legacy pull checks remain readable, but they block issue readiness until they are recalculated with the current evidence contract.

## Required evidence

A pull plan is ready for qualified review only when all applicable checks pass:

- The existing cable-pull calculation has complete physical inputs and retains both direction comparisons when Auto direction is used.
- Cable tension and sidewall-pressure limits have an identified manufacturer or project source.
- Every modeled direction change has an explicit segment radius, or the configured default radius is explicitly confirmed against a named fitting schedule, route-model revision, or field-layout source.
- Cable minimum bend radius is present when the route has bends, and every evaluated radius is at least that minimum.
- Puller, rope, grip or pulling-eye, anchorage, and sheave-support ratings have an identified source.
- The selected pull direction and its field-equipment checks do not exceed the controlling limits.
- Every calculated reel, receiving, and intermediate pull point has its own Pending, Confirmed, or Blocked access record. A Confirmed record must cite a site plan, structure schedule, or field-walkdown source.

The Optimal Route page labels incomplete plans **Evidence incomplete** and lists the first blocker in the pull-plan table. The selected cable field plan shows all evidence issues, source summaries, a deterministic evidence signature, and an editable per-point access table. A global source may prefill the rows, but each row must still be individually confirmed. A Blocked record remains a deliverable blocker and carries its access note into reports.

## Signature and persistence

The evidence signature covers route geometry, cable and equipment limits, cited sources, bend-radius basis, every matched pull-point status/source/note, and the selected pull results. Point identifiers include calculated coordinates and station, so geometry or direction changes cannot silently reuse an unrelated confirmation. Unmatched saved records are reported as stale and new calculated points remain Pending. Route storage compaction preserves the signed constructability package with the saved pull check, while the project session retains editable records by cable for recalculation.

The signature is an audit and reproducibility aid. It is not a seal, approval, or proof that the installed route matches the model.

## Issue gate and reports

The shared deliverable workflow aggregates pull evidence across the saved route batch. When the gate is applicable and blocked:

- Pull Cards and Project Report readiness are false.
- The workflow raises a critical **Resolve pull constructability blockers** action.
- Pull Card detail and XLSX export carry the read-only per-cable point records, notes, sources, and evidence signature from Optimal Route.
- Routing report rows retain the per-route evidence status, signature, issue list, point confirmation count, and per-point record detail.
- The routing report summary retains the aggregate status, blocker list, signature count, and required/confirmed access-point totals.

## Required field review

Per-point records make location-specific evidence reviewable, but a Confirmed status is still planning evidence rather than approval. Before construction, a qualified reviewer must verify each actual setup location, equipment anchorage, working clearance, cable-reel handling, pulling-head design, communications and control, pull speed, fitting and sheave geometry, splice strategy, manufacturer instructions, and current field conditions. Governed manufacturer catalog data and qualified field verification remain open.
