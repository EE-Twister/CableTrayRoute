# Protective-device promotion precheck — S&C SMU-20 cohort

Date: 2026-08-12  
Scope: read-only technical precheck of the three `source_verified` records in `data/protectiveDevices.json`.  
Disposition: **not promotable; retain `source_verified` / peer-review-pending status.**

This precheck is not independent engineering review, licensed-engineer approval, or authorization to use these records for issued coordination, settings, or arc-flash clearing times. No production-library record or human review field was changed.

## Completion update — governed candidate package

The technical follow-up identified by this precheck is complete in
`protective-device-research-candidates-smu20-2026-08-12.json`. The three
replacement candidates retain all 522 manufacturer points, include explicit
asymmetric tolerance semantics, provide field-level provenance and verification
statuses, and pass 18 automated operational-boundary spot checks with zero
relative error. Specification Bulletin 242-31 is mapped as the direct SMD-20
outdoor ordering source; Bulletin 665-31 is retained only as a traceable PME
cross-application source and is excluded from direct field mappings.

The candidate batch passes the research schema and semantic validator without
warnings. Its only calculated production gap is independent qualified human
review. The canonical production records remain unchanged. See
`protective-device-qualified-review-handoff-smu20-2026-08-12.md` and the
review workbook named there for the terminal review step.

## Cohort

| Record | Catalog | Rating | Application recorded in library | Stored curve profiles |
| --- | --- | ---: | --- | --- |
| `sc_smu20_25e_standard_14kv` | 612025 | 25E | SMU-20 in SMD-20 mounting, 14.4 kV nominal, 14 kA RMS symmetrical | 13 minimum-melt points; 23 total-clearing points |
| `sc_smu20_65e_standard_14kv` | 612065 | 65E | SMU-20 in SMD-20 mounting, 14.4 kV nominal, 14 kA RMS symmetrical | 17 minimum-melt points; 24 total-clearing points |
| `sc_smu20_100e_standard_14kv` | 612100 | 100E | SMU-20 in SMD-20 mounting, 14.4 kV nominal, 14 kA RMS symmetrical | 17 minimum-melt points; 22 total-clearing points |

The manufacturer ordering bulletin lists the three catalog numbers at the corresponding E ratings for the 14.4 kV nominal / 17.0 kV maximum SMU-20 family. It also lists 14,000 A RMS symmetrical as an SMD-20 mounting interrupting rating and states that the rating is assembly- and X/R-dependent. The library's installation warning is therefore material and must remain visible.

The [manufacturer TCC index](https://www.sandc.com/en/contact-us/time-current-characteristic-curves/) identifies TCC 153-2 as the standard-speed minimum-melting curve for SMU-20/SMU-40 and TCC 153-2-2 as the 14.4 kV SMU-20 total-clearing curve. The [S&C Specification Bulletin 242-31](https://www.sandc.com/globalassets/sac-electric/documents/public---documents/sales-manual-library---external-view/specification-bulletin-242-31.pdf) supports the catalog/rating/application identity.

## Automated precheck results

| Check | 25E | 65E | 100E |
| --- | ---: | ---: | ---: |
| Metadata-reported normalized reduction error | 0.0249 | 0.0229 | 0.0245 |
| Minimum-melt / total-clearing band samples | 41 | 41 | 41 |
| Samples where total clearing was below minimum melting | 0 | 0 | 0 |
| Minimum sampled clearing-to-melting time ratio | 1.2024 | 1.2826 | 1.2280 |
| Current promotion-validator result | Fail | Fail | Fail |

The sampled band relationship is a useful transcription sanity check only. It does not replace point-by-point comparison with the official spreadsheets or a protection engineer's applicability review. The metadata-reported errors above describe the earlier normalized reduction workflow; they do not bound error against every raw official workbook point.

## Official workbook comparison

The official XLSX files were read directly and compared with the stored curve profiles using log-log interpolation at every in-range source point. This exposed vertical or near-vertical source segments that a single-valued reduced `time = f(current)` curve cannot necessarily preserve.

| Profile | Rating | Official range | Source points | Maximum raw-source log error | Worst official point | Stored interpolation at that current |
| --- | ---: | --- | ---: | ---: | --- | --- |
| Minimum melting | 25E | `153_2!P10:Q95` | 86 | 1.1813 | 49.5972 A, 602.961 s | 39.7197 s |
| Minimum melting | 65E | `153_2!X10:Y95` | 86 | 0.1998 | 129.785 A, 359.549 s | 569.554 s |
| Minimum melting | 100E | `153_2!AB10:AC95` | 86 | 0.0105 | 247.629 A, 17.3544 s | 17.7791 s |
| Total clearing, 14.4 kV | 25E | `153_22!N8:O95` | 88 | 0.1411 | 54.0513 A, 46.5184 s | 33.6108 s |
| Total clearing, 14.4 kV | 65E | `153_22!V8:W95` | 88 | 0.0098 | 484.894 A, 0.537858 s | 0.550144 s |
| Total clearing, 14.4 kV | 100E | `153_22!Z8:AA95` | 88 | 0.0102 | 253.644 A, 28.6985 s | 29.3813 s |

The 25E minimum-melting source contains a long-time, near-vertical segment around 49.6 A; the stored profile collapses that behavior to approximately 39.72 s. The application now preserves duplicate-current and near-vertical point geometry, uses the longest time at an exact upper/total-clearing boundary and the shortest time at an exact lower/minimum-melt boundary, and traverses vertical segments directionally during log-log interpolation. That resolves the runtime representation primitive, but the stored 25E profile has not yet been regenerated from the official source. It is not acceptable to promote this cohort until that regeneration and comparison are complete. The 65E minimum-melting difference also exceeds the prior normalized-error figure and must be explained before review.

The official minimum-melting workbook is dated 2015-07-14 and states a plus-10-percent current tolerance for 10E through 400E curves. The total-clearing workbook is dated 1988-08-29 and states that curves are plotted to maximum test points and variations are minus. Those semantics must remain attached to any reduced representation.

## Boundary-aware source reconstruction

The 522 official coordinates for the selected profiles are now preserved in
[`protective-device-source-geometry-smu20-2026-08-12.json`](protective-device-source-geometry-smu20-2026-08-12.json).
This is a technical-only, non-canonical evidence file. It contains no reviewer
or approval fields and does not change the production library.

For minimum melting, the comparison selects the shortest time at an exact
duplicate current. For total clearing, it selects the longest time. Every
selected boundary point evaluates exactly against the raw-coordinate candidate
with the new bounded log-log evaluator (`maximumLog10Error = 0`). The remaining
error below is therefore attributable to the stored reduced profile, not loss
inside the new candidate representation.

| Profile | Rating | Raw points | Duplicate-current groups | Candidate max log10 error | Stored-boundary max log10 error |
| --- | ---: | ---: | ---: | ---: | ---: |
| Minimum melting | 25E | 86 | 1 | 0 | 0.8868 |
| Minimum melting | 65E | 86 | 2 | 0 | 0.1998 |
| Minimum melting | 100E | 86 | 1 | 0 | 0.0105 |
| Total clearing, 14.4 kV | 25E | 88 | 1 | 0 | 0.1411 |
| Total clearing, 14.4 kV | 65E | 88 | 1 | 0 | 0.0098 |
| Total clearing, 14.4 kV | 100E | 88 | 1 | 0 | 0.0102 |

This resolves source-point capture and the software representation primitive.
It does not resolve asymmetric manufacturer tolerance metadata, governed field
mapping, applicability review, or independent human review.

## Common promotion blockers

All three records fail the strict promotion precheck for the same reasons:

- `researchStatus` is not human-set `reviewed`;
- `libraryStatus` is not `calculation_ready`;
- lifecycle status is missing;
- region applicability is missing;
- standards and editions are missing;
- frequency applicability is missing;
- pole configuration is missing;
- three official curve spot checks are missing;
- structured traceable `sourceDocuments` are missing;
- field-level `fieldSources` mappings are missing;
- field verification statuses are missing;
- `lastVerified` is missing; and
- independent engineering review is missing.

In addition, the raw-source comparison now blocks package readiness because the stored 25E and 65E minimum-melting representations have unresolved deviations from official source points. The 65E and 100E legacy `sourceUrls` also reference Specification Bulletin 665-31 while the currently located manufacturer ordering bulletin is 242-31; the governed source mapping must resolve that document identity rather than silently substituting it.

The existing `sourceUrls` and `curveEvidence` are helpful legacy provenance, but they do not satisfy the governed structured-source and field-level mapping contract.

## Recommended next review package

Prepare one governed review package for the three-record cohort rather than three unrelated reviews:

1. Transcribe structured source documents for TCC 153-2, TCC 153-2-2, and Specification Bulletin 242-31, including access date and purpose.
2. Map every governed technical field to its supporting manufacturer source and mark verified, derived, not found, not applicable, or conflicting.
3. Record applicability explicitly: 60 Hz basis, SMU-20 fuse unit, required SMD-20 mounting, 14.4 kV nominal / 17 kV maximum, and the interrupting-rating X/R basis.
4. **Completed technically:** raw non-canonical candidates retain all 522 official coordinates, including vertical and duplicate-current source segments, and reproduce each operational boundary point exactly with the bounded evaluator.
5. Convert the raw-coordinate evidence into governed research candidates with field-level sources, asymmetric tolerance metadata, spot checks, and a documented engineering acceptance criterion.
6. Have an independent qualified human reviewer confirm catalog identity, curve selection, voltage/application limits, and transcription. Only that reviewer may populate reviewer/date fields or authorize promotion.

The structured package at `docs/protective-device-review-package-smu20-2026-08-12.json` is an evidence assembly, but its status is **not ready for qualified human review**.

Until the technical blockers are corrected and the package is complete, the application should continue to show these records as **Source verified — peer review pending** and exclude them from calculation-ready coordination and arc-duration workflows.
