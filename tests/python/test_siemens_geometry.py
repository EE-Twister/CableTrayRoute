import importlib.util
import math
import unittest
from pathlib import Path
from unittest.mock import patch

REPO = Path(__file__).resolve().parents[2]
SCRIPT = REPO / "scripts" / "extractSiemens3va5130Geometry.py"
SPEC = importlib.util.spec_from_file_location("siemens_geometry", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class SiemensGeometrySelectionTests(unittest.TestCase):
    def test_full_range_log_mappings_and_ii_knee_mapping(self):
        x = MODULE.EXPECTED_X_TICKS
        self.assertAlmostEqual(MODULE.log_map(x[2][0], x[0][0], x[3][0], x[0][1], x[3][1]), 1000, delta=0.001)
        y = MODULE.EXPECTED_Y_TICKS
        self.assertAlmostEqual(MODULE.log_map(y[3][0], y[0][0], y[-1][0], y[0][1], y[-1][1]), 10, delta=0.0001)
        knee_xs = [312.5598046255, 305.1825229855, 296.8189430255, 287.1636811455, 275.7442242555, 319.1589628055]
        expected_ii = [270, 240, 210, 180, 150, 300]
        mapped = [MODULE.infer_ii_from_knee(MODULE.log_map(value, x[0][0], x[3][0], x[0][1], x[3][1])) for value in knee_xs]
        self.assertEqual(mapped, expected_ii)

    def test_nonfinite_and_nonpositive_values_fail_closed(self):
        for value in (math.nan, math.inf, -math.inf, 0, -1):
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    MODULE.log_map(value, 0, 1, 1, 10)
        for value in (math.nan, math.inf, 0, -1):
            with self.subTest(knee=value):
                with self.assertRaises(ValueError):
                    MODULE.infer_ii_from_knee(value)

    def test_plot_clipping_excludes_outside_segments_and_bounds_returned_points(self):
        bounds = MODULE.EXPECTED_PLOT
        clipped = MODULE.clip_segment((500, 500), (600, 800), bounds)
        self.assertIsNotNone(clipped)
        for x, y in clipped:
            self.assertGreaterEqual(x, bounds["left"])
            self.assertLessEqual(x, bounds["right"])
            self.assertGreaterEqual(y, bounds["top"])
            self.assertLessEqual(y, bounds["bottom"])
        self.assertIsNone(MODULE.clip_segment((600, 710), (620, 730), bounds))

    def test_connected_source_group_accepts_rounding_gap_and_rejects_disconnect(self):
        connected = [
            {"pts": [[0.0, 0.0], [1.0, 0.0]]},
            {"pts": [[1.0002, 0.0], [2.0, 0.0]]},
            {"pts": [[2.0001, 0.0], [3.0, 0.0]]},
        ]
        self.assertAlmostEqual(MODULE.validate_connected_group(connected, 0, 2), 0.0002)
        disconnected = [connected[0], {"pts": [[1.002, 0.0], [2.0, 0.0]]}]
        with self.assertRaisesRegex(ValueError, "disconnects"):
            MODULE.validate_connected_group(disconnected, 0, 1)

    def test_source_selection_is_explicit_and_unknown_hash_fails(self):
        self.assertEqual(MODULE.THERMAL_GROUPS, [(104, 125), (126, 146), (147, 166), (167, 185), (186, 203), (204, 224)])
        source = REPO / "output/design-synthesis-protection-next-2026-10-21/sources/siemens-3va5130-30a.pdf"
        with patch.object(MODULE, "digest", return_value="0" * 64):
            with self.assertRaisesRegex(ValueError, "unsupported PDF SHA-256"):
                MODULE.build(source, REPO / "unused-output")


if __name__ == "__main__":
    unittest.main()



