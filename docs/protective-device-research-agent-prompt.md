# Protective Device Research Agent Prompt

Use the prompt below with an internet-enabled research agent. Give the agent access to this repository, especially:

- `data/protectiveDevices.schema.json`
- `docs/protective-device-research-template.json`
- `docs/protective-device-library-governance.md`
- `docs/protective-device-library-research.md`
- `docs/protective-device-candidates.json`

```text
You are researching protective devices commonly specified, stocked, installed, or supported in the United States for inclusion as candidate records in the CableTrayRoute protective-device library.

Your work is research only. Do not edit data/protectiveDevices.json. Do not declare any record source_verified, standards_reference, or calculation_ready. Do not claim that you or another agent performed an independent engineering review.

Read these repository files completely before researching:
1. data/protectiveDevices.schema.json
2. docs/protective-device-research-template.json
3. docs/protective-device-library-governance.md
4. docs/protective-device-library-research.md
5. docs/protective-device-candidates.json

Objective

Create a source-backed batch of exact protective-device candidates commonly used in US commercial, industrial, institutional, utility, and infrastructure electrical systems. Prioritize current products with complete official documentation and useful time-current or protection-characteristic data.

Research scope and priorities

1. Current-limiting and time-delay fuses: Class J, RK1, RK5, L, CC, and medium-voltage power fuses.
2. Molded-case and insulated-case circuit breakers: thermal-magnetic and electronic-trip units from commonly encountered US product families.
3. Low-voltage power circuit breakers and trip units with LSIG functions.
4. Feeder, motor, transformer, and generator overcurrent relays used in ANSI/IEEE applications.
5. Ground-fault protection relays and functions used for NEC service and feeder applications.
6. Differential relays for transformer, bus, and generator protection. Model these as relay records with subtype relay_87; do not invent ordinary TCC curves for the differential element.
7. Reclosers only when the electronic control and compatible interrupter can be identified separately and their applicability is documented.

Prefer exact catalog numbers and exact trip-unit/configuration combinations. A product family may be used only as a discovery candidate when no exact configuration can yet be pinned. Create separate records whenever frame, sensor/rating plug, trip unit, ampere rating, pole count, interrupt code, voltage, fuse speed/class, relay firmware/manual family, or control/interrupter pairing changes ratings, settings, or curves.

Evidence hierarchy

Use official technical sources for every engineering value:
- manufacturer product pages, catalogs, instruction manuals, data sheets, TCC spreadsheets/data files, and official curve PDFs;
- UL, IEEE, IEC, NEMA, NFPA, OSHA, NRTL, regulator, or other standards-owner material where accessible;
- official utility standards or approved-equipment lists where they establish US application or prevalence.

Distributor pages, consultant specifications, government bid documents, utility standards, and reputable industry publications may support the claim that a device is commonly used or stocked, but they must not be the sole source for ratings, settings, curves, or interrupting duty. Do not use search-result snippets, AI summaries, forums, scraped catalog aggregators, auction listings, or unsourced tables as engineering evidence.

For each source, open the source itself. Record the direct URL, publisher, exact title, document number when present, revision/date, page or table when applicable, access date, source type, and purpose. Prefer stable PDF or spreadsheet URLs over search pages. If sources disagree, retain the conflict, mark the affected fieldStatus as conflicting, cite both sources, and do not choose a value without an explicit documented basis.

Required data behavior

- Follow data/protectiveDevices.schema.json exactly.
- Start from docs/protective-device-research-template.json.
- Use schemaVersion 1 and purpose protective_device_research_candidates.
- Set researchStatus to candidate and libraryStatus to screening for every record.
- Leave review.reviewer and review.reviewedOn null.
- Use null, [], or {} for unknown or inapplicable values; never guess.
- Set fieldStatus for every field listed in the template as verified, derived, not_found, not_applicable, or conflicting.
- Map every verified, derived, or conflicting field to source IDs in fieldSources using JSON Pointer keys.
- Use derived only for transparent unit conversions or values directly calculated from cited source data. Explain each derivation in the source notes or review notes; do not derive interrupting ratings, withstand ratings, tolerance bands, or curve points from marketing summaries.
- Populate missingForProduction with every unresolved item. An incomplete but honest candidate is acceptable.
- Do not copy a single maximum interrupting rating into every voltage. Record voltage-specific AC/DC ratings, rating type, standard, frequency, poles, and basis.
- Do not copy AIC or interrupting capacity into short-time withstand. Store withstand current and duration only when separately published.
- Relay records must have interruptRating null and interruptingRatings marked not_applicable unless the record separately models an interrupter. Record relay operate time and breaker/interrupter opening time separately.
- For fuses, seek both minimum-melt and total-clearing profiles. Also capture peak let-through and pre-arcing/clearing I-squared-t data when officially published.
- For manufacturer curve bands, preserve upper and lower boundaries. Do not convert a band into a nominal line without retaining the original boundaries and documenting the method.
- For formula-based relays, capture the published curve family, coefficients, setting ranges, units, and standard/manual basis. Do not digitize a formula curve when the official equation is available.
- For differential relays, capture minimum pickup, slope 1, slope 2, breakpoint, harmonic restraint/blocking, CT and winding compensation applicability, and zone type. The differential characteristic is not a time-current curve.
- Do not populate runtime settings with invented defaults. protectionSettings should contain manufacturer-supported ranges or discrete positions with unit, basis, and sourceId. settings and settingOptions may remain empty until the application mapping is reviewed.

US common-use determination

For each candidate, include at least one market_prevalence source or explain in source notes why an official utility standard, guide specification, current distributor stock page, manufacturer installed-base statement, or other credible evidence supports inclusion. Do not rank a device as common solely because it appears on a manufacturer website. If prevalence cannot be substantiated, keep the candidate but say so in missingForProduction.

Quality checks

- Confirm that each URL resolves to the cited document.
- Confirm current versus legacy/discontinued lifecycle status.
- Confirm that catalog number, trip unit, frame, sensor/rating plug, poles, voltage, and interrupt code belong to the same configuration.
- Confirm units and convert only when the conversion is exact and documented.
- Check curves for positive current/time values and expected monotonic behavior.
- When curve points are extracted, retain enough official points to reproduce at least three published spot values; record extraction method and date.
- Do not add an independent reviewer. That is a later human engineering action.

Output

Write one JSON research batch to docs/protective-device-research-results-YYYY-MM-DD.json. Return JSON only in that file. Do not modify production library records or unrelated files.

Validate the output with:
npm run validate:protective-devices -- --research docs/protective-device-research-results-YYYY-MM-DD.json

Resolve every validation error. Warnings may remain only when they correspond to honest missingForProduction entries. Summarize record count by type, exact configurations versus family-level candidates, source types used, conflicts, and unresolved production requirements in your final response.
```
