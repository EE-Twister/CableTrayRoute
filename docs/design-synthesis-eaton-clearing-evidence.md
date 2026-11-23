# Eaton breaker clearing-curve evidence

Overall review class: **Screening only**. This is an offline source-transcription
milestone for the [equipment-to-design goal](design-synthesis-acceptance.md).
The application can now read portions of the research geometry under a
hypothetical constant-current assumption. These are graphical readings, not
actual clearing times or approved protective-device records. The goal remains active.

## Source basis and exact candidate scope

The current default synthesis snapshot has seven F-frame candidates and one
K-frame candidate. The mappings below use the actual snapshot identities;
different ampere ratings are not substituted or rescaled.

| Candidate | Rating | One-based PDF page / figure | Curve number | Current evidence |
| --- | ---: | --- | --- | --- |
| FD3020 | 20 A | 32 / 29 | TC012037EN | Separate vector segments |
| HFD3080 | 80 A | 41 / 38 | TC012046EN | Separate vector segments; point-join gap recorded |
| FD3125 | 125 A | 45 / 42 | TC012031EN | Raster-only; 28 sparse pixel observations |
| HFD3150 | 150 A | 46 / 43 | TC012032EN | Vector segments; current-domain gap |
| FD3175 | 175 A | 47 / 44 | TC012033EN | Separate vector segments |
| HFD3200 | 200 A | 48 / 45 | TC012034EN | Vector segments; current-domain gaps |
| FD3225 | 225 A | 49 / 46 | TC012035EN | Vector segments; current-domain gap |
| KDB3400 | 400 A | K-frame 17 / 9 | SC-4118-87B | Configuration applicability unresolved |

The [F-frame source book](https://www.eaton.com/content/dam/eaton/products/electrical-circuit-protection/molded-case-circuit-breakers/series-c-molded-case-circuit-breakers/f-frame-time-current-curves-tc01200002e.pdf)
is TC01200002E, effective April 2022. Each selected figure states a cold start at
rated ambient, open-air testing, all poles in series, and four feet of rated
60/75 °C wire per terminal. Instantaneous tripping is single-pole. The figures
list 600 V AC maximum at 50/60 Hz and 250 V DC maximum; their DC instantaneous
caution is not a DC clearing curve. The numeric ambient is not specified on
these figures. The distinct dashed single-pole 25 °C trace is excluded.

The [Eaton MCCB application guide](https://www.eaton.com/content/dam/eaton/products/design-guides---consultant-audience/cag-documents-from-wcm/molded-case-circuit-breakers-and-enclosures.pdf),
CA08104001E, April 2016, one-based PDF page **41**, printed **27.3-9**, explains
thermal-magnetic minimum/maximum curve bands and total clearing, including
mechanical operation and interruption. This supports interpreting the matching
upper boundary as a maximum total-clearing research candidate. It supplies no
missing plotted points, installation qualification, or variable-current
response model. Its general 40 °C calibration discussion (PDF pages 33 and 69)
does not change the exact figures' ambient wording.

The [K-frame source book](https://www.eaton.com/content/dam/eaton/products/electrical-circuit-protection/molded-case-circuit-breakers/series-c-molded-case-circuit-breakers/k-frame-time-current-curves-td012034en.pdf),
TD012034EN, September 2015, page 17 shows KT thermal-magnetic family curves with
adjustable 5–10× magnetic settings and a percent-of-rated-current axis. The
[KDB3400 product page](https://www.eaton.com/us/en-us/skuPage.KDB3400.html),
checked October 26, describes fixed thermal/fixed magnetic operation and lists
trip type T186. The exact relationship requires manufacturer clarification;
neither a 5× nor a 10× setting is inferred. KDB3400 remains outside the F-frame
extraction.

Eaton's [February 2015 K-frame installation leaflet](https://www.eaton.com/content/dam/eaton/products/electrical-circuit-protection/molded-case-circuit-breakers/series-c-molded-case-circuit-breakers/k-frame-breakers-il29c104e.pdf),
IL 29C104E, describes adjustable magnetic trip units for the K-frame family and
lists KDB among its breaker types. It does not establish the setting of a
particular KDB3400 or reconcile the current product page's fixed-magnetic
description. A family-level installation instruction is insufficient to select
the applicable 400 A curve or setting for this catalog record. Manufacturer
clarification remains necessary before numerical curve research is enabled.

The [F-frame technical leaflet](https://www.eaton.com/content/dam/eaton/products/electrical-circuit-protection/molded-case-circuit-breakers/series-c-f-frame-mccb-td01203013e.PDF),
TD01203013E, March 2011, provides family/type information, not replacement
time-current curves.

## Source integrity

Archived files and renders are under
`output/design-synthesis-device-clearing-evidence-2026-10-26/sources/`.
The primary document URLs above identify the documents. The identical content
paths on Eaton's `origin-edge.eaton.com` host supplied the archived bytes when
the main host timed out. Page counts, extraction topology, and SHA-256 values
are retained in `source-intake.json`.

| Archived document | Pages | SHA-256 |
| --- | ---: | --- |
| TC01200002E | 62 | `b7e6ccdb7229f5f2c30573c1dbc64b42fbd22b8e640ecd7ceb82b943cc8d22ff` |
| TD012034EN | 48 | `a6823a8fbf821131606a0b8b999f5ced5ffeb47299b87b55dfd57cae24a778d1` |
| CA08104001E MCCB application guide | 136 | `6127c25f31b46d4af3747415bfc7e40deb95a061e64fe4f31b854e7267086838` |
| TD01203013E | 12 | `7bdda03230131e4b640aa6549b4cd450e8fc232c3a6e2b890632143c2208bdca` |

## Reproducible extraction and its limits

With Python, `pdfplumber` 0.11.9, `pypdf` 6.10.0 and Pillow 12.3.0, archive the
linked F-frame PDF locally and run:

```text
python scripts/extractEatonFFrameGeometry.py --source path/to/f-frame.pdf --output output/eaton-geometry
python scripts/inspectEaton125Raster.py --source path/to/f-frame.pdf --output output/eaton-geometry
python tests/python/test_eaton_f_frame_geometry.py
python tests/python/test_eaton_raster_observations.py
```

The pure algorithm tests run without an archived manufacturer PDF. Full-source
acceptance checks run when the pinned PDF exists at the documented evidence
location; otherwise those two checks are explicitly skipped. Both ran here.

The vector tool checks the PDF hash, all major grid anchors, path counts,
colors, widths, and dashed/filled topology. Original cubic/line commands and
separate plotted runs are retained. Adaptive cubic subdivision bounds distance
to the **finite** endpoint chord by 0.005 PDF points; a distance to the infinite
line would miss collinear overshoot. Rectangle clipping preserves disconnected
exit/re-entry runs. Only exactly equal adjacent coordinates are shared; observed
endpoint gaps are never stitched. Run-wise current-domain unions expose gaps
that a single minimum/maximum bounding interval could hide.

Each voltage candidate retains minimum and maximum boundaries separately.
Maximum candidates use the common black boundary and the correct separate
240/480/600 V colored tail. The dashed single-pole trace and filled arrows are
excluded. Axes are amperes and seconds on log scales. Grid-fit residuals and
source widths are recorded as graphical uncertainty, not electrical accuracy.
The 0.001-point join threshold is a diagnostic, not permission to interpolate.

The largest observed point join is 0.00116619 pt (HFD3080). Its current domains
overlap, so segments are retained without certifying point connectivity.
Actual source current gaps of 0.0002–0.0005 pt remain on the 150/200/225 A
figures. Stroke-width enclosures could describe visible ink overlap, but do not
establish joined centerlines or new manufacturer tolerance bands. These records
remain blocked for whole-domain clearing evaluation.

The 125 A tool verifies both PDF bytes and decoded 2550×3300 RGB pixels. It
records 28 manually located, thresholded black-pixel spans at 14 rows, rejecting
missing, multiple thick, oversized and window-clipped runs. Thin 1–3-pixel
components are retained as excluded evidence; 13 reading windows contain them.
A unique thick run is not a generic raster-ambiguity proof. It emits no current/time
values, interpolated connections, voltage tails, or complete curve. Cell
rectangles describe observed dark pixels only. Scan/grid calibration, full-stroke
uncertainty, continuous tracing and independent digitization remain open.

No boundary is extrapolated below the 0.01 s plot floor, past a source endpoint,
or to the part's interrupting rating. A plotted clearing domain may end below
that rating. TCCs alone do not establish let-through energy or a response to a
time-varying fault-current history.

## Verification and next calculation milestone

The focused suite includes finite-chord overshoot, disconnected clipping,
within-path domain gaps, exact source rejection, grid calibration, all seven
part mappings, and ambiguous raster readings. The independent checker evaluates
the original PDF's cubic Bernstein forms at three parameters per cubic and
line midpoints for every selected boundary and voltage tail. It imports no
extractor functions and independently locates the axis endpoints. Results and
the final repository gates are recorded in the evidence folder's
`verification.json`.

The Design Synthesis proposal now attaches a compact source annotation to each
selected device that exactly matches the reviewed snapshot record. Altered or
unrecognized records do not inherit the annotation. The workspace, JSON and
readable report identify the figure, source status and limitations. Existing
selected-device evidence storage retains the complete annotation through Apply
and named-project reload. The saved source review is visible when returning to
Design Synthesis; missing or changed referenced evidence is identified instead
of being displayed as current. The saved review also compares the present
circuit or transformer voltage with the selected device's evaluated voltage.
Actual clearing and coordination remain unevaluated. Offline geometry JSON is
not a promotable device research batch. Future device records
must use the governed research template and remain `researchStatus: candidate`,
`libraryStatus: screening`, with human review fields unset.

The [evidence-storage guide](design-synthesis-evidence-storage.md) records a
lossless active-storage encoding and a measured 281,748-byte reduction for the
25-to-50-load mixed-voltage fixture. Additional project data can still exhaust
the unchanged 5 MiB limit; a failed durable save must roll back rather than
report a successful Apply.

The selected input record must match every field of the current bundled record;
the bundled record must also retain its pinned FNV fingerprint. FNV is a
non-cryptographic change detector, not source authentication. Re-review changed
catalog data and update the pinned evidence together. F-frame plot tails are
labeled 240/480/600 V; this annotation does not qualify other voltages such as
208 V for clearing evaluation.

Referenced cable and transformer device evidence is returned only while its
stored content fingerprint matches the reference and the available inline
device summary still agrees. A changed or missing referenced record resolves to
no evidence; older inline-only records remain readable. The FNV fingerprint is
an accidental-change detector and does not authenticate project data.

## Constant-current graphical research

For an exact, unchanged matching F-frame snapshot record and a 240, 480, or
600 V plotted tail, the device fault review can use its observed maximum
through-device initial RMS current as a **hypothetical constant current**. The
result is an upper graphical reading from the plotted maximum-tolerance boundary,
not an actual clearing time. Source changes, unsupported devices or voltages,
disconnected gaps, and readings that reach a chart boundary return no number.
The 125 A raster and KDB3400 remain unavailable. Neither initial RMS nor this
chart reading describes how fault current evolves with time.

The evaluation retains separate original plot runs and considers the full
horizontal query uncertainty band, including the plotted stroke, flattening
error, and grid-fit residual. It takes the longest graphical time over all
intersections, accounting for either axis direction. These are graphical
uncertainties, not manufacturer electrical tolerances. The saved compact fault
evidence pins the dataset fingerprint; a changed or missing dataset, device, or
voltage cannot silently produce a saved reading. Saved readings are expressly
marked as not revalidated against the current project. The fingerprint detects
accidental changes; it is not authentication.

The 49 KB `data/designSynthesisEatonCurveResearch.json` is derived from the
hash-pinned geometry with `scripts/buildEatonCurveResearchData.py`. Separate
analytic tests cover both time-axis directions, vertical/multiple intersections,
gaps and boundaries. An independent test reads original PDF cubic paths and
grid anchors directly and checks 84 supported readings against their source
centerlines. These checks do not turn the graphical data into manufacturer
certification or establish variable-current relay response.

Next: complete independently bounded 125 A digitization, qualify exact KDB3400
applicability, and validate a source-supported variable-current clearing and
thermal model end to end.
Motor overload curves, acceleration/damage limits, assembly protection and
coordination remain separate requirements. Motor Apply remains blocked.

## 125 A historical-source investigation

On October 27, 2026, the Eaton-authored
[March 2018 F-frame book](https://media.cityelectricsupply.com/media/cutlerhammerbyeaton/ehd2030/documents/ch_linedrawing_964436.pdf)
was compared with the April 2022 book. Its PDF SHA-256 is
`f672823837b36e2d72d14f01ad4f859edd938cd0da78a0b7893839b6ff0fe621`.
Figure 42, physical page 45, contains a single raster image for the 125 A
TC012031EN graph. The decoded 2550 × 3300 RGB image has SHA-256
`dc006df2ca504f4f36799d6f8601dceb223bdabb9aa100572b5f9713a895ff0e`,
identical to the decoded graph in the April 2022 book. The older PDF therefore
offers neither a higher-resolution graph nor an independent digitization check.
The hashes identify the files and decoded pixels inspected; they are not proof
of document authenticity or electrical accuracy.

The revision notes in the books identify an April 2018 correction to the 110 A
and 125 A maximum single-pole trip curves. An earlier version of TC012031EN must
not be substituted for the current graph solely because it has the same curve
number. Any proposed use of an older vector source requires confirmation of the
exact applicable traces and a documented, independently bounded comparison
against the corrected manufacturer graph. The current 125 A record remains
unavailable for numerical graphical evaluation until those gaps are resolved.
