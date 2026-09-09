# Golden-path engineering evidence backlog

Status: technical review snapshot, 2026-08-12. This document is not licensed-engineer approval and does not make any study, protective-device curve, or report calculation-ready.

## Release position

The Project Workflow Core sample now passes the functional golden path from project persistence through schedules, One-Line, tray/conduit fill handoffs, routing, load flow, short circuit, TCC plotting, arc flash, design-rule checks, and reporting. Functional continuity is necessary, but it is not sufficient engineering evidence.

The generated validation manifest includes named evidence for IEEE 1584 Annex D.1 and D.2, an independently derived two-bus radial load-flow case, an independently derived ANSI-path Thevenin/symmetrical-component case, NEC 2023 conduit-fill count limits, and an independently derived NEC 2023 Article 392 mixed-cable boundary fixture. Routing now has deterministic invariant validation, while TCC remains blocked on trustworthy manufacturer-curve representation and human promotion.

## Evidence matrix

| Golden-path stage | Functional evidence | Independent engineering evidence | Current disposition | Required release gate |
| --- | --- | --- | --- | --- |
| Project identity, save/load, scenarios | Hashless navigation, reload, local/cloud save, switching, deletion, and full-snapshot round-trip regressions | Not an engineering calculation | Ready for pre-merge regression | Keep the named-project recovery test in `e2e:critical`; preserve canonical-state equality across page transitions |
| Equipment, loads, One-Line, cables | Cross-page contract assertions and canonical-state equality | Data-shape and relationship checks; no claim that sample ratings constitute a design | Workflow-ready | Add completeness rules for every solver-required field and report missing/assumed inputs explicitly |
| Tray and conduit fill | Project handoff E2E plus unit tests for exact Article 392 arrangements, count limits, and area calculations | Named NEC 2023 Chapter 9 count-limit evidence covers 1, 2, and 3+ conduit cables; an independent Article 392 mixed-cable boundary fixture and exact table/boundary tests cover the selected multiconductor tray scope | Screening only | Add governed evidence for single-conductor, channel-tray, MV, ampacity-spacing, and installation-specific exceptions before expanding the selected-rule scope |
| Routing | Saved-result restoration, rerun, geometry inheritance, scoped ductbank/conduit assignment, overload, DRC, route, pull-evidence, quantity, and cost signatures, Procurement/Cost handoff, and issue-gate regressions | Project-specific optimization is checked through deterministic invariants; opted-in pull planning checks sourced limits and individually recorded access at calculated reel/intermediate/receiving points, while route cost assurance checks deduplicated quantities, BOM-derived ductbank assemblies, tray supports/fittings, catalog-keyed prices, mixed-unit labor evidence, extensions, and freshness | Screening only | Populate governed manufacturer/pricing catalogs and project civil/productivity rates, and complete qualified commercial/field review before issue |
| Load flow | Project Workflow Core now derives 3 buses, 2 fuse-fed ideal-tie branches, a utility slack bus, and converges in unit and browser tests | A named small radial case is checked against an independently derived exact two-bus quadratic; IEEE 14-bus regression coverage remains separate | Provisional | Add a named IEEE 14-bus reference and document base conversion, bus types, convergence tolerance, losses, and voltages against an independent source |
| ANSI short circuit | Golden sample restores and reruns location results; extensive solver regressions exist | A named Thevenin/symmetrical-component fixture covers three-phase, line-to-ground, and empirical asymmetrical peak current | Provisional | Add a published industrial breaker-duty example with first-cycle, interrupting, decrement, rating-basis, and X/R expectations; separately complete the IEC 60909 edition delta |
| TCC / coordination | Golden sample plots the selected protective devices and verifies coordination-package rendering | The shared library currently reports zero calculation-ready curves; all 522 selected S&C source coordinates are now retained in non-canonical evidence, duplicate-current geometry is preserved, and automatic coordination refuses out-of-domain comparisons | Screening only; blocked from production coordination | Convert the raw-coordinate evidence to governed research candidates, then complete asymmetric tolerance checks, settings-domain validation, peer review, and human promotion |
| Arc flash | Golden sample reruns and appears in the project report | Named IEEE 1584-2018 Annex D.1 and D.2 evidence covers medium voltage, low voltage, and full/reduced arcing-current cases; clearing-time source/readiness/domain are now recorded | Best-supported golden-path calculation, still input-dependent | Retain both examples; complete protective-device evidence and stale-result blocking. Screening or out-of-domain clearing time now blocks label eligibility |
| DRC and report | Findings propagate consistently to dashboard and report; report sections, TOC, freshness, and issue blocking are tested | Report is a traceable software artifact, not a sealed deliverable | Workflow-ready, issue-blocked | Every reported result must carry method/edition, input fingerprint, units, timestamp, stale/current state, assumptions, and reviewer status; exports stay blocked while errors or stale required studies remain |

## Ordered backlog

### P0 — standards currency and claims

1. **Boundary implemented; licensed delta still open.** The repository and UI now label the calculation as IEC 60909-0:2016 and explicitly disclaim 2026 validation. `docs/iec60909-2026-edition-assessment.md` defines the licensed-text delta matrix and acceptance procedure.
2. **Completed for current load-flow surfaces.** Active study-practice references now map to IEEE 3002.2-2018; IEEE 399 is no longer presented as the current standards basis.
3. **Partially completed.** The active IEEE 3004.5-2025 low-voltage circuit-breaker practice and IEEE C37.48-2020 high-voltage fuse application guide are identified. Manufacturer data remains authoritative for individual SMU-20 curves; a complete protection-reference inventory remains open.

Acceptance: a human electrical-engineering reviewer records the edition mapping, affected formulas/data, benchmark deltas, and disposition. No automated process may fill reviewer or approval fields.

### P0 — protective-device evidence

1. **Completed:** selected the 25E, 65E, and 100E S&C SMU-20 14.4-kV source-verified cohort.
2. **Technical reconstruction completed; governance still blocked:** the runtime now preserves duplicate-current and near-vertical geometry, uses explicit upper/lower boundary rules, and rejects out-of-domain coordination/arc-duration claims. A non-canonical evidence file retains all 522 official coordinates and reproduces each selected operational boundary point exactly. Governed research candidates, tolerance semantics, field mapping, and review remain open.
3. **Screening only:** the stored profiles retain clearing-above-melting order in 41 sampled points, but coordination acceptance cannot proceed on the unresolved reductions.
4. **Enforced disposition:** every selected record remains source-verified / peer-review-pending; no canonical record or human review field was changed.

Acceptance: promotion validation succeeds only after independent human review; calculation code consumes only explicitly promoted records.

### P1 — named benchmarks for the golden calculations

1. **Partially completed:** registered a small industrial radial benchmark with an independent exact-quadratic oracle; named IEEE 14-bus evidence remains open.
2. **Partially completed:** added an independently derived ANSI-path benchmark; a published breaker-duty example remains open.
3. **Partially completed:** added named NEC conduit-fill count-limit evidence and an independently derived NEC 2023 Article 392 mixed-cable boundary fixture. Single-conductor, channel-tray, MV, ampacity-spacing, and installation-specific cases remain open.
4. **Completed:** added IEEE 1584 Annex D.2 low-voltage full/reduced-current evidence alongside Annex D.1.

Acceptance: each benchmark records primary source, edition/clause, normalized inputs with units, expected outputs, justified tolerances, and a test that fails on formula or unit drift.

### P1 — end-to-end evidence chain

For load flow, short circuit, TCC, and arc flash, make the report trace the chain:

`source project records → normalized solver model → method and edition → input fingerprint → result → freshness state → report section`

Acceptance: changing any solver-significant input invalidates the prior result, report export shows the stale state, and the golden-path regression proves a fresh rerun restores issue eligibility without silently carrying old results across projects or scenarios.

### P2 — routing and lifecycle assurance

1. **Partially completed:** route signatures, finite/continuous geometry, endpoint and length reconciliation, valid raceway references and cable-group compatibility, input freshness, selected tray/conduit capacity evidence, auditable field-route basis, scope-qualified ductbank internal-conduit assignment, per-conduit capacity ledgers, ambiguity blocking, Pull Card propagation, and report traceability now gate deliverables. Opted-in pull planning adds sourced cable/equipment limits, explicit or confirmed bend geometry, minimum-radius comparison, selected equipment checks, stable per-point access records for calculated reel/intermediate/receiving locations, stale-record rejection, deterministic evidence signatures, and report/issue-gate propagation. Route cost assurance adds shared-raceway deduplication, physical-run/conductor multiplicity, tray support and fitting labor evidence, existing-BOM-derived civil ductbank assemblies, governed catalog/material/labor/productivity coverage, mixed-unit extension reconciliation, freshness checks, quantity/cost signatures, procurement/report propagation, and lifecycle snapshots. Governed project price books, complete manufacturer catalog identity, and qualified commercial/field verification remain open.
2. Verify project switching, scenario switching, deletion, and report snapshot restoration across all golden-path result keys.
3. Add round-trip tests for version upgrades of saved project snapshots and document the compatibility window.

Acceptance: no route, study result, approval note, or report snapshot leaks across project/scenario boundaries, and migrations preserve an auditable source schema version.

## Primary standards pages checked for this snapshot

- [IEC 60909-0:2026 product and lifecycle page](https://webstore.iec.ch/en/publication/68454)
- [IEC 60909-0:2016 withdrawn-edition page](https://webstore.iec.ch/en/publication/24100)
- [IEEE 3002.2-2018 load-flow practice](https://standards.ieee.org/ieee/3002.2/4773/)
- [IEEE 1584-2018 arc-flash guide](https://standards.ieee.org/ieee/1584/5802/)
- [IEEE C37.010-2016 high-voltage circuit-breaker application guide](https://standards.ieee.org/ieee/C37.010/5807/)
- [IEEE 3004.5-2025 low-voltage circuit-breaker application practice](https://standards.ieee.org/ieee/3004.5/11043/)
- [IEEE C37.48-2020 high-voltage fuse application guide](https://standards.ieee.org/ieee/C37.48/6964/)
