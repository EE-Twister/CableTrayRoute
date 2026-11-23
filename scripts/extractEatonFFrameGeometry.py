#!/usr/bin/env python3
"""Extract offline vector geometry from the pinned Eaton F-frame TCC PDF.

This is a research artifact generator only. It does not create application
catalog records or claim that traced curves are approved device data.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
from typing import Any

try:
    import pdfplumber
except ImportError as exc:  # pragma: no cover - environment diagnostic
    raise SystemExit("pdfplumber is required to extract the archived PDF") from exc


SOURCE_NAME = "f-frame-time-current-curves-tc01200002e.pdf"
SOURCE_SHA256 = "b7e6ccdb7229f5f2c30573c1dbc64b42fbd22b8e640ecd7ceb82b943cc8d22ff"
SOURCE_URL = "https://www.eaton.com/content/dam/eaton/products/electrical-circuit-protection/molded-case-circuit-breakers/series-c-molded-case-circuit-breakers/f-frame-time-current-curves-tc01200002e.pdf"
ACCESS_DATE = "2026-10-26"
FLATNESS_PT = 0.005
MAX_JOIN_GAP_PT = 0.001
GRID_TOLERANCE_PT = 0.01

# Exact application catalog projection and corresponding manufacturer figures.
PARTS = (
    {"part": "FD3020", "catalogId": "eaton_series_c_fd3020", "amps": 20, "page": 32, "figure": 29, "curveId": "TC012037EN"},
    {"part": "HFD3080", "catalogId": "eaton_series_c_hfd3080", "amps": 80, "page": 41, "figure": 38, "curveId": "TC012046EN"},
    {"part": "FD3125", "catalogId": "eaton_series_c_fd3125", "amps": 125, "page": 45, "figure": 42, "curveId": "TC012031EN"},
    {"part": "HFD3150", "catalogId": "eaton_series_c_hfd3150", "amps": 150, "page": 46, "figure": 43, "curveId": "TC012032EN"},
    {"part": "FD3175", "catalogId": "eaton_series_c_fd3175", "amps": 175, "page": 47, "figure": 44, "curveId": "TC012033EN"},
    {"part": "HFD3200", "catalogId": "eaton_series_c_hfd3200", "amps": 200, "page": 48, "figure": 45, "curveId": "TC012034EN"},
    {"part": "FD3225", "catalogId": "eaton_series_c_fd3225", "amps": 225, "page": 49, "figure": 46, "curveId": "TC012035EN"},
)

# Axis calibration is independently pinned per figure. Grid points correspond
# to 10, 100, 1k, 10k, 100k, 1M A and 1e4, 1e3, ..., 1e-2 s respectively.
PAGE_GRIDS = {
    32: {
        "x": [75.8143, 162.9163, 249.9323, 336.9483, 423.9523, 511.0323],
        "y": [80.4563, 182.5593, 284.6943, 386.8303, 488.9763, 591.1123, 693.2039],
    },
    41: {
        "x": [101.9278, 189.0518, 276.0778, 363.1048, 450.1318, 537.2328],
        "y": [78.5919, 180.7599, 282.7869, 384.9449, 487.1019, 589.2589, 691.3410],
    },
    46: {
        "x": [87.4023, 175.0033, 262.5183, 350.0343, 437.5493, 525.1393],
        "y": [82.4264, 183.6274, 284.7964, 385.9644, 487.1324, 588.3014, 689.4271],
    },
    47: {
        "x": [108.9847, 196.5857, 284.1007, 371.6167, 459.1317, 546.7217],
        "y": [83.7940, 184.9950, 286.1640, 387.3320, 488.5000, 589.6690, 690.7947],
    },
    48: {
        "x": [94.8080, 182.4090, 269.9240, 357.4400, 444.9550, 532.5450],
        "y": [83.2621, 184.4631, 285.6321, 386.8001, 487.9681, 589.1371, 690.2628],
    },
    49: {
        "x": [107.4271, 195.0281, 282.5431, 370.0591, 457.5741, 545.1641],
        "y": [84.7621, 185.9631, 287.1321, 388.3001, 489.4681, 590.6371, 691.7628],
    },
}
X_VALUES = [10.0 ** n for n in range(1, 7)]
Y_VALUES = [10.0 ** n for n in range(4, -3, -1)]


class ExtractionError(RuntimeError):
    pass


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _axis_fit(observed: list[float], expected: list[float], values: list[float]) -> dict[str, Any]:
    if len(values) < 2 or len(observed) != len(values) or len(expected) != len(values):
        raise ExtractionError("axis calibration requires all major grid lines")
    if (not all(math.isfinite(value) for value in observed + expected + values)
            or any(value <= 0 for value in values)
            or any(right <= left for left, right in zip(observed, observed[1:]))):
        raise ExtractionError("axis calibration requires finite increasing coordinates and positive values")
    value_steps = [right - left for left, right in zip(values, values[1:])]
    if not (all(step > 0 for step in value_steps) or all(step < 0 for step in value_steps)):
        raise ExtractionError("axis values must be strictly monotone")
    # Anchor the calibration to the actual plotted endpoint gridlines so every
    # emitted clipped point maps inside the documented log-axis range.
    slope = (math.log10(values[-1]) - math.log10(values[0])) / (observed[-1] - observed[0])
    intercept = math.log10(values[0]) - slope * observed[0]
    residuals = [abs(math.log10(value) - (intercept + slope * coordinate)) for coordinate, value in zip(observed, values)]
    # Retain all scale residuals; fail above 0.001 decades (about 0.23%).
    if max(residuals) > 0.001:
        raise ExtractionError(f"axis calibration residual too large: {max(residuals):.6g} decades")
    coordinate_residuals = [abs(a - b) for a, b in zip(observed, expected)]
    if max(coordinate_residuals) > GRID_TOLERANCE_PT:
        raise ExtractionError(f"grid coordinates differ from audited figure coordinates: {max(coordinate_residuals):.6g} pt")
    return {
        "log10ValuePerPoint": slope,
        "log10ValueIntercept": intercept,
        "maxLog10Residual": max(residuals),
        "gridCoordinateResidualsPt": coordinate_residuals,
    }


def _grid_coordinates(page: Any, expected: dict[str, list[float]]) -> tuple[list[float], list[float]]:
    vertical: list[float] = []
    horizontal: list[float] = []
    for line in page.lines:
        if abs(float(line.get("linewidth") or 0) - 0.269) > 0.01:
            continue
        x0, x1 = float(line["x0"]), float(line["x1"])
        top, bottom = float(line["top"]), float(line["bottom"])
        if abs(top - bottom) < 1e-6 and abs(x1 - x0) > 100:
            horizontal.append(top)
        elif abs(x1 - x0) < 1e-6 and abs(bottom - top) > 100:
            vertical.append(x0)
    x = _match_audited_grid(vertical, expected["x"])
    y = _match_audited_grid(horizontal, expected["y"])
    return x, y


def _match_audited_grid(observed: list[float], expected: list[float]) -> list[float]:
    if len(observed) < len(expected):
        raise ExtractionError("major grid lines are missing")
    matched = []
    for target in expected:
        candidate = min(observed, key=lambda value: abs(value - target))
        if abs(candidate - target) > GRID_TOLERANCE_PT:
            raise ExtractionError(f"major grid coordinate {target:.4f} pt not found")
        matched.append(candidate)
    if len(set(matched)) != len(expected):
        raise ExtractionError("major grid calibration matched duplicate lines")
    return matched


def _point_distance_to_segment(point: tuple[float, float], start: tuple[float, float], end: tuple[float, float]) -> float:
    dx, dy = end[0] - start[0], end[1] - start[1]
    if dx == 0 and dy == 0:
        return math.hypot(point[0] - start[0], point[1] - start[1])
    projection = ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / (dx * dx + dy * dy)
    projection = max(0.0, min(1.0, projection))
    return math.hypot(point[0] - start[0] - projection * dx, point[1] - start[1] - projection * dy)


def _split_cubic(p0, p1, p2, p3):
    p01 = ((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2)
    p12 = ((p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2)
    p23 = ((p2[0] + p3[0]) / 2, (p2[1] + p3[1]) / 2)
    p012 = ((p01[0] + p12[0]) / 2, (p01[1] + p12[1]) / 2)
    p123 = ((p12[0] + p23[0]) / 2, (p12[1] + p23[1]) / 2)
    mid = ((p012[0] + p123[0]) / 2, (p012[1] + p123[1]) / 2)
    return (p0, p01, p012, mid), (mid, p123, p23, p3)


def _flatten_cubic(p0, p1, p2, p3, tolerance=FLATNESS_PT, depth=0):
    # The convex hull of the controls lies within this capsule around the
    # finite chord. Distance to its infinite line would miss collinear
    # overshoot, including reversals outside the endpoints.
    deviation = max(_point_distance_to_segment(p1, p0, p3), _point_distance_to_segment(p2, p0, p3))
    if deviation <= tolerance:
        return [p3]
    if depth >= 32:
        raise ExtractionError("Bezier flattening exceeded bounded recursion depth")
    left, right = _split_cubic(p0, p1, p2, p3)
    return _flatten_cubic(*left, tolerance, depth + 1) + _flatten_cubic(*right, tolerance, depth + 1)


def _path_segments(curve: dict[str, Any]) -> list[dict[str, Any]]:
    path = curve.get("path")
    if not path or path[0][0] != "m":
        raise ExtractionError("curve path is missing its initial move command")
    segments = []
    current = tuple(float(value) for value in path[0][1])
    subpath_start = current
    for command in path[1:]:
        op = command[0]
        args = [tuple(float(value) for value in item) for item in command[1:]]
        if op == "l":
            end = args[0]
            segments.append({"kind": "line", "from": current, "to": end, "points": [current, end]})
            current = end
        elif op == "c":
            if len(args) != 3:
                raise ExtractionError("cubic Bezier command has wrong arity")
            points = [current, *_flatten_cubic(current, *args)]
            segments.append({"kind": "cubic", "from": current, "controls": args[:2], "to": args[2], "points": points})
            current = args[2]
        elif op == "h":
            segments.append({"kind": "close", "from": current, "to": subpath_start, "points": [current, subpath_start]})
            current = subpath_start
        else:
            raise ExtractionError(f"unsupported path command {op!r}")
    return segments


def _clip_segment(points, xmin, xmax, ymin, ymax):
    # Return separate in-plot runs. A path may exit and re-enter the rectangle;
    # joining those intersections would invent an in-plot line.
    runs = []
    current_run = None
    for start, end in zip(points, points[1:]):
        x0, y0 = start
        x1, y1 = end
        dx, dy = x1 - x0, y1 - y0
        t0, t1 = 0.0, 1.0
        for p, q in ((-dx, x0 - xmin), (dx, xmax - x0), (-dy, y0 - ymin), (dy, ymax - y0)):
            if abs(p) < 1e-15:
                if q < 0:
                    t0, t1 = 1.0, 0.0
                    break
                continue
            ratio = q / p
            if p < 0:
                t0 = max(t0, ratio)
            else:
                t1 = min(t1, ratio)
            if t0 > t1:
                break
        if t0 <= t1:
            first = [x0 + t0 * dx, y0 + t0 * dy]
            last = [x0 + t1 * dx, y0 + t1 * dy]
            if current_run is None or current_run[-1] != first:
                current_run = [first]
                runs.append(current_run)
            if current_run[-1] != last:
                current_run.append(last)
            if t1 < 1.0:
                current_run = None
        else:
            current_run = None
    if len(points) == 1:
        x, y = points[0]
        if xmin <= x <= xmax and ymin <= y <= ymax:
            runs.append([[x, y]])
    return runs


def _backtracks(points):
    directions = []
    for left, right in zip(points, points[1:]):
        delta = right[0] - left[0]
        if abs(delta) > 1e-9:
            directions.append(1 if delta > 0 else -1)
    return any(left != right for left, right in zip(directions, directions[1:]))


def _curve_summary(curve: dict[str, Any]) -> dict[str, Any]:
    return {
        "index": int(curve["index"]),
        "strokeWidthPt": float(curve["linewidth"] or 0),
        "strokeColor": curve.get("stroking_color"),
        "dash": curve.get("dash"),
        "fill": bool(curve.get("fill")),
        "boundsPt": [float(curve[k]) for k in ("x0", "x1", "top", "bottom")],
        "pathCommands": len(curve["path"]),
        "path": [[entry[0], *[[float(v) for v in item] for item in entry[1:]]] for entry in curve["path"]],
    }


def _curve_classification(curves: list[dict[str, Any]]) -> None:
    if len(curves) != 11:
        raise ExtractionError(f"expected 11 source paths, found {len(curves)}")
    for index in [0, 1, 2, 3, 5]:
        curve = curves[index]
        dash = curve.get("dash")
        solid = dash is None or (isinstance(dash, (tuple, list)) and len(dash) == 2 and dash[0] == [])
        if curve.get("fill") or not solid:
            raise ExtractionError(f"expected solid unfilled black source curve at index {index}")
        if not isinstance(curve.get("stroking_color"), (int, float)) or float(curve["stroking_color"]) != 0:
            raise ExtractionError(f"expected black source curve at index {index}")
        if not 2.14 <= float(curve.get("linewidth") or 0) <= 2.18:
            raise ExtractionError(f"unexpected line width at source curve {index}")
    dash4 = curves[4].get("dash")
    if dash4 is None or (isinstance(dash4, (tuple, list)) and len(dash4) == 2 and dash4[0] == []) or curves[4].get("fill"):
        raise ExtractionError("excluded single-pole curve index 4 no longer has dashed-line topology")
    if any(not curves[i].get("fill") or float(curves[i].get("linewidth") or 0) > 1 for i in (9, 10)):
        raise ExtractionError("expected filled arrow marker paths at source indices 9 and 10")
    expected_colors = ([0.745, 0.294, 0.282], [0.275, 0.667, 0.773], [0.965, 0.573, 0.251])
    for index, expected in zip((6, 7, 8), expected_colors):
        color = curves[index].get("stroking_color")
        if not isinstance(color, (tuple, list)) or len(color) != 3 or any(abs(float(a) - b) > 0.002 for a, b in zip(color, expected)):
            raise ExtractionError(f"voltage-tail curve {index} changed color/topology")
        if not 2.40 <= float(curves[index].get("linewidth") or 0) <= 2.46:
            raise ExtractionError(f"unexpected voltage-tail width at source curve {index}")


def _geometry_for_curve(curve, plot):
    xmin, xmax, ymin, ymax = plot
    segments = _path_segments(curve)
    runs = []
    for segment in segments:
        clipped = _clip_segment(segment["points"], xmin, xmax, ymin, ymax)
        segment["clippedPlotRunsPt"] = clipped
        if not clipped:
            continue
        for run in clipped:
            if runs:
                segment["sourceJoinGapBeforePt"] = math.dist(runs[-1][-1], run[0])
            # Only exactly identical adjacent source coordinates are shared.
            # A small observed gap is evidence, never an interpolation rule.
            if runs and runs[-1][-1] == run[0]:
                runs[-1].extend(run[1:])
            else:
                runs.append(list(run))
    if not runs:
        raise ExtractionError(f"source curve {curve['index']} has no points inside the plot")
    return {
        "index": int(curve["index"]),
        "segments": segments,
        "plottedPolylineRunsPt": runs,
        "sourceBacktracksInCurrent": any(_backtracks(run) for run in runs),
        "maxFlatteningDeviationPt": FLATNESS_PT,
    }


def _check_joins(geometries):
    gaps = []
    for left, right in zip(geometries, geometries[1:]):
        left_end = left["plottedPolylineRunsPt"][-1][-1]
        right_start = right["plottedPolylineRunsPt"][0][0]
        gap = math.dist(left_end, right_start)
        left_domains = _current_domains([left])
        right_domains = _current_domains([right])
        overlaps = [min(a[1], b[1]) - max(a[0], b[0]) for a in left_domains for b in right_domains]
        overlap = max(overlaps)
        gaps.append({"fromCurveIndex": left["index"], "toCurveIndex": right["index"], "gapPt": gap,
                     "pointJoinWithinLimit": gap <= MAX_JOIN_GAP_PT,
                     "fromCurrentDomainsPt": left_domains,
                     "toCurrentDomainsPt": right_domains,
                     "currentDomainOverlapPt": max(0.0, overlap),
                     "currentDomainsOverlap": overlap >= -1e-12})
    return gaps


def _current_domains(geometries):
    intervals = sorted((min(point[0] for point in run), max(point[0] for point in run))
                       for geometry in geometries for run in geometry["plottedPolylineRunsPt"] if run)
    union = []
    for low, high in intervals:
        if union and low <= union[-1][1]:
            union[-1][1] = max(union[-1][1], high)
        else:
            union.append([low, high])
    return union


def _to_log_curve(geometry, xfit, yfit):
    runs = []
    for run in geometry["plottedPolylineRunsPt"]:
        points = []
        for x, y in run:
            logi = xfit["log10ValueIntercept"] + xfit["log10ValuePerPoint"] * x
            logt = yfit["log10ValueIntercept"] + yfit["log10ValuePerPoint"] * y
            points.append({"currentA": 10.0 ** logi, "timeSeconds": 10.0 ** logt, "pdfXPt": x, "pdfYPt": y})
        runs.append(points)
    return {"sourceCurveIndex": geometry["index"], "runs": runs}


def extract(pdf_path: Path, output_dir: Path) -> dict[str, Any]:
    observed_sha = _sha256(pdf_path)
    if observed_sha != SOURCE_SHA256:
        raise ExtractionError(f"source SHA mismatch: expected {SOURCE_SHA256}, got {observed_sha}")
    output_dir.mkdir(parents=True, exist_ok=True)
    records = []
    with pdfplumber.open(pdf_path) as pdf:
        for part in PARTS:
            page_index = part["page"] - 1
            page = pdf.pages[page_index]
            if part["page"] == 45:
                if len(page.curves) or len(page.lines) or len(page.images) != 1:
                    raise ExtractionError("FD3125 figure topology changed from audited raster-only page")
                image = page.images[0]
                records.append({
                    **part,
                    "status": "blocked-raster-only",
                    "reason": "Fig. 42 is a single embedded raster image; this vector extractor does not digitize raster figures.",
                    "pageTopology": {"curves": len(page.curves), "lines": len(page.lines), "images": len(page.images)},
                    "embeddedImageBoundsPt": {key: float(image[key]) for key in ("x0", "top", "x1", "bottom", "width", "height")},
                    "curves": [],
                })
                continue
            if part["page"] not in PAGE_GRIDS:
                raise ExtractionError(f"missing audited grid calibration for page {part['page']}")
            curves = [{**curve, "index": index} for index, curve in enumerate(page.curves)]
            _curve_classification(curves)
            expected = PAGE_GRIDS[part["page"]]
            xgrid, ygrid = _grid_coordinates(page, expected)
            xfit = _axis_fit(xgrid, expected["x"], X_VALUES)
            yfit = _axis_fit(ygrid, expected["y"], Y_VALUES)
            plot = (xgrid[0], xgrid[-1], ygrid[0], ygrid[-1])
            allcurve_geometry = [_geometry_for_curve(curve, plot) for curve in curves]
            curve_by_index = {int(curve["index"]): curve for curve in curves}
            geometry_by_index = {item["index"]: item for item in allcurve_geometry}
            raw_curves = []
            for curve in curves:
                index = int(curve["index"])
                raw_curves.append({**_curve_summary(curve), **geometry_by_index[index]})
            voltage_candidates = []
            join_evidence_all = []
            has_current_domain_gap = False
            for voltage, tail_index in ((240, 6), (480, 7), (600, 8)):
                minimum_indexes = [0, 2]
                maximum_indexes = [1, 3, 5, tail_index]
                joins = _check_joins([geometry_by_index[index] for index in minimum_indexes])
                joins += _check_joins([geometry_by_index[index] for index in maximum_indexes])
                join_evidence_all.extend([{**join, "voltageV": voltage} for join in joins])
                domains = {"minimum": _current_domains([geometry_by_index[index] for index in minimum_indexes]),
                           "maximum": _current_domains([geometry_by_index[index] for index in maximum_indexes])}
                domain_complete = all(len(intervals) == 1 for intervals in domains.values())
                has_current_domain_gap = has_current_domain_gap or not domain_complete
                voltage_candidates.append({
                    "voltageV": voltage,
                    "minimumCurveIndices": minimum_indexes,
                    "maximumCurveIndices": maximum_indexes,
                    "joinGapEvidencePt": joins,
                    "pointConnectivityVerified": all(join["pointJoinWithinLimit"] for join in joins),
                    "currentDomainComplete": domain_complete,
                    "currentDomainUnionsPt": domains,
                    "observedCurrentDomainCoverage": "contiguous-via-overlap" if domain_complete else "incomplete-gap",
                    "sourceVoltageTailCurveIndex": tail_index,
                    "sourceTailStrokeWidthPt": float(curve_by_index[tail_index]["linewidth"]),
                    "geometricUncertainty": {
                        "sourceStrokeWidthsPt": {str(index): float(curve_by_index[index]["linewidth"]) for index in sorted(set(minimum_indexes + maximum_indexes))},
                        "maxAxisLog10Residual": max(xfit["maxLog10Residual"], yfit["maxLog10Residual"]),
                        "flatteningMaximumDeviationPt": FLATNESS_PT,
                    },
                    "minimumSegments": [_to_log_curve(geometry_by_index[index], xfit, yfit) for index in minimum_indexes],
                    "maximumSegments": [_to_log_curve(geometry_by_index[index], xfit, yfit) for index in maximum_indexes],
                })
            records.append({
                **part,
                "status": "blocked-current-domain-gap" if has_current_domain_gap else "vector-segments-extracted-candidate",
                "pointConnectivityVerified": all(item["pointJoinWithinLimit"] for item in join_evidence_all),
                "overLimitJoinEvidence": [item for item in join_evidence_all if not item["pointJoinWithinLimit"]],
                "currentDomainGapEvidence": [item for item in join_evidence_all if not item["currentDomainsOverlap"]],
                "reason": "Source curves are emitted as original separate subpaths; no endpoint stitching or interpolation is performed."
                         if not has_current_domain_gap else "One or more selected curve groups have an unrepresented current-domain interval; candidate coverage is incomplete.",
                "pageTopology": {"curves": len(curves), "lines": len(page.lines), "images": len(page.images)},
                "plotBoundsPt": {"xMin": plot[0], "xMax": plot[1], "yMin": plot[2], "yMax": plot[3]},
                "axisCalibration": {"xCurrentA": xfit, "yTimeSeconds": yfit,
                                    "xMajorGridPdfPt": xgrid, "yMajorGridPdfPt": ygrid,
                                    "xMajorGridValuesA": X_VALUES, "yMajorGridValuesSeconds": Y_VALUES},
                "excludedCurveIndices": {"dashedMaxSinglePole25C": [4], "filledArrowMarkers": [9, 10]},
                "curves": raw_curves,
                "voltageCandidateDomains": voltage_candidates,
                "interpretationBoundary": "Geometric source candidates only; no runtime use or device-data promotion. Each source path remains a separate subpath; joins are evidence only, never repaired. Dashed 25 C single-pole curve and arrows excluded; no extrapolation beyond plotted axes.",
            })
    payload = {
        "schema": "eaton-f-frame-vector-geometry-research-v2",
        "source": {"file": SOURCE_NAME, "url": SOURCE_URL, "sha256": observed_sha,
                   "accessedOn": ACCESS_DATE, "printedDocument": "TC01200002E, Effective April 2022"},
        "conditions": {"intendedUse": "application and coordination purposes only",
                       "initialState": "cold", "ambient": "rated ambient temperature; numeric value not specified on these figures",
                       "terminalWire": "four feet of rated 60/75 C wire per terminal",
                       "testConfiguration": "all poles in series, open air; instantaneous tripping is single pole",
                       "maximumAcV": 600, "frequencyHz": [50, 60], "maximumDcV": 250,
                       "dcInstantaneousCaution": "may be 42% higher for dc voltages; these AC voltage-tail candidates are not DC clearing curves"},
        "method": {"flatteningMaximumDeviationPt": FLATNESS_PT,
                   "maximumAcceptedPathJoinGapPt": MAX_JOIN_GAP_PT,
                   "joinGapsArePreserved": True,
                   "currentTimeAxes": "log-log; current A and seconds, clipped to plotted major-grid rectangle",
                   "curveWidthsTreatedAsGeometricUncertainty": True,
                   "tailCurveMap": {"240": 6, "480": 7, "600": 8}},
        "records": records,
    }
    output_path = output_dir / "eaton-f-frame-vector-geometry.json"
    output_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    summary_lines = [
        "Eaton F-frame vector geometry extraction (research candidates only)",
        f"Source SHA-256: {observed_sha}",
        f"Accessed: {ACCESS_DATE}; document TC01200002E, effective April 2022",
        "Axes: 10–1,000,000 A and 0.01–10,000 s, log-log; no extrapolation.",
        f"Bezier flatness bound: {FLATNESS_PT:.3f} pt; join acceptance: {MAX_JOIN_GAP_PT:.3f} pt.",
        "Excluded: dashed max single-pole 25 C curve (source index 4) and filled arrows (9, 10).",
        "Candidate classes: min=[0,2]; max=[1,3,5,voltage tail], tails 6/7/8=240/480/600 V.",
        "Source stroke widths and axis residuals are retained as geometric uncertainty, not tolerance bands.",
        "",
    ]
    for record in records:
        summary_lines.append(f"{record['part']} page {record['page']} Fig.{record['figure']}: {record['status']}")
        if record["status"] == "blocked-raster-only":
            summary_lines.append("  No vector curves: one embedded raster image; raster digitization not performed.")
        for gap in record.get("overLimitJoinEvidence", []):
            summary_lines.append(f"  Blocked join curve {gap['fromCurveIndex']}→{gap['toCurveIndex']}: {gap['gapPt']:.9f} pt")
        for gap in record.get("currentDomainGapEvidence", []):
            summary_lines.append(
                f"  Current-domain gap curves {gap['fromCurveIndex']}→{gap['toCurveIndex']}: "
                f"{gap['fromCurrentDomainsPt']} pt vs {gap['toCurrentDomainsPt']} pt"
            )
        calibration = record.get("axisCalibration")
        if calibration:
            summary_lines.append(
                "  Maximum axis residual: "
                f"{max(calibration['xCurrentA']['maxLog10Residual'], calibration['yTimeSeconds']['maxLog10Residual']):.9f} decades"
            )
    (output_dir / "eaton-f-frame-vector-geometry-summary.txt").write_text("\n".join(summary_lines) + "\n", encoding="utf-8")
    return payload


def default_paths(repo: Path) -> tuple[Path, Path]:
    base = repo / "output" / "design-synthesis-device-clearing-evidence-2026-10-26"
    return base / "sources" / SOURCE_NAME, base / "geometry"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[1]
    default_source, default_output = default_paths(repo)
    payload = extract(args.source or default_source, args.output or default_output)
    print(json.dumps({"output": str((args.output or default_output) / "eaton-f-frame-vector-geometry.json"),
                      "records": [{"part": r["part"], "status": r["status"]} for r in payload["records"]]}, indent=2))


if __name__ == "__main__":
    main()
