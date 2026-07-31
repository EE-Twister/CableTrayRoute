# Manufacturer Catalog Research

## Eaton B-Line / KwikRail starter family

The source-verified base catalog records below were checked on 2026-07-30
against Eaton manufacturer product pages. A record is marked `source_verified`
only when the stored identity, physical attributes, source URL, and verification
date match the page. It remains `unreviewed` until a project approval authority
approves it.

| Catalog number | Stored product facts | Manufacturer source |
| --- | --- | --- |
| `KRB4ASB-12-120` | KwikRail NEMA Class B aluminum straight section; 12 in wide, 3.858 in high, 120 in long, 18.053 lb; UL Classified and CSA. | [Eaton product page](https://www.eaton.com/us/en-us/skuPage.KRB4ASB-12-120.html) |
| `ACC-04-45HB12` | Aluminum ventilated horizontal-bend cable channel; 4 in wide, 1.75 in high, 15.021 in long, 45 degree, 12 in radius, 1.3 lb; CSA, UL Classified, and CE. | [Eaton product page](https://www.eaton.com/us/en-us/skuPage.ACC-04-45HB12.html) |
| `KRA-SDO-12` | Aluminum side-rail drop-out for 12 in KwikRail tray; 9.459 in wide, 1 in high, 12 in long, 0.927 lb. The manufacturer page lists certifications as not applicable. | [Eaton product page](https://www.eaton.com/us/en-us/skuPage.KRA-SDO-12.html) |
| `KR4A-END-12` | Aluminum blind end for 12 in KRA4A/KRB4A tray; 14.194 in wide, 4 in high, 12 in long, 1.391 lb. The manufacturer page lists certifications as not applicable. | [Eaton product page](https://www.eaton.com/us/en-us/skuPage.KR4A-END-12.html) |

No list price, owner approval, BIM family download, or EPD claim is inferred
from these pages. Those remain project-specific evidence requirements.

## Shared heat-trace catalog rows

The project catalog template also accepts `heat_trace` rows. In addition to the
normal manufacturer, source, verification, evidence, and approval fields, a
usable heat-trace row needs cable type, voltage options, nominal W/ft, and
voltage-to-maximum-circuit-length pairs (for example `120:300;240:500`).

Heat Trace Sizing merges these project rows with the bundled starter catalog;
a project row with the same manufacturer and catalog number replaces the
starter entry. The **Approved only** filter continues to apply, so a
source-verified entry is not mistaken for project approval.

## Shared cable catalog rows

The same template accepts `cable` rows with conductor count, conductor size
and material, insulation type, and voltage rating. Those fields are validated
before import. In Cable Schedule, **Load Project Catalog Types** adapts each
complete project catalog cable into a reusable typical; source evidence is
carried across and displayed separately from project approval.

## Shared protective-device catalog rows

The template also accepts `protective_device` rows for the TCC selector. A
usable row declares its device type, at least two `current:time` curve points,
and—except for relays—voltage-to-interrupting-kA pairs such as `480:65;600:50`.
For source-verified rows, the manufacturer curve document, revision, curve
identifier/page, and extraction method are required. An independent reviewer
and a declared `calculation_ready` status are additionally required before the
TCC library will display the entry as calculation-ready.

TCC loads qualifying project catalog entries automatically in the **Project
Catalog Devices** group. It preserves the catalog evidence and applies the
same runtime readiness gate as bundled devices; no import field can fabricate
curve data or promote an incomplete device.

## Approved routing assignments

In Raceway Schedule, an approved `tray` or `conduit` product can be assigned
to a routed segment through its **Approved Catalog Product** field. Tray
choices are limited to width/depth-compatible approved rows. The route stores
a snapshot of product identity, approval, source, verification date, and
datasheet link; the Tray Hardware BOM carries an assigned straight-section
catalog number into its procurement view and XLSX export.
