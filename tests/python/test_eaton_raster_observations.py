import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw

REPO = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("eaton_125_raster", REPO / "scripts/inspectEaton125Raster.py")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
SOURCE = REPO / "output/design-synthesis-device-clearing-evidence-2026-10-26/sources/f-frame-time-current-curves-tc01200002e.pdf"


class Eaton125RasterTests(unittest.TestCase):
    def test_single_thick_black_run_retains_pixel_cell_extents(self):
        image = Image.new("RGB", (100, 30), "white")
        ImageDraw.Draw(image).line([(48, 15), (54, 15)], fill="black")
        point = MODULE.observe(image, 15, 50, "maximum-tolerance")
        self.assertEqual(point["darkPixelColumns"], [48, 54])
        self.assertEqual(point["observedDarkCellRectangle"], [47.5, 14.5, 54.5, 15.5])

    def test_missing_multiple_clipped_and_grid_only_readings_are_blocked(self):
        for spans in ([], [(49, 50)], [(43, 47), (52, 56)], [(35, 50)], [(38, 62)], [(35, 43), (49, 55)]):
            image = Image.new("RGB", (100, 30), "white")
            for low, high in spans:
                ImageDraw.Draw(image).line([(low, 15), (high, 15)], fill="black")
            self.assertEqual(MODULE.observe(image, 15, 50, "maximum-tolerance")["status"], "blocked-ambiguous-or-missing")

    def test_colored_tail_is_not_a_black_boundary(self):
        image = Image.new("RGB", (100, 30), "white")
        ImageDraw.Draw(image).line([(48, 15), (54, 15)], fill=(190, 75, 72))
        self.assertEqual(MODULE.dark_runs(image, 15, 50), [])

    def test_thin_components_are_retained_as_excluded_evidence(self):
        image = Image.new("RGB", (100, 30), "white")
        draw = ImageDraw.Draw(image)
        draw.line([(48, 15), (54, 15)], fill="black")
        draw.line([(39, 15), (40, 15)], fill="black")
        point = MODULE.observe(image, 15, 50, "maximum-tolerance")
        self.assertEqual(point["status"], "observed-dark-pixels")
        self.assertEqual(point["darkPixelColumns"], [48, 54])
        self.assertEqual(point["excludedThinDarkPixelSpans"], [[39, 40]])

    def test_wrong_source_is_rejected_before_output(self):
        with tempfile.TemporaryDirectory(prefix=".eaton-raster-test-", dir=REPO) as temp:
            source = Path(temp) / "wrong.pdf"
            source.write_bytes(b"wrong source")
            output = Path(temp) / "output"
            with self.assertRaisesRegex(ValueError, "SHA mismatch"):
                MODULE.inspect(source, output)
            self.assertFalse(output.exists())

    @unittest.skipUnless(SOURCE.exists(), "archive the pinned PDF for source acceptance")
    def test_archive_retains_only_sparse_pixel_observations(self):
        with tempfile.TemporaryDirectory(prefix=".eaton-raster-test-", dir=REPO) as temp:
            result = MODULE.inspect(SOURCE, Path(temp))
            saved = json.loads((Path(temp) / "eaton-fd3125-raster-observations.json").read_text(encoding="utf-8"))
        self.assertEqual(result, saved)
        self.assertEqual(len(result["observations"]), 28)
        self.assertFalse(result["curveComplete"])
        self.assertFalse(result["interpolationAllowed"])
        self.assertFalse(result["clearingEvaluationAllowed"])
        for point in result["observations"]:
            self.assertEqual(point["status"], "observed-dark-pixels")
            self.assertNotIn("currentA", point)
            self.assertNotIn("timeSeconds", point)
        self.assertEqual(result["observations"][0]["darkPixelColumns"], [793, 799])
        self.assertEqual(result["observations"][1]["darkPixelColumns"], [829, 836])
        self.assertEqual(sum(bool(point["excludedThinDarkPixelSpans"]) for point in result["observations"]), 13)


if __name__ == "__main__":
    unittest.main()
