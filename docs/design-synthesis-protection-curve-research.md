# Motor branch-breaker curve source and geometry

Overall review class: **Screening only**. This advances the protection-data
prerequisite for the [equipment-to-design goal](design-synthesis-acceptance.md).
It does not complete motor protection or enable motor Apply.

For the eight Eaton candidates in the default non-motor synthesis snapshot,
see [Eaton clearing-curve evidence](design-synthesis-eaton-clearing-evidence.md).
That offline milestone records the exact source figures, verified vector
geometry, sparse 125 A raster observations, and unresolved KDB applicability;
it does not add runtime clearing curves.

Selected general breaker candidates now carry their matching source annotation
in the proposal. The workspace, readable report and proposal JSON identify its
source figure and unresolved applicability. The annotation persists in the
existing shared selected-device evidence on Apply. Records that differ from the
reviewed snapshot do not inherit this annotation. No clearing or coordination
calculation is implied.

## Candidate-specific source availability

On October 29, 2026, the official [SIMARIS exact-device viewer](https://curves.simaris.siemens.com/curves/3VA51706EC310AA0#trip)
resolved the earlier source-location gap for **3VA5170-6EC31-0AA0**. The
workspace and reports now retain that source, its version, two archived PDF
fingerprints and selected-setting scope. This supersedes earlier statements
that the exact 70 A graphic had not been located; the numerical protection
and Apply restrictions remain.

The viewer's Details tab identifies 415 V, three poles, TM230 LI, 70 A,
IEC Icu 70 kA and 40 °C. These are the displayed source conditions, not the
480 V UL interrupting or assembly ratings. Frequency, initial thermal state,
installation, boundary meaning, tolerances and applicability at 480 V have
not been established. The proposal records `unqualified-for-480v` explicitly.

Separate four-page raster PDF exports from viewer version
`v2026.10.20-405ccf96` retain the exact catalog identity and In/Ir 70 A with
Ii 350 A and 490 A respectively on page 4; page 1 contains the tripping
graphic. SHA-256 values are:

- 350 A: `487f28195e3761809208a8acbebc7362b822abc1a915144adb08bcec815d9c07`
- 490 A: `fa55fd533b8bc87e2059384bcb34570ab3f4a285e7daff6e63340eaa7d804e15`

The exports and inspected page renders are archived under
`output/design-synthesis-simaris-2026-10-29/`. The viewer URL does not encode
Ii, so it is essential to inspect the setting after reopening. A proposal
with Ii 420/560/630/700 A does not claim an archived setting match; no
proposed setting yields a null match. No plot points, trip times, clearing
envelopes or let-through values were added to runtime calculations. The
30 A graphic is not reused or scaled. Complete motor protection remains
blocked.

The inverse-time starter review now distinguishes its two proposed breakers.
For **3VA5130-6EC31-0AA0**, the proposal records a matching manufacturer graphic,
fingerprint, listed settings, selected proposed pickup, conditions and unresolved
qualifications. Its TCC check remains unevaluated. For **3VA5125-6EC31-0AA0**,
the exact curve source remains missing; it does not inherit the 30 A source.
Selection, conductor floors and Apply restrictions remain unchanged.

Metadata appears in the existing candidate review, JSON and readable report.
Editing a pickup invalidates downloads until regeneration. A listed value
identifies a proposed setting, not an installed or suitable one. Missing or
invalid values remain null in the curve research evidence.

## Manufacturer evidence

The archived [Siemens 3VA5130
graphic](https://cache.industry.siemens.com/dl/files/743/109801743/att_1079474/v1/SIE_TCC_3VA5130_30A_3P_LI_TM210-240.pdf)
is drawing L1V 300 40 333 304 A DS 01, dated February 1, 2018. Its family and
rating table match the 30 A TM230 configuration through the existing Siemens
catalog/product evidence; the full ordering number is not printed. Conditions
include a cold start at 40 °C, open air, all main poles and four feet of 75 °C
wire per terminal. The thermal trace is nominal with illustrated variation.
Separate instantaneous annotations distinguish maximum clearing from minimum
tripping; their meaning must not be extended to thermal clearing.

PDF SHA-256:
`f62f22900761e701bde34df6308fe7c29fd5b2ecdf4a5d2947f882ced0e0c94e`.
Text extraction omitted important raster annotations, so root and Luna inspected
the rendered page. Separate PDF and PNG fingerprints are retained. A bounded
search did not locate a matching 25 A graphic; this does not prove none exists.
The 30 A trace must not be rescaled to fill that gap.

## Reproducible offline transcription

`scripts/extractSiemens3va5130Geometry.py` checks the source hash, stroke indices,
grid anchors and path connectivity before writing raw geometry and research
candidate segments. It does not download or execute manufacturer software.
With Python and `pdfplumber` 0.11.9 installed, archive the linked PDF, verify its hash,
and run:

```text
python scripts/extractSiemens3va5130Geometry.py --pdf path/to/archived.pdf --out-dir output/curve-geometry
python tests/python/test_siemens_geometry.py
```

Six separate 30 A thermal paths end before their instantaneous knees. The tool
maps each knee to a listed setting using the calibrated current axis, rather
than guessing from drawing order. Separate instantaneous fragments retain their
line styles. Each point identifies its source line and PDF coordinates. Plot
clipping excludes hidden geometry outside the axes; no extrapolated tail is
generated.

Time calibration spans all six plotted decades. Anchor residuals and the 2.657 pt
source stroke width distinguish coordinate precision from electrical accuracy.
Endpoint joins tolerate at most 0.001 pt, accommodating observed source rounding
below 0.0003 pt. No thermal tolerance envelope is synthesized from inset
percentages, and no instantaneous fragment becomes a complete clearing curve.
The numbers remain research geometry, separate from runtime trip calculations.

## Verification and remaining work

Root independently checked six knee/setting correspondences, three thermal
source-segment transcriptions and one instantaneous timing annotation without
calling extractor functions. This verifies transcription, not device performance.
Tracked Python tests cover calibration, invalid inputs, clipping, connectivity
and source rejection; archived-source tests exercise the full extraction.

Evidence is under `output/design-synthesis-protection-next-2026-10-21/`, including
the PDF, render, raw geometry, candidate segments and independent checks. No
production protective-device catalog or reviewer identity was modified. Qualified
thermal/clearing envelopes, exact 25 A and overload curves, motor acceleration
and thermal limits, complete fault duty and coordination remain open.
The full goal remains active.

Final verification passed all 446 Node test files, 21 focused Node cases, five
tracked Python checks and three archived-source checks, plus seven selected Edge
cases, build, lint, the generated page-contract audit and whitespace checks.
Root inspected the new 30 A review screenshot and readable report. No source
evidence or module/storage budget was relaxed to obtain these results.
