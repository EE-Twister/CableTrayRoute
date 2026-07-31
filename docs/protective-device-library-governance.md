# Protective Device Library Governance

The Time-Current Curve library labels each bundled device by its evidence and
calculation readiness. This lets a user explore a catalog without mistaking a
representative curve for a released engineering calculation.

The TCC selector's **Filters** group can isolate calculation-ready,
source-verified, standards-reference, or screening-only library records before
curves are selected.

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

## Recording reviewed custom curves

The TCC **Custom Curve Builder** is also a controlled entry path for a local
library. Alongside the curve points, record the exact catalog or trip-unit
identifier, source document, revision/date, curve number or page, extraction
method, reviewer, and—where applicable—the AC voltage and interrupting rating.
Selecting **Promote as calculation-ready** is rejected until the same promotion
gate passes. This preserves incomplete entries as screening curves while still
letting a project team capture source context and complete its review later.

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
