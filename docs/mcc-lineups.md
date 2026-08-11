# MCC Lineups

The MCC Lineups tool (`mcclineup.html`) builds motor control center lineup layouts for early coordination and package drafting.

## What it supports

- Multiple named MCC lineups per project.
- Section-by-section elevation rendering with configurable section width, depth, height, horizontal/vertical bus ratings, usable bucket height, vertical wireway width, top/bottom horizontal wireway height, and bucket position letters such as `A-C`.
- Bucket sizing in both MCC units and inches. The default is 1 unit = 6 inches.
- Newly added sections are prepopulated with 12-inch space buckets across the available bucket stack.
- Profile defaults can be applied to the active lineup for common low-voltage, heavy-duty, and compact MCC sizing/specification assumptions.
- Bucket metadata for type, equipment tag, equipment description, horsepower, breaker rating, starter type, control scheme, starter size, motor space heater feed requirement, motor space heater VA rating, and notes. Spare and space buckets are selected directly in the Type column, and main incoming buckets are selected as `Main-MLO` or `Main-Breaker`.
- The Starter Size column includes an info tooltip with a NEMA size motor starters horsepower reference chart.
- Section bucket row controls use icon buttons at the right side of the table for drag/place, move up, move down, and delete actions.
- Bucket rows can be reordered with the controls at the right side of each bucket row by dragging the row handle onto another bucket row, by clicking **Drag** and then the target row's **Place** handle, or with the Up/Down buttons.
- The section bucket table keeps its horizontal scroll position after edits so users can fill out columns from left to right without being returned to the first column.
- Buckets can also be dragged directly in the elevation view. Drop a bucket on another bucket to place it at that position, including in another section.
- Bucket nameplates use the equipment tag and equipment description; legacy load tags are migrated into the equipment tag field.
- Main buckets can be marked as `Main-MLO` or `Main-Breaker` in the Type column; breaker-rated mains should include a breaker amp rating.
- Per-lineup specification requirements in an Additional Information dropdown, including bus material, bus plating from a drop-down with an Other value, SCCR, incoming line power, communication protocol, control voltage, MCC enclosure, MCC arrangement, expansion cover plate side, space heater requirement with voltage/accessories enabled only when required, bus join plating, ground bus requirement/location, motor protection device type, finish, and notes.
- System and rating requirements for phase/wire/frequency/grounding, neutral, available fault current and basis, service entrance, certifications, arc-resistant construction, seismic qualification, jurisdiction, and AHJ.
- Installation interfaces for incoming/outgoing conductors, cable entry and bending space, access and clearance, shipping splits and building entry, base/anchoring/pad/floor openings, location/coordinates, ambient, altitude, environment, and hazardous-area classification.
- Linked project-data suggestions with visible source state. Blank MCC fields are populated from existing project data when a matching source is available, while every field remains manually editable for standalone lineup creation.
- Bucket selection from the elevation view, with the same bucket highlighted in the one-line preview and bucket list.
- Layout validation for missing sections, section overflow, unit/inch mismatches, and active buckets without equipment tags.
- Wireway validation for top/bottom horizontal wireway stack height and vertical wireway width versus section width.
- A generated simple one-line diagram below the lineup elevation, with different symbols for starter, VFD, breaker/feeder, spare, and space cubicles. Starter cubicles can show a starter type and size such as `FVNR-2`; spare breaker ratings are shown as AT/AF when entered with trip and frame values; each branch drop is labeled with the section and bucket position such as `1A`, `2F`, or `3C`. Wide one-line previews keep their readable component scale and scroll horizontally instead of shrinking all branches to fit.
- SVG sheet export for the current lineup.
- PDF report export with the current lineup summary, elevation view, simple one-line, and bucket schedule.
- Optional Equipment List sync for MCC summary fields such as width, depth, height, voltage, arrangement, and lineup tag.
- Previewed Load List reconciliation that builds and refreshes preliminary MCC buckets from loads whose Source / Panel matches the active lineup Equipment Tag or Tag.
- Direct placement on Equipment Arrangements as a one-off MCC lineup without creating an Equipment List row first.

## Build or refresh from the Load List

Use **Build / Refresh from Load List** to preview loads whose **Source / Panel** matches the active lineup's **Equipment Tag**, or its **Tag** when no Equipment Tag is provided. Source matching ignores capitalization and surrounding spaces. Confirming the preview creates one Load List-managed bucket per matching load and packs those buckets into dedicated `Load List` sections. Existing manual buckets and sections are preserved.

Refreshing uses each load's stable project ID to update generated tag, description, type, and any explicit MCC fields supplied by imported data. A manual edit to a generated field is preserved on later refreshes. Generated buckets whose source loads no longer belong to the MCC are listed in the preview and removed only after confirmation.

The Load List's explicit **MCC Unit Type** uses the same Main-MLO, Main-Breaker, Starter, VFD, Breaker, Feeder, Space, and Spare choices as the MCC Type column and takes precedence during lineup generation. When MCC Unit Type is left on Auto, motor loads become starter buckets, explicit VFD loads become VFD buckets, spare loads become spare buckets, and other loads become feeder buckets. For starter units, the Load List **Starter Type** uses the same FVNR, FVR, Soft Starter, Wye-Delta, Part-Winding, Two-Speed, Reduced Voltage Autotransformer, and Other choices as the MCC page and transfers directly into the generated bucket. **Control Scheme** also transfers to generated starter and VFD buckets. General choices include Start/Stop, HOA, and Local/Remote; FVR starters expose forward/reverse arrangements, two-speed starters expose speed selection, and VFD buckets expose keypad, speed potentiometer, analog-reference, and network/PLC speed-control arrangements. Incompatible schemes are cleared when controller context changes. The Load List's kW and calculated current are not converted into motor nameplate horsepower or protective-device ratings. Instead, an explicit Load List HP value is passed through as nameplate horsepower.

Control scheme is metadata for preliminary coordination and the bucket schedule; it does not automatically add MCC units or inches to the bucket. Basic door-mounted control devices often fit within a standard unit, but pilot-device count, control power transformers, relays, communications hardware, terminal blocks, and manufacturer construction can require additional space. Confirm the selected scheme and physical bucket size with the MCC manufacturer.

For three-phase motor loads with an explicit positive HP value, a supported voltage class, and no explicit starter size, the generator can assign a preliminary NEMA starter size from the same horsepower table shown in the Starter Size tooltip. Supported nominal voltages are 200/208 V, 220/230/240 V, and 440/460/480/575/600 V. Full-voltage non-reversing/reversing, wye-delta, part-winding, and reduced-voltage autotransformer methods use their corresponding table columns. If no starter method is provided, the screening estimate assumes full voltage and records that assumption. Soft starters, two-speed starters, VFDs, other unsupported methods, single-phase loads, unsupported voltages, missing HP, and values beyond the table remain unassigned. An explicit imported starter size always takes precedence.

The starter table basis is the [Eaton NEMA Contactors and Starters catalog](https://www.eaton.com/content/dam/eaton/products/industrialcontrols-drives-automation-sensors/nema-contactors-and-starters-v5-t2-ca08100006e.pdf). It is used only for early screening.

When a starter size is available and the method is FVNR, the generator also applies this conservative cross-manufacturer bucket-height allowance:

| NEMA starter size | Estimated bucket height | MCC units at 6 in./unit |
| --- | ---: | ---: |
| 00-2 | 12 in. | 2 |
| 3 | 24 in. | 4 |
| 4 | 36 in. | 6 |
| 5 | 48 in. | 8 |
| 6 | Full usable section | Depends on lineup |
| 7-9 | Not automatically assigned | Custom |

The allowance is informed by published construction data from the [Eaton Freedom MCC catalog](https://www.eaton.com/content/dam/eaton/products/low-voltage-power-distribution-controls-systems/motor-contols/mcc-catalog.pdf-vol03-tab03.pdf), [Rockwell Automation CENTERLINE 2100 selection guide](https://literature.rockwellautomation.com/idc/groups/literature/documents/sg/2100-sg003_-en-p.pdf), and [Schneider Electric Model 6 guidance](https://www.se.com/us/en/faqs/FA236769/). It is intentionally conservative for generic layout planning, not a manufacturer-specific selection. FVR, wye-delta, part-winding, autotransformer, soft-starter, VFD, and NEMA 7-9 constructions remain unassigned unless a bucket size is supplied explicitly. Options such as arc-resistant construction, larger protective devices, control power transformers, pilot devices, communications, and special terminations can require more space.

An explicit imported bucket size takes precedence over the estimate. A user can resize a generated bucket in the MCC editor; that manual value is retained on later Load List refreshes and its automatic-estimate provenance is cleared. Loads without an explicit or supported estimated bucket size use one MCC unit for preliminary layout. Voltage mismatches, missing tags, preliminary starter or bucket estimates, and incomplete or unsupported motor data are shown as review items in the preview. Each uniquely tagged Load List row creates one bucket.

Feeder and breaker buckets can also use explicit **Breaker Trip (A)** and **Breaker Frame (A)** values from the Load List. The generated MCC bucket retains the two ratings separately, and only the amp-frame rating drives automatic bucket sizing. The MCC bucket editor continues to accept the legacy combined form `100AT/250AF`; a lone value such as `100` is treated as trip amps and does not trigger frame-based sizing. The conservative planning allowances are:

| Breaker amp frame | Estimated bucket height | MCC units at 6 in./unit |
| --- | ---: | ---: |
| Up to 125 AF | 12 in. | 2 |
| 126-250 AF | 18 in. | 3 |
| 251-400 AF | 30 in. | 5 |
| 401-600 AF | 42 in. | 7 |
| 601-800 AF | 66 in. | 11 |
| 801-2500 AF | Full usable section | Depends on lineup |
| Above 2500 AF | Not automatically assigned | Custom |

This feeder-breaker allowance is informed by the [Eaton low-voltage MCC design guide](https://www.eaton.com/content/dam/eaton/products/design-guides---consultant-audience/eaton-low-voltage-mcc-design-guide-dg043001en.pdf), [Rockwell Automation CENTERLINE 2100 selection guide](https://literature.rockwellautomation.com/idc/groups/literature/documents/sg/2100-sg003_-en-p.pdf), and [Schneider Electric Model 6 feeder catalog](https://productinfo.se.com/nadigest/5c51d645347bdf0001f1f280/Master/17717_MAIN%20%28bookmap%29_0000055870.xml/%24/topicref). It is a generic screening allowance. Breaker family, interrupting rating, fixed versus withdrawable construction, arc-resistant construction, line/load lug orientation, conductor quantity and size, metering, controls, and accessories can change the required space.

Load List-generated layouts are screening and coordination drafts. Confirm equipment quantities, motor nameplate current and horsepower, duty, starter method, starter and VFD selections, protective-device ratings, manufacturer horsepower ratings, construction options, and physical bucket dimensions before detailed design, procurement, or construction use.

## Equipment List sync

Use **Sync Equipment List** after editing a lineup only when the lineup should maintain an Equipment List row. The sync matches the MCC row by `equipmentTag`, `tag`, `ref`, or `id`, then updates MCC-owned summary fields while preserving unrelated Equipment List data.

Leave **Equipment Tag** blank for a standalone one-off lineup. Standalone lineups stay in MCC Lineups storage and are skipped by Equipment List sync. If an Equipment Tag is provided and no matching row exists, the tool creates an Equipment List row for the MCC.

Specification requirements are saved with the MCC lineup. Equipment List sync includes a compact spec summary in new MCC notes while still preserving unrelated fields on existing Equipment List rows.

## System basis and installation interfaces

The MCC page reuses project information when it is available instead of requiring duplicate entry. Matching uses the lineup **Equipment Tag** or **Tag** and can draw from:

- Equipment List and One-Line records for voltage, phase/wire/frequency/grounding, neutral, SCCR, service-entrance, certification, arc-resistant, seismic, location, coordinates, and environment data;
- location-specific Short Circuit results for available fault current and method;
- Cable Schedule endpoints and conductor data for incoming and outgoing cable summaries;
- Project Metadata for title-block identity, site/location, altitude, and minimum/maximum design ambient; and
- Design Basis for code, edition, jurisdiction, and AHJ.

Blank fields, already linked fields, and untouched generic starting defaults update automatically. Editing any field or applying an MCC profile records that choice as a manual override, and later automatic reloads preserve it. **Refresh from project** intentionally reapplies all currently available source values and clears the affected overrides. Fields with no source remain ordinary manual inputs, so an MCC can be created without completing earlier workflow pages.

A project-level Short Circuit summary is identified as provisional because it may not represent duty at the MCC bus. The page validates the specified MCC SCCR against the available fault current when both values are present, but the result remains an engineering screening check and does not replace a location-specific fault study or manufacturer confirmation.

## Reports

Use **Export PDF Report** to create a PDF package for the active lineup. The report includes the lineup characteristics, system/rating basis, specification requirements, installation interfaces, source/status for each requirement, section elevation, generated simple one-line, and a bucket schedule with bucket positions, equipment tags, equipment descriptions, sizing, breaker/main information, starter type/size, control scheme, motor space heater feed and VA information, cables, and notes. Long one-lines are split into fixed-height rows with continuation markers so branch symbols and labels stay readable.

The **PDF Title Block** dropdown stores project name, client, drawing number, revision, prepared-by, checked-by, and report date fields with the lineup and uses them in the PDF title block.

## Equipment Arrangement preview

On `equipmentarrangements.html`, use **Source > MCC Lineup** to place a saved lineup directly on the room canvas. Select the placed MCC to show the detailed MCC elevation and simple one-line below the normal room elevation view.

Equipment List rows can still drive the same preview when a placed MCC matches a lineup by Equipment Tag or Lineup.

The preview is read-only; use **Edit MCC Lineup** on the arrangement preview to open the selected lineup back on `mcclineup.html`.
