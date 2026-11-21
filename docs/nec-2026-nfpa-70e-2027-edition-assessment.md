# NEC 2026 and NFPA 70E-2027 Edition Assessment

**Assessment date:** 2026-11-21  
**Application implementation:** NFPA 70 (NEC) 2023; NFPA 70E-2024 (DC arc flash), label text reviewed against 70E-2021  
**Current publications:** NFPA 70-2026 and NFPA 70E-2027  
**Disposition:** Version-pinned to the implemented editions; compliance with the 2026 NEC and 2027 70E is not claimed

## Lifecycle finding

- NFPA 70-2026 was issued by the NFPA Standards Council on 2025-08-20, effective 2025-09-09 ([ICC listing](https://shop.iccsafe.org/nfpa-70r-national-electrical-coder-necr-2026-edition.html), [ANSI listing](https://webstore.ansi.org/standards/nfpa/NFPA702026)).
- NFPA 70E-2027 was issued on 2026-04-16, effective 2026-05-06. These dates come from trade-press sources only ([Incident Prevention](https://online.incident-prevention.com/publication/?i=870505&article_id=5213854&view=articleBrowser), [Herzig Engineering](https://www.herzigengineering.com/nfpa-70e-2027-changes-explained)). Confirm them on nfpa.org.

## Controlled boundary

The licensed NEC 2026 and NFPA 70E-2027 text was not available for this assessment. Everything in "Unverified leads" below comes from secondary sources (trade articles, training sites, consultancies), several of which conflict. None of it is treated as a confirmed change, and no 2023 or 2024 rule, table, or factor is assumed unchanged in the new editions.

Until the delta is completed:

- Results remain screening calculations for projects whose basis adopts NEC 2023 (and 70E-2024 for DC arc flash).
- The Submittal Package page defaults to NEC 2026 but prints the NEC 2023 calculation basis whenever another edition is selected.
- Benchmarks and fixtures named "NEC 2023" or "NFPA 70E-2024" are regression checks for the implemented editions, not 2026/2027 validation.
- A project that requires the current editions must be evaluated outside this application or by a qualified reviewer with the licensed text.

## Code surface to review

Edition pinning exists only for tray fill (`NEC_2023_TRAY_FILL_BASIS`, `analysis/trayFill.mjs:18`) and the benchmark text. Other modules cite NEC sections without an edition, so the 2023 assumption is implicit there.

### NEC

| Function | Implementation | Cited rule | Required 2026 review |
|---|---|---|---|
| Tray fill | `analysis/trayFill.mjs` (`table39222AllowableArea`, `evaluateTrayFill`); `cabletrayfill.js`; `src/routing/trayNecAdvisory.mjs` | Art. 392.22(A), Table 392.22(A)(1) | Compare table values, column structure, and the mixed-cable rule; check Article 392 for new requirements |
| Conduit fill | `analysis/conduitFill.mjs` (`CONDUIT_INTERNAL_AREA_IN2`, `conduitFillLimit`); `conduitfill.js` | Chapter 9 Table 1 and Annex C | Compare the 53/31/40% limits and the conduit area tables. Tables 4, 5 and 5A are not implemented (cable area comes from user-entered OD) |
| Table 9 impedance | `src/necTable9.mjs` | Chapter 9 Table 9 | Compare R and X values by size, material, and conduit type |
| Ampacity | `analysis/autoSize.mjs` (`NEC_AMPACITY_TABLE`, `selectConductorSize`); duplicate dataset in `codes/necTables.js` | Table 310.16, 110.14(C), 240.4(D) | Compare table values and any new conductor rows, and the terminal-rating and small-conductor rules |
| Derating | `analysis/autoSize.mjs` (`ambientTempFactor`, `bundlingFactor`, `trayFillFactor`); `analysis/designRuleChecker.mjs` (`TRAY_DERATING_FACTORS`) | Table 310.15(B)(1)(a), 310.15(C)(1), 392.80(A)(1)(b) | Compare ambient and adjustment factors, and the tray rules in 392.80 |
| Parallel conductors | `autoSize.mjs`; DRC-07 | 310.10(H) | Compare size minimums and equal-length requirements |
| Voltage drop | `analysis/voltageDropStudy.mjs` (`NEC_LIMITS` 3/3/5%); `analysis/busDuctSizing.mjs` | 210.19(A)(1) and 215.2 informational notes; 215.2(A)(4); 368.12 | Compare the informational-note recommendations and any renumbering |
| Pull box and bends | `analysis/pullBoxSizing.mjs`; `analysis/conduitBendSchedule.mjs` | 314.28(A)(1) and (A)(2); 358.26 | Compare the 8x and 6x multipliers and the 360 degree limit |
| Demand | `analysis/demandSchedule.mjs` | 220.42, 220.44, Table 220.56, 430.24, 625.42 | Compare demand factors and article numbering |
| Hazardous areas | `analysis/hazAreaClassification.mjs`; DRC-08 | Articles 500, 505, 506; Table 505.7(A) | Compare group definitions, Division-to-Zone mapping, and any restructuring |
| Motors and transformers | `autoSize.mjs` (`motorFLC3Ph`, `sizeMotorBranch`, `sizeTransformer`); `src/mccLineupModel.mjs` | Table 430.250, 430.22, 430.32, Table 430.52, 450.3(B) | Compare FLC tables and the percentage limits |
| Grounding and OCPD | DRC-04 (`COPPER_EGC_MINIMUMS_BY_OCPD`), DRC-09; `STANDARD_OCPD_RATINGS` | 250.122, 240.6(A), 240.4(D) | Compare the EGC table and standard ratings list |
| Interrupting and short-circuit rating | `analysis/equipmentEvaluation.mjs` | 110.10 (110.9 is not cited) | Add the missing 110.9 interrupting-rating citation if confirmed, and compare both sections |
| Direct burial | `analysis/directBurial.mjs` | 300.5 | Compare the burial depth advisory |

### NFPA 70E

| Function | Implementation | Cited rule | Required 2027 review |
|---|---|---|---|
| DC arc flash | `analysis/dcShortCircuit.mjs` (`calcDcArcFlash`), `dcshortcircuit.js` | Annex D.8 / D.8.1 (Ammerman method), 70E-2024 | Compare the annex method, any renumbering, and the 1.2 cal/cm2 boundary |
| AC arc flash | `analysis/arcFlash.mjs` (IEEE 1584-2018 engine; 70E-based arc rating logic) | 70E arc-rating selection | Compare the incident-energy method text. IEEE 1584 itself is unchanged here |
| PPE category | `src/components/resultViz.mjs` (`ppeCategoryForEnergy`); `studies/arcFlash.js` | "NFPA 70E-style" Cat 1-4 thresholds | See the internal discrepancy below |
| Equipment labels | `reports/labels.mjs`, `reports/arcFlashReport.mjs`; `docs/arc-flash-labels.md` | 130.5(H) | Compare label content requirements against the 2027 text |
| Benchmarks | `data/validationBenchmarks.json` (`nfpa70e` entry) | Tables 130.5(G), 130.7(C)(15) | Confirm table identifiers still exist under the same numbers |

## Internal discrepancies found (independent of edition)

These were verified in the source during this assessment and should be resolved regardless of the edition decision.

1. **Tray derating above 40 conductors.** `TRAY_DERATING_FACTORS` in `analysis/designRuleChecker.mjs:58` uses 0.40 for every count above 30. `BUNDLING_FACTORS` in `analysis/autoSize.mjs:183` uses 0.40 for 31-40 and 0.35 above 40. The DRC therefore derates less than auto-sizing for more than 40 conductors. Decide which is correct against the adjustment-factor table and use one shared table.
2. **PPE category versus the no-category rule.** `analysis/dcShortCircuit.mjs:38-46` states that 70E does not permit converting calculated incident energy into a PPE category, and reports a minimum arc rating instead. `ppeCategoryForEnergy` in `src/components/resultViz.mjs:48` assigns Cat 1-4 from calculated energy. One of the two positions is wrong for the incident-energy method.
3. **Duplicate ampacity data.** `codes/necTables.js` repeats ampacity, temperature, and adjustment data with no citation comments, and is imported by `sizing.js`.
4. **Legacy identifier.** `nec358_24Check` implements NEC 358.26 (bends in one run); 358.24 is "Bends - How Made". The name is kept for saved-project compatibility, as the file header notes.
5. **Missing citations.** `analysis/generatorSizing.mjs` cites NEC 700/701/702 in its header but implements NFPA 110 sizing only. No code cites NEC 110.16 (arc-flash labeling).

## Unverified leads from public sources

Each item needs confirmation against the licensed text before any code or label changes.

**NEC 2026**

- A guide reports a new Article 392 requirement for access space above cable trays (a minimum of 12 in). One source only ([Keentel Engineering](https://keentelengineering.com/nec-2026-code-changes-field-guide)).
- A conductor-sizing page claims new Table 310.16 rows for compact-stranded aluminum conductors used in MC cable and tray. Unconfirmed, and other sources do not mention it ([ECalPro](https://ecalpro.com/standards/nec/conductor-sizing-2026)).
- State-review minutes and trade coverage describe chapter title changes and a restructuring of chapters, so article and section numbers cited in code may have moved ([Minnesota DLI review minutes](https://www.dli.mn.gov/sites/default/files/pdf/NEC-2026-adoption-review-092525-minutes.pdf), [EC&M](https://www.ecmag.com/magazine/articles/article-detail/wired-for-change--what-s-new-for-chapter-3-in-the-2026-nec)).
- No source reported changes to Chapter 9 tables or the 210.19 informational notes. Absence of a report is not confirmation.

**NFPA 70E-2027**

- Article 130 was reorganized: scope moved from 130.1 to 130.2 and the energized work permit from 130.2 to 130.3. A new 130.2(A)(2) requires an additional trained person outside the boundary when a permit calls for shock or arc flash PPE ([EC&M](https://www.ecmag.com/magazine/articles/article-detail/changes-to-article-130--2027-nfpa-70e-update--part-2)).
- The arc flash likelihood table is reported as Table 130.5(C)(3), with a new row for battery equipment under 600 V.
- Summaries report no change to the 130.5(H) label content requirements. One source mentions a 5-year review interval for label data. Unresolved.
- Sources conflict on the DC PPE table: one reports a change to Table 130.7(C)(15)(a), another says it is unchanged and points to table (b). Unresolved.
- A change to 130.7(C)(14) is reported for arc-rated PPE conformity assessment, and thermal hand protection is reported as added.
- Annex D was not covered by any source found. The DC method citation (D.8 / D.8.1) is therefore completely unreviewed for 2027.

## Acceptance procedure

1. Obtain authorized text of NEC 2023 and 2026, and NFPA 70E-2024 and 2027, or NFPA-issued change documents.
2. For each row in the code surface tables, record every changed clause, table, factor, and definition that affects it, plus renumbering.
3. Resolve the internal discrepancies above first, so the 2023-basis implementation is self-consistent before comparing editions.
4. Map each reviewed change to code, inputs, outputs, reports, UI strings, and documentation.
5. Implement the reviewed delta without overwriting the 2023/2024 path if projects still require those editions (the Submittal Package already offers older editions).
6. Add named, edition-specific benchmarks or fixtures for every affected calculation family, including `TRAY-NEC-001`, `nec2023-conduit-fill-count`, `VDROP-001`, and `VDROP-002` equivalents for the new edition.
7. Run unit, integration, build, and applicable browser evidence, and archive the results with the review record.
8. Require qualified human review before updating the "Edition currency" table in [standards.md](standards.md) or removing the calculation-basis note from the Submittal Package.

No reviewer identity, approval date, or engineering sign-off is asserted by this document.
