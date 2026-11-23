import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'output/design-synthesis-device-clearing-evidence-2026-10-26/geometry/eaton-f-frame-vector-geometry.json'
PDF = ROOT / 'output/design-synthesis-device-clearing-evidence-2026-10-26/sources/f-frame-time-current-curves-tc01200002e.pdf'
DATA = ROOT / 'data/designSynthesisEatonCurveResearch.json'
SPEC = importlib.util.spec_from_file_location('eaton_curve_data', ROOT / 'scripts/buildEatonCurveResearchData.py')
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class EatonResearchDataTests(unittest.TestCase):
    def test_wrong_source_does_not_replace_existing_output(self):
        with tempfile.TemporaryDirectory(prefix='.eaton-curve-data-', dir=ROOT) as temp:
            source = Path(temp) / 'wrong.json'
            source.write_text('{}', encoding='utf-8')
            target = Path(temp) / 'result.json'
            target.write_text('preserve', encoding='utf-8')
            with self.assertRaisesRegex(ValueError, 'SHA-256 mismatch'):
                MODULE.build(source, target)
            self.assertEqual(target.read_text(encoding='utf-8'), 'preserve')

    @unittest.skipUnless(SOURCE.exists() and PDF.exists(), 'archive the pinned source and geometry for source checks')
    def test_curated_data_preserves_exact_original_runs_and_voltage_mapping(self):
        self.assertEqual(hashlib.sha256(PDF.read_bytes()).hexdigest(), MODULE.PDF_SHA256)
        original = json.loads(SOURCE.read_text(encoding='utf-8'))
        saved = json.loads(DATA.read_text(encoding='utf-8'))
        with tempfile.TemporaryDirectory(prefix='.eaton-curve-data-', dir=ROOT) as temp:
            generated = MODULE.build(SOURCE, Path(temp) / 'generated.json')
        self.assertEqual(generated, saved)
        expected = {row['catalogId']: row for row in original['records'] if row['part'] in MODULE.PARTS}
        self.assertEqual(set(expected), {row['id'] for row in saved['records']})
        for row in saved['records']:
            source = expected[row['id']]
            self.assertEqual(row['axes']['x'], source['axisCalibration']['xCurrentA'])
            self.assertEqual(row['axes']['y'], source['axisCalibration']['yTimeSeconds'])
            self.assertEqual(row['plotBoundsPt'], source['plotBoundsPt'])
            for domain in source['voltageCandidateDomains']:
                self.assertEqual(row['voltageCurves'][str(domain['voltageV'])], domain['maximumCurveIndices'])
            curves = {entry['index']: entry for entry in source['curves']}
            for curve in row['curves']:
                source_curve = curves[curve['sourceCurveIndex']]
                self.assertEqual(curve['strokeWidthPt'], source_curve['strokeWidthPt'])
                self.assertEqual(curve['runs'], source_curve['plottedPolylineRunsPt'])


if __name__ == '__main__':
    unittest.main()
