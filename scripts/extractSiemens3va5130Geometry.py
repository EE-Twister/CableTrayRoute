import argparse
import hashlib
import json
import math
from pathlib import Path

EXPECTED_SHA256 = "f62f22900761e701bde34df6308fe7c29fd5b2ecdf4a5d2947f882ced0e0c94e"
EXPECTED_LINE_COUNT = 323
EXPECTED_HEAVY_INDICES = list(range(94, 104)) + list(range(104, 126)) + list(range(126, 147)) + list(range(147, 167)) + list(range(167, 186)) + list(range(186, 204)) + list(range(204, 225)) + list(range(225, 247)) + list(range(247, 270)) + list(range(270, 294)) + list(range(294, 315))
EXPECTED_PLOT = {"left": 106.14230252, "right": 538.80404216, "top": 129.62749214949997, "bottom": 700.2424557945}
EXPECTED_X_TICKS = [(106.14230252, 10), (250.362844605, 100), (394.583424485, 1000), (538.80404216, 10000)]
EXPECTED_Y_TICKS = [(129.62749214949997, 10000), (224.73078608449998, 1000), (319.83404222449997, 100), (414.9348038945, 10), (510.0357545395, 1), (605.1391240644999, 0.1), (700.2424557945, 0.01)]
THERMAL_GROUPS = [(104, 125), (126, 146), (147, 166), (167, 185), (186, 203), (204, 224)]
THERMAL_Ii_A = [270, 240, 210, 180, 150, 300]
MAX_CONNECTIVITY_GAP_PT = 0.001


def digest(path):
    value = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            value.update(chunk)
    return value.hexdigest()


def log_map(value, a0, a1, v0, v1):
    if not all(math.isfinite(item) for item in (value, a0, a1, v0, v1)) or value <= 0 or v0 <= 0 or v1 <= 0 or a0 == a1:
        raise ValueError("log-axis calibration requires positive values and distinct anchors")
    fraction = (value - a0) / (a1 - a0)
    return 10 ** (math.log10(v0) + fraction * (math.log10(v1) - math.log10(v0)))


def point_current(x, calibration):
    return log_map(x, calibration["x0"], calibration["x1"], calibration["current0A"], calibration["current1A"])


def point_time(top, calibration):
    return log_map(top, calibration["y0"], calibration["y1"], calibration["time0s"], calibration["time1s"])


def clip_segment(p0, p1, bounds):
    """Liang-Barsky clipping in PDF page coordinates (x, top)."""
    x0, y0 = p0
    x1, y1 = p1
    dx, dy = x1 - x0, y1 - y0
    t0, t1 = 0.0, 1.0
    for p, q in ((-dx, x0 - bounds["left"]), (dx, bounds["right"] - x0), (-dy, y0 - bounds["top"]), (dy, bounds["bottom"] - y0)):
        if p == 0:
            if q < 0:
                return None
            continue
        ratio = q / p
        if p < 0:
            if ratio > t1:
                return None
            t0 = max(t0, ratio)
        else:
            if ratio < t0:
                return None
            t1 = min(t1, ratio)
    return ((x0 + t0 * dx, y0 + t0 * dy), (x0 + t1 * dx, y0 + t1 * dy))


def validate_connected_group(lines, start, end, max_gap=MAX_CONNECTIVITY_GAP_PT):
    """Fail closed unless source elements form one consecutive drawn path."""
    if start < 0 or end >= len(lines) or start > end or max_gap <= 0:
        raise ValueError("invalid source group range or connectivity tolerance")
    gaps = []
    for index in range(start, end):
        left = lines[index].get("pts", [])
        right = lines[index + 1].get("pts", [])
        if len(left) < 2 or len(right) < 2:
            raise ValueError(f"source line {index} or {index + 1} has no endpoint geometry")
        gap = math.dist(left[-1], right[0])
        if not math.isfinite(gap) or gap > max_gap:
            raise ValueError(f"source path disconnects between lines {index} and {index + 1}: {gap:.6f} pt")
        gaps.append(gap)
    return max(gaps, default=0.0)


def infer_ii_from_knee(knee_current):
    if not math.isfinite(knee_current) or knee_current <= 0:
        raise ValueError("knee current must be finite and positive")
    value = min(THERMAL_Ii_A, key=lambda item: abs(item - knee_current))
    if abs(value - knee_current) > 2:
        raise ValueError(f"knee current {knee_current:.3f} A does not match a labeled Ii value")
    return value


def line_record(index, line):
    pts = [[float(x), float(y)] for x, y in line.get("pts", [])]
    return {
        "sourceLineIndex": index,
        "x0": float(line["x0"]), "x1": float(line["x1"]),
        "top": float(line["top"]), "bottom": float(line["bottom"]),
        "linewidth": float(line["linewidth"]),
        "strokingColor": line.get("stroking_color"),
        "dash": line.get("dash"),
        "pointsPdfXYTop": pts,
        "outsidePlotBounds": any(x < EXPECTED_PLOT["left"] or x > EXPECTED_PLOT["right"] or y < EXPECTED_PLOT["top"] or y > EXPECTED_PLOT["bottom"] for x, y in pts),
    }


def clipped_points_for_indices(lines, indices):
    segments = []
    for index in indices:
        line = lines[index]
        pts = line.get("pts", [])
        if len(pts) < 2:
            continue
        clipped = clip_segment(tuple(pts[0]), tuple(pts[-1]), EXPECTED_PLOT)
        if clipped is None:
            continue
        for endpoint in clipped:
            segments.append({"sourceLineIndex": index, "pdfXYTop": [endpoint[0], endpoint[1]]})
    return segments


def build(pdf_path, out_dir):
    from pdfplumber import open as open_pdf

    actual_hash = digest(pdf_path)
    if actual_hash != EXPECTED_SHA256:
        raise ValueError(f"unsupported PDF SHA-256: {actual_hash}")
    with open_pdf(str(pdf_path)) as pdf:
        if len(pdf.pages) != 1:
            raise ValueError(f"expected one page, found {len(pdf.pages)}")
        page = pdf.pages[0]
        if len(page.lines) != EXPECTED_LINE_COUNT:
            raise ValueError(f"unsupported PDF line geometry count: {len(page.lines)}")
        heavy = [i for i, line in enumerate(page.lines) if line["linewidth"] > 2 and line.get("stroking_color") == (0.0, 0.216, 0.294)]
        if heavy != EXPECTED_HEAVY_INDICES:
            raise ValueError("unsupported heavy-stroke source indices; refusing silent reselection")
        # Tick/grid anchors are fixed by actual PDF vector coordinates; compare the archived fingerprint before mapping.
        xgrid = [line for line in page.lines if line["linewidth"] < 1 and abs(line["x0"] - line["x1"]) < .01 and line["top"] < 140 and line["bottom"] > 690]
        actual_x = sorted(line["x0"] for line in xgrid)
        expected_x = [a[0] for a in EXPECTED_X_TICKS]
        if any(not any(abs(actual - expected) <= .01 for actual in actual_x) for expected in expected_x):
            raise ValueError(f"unsupported x-axis grid calibration: {actual_x}")
        actual_y = [line["top"] for line in page.lines if line["linewidth"] < 1 and abs(line["top"] - line["bottom"]) < .01 and line["x0"] <= EXPECTED_PLOT["left"] + .01 and line["x1"] >= EXPECTED_PLOT["right"] - .01]
        if any(not any(abs(actual - expected[0]) <= .01 for actual in actual_y) for expected in EXPECTED_Y_TICKS):
            raise ValueError(f"unsupported y-axis grid calibration: {actual_y}")
        x_anchor_evidence = [{"expectedPdfX": x, "matchedPdfX": min(actual_x, key=lambda actual: abs(actual - x)), "residualPt": min(actual_x, key=lambda actual: abs(actual - x)) - x, "currentA": current} for x, current in EXPECTED_X_TICKS]
        y_anchor_evidence = [{"expectedPdfTop": y, "matchedPdfTop": min(actual_y, key=lambda actual: abs(actual - y)), "residualPt": min(actual_y, key=lambda actual: abs(actual - y)) - y, "timeS": seconds} for y, seconds in EXPECTED_Y_TICKS]
        calibration = {
            "coordinateConvention": "pdfplumber page coordinates: x from left, top from page top; units PDF points",
            "plotBoundsPdfXYTop": EXPECTED_PLOT,
            "currentAxis": {"scale": "log10", "unit": "A", "anchors": [{"pdfX": x, "currentA": v} for x, v in EXPECTED_X_TICKS]},
            "timeAxis": {"scale": "log10", "unit": "s", "anchors": [{"pdfTop": y, "timeS": v} for y, v in EXPECTED_Y_TICKS]},
            "anchorMatchResidualsPt": {"x": x_anchor_evidence, "time": y_anchor_evidence},
            "evidence": "Major grid lines in page vector geometry; X ticks 10, 100, 1000, 10000 A and Y ticks 10000, 1000, 100, 10, 1, 0.1, 0.01 s. Time calibration spans the full six decades. Plot bounds use the exact outer major-grid lines at x=106.14230252/538.80404216 and top=129.62749214949997/bottom=700.2424557945 pt.",
            "linearTransformForLog10": {"current": {"x0": EXPECTED_X_TICKS[0][0], "current0A": 10, "x1": EXPECTED_X_TICKS[3][0], "current1A": 10000}, "time": {"y0": EXPECTED_Y_TICKS[0][0], "time0s": 10000, "y1": EXPECTED_Y_TICKS[-1][0], "time1s": 0.01}},
        }
        xmap = calibration["linearTransformForLog10"]["current"]
        ymap = calibration["linearTransformForLog10"]["time"]
        raw = {
            "artifactType": "research_only_raw_source_geometry",
            "source": {"filename": pdf_path.name, "sha256": actual_hash, "url": "https://cache.industry.siemens.com/dl/files/743/109801743/att_1079474/v1/SIE_TCC_3VA5130_30A_3P_LI_TM210-240.pdf", "page": 1, "pdfPageSizePt": [page.width, page.height]},
            "calibration": calibration,
            "geometryCounts": {"line": len(page.lines), "curve": len(page.curves), "thickManufacturerStrokeLines": len(heavy)},
            "allLines": [line_record(i, line) for i, line in enumerate(page.lines)],
            "allCurves": [{"sourceCurveIndex": i, "x0": c["x0"], "x1": c["x1"], "top": c["top"], "bottom": c["bottom"], "linewidth": c["linewidth"], "strokingColor": c.get("stroking_color"), "dash": c.get("dash"), "path": c.get("path")} for i, c in enumerate(page.curves)],
        }
        candidates = {
            "artifactType": "research_only_numeric_candidate_segments",
            "sourceSha256": actual_hash,
            "deviceScope": "Siemens 3VA5130, 3-pole, TM230 fixed Ir 30 A family; chart identifies TM210/TM230/TM240 and Ir 21-30 A.",
            "status": "candidate_geometry_only_no_curve_ready_status_no_human_approval",
            "calibration": calibration,
            "thermalCenterlineCandidates": [],
            "instantaneousRegionPaths": [],
            "sourceStrokeWidthPt": 2.65736645,
            "limitations": ["Source says coordination purposes only; plotted information is not a guaranteed equipment-protection envelope.", "The graphic identifies Ir 21-30 A; selecting 30 A is a configuration interpretation requiring reviewer confirmation.", "Six repeated thick solid connected paths correspond to Ir 30 A. Their Ii labels are mapped to the calibrated current at each explicit vertical knee and remain discrete path identities.", "Recorded numeric coordinates describe PDF vector geometry; the 2.657 pt stroke width limits where the drawn centreline can be located and is not an electrical tolerance or guaranteed band.", "The exact pickup/transition interpretation and clearing semantics remain unresolved. No tolerance envelope is synthesized from inset percentages. The thermal centerline is not a total-clearing boundary.", "No scaling to 25 A; no extrapolation beyond the chart bounds; all coordinates are clipped to the printed plot rectangle.", "Instantaneous max-clearing and min-tripping labels are interpreted from dash/solid styling and source annotations; their short displayed fragments do not establish complete trip-time behavior."],
        }
        for group_number, (start, end) in enumerate(THERMAL_GROUPS, 1):
            # Each connected group is in source draw order. Thermal centerline stops immediately before its knee's vertical line.
            indices = list(range(start, end + 1))
            max_gap = validate_connected_group(page.lines, start, end)
            knee_index = next((i for i in indices if abs(page.lines[i]["x0"] - page.lines[i]["x1"]) < .01 and page.lines[i]["top"] >= 140), None)
            if knee_index is None:
                raise ValueError(f"thermal candidate {group_number} has no explicit vertical-knee separator")
            thermal_indices = [i for i in indices if i < knee_index]
            pts = clipped_points_for_indices(page.lines, thermal_indices)
            if len(pts) < 4:
                raise ValueError(f"thermal candidate {group_number} has too few in-plot points")
            knee_x = page.lines[knee_index]["x0"]
            knee_current = point_current(knee_x, xmap)
            ii_value = infer_ii_from_knee(knee_current)
            candidates["thermalCenterlineCandidates"].append({"candidateId": f"thermal_ir30_group_{group_number:02d}", "sourceLineIndicesInclusive": [start, end], "thermalSourceLineIndices": thermal_indices, "kneeSourceLineIndex": knee_index, "maximumConsecutiveEndpointGapPt": max_gap, "IrA": 30, "IiA": ii_value, "kneeCurrentFromAxisA": knee_current, "selectionBasis": "source-order connected thick solid path; first six connected groups are the Ir30 family; Ii is matched to the calibrated x-axis current at the explicit vertical knee; thermal branch ends before the knee", "points": [{"currentA": point_current(p["pdfXYTop"][0], xmap), "timeS": point_time(p["pdfXYTop"][1], ymap), "sourceLineIndex": p["sourceLineIndex"], "pdfXYTop": p["pdfXYTop"]} for p in pts], "pointCount": len(pts)})
        # Separate manufacturer annotated instantaneous-limit fragments (source lines 94-103), preserving each source element.
        for index in range(94, 104):
            line = page.lines[index]
            label = "max_clearing_dashed" if line.get("dash", [[], 0])[0] else "min_tripping_solid"
            clipped = clipped_points_for_indices(page.lines, [index])
            if not clipped:
                continue
            candidates["instantaneousRegionPaths"].append({"pathId": label, "sourceLineIndex": index, "stroke": "dashed" if label.startswith("max") else "solid", "points": [{"currentA": point_current(p["pdfXYTop"][0], xmap), "timeS": point_time(p["pdfXYTop"][1], ymap), "sourceLineIndex": index, "pdfXYTop": p["pdfXYTop"]} for p in clipped]})
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "siemens3va5130-30a-raw-geometry.json").write_text(json.dumps(raw, indent=2) + "\n", encoding="utf-8")
        (out_dir / "siemens3va5130-30a-candidate-segments.json").write_text(json.dumps(candidates, indent=2) + "\n", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description="Offline research-only extraction of archived Siemens 3VA5130 source vector geometry.")
    parser.add_argument("--pdf", type=Path, default=Path("output/design-synthesis-protection-next-2026-10-21/sources/siemens-3va5130-30a.pdf"))
    parser.add_argument("--out-dir", type=Path, default=Path("output/design-synthesis-protection-next-2026-10-21/geometry"))
    args = parser.parse_args()
    build(args.pdf, args.out_dir)


if __name__ == "__main__":
    main()

