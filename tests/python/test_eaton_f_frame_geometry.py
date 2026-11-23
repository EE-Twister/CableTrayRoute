import importlib.util
import json
import math
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SCRIPT = REPO / "scripts" / "extractEatonFFrameGeometry.py"
SPEC = importlib.util.spec_from_file_location("eaton_f_frame_geometry", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
SOURCE = REPO / "output/design-synthesis-device-clearing-evidence-2026-10-26/sources/f-frame-time-current-curves-tc01200002e.pdf"


class EatonFFrameGeometryTests(unittest.TestCase):
    def test_adaptive_bezier_flattening_is_bounded_and_keeps_vertical_segments(self):
        points = MODULE._flatten_cubic((0.0, 0.0), (0.0, 1.0), (1.0, 1.0), (1.0, 0.0))
        self.assertEqual(points[-1], (1.0, 0.0))
        self.assertGreater(len(points), 2)
        self.assertLessEqual(MODULE.FLATNESS_PT, 0.005)
        vertical = MODULE._path_segments({"path": (("m", (2.0, 0.0)), ("l", (2.0, 3.0)))})
        self.assertEqual(vertical[0]["points"], [(2.0, 0.0), (2.0, 3.0)])

    def test_log_axis_fit_records_residual_and_rejects_wrong_calibration(self):
        expected = [10.0, 100.0, 1000.0, 10000.0, 100000.0, 1000000.0]
        observed = MODULE.PAGE_GRIDS[32]["x"]
        fit = MODULE._axis_fit(observed, observed, expected)
        self.assertLessEqual(fit["maxLog10Residual"], 0.001)
        with self.assertRaisesRegex(MODULE.ExtractionError, "coordinates differ"):
            MODULE._axis_fit(observed, [value + 1 for value in observed], expected)

    def test_nonfinite_duplicate_and_nonpositive_axis_inputs_fail_closed(self):
        for observed, values in (([0, math.nan], [1, 10]), ([1, 1], [1, 10]),
                                 ([0, 1], [0, 10]), ([0, 1], [1, 1]),
                                 ([0, 1], [1, math.inf]), ([], [])):
            with self.assertRaises(MODULE.ExtractionError):
                MODULE._axis_fit(observed, observed, values)

    def test_exact_part_scope_matches_the_current_default_snapshot(self):
        snapshot = json.loads((REPO / "data/designSynthesisDevices.json").read_text(encoding="utf-8"))
        records = {record["id"]: record for record in snapshot["records"]}
        self.assertEqual(set(records), {part["catalogId"] for part in MODULE.PARTS} | {"eaton_series_c_kdb3400"})
        for part in MODULE.PARTS:
            record = records[part["catalogId"]]
            self.assertEqual(record["catalogNumber"], part["part"])
            self.assertEqual(record["continuousCurrentA"], part["amps"])

    def test_clipping_adds_plot_intersections_and_preserves_vertical_duplicates(self):
        clipped = MODULE._clip_segment([(-1.0, 0.5), (0.5, 0.5), (0.5, 2.0)], 0.0, 1.0, 0.0, 1.0)
        self.assertEqual(clipped[0][0], [0.0, 0.5])
        self.assertEqual(clipped[-1][-1], [0.5, 1.0])
        vertical = MODULE._clip_segment([(0.25, -1.0), (0.25, 2.0)], 0.0, 1.0, 0.0, 1.0)
        self.assertEqual(vertical, [[[0.25, 0.0], [0.25, 1.0]]])

    def test_collinear_bezier_overshoot_is_not_replaced_by_endpoint_chord(self):
        controls = ((0.0, 0.0), (4.0, 0.0), (4.0, 0.0), (1.0, 0.0))
        points = [controls[0], *MODULE._flatten_cubic(*controls)]
        self.assertGreater(max(point[0] for point in points), 3.0)
        for index in range(1001):
            t = index / 1000
            x = 12 * (1 - t) ** 2 * t + 12 * (1 - t) * t ** 2 + t ** 3
            distance = min(MODULE._point_distance_to_segment((x, 0.0), a, b) for a, b in zip(points, points[1:]))
            self.assertLessEqual(distance, MODULE.FLATNESS_PT + 1e-12)

    def test_clipping_preserves_exit_and_reentry_as_disconnected_runs(self):
        points = [(0.25, 0.25), (2.0, 0.25), (2.0, 0.75), (0.25, 0.75)]
        runs = MODULE._clip_segment(points, 0.0, 1.0, 0.0, 1.0)
        self.assertEqual(runs, [[[0.25, 0.25], [1.0, 0.25]], [[1.0, 0.75], [0.25, 0.75]]])

    def test_join_gap_limit_is_evidence_not_silent_repair(self):
        joined = [
            {"index": 5, "plottedPolylineRunsPt": [[[0.0, 0.0], [1.001, 1.0]]]},
            {"index": 6, "plottedPolylineRunsPt": [[[1.0007, 1.0007], [2.0, 2.0]]]},
        ]
        evidence = MODULE._check_joins(joined)
        self.assertAlmostEqual(evidence[0]["gapPt"], math.hypot(0.0003, 0.0007), places=7)
        self.assertTrue(evidence[0]["pointJoinWithinLimit"])
        self.assertTrue(evidence[0]["currentDomainsOverlap"])
        joined[1]["plottedPolylineRunsPt"][0][0][0] = 1.0022
        self.assertFalse(MODULE._check_joins(joined)[0]["pointJoinWithinLimit"])

    def test_domain_union_does_not_hide_a_gap_within_one_source_path(self):
        left = {"index": 0, "plottedPolylineRunsPt": [[[0, 0], [1, 1]], [[3, 1], [4, 0]]]}
        right = {"index": 2, "plottedPolylineRunsPt": [[[2, 0], [2.5, 1]]]}
        self.assertEqual(MODULE._current_domains([left, right]), [[0, 1], [2, 2.5], [3, 4]])
        self.assertFalse(MODULE._check_joins([left, right])[0]["currentDomainsOverlap"])
        bridging = {"index": 5, "plottedPolylineRunsPt": [[[1, 0], [3, 1]]]}
        self.assertEqual(MODULE._current_domains([left, bridging]), [[0, 4]])

    def test_wrong_archived_source_hash_fails_before_writing_output(self):
        with tempfile.TemporaryDirectory(prefix=".eaton-geometry-test-", dir=REPO) as temp:
            bad_source = Path(temp) / "wrong.pdf"
            bad_source.write_bytes(b"not the pinned PDF")
            output = Path(temp) / "out"
            with self.assertRaisesRegex(MODULE.ExtractionError, "source SHA mismatch"):
                MODULE.extract(bad_source, output)
            self.assertFalse(output.exists())

    @unittest.skipUnless(SOURCE.exists(), "archive the pinned manufacturer PDF to run source acceptance")
    def test_full_archived_source_extracts_candidates_and_explicit_blocked_figures(self):
        self.assertTrue(SOURCE.exists())
        with tempfile.TemporaryDirectory(prefix=".eaton-geometry-test-", dir=REPO) as temp:
            result = MODULE.extract(SOURCE, Path(temp))
            saved = json.loads((Path(temp) / "eaton-f-frame-vector-geometry.json").read_text(encoding="utf-8"))
        self.assertEqual(json.loads(json.dumps(result)), saved)
        self.assertEqual(result["source"]["sha256"], MODULE.SOURCE_SHA256)
        self.assertEqual([record["part"] for record in result["records"]], [item["part"] for item in MODULE.PARTS])
        by_part = {record["part"]: record for record in result["records"]}
        self.assertEqual(by_part["FD3125"]["status"], "blocked-raster-only")
        self.assertEqual(by_part["FD3125"]["pageTopology"], {"curves": 0, "lines": 0, "images": 1})
        self.assertEqual(by_part["HFD3080"]["status"], "vector-segments-extracted-candidate")
        self.assertFalse(by_part["HFD3080"]["pointConnectivityVerified"])
        self.assertTrue(any(item["gapPt"] > MODULE.MAX_JOIN_GAP_PT and item["currentDomainsOverlap"] for item in by_part["HFD3080"]["overLimitJoinEvidence"]))
        self.assertEqual(by_part["HFD3150"]["status"], "blocked-current-domain-gap")
        self.assertTrue(by_part["HFD3150"]["currentDomainGapEvidence"])
        self.assertEqual(by_part["HFD3200"]["status"], "blocked-current-domain-gap")
        self.assertEqual(by_part["FD3225"]["status"], "blocked-current-domain-gap")
        for part in ("FD3020", "HFD3080", "HFD3150", "FD3175", "HFD3200", "FD3225"):
            record = by_part[part]
            self.assertIn(record["status"], ("vector-segments-extracted-candidate", "blocked-current-domain-gap"))
            self.assertEqual(len(record["curves"]), 11)
            self.assertEqual(record["excludedCurveIndices"], {"dashedMaxSinglePole25C": [4], "filledArrowMarkers": [9, 10]})
            self.assertEqual([candidate["voltageV"] for candidate in record["voltageCandidateDomains"]], [240, 480, 600])
            for candidate, tail in zip(record["voltageCandidateDomains"], (6, 7, 8)):
                self.assertEqual(candidate["sourceVoltageTailCurveIndex"], tail)
                self.assertEqual(candidate["minimumCurveIndices"], [0, 2])
                self.assertEqual(candidate["maximumCurveIndices"], [1, 3, 5, tail])
                self.assertTrue(all("pointJoinWithinLimit" in join and "currentDomainsOverlap" in join for join in candidate["joinGapEvidencePt"]))
                for source in candidate["minimumSegments"] + candidate["maximumSegments"]:
                    for series in source["runs"]:
                        self.assertTrue(series)
                        for point in series:
                            self.assertGreaterEqual(point["currentA"], 10.0)
                            self.assertLessEqual(point["currentA"], 1e6)
                            self.assertGreaterEqual(point["timeSeconds"], 0.01 - 1e-12)
                            self.assertLessEqual(point["timeSeconds"], 1e4 + 1e-8)
                            self.assertTrue(math.isfinite(point["currentA"]))
                            self.assertTrue(math.isfinite(point["timeSeconds"]))


if __name__ == "__main__":
    unittest.main()
