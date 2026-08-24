# S&C SMU-20 Qualified-Review Handoff

Date: 2026-08-12  
Technical disposition: Candidate for qualified human review  
Production disposition: Not calculation-ready; canonical library unchanged

This package is technical assistance for a qualified reviewer. It is not independent engineering review, licensed-engineer approval, or authorization for protective-device settings, coordination conclusions, arc-flash clearing times, or field labels.

## Package

- Governed candidates: `docs/protective-device-research-candidates-smu20-2026-08-12.json`
- Reproducible builder: `scripts/buildSmu20ResearchCandidates.mjs`
- Source-geometry evidence: `docs/protective-device-source-geometry-smu20-2026-08-12.json`
- Human-review workbook: `outputs/019ff634-ad72-7a30-a116-8938931b0346/SMU20-qualified-human-review-handoff.xlsx`
- Validator: `node scripts/validateProtectiveDevices.mjs --research docs/protective-device-research-candidates-smu20-2026-08-12.json`

The governed batch contains replacement candidates for the existing canonical IDs:

| Candidate ID | Rating | Catalog | Manufacturer points | Spot checks |
| --- | ---: | --- | ---: | ---: |
| `sc_smu20_25e_standard_14kv` | 25E | 612025 | 174 | 6 |
| `sc_smu20_65e_standard_14kv` | 65E | 612065 | 174 | 6 |
| `sc_smu20_100e_standard_14kv` | 100E | 612100 | 174 | 6 |

All three records remain `researchStatus: "candidate"` and `libraryStatus: "screening"`. Reviewer and review-date fields are null. The only calculated production gap is `independent engineering review`.

## Technical completion

- Retained all 522 manufacturer spreadsheet coordinates across six profiles; no curve reduction is used.
- Preserved duplicate-current and near-vertical geometry.
- Applied the bounded log-current/log-time evaluator with extrapolation rejected.
- Assigned minimum-melting profiles to the lower operational boundary and total-clearing profiles to the upper operational boundary.
- Added six automated source-point checks per record. All 18 checks have zero relative error.
- Added field-level source mappings and verification states for every governed research path.
- Added structured asymmetric tolerance semantics:
  - TCC 153-2 is plotted to minimum test points with plus 10% current variation for the 25E, 65E, and 100E ratings.
  - TCC 153-2-2 is plotted to maximum test points and states that all variations are minus; no percentage is supplied, so none is invented.
- Added manufacturer and IEEE standards-body source records. The edition mapping is explicitly derived and remains a human-review item.

## Bulletin identity resolution

Specification Bulletin 242-31 is the direct outdoor SMD-20/SMU-20 ordering source. It identifies the 14.4-kV standard-speed SMU-20 catalog numbers and is used for catalog and application provenance.

Specification Bulletin 665-31 is the manual PME pad-mounted-gear bulletin. It contains SMU-20 cross-application information but is not the direct SMD-20 outdoor ordering source. The candidate records retain it as a traceable cross-application source and deliberately exclude it from direct catalog and application field mappings.

## Qualified reviewer decisions

The reviewer should independently:

1. Confirm the 242-31 catalog/application mapping for each exact rating and intended SMD-20 assembly.
2. Confirm the derived IEEE C37.41-2016 and IEEE C37.46-2010 edition mapping against the project standards basis. The 2019 manufacturer TCCs cite the standard numbers without editions, and IEEE identifies C37.46-2010 as superseded by C37.42-2016.
3. Compare representative raw coordinates, including a duplicate-current location, against the official manufacturer workbooks and PDF plots.
4. Confirm the asymmetric tolerance interpretation and operational lower/upper boundary roles.
5. Confirm 50/60-Hz, single-pole, and complete-assembly interrupting-rating applicability for the intended study.
6. Decide whether the records may move to `researchStatus: "reviewed"` and `libraryStatus: "calculation_ready"` through the controlled promotion/replacement workflow.

No promotion should occur until those decisions are documented by the qualified reviewer with reviewer identity and review date.
