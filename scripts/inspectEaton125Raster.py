#!/usr/bin/env python3
"""Record sparse, hash-bound pixel observations from Eaton's 125 A chart.

These are research observations, not a digitized or interpolable device curve.
The selected row/column windows are manual source-reading aids. Multiple thick,
missing, oversized or window-clipped runs are blocked rather than guessed.
Thin components are retained explicitly as excluded observations.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from pypdf import PdfReader

PDF_SHA256 = "b7e6ccdb7229f5f2c30573c1dbc64b42fbd22b8e640ecd7ceb82b943cc8d22ff"
PIXELS_SHA256 = "dc006df2ca504f4f36799d6f8601dceb223bdabb9aa100572b5f9713a895ff0e"
NATIVE_SIZE = (2550, 3300)
DARK_THRESHOLD = 110
WINDOW_RADIUS = 15
# (native pixel row, approximate column for minimum, column for maximum).
# No points between these rows are inferred, and no voltage tail is inferred.
READING_WINDOWS = (
    (500, 796, 833), (700, 796, 833), (1000, 810, 853),
    (1200, 836, 894), (1400, 882, 946), (1600, 939, 1005),
    (1800, 986, 1070), (1950, 1020, 1107), (2150, 1030, 1112),
    (2300, 1030, 1112), (2450, 1030, 1112), (2550, 1030, 1127),
    (2600, 1032, 1163), (2640, 1055, 1223),
)


def dark_runs(image, row, center, radius=WINDOW_RADIUS):
    if image.mode != "RGB" or not (0 <= row < image.height and 0 <= center < image.width):
        raise ValueError("reading requires an RGB image and in-image row/column")
    low, high = max(0, center - radius), min(image.width - 1, center + radius)
    groups = []
    for x in range(low, high + 1):
        # Require all channels dark. This excludes the colored voltage tails.
        if max(image.getpixel((x, row))) >= DARK_THRESHOLD:
            continue
        if groups and groups[-1][-1] == x - 1:
            groups[-1].append(x)
        else:
            groups.append([x])
    return [[group[0], group[-1]] for group in groups]


def observe(image, row, center, boundary):
    all_spans = dark_runs(image, row, center)
    spans = [span for span in all_spans if span[1] - span[0] + 1 >= 4]
    thin = [span for span in all_spans if span[1] - span[0] + 1 < 4]
    evidence = {"boundary": boundary, "row": row, "windowCenterColumn": center,
                "excludedThinDarkPixelSpans": thin,
                "selectionBasis": "manual reading window; a unique thick run; thin components excluded by width"}
    low_edge = max(0, center - WINDOW_RADIUS)
    high_edge = min(image.width - 1, center + WINDOW_RADIUS)
    if (len(spans) != 1 or spans[0][1] - spans[0][0] + 1 > 20
            or spans[0][0] == low_edge or spans[0][1] == high_edge):
        return {**evidence, "status": "blocked-ambiguous-or-missing", "observedCandidateSpans": spans}
    low, high = spans[0]
    return {**evidence, "status": "observed-dark-pixels", "darkPixelColumns": [low, high],
            "observedDarkCellRectangle": [low - 0.5, row - 0.5, high + 0.5, row + 0.5]}


def inspect(pdf_path: Path, output_dir: Path):
    digest = hashlib.sha256(pdf_path.read_bytes()).hexdigest()
    if digest != PDF_SHA256:
        raise ValueError("source PDF SHA mismatch; no raster observations written")
    page = PdfReader(pdf_path).pages[44]
    if len(page.images) != 1:
        raise ValueError("125 A source page no longer contains exactly one native image")
    image = page.images[0].image.convert("RGB")
    if image.size != NATIVE_SIZE or hashlib.sha256(image.tobytes()).hexdigest() != PIXELS_SHA256:
        raise ValueError("decoded native pixels differ from the audited source image")
    points = [observe(image, row, center, boundary)
              for row, lower, upper in READING_WINDOWS
              for center, boundary in ((lower, "minimum-tolerance"), (upper, "maximum-tolerance"))]
    payload = {
        "schema": "eaton-fd3125-raster-point-observations-v1",
        "purpose": "offline-source-transcription-research",
        "part": "FD3125", "catalogId": "eaton_series_c_fd3125",
        "source": {"pdfSha256": digest, "decodedRgbPixelsSha256": PIXELS_SHA256,
                   "pageOneBased": 45, "figure": 42, "curveId": "TC012031EN",
                   "document": "TC01200002E, Effective April 2022", "accessedOn": "2026-10-26"},
        "nativeImageSizePixels": list(image.size),
        "status": "sparse-raster-observations-only", "curveComplete": False,
        "interpolationAllowed": False, "clearingEvaluationAllowed": False,
        "method": {"darkThresholdExclusive": DARK_THRESHOLD, "manualWindowRadiusPixels": WINDOW_RADIUS,
                   "minimumRunWidthPixels": 4, "maximumRunWidthPixels": 20,
                   "coordinateConvention": "native image pixel columns/rows from top left; integer pixel centers"},
        "observations": points,
        "unresolved": [
            "No numeric current/time calibration: scan skew, grid positions and reading uncertainty require separate verification.",
            "Sparse row samples are not a continuous source boundary; no interpolation between readings.",
            "Dark-cell rectangles describe only thresholded observed pixels, not the full ink stroke or a manufacturer tolerance enclosure.",
            "No 240/480/600 V tail digitization or connections to thermal/instantaneous segments.",
            "Grid/curve coincidences and excluded single-pole dashed trace require visual source checks.",
            "Thin dark runs are retained as excluded components; a unique thick run does not prove every nearby fragment is a grid line or resolve generic raster ambiguity.",
            "No device-data promotion, clearing-time result, coordination result or Apply permission follows from these observations.",
        ],
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "eaton-fd3125-raster-observations.json").write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return payload


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    result = inspect(args.source, args.output)
    print(json.dumps({"status": result["status"], "observations": len(result["observations"]),
                      "blocked": sum(point["status"].startswith("blocked") for point in result["observations"])}))


if __name__ == "__main__":
    main()
