# Protective Device Library Governance

The Time-Current Curve library labels each bundled device by its evidence and
calculation readiness. This lets a user explore a catalog without mistaking a
representative curve for a released engineering calculation.

The TCC selector's **Filters** group can isolate calculation-ready,
source-verified, standards-reference, or screening-only library records before
curves are selected.

The Library Manager initially loads the compact governed inventory rather than
every curve and source record. Selecting a device name loads that device's full
record from its catalog shard and opens the detailed rating and curve summary.
This keeps the complete inventory searchable without placing the full catalog
on the startup path.

## Authoritative data contract

[`data/protectiveDevices.schema.json`](../data/protectiveDevices.schema.json) is
the machine-readable contract for both the production array and staged research
batches. It declares field names, units, nullability, enumerations, curve and
rating structures, source-document metadata, field-level provenance, review
metadata, and conditional calculation-ready requirements.

Internet research must start from
[`protective-device-research-template.json`](protective-device-research-template.json)
and produce `purpose: "protective_device_research_candidates"` records. Research
agents may only set `researchStatus: "candidate"` and
`libraryStatus: "screening"`; they must leave reviewer identity and review date
null. Validate a research batch before review with:

```text
npm run validate:protective-devices -- --research <candidate-file.json>
```

After the batch passes research validation, merge it into the production library
as screening-only inventory with:

```text
npm run promote:protective-devices -- --input <candidate-file.json> --apply
```

This merge preserves `libraryStatus: "screening"` and
`researchStatus: "candidate"`; it does not bypass the human review gate or
make records calculation-ready.

Before a reviewed record is proposed as calculation-ready, run the stricter
promotion contract after setting `researchStatus: "reviewed"`, recording the
human reviewer, and setting `libraryStatus: "calculation_ready"`:

```text
npm run validate:protective-devices -- --promotion <reviewed-file.json>
```

The checked-in production library is also validated automatically at the start
of `npm run build`. Legacy screening records remain readable, but they are not
templates for new research.

| Status | Intended use |
| --- | --- |
| Calculation-ready | Exact configuration, voltage-specific ratings, curve evidence, and independent review are present. Suitable for calculation workflows within the recorded applicability. |
| Source verified — peer review pending | Exact configuration, ratings, and manufacturer curve source are recorded, but the independent review has not been completed. Suitable for controlled checking and peer review, not issued calculations or settings. |
| Standards reference | Uses a published IEC 60255 inverse-time equation family. Verify settings and the associated breaker or recloser before issuing a study. |
| Screening only | Supports preliminary comparison only. The exact manufacturer curve/configuration must be checked before issued calculations, protection settings, or arc-flash clearing times. |

## Promotion gate

A device may declare `libraryStatus: "calculation_ready"` only when it includes:

- an exact `catalogNumber` or `tripUnitModel`;
- voltage-specific `interruptingRatings` for an interrupting device;
- at least two curve points (or curve-profile points);
- `curveEvidence` with the document, revision or date, curve number/page,
  extraction method, and reviewer; and
- an independent review of the transcription and applicability.

The runtime rechecks this gate. A record that claims calculation-ready status
but misses any required field is displayed as **Screening only** instead.

The runtime gate above is a compatibility minimum. The schema and promotion
validator additionally require the documented production applicability fields,
field-level source mapping, verification statuses, last-verified date, curve
spot checks, and independent review metadata. Passing the compatibility gate
alone is not authorization to issue engineering work.

## Source and field provenance

Every new researched record must use `sourceDocuments` for complete source
citations and `fieldSources` to map JSON Pointer field paths to source IDs.
`fieldStatus` must mark each governed field as `verified`, `derived`,
`not_found`, `not_applicable`, or `conflicting`. Technical values marked
verified or derived require a manufacturer, standards-body, regulator, or NRTL
source. A source supporting US market prevalence is also required; distributor
or industry sources may support prevalence but cannot be the sole authority for
ratings, settings, or curves.

Unknown values must remain null, empty arrays, or empty objects and must be
listed in `missingForProduction`. Research agents must not infer interrupting
ratings, withstand ratings, curve bands, settings, or reviewer approval.

## Recording reviewed custom curves

The TCC **Custom Curve Builder** is also a controlled entry path for a local
library. Alongside the curve points, record the exact catalog or trip-unit
identifier, source document, revision/date, curve number or page, extraction
method, reviewer, and—where applicable—the AC voltage and interrupting rating.
Selecting **Promote as calculation-ready** is rejected until the same promotion
gate passes. This preserves incomplete entries as screening curves while still
letting a project team capture source context and complete its review later.

## Graphical engineering review workflow

Engineering reviewers do not need to edit JSON or use a command line to compare
curves in the application. In **TCC Analysis**, select **Select Devices**, filter
to **Screening Only**, select the device, and choose **Open Curve Review**.
The review workspace provides:

- a log-log overlay of the stored library curve and manufacturer source points;
- editable source and stored-point tables, including a paste helper for
  current/time pairs;
- live spot-check results calculated from the stored curve;
- direct access to the cited source document;
- fields for revision, curve/page reference, extraction method, reviewer, date,
  and review notes; and
- a live promotion gate that keeps **Mark calculation-ready** blocked until the
  production requirements pass.

Review progress is saved with the current project through the application's
project storage. The reviewer can save an incomplete review and return to it;
the production library remains unchanged until the reviewed record is
deliberately published through the governed library-promotion workflow.

`data/protectiveDevices.json` is intentionally conservative today: its physical
breaker, fuse, and manufacturer relay records are screening entries until their
source documents and exact configurations are pinned. The IEC 60255 equation
entries are standards references. The research inventory in
[`protective-device-library-research.md`](protective-device-library-research.md)
identifies source-backed candidates; it is not a substitute for promotion.

## Project manufacturer-catalog imports

The Library Manager can import `protective_device` product rows. TCC maps
these rows into the **Project Catalog Devices** selector group, retaining the
manufacturer, catalog number, curve points, voltage-specific ratings, and
curve-provenance fields. Use semicolon-separated `current:time` pairs for the
curve and `voltage:kA` pairs for interrupting ratings. Source-verified imports
must identify the curve document, revision, curve ID/page, and extraction
method. The library still downgrades any incomplete record to **Screening
only**, even when a user-supplied row declares a higher readiness status.
