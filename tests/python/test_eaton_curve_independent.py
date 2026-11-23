"""Independent source-PDF spot checks for hypothetical chart readings.

Directly samples Bernstein paths and independently obtains grid endpoints; it
imports neither the geometry extractor nor the JavaScript evaluator.
"""
import hashlib
import json
import math
import subprocess
import unittest
from pathlib import Path
import pdfplumber

ROOT = Path(__file__).resolve().parents[2]
PDF = ROOT / 'output/design-synthesis-device-clearing-evidence-2026-10-26/sources/f-frame-time-current-curves-tc01200002e.pdf'
PDF_SHA = 'b7e6ccdb7229f5f2c30573c1dbc64b42fbd22b8e640ecd7ceb82b943cc8d22ff'
PARTS = [('eaton_series_c_fd3020', 32), ('eaton_series_c_hfd3080', 41),
         ('eaton_series_c_hfd3150', 46), ('eaton_series_c_fd3175', 47),
         ('eaton_series_c_hfd3200', 48), ('eaton_series_c_fd3225', 49)]
CURRENTS = [50, 100, 200, 500, 1000, 2000, 5000, 10000]


def grid(page):
    xs, ys = [], []
    for line in page.lines:
        if abs(float(line.get('linewidth') or 0) - 0.269) > 0.01:
            continue
        x0, x1, y0, y1 = map(float, (line['x0'], line['x1'], line['top'], line['bottom']))
        if abs(x1 - x0) <= 1e-6 and y1 - y0 > 400:
            xs.append(x0)
        if abs(y1 - y0) <= 1e-6 and x1 - x0 > 400:
            ys.append(y0)
    if not xs or not ys:
        raise AssertionError('independent grid endpoints unavailable')
    return min(xs), max(xs), min(ys), max(ys)


def cubic(a, b, c, d, t):
    u = 1 - t
    return tuple(u**3 * a[i] + 3*u*u*t*b[i] + 3*u*t*t*c[i] + t**3*d[i] for i in (0, 1))


def intersections(path, x):
    current = path[0][1]
    found = []
    for op, *coordinates in path[1:]:
        if op == 'l':
            end = coordinates[0]
            if min(current[0], end[0]) <= x <= max(current[0], end[0]) and end[0] != current[0]:
                t = (x-current[0])/(end[0]-current[0])
                found.append(current[1]+t*(end[1]-current[1]))
            current = end
        elif op == 'c':
            p0, p1, p2, p3 = current, *coordinates
            samples = [(i / 512, cubic(p0, p1, p2, p3, i / 512)[0] - x) for i in range(513)]
            for (ta, fa), (tb, fb) in zip(samples, samples[1:]):
                if fa * fb > 0:
                    continue
                lo, hi = ta, tb
                for _ in range(45):
                    mid = (lo + hi) / 2
                    fm = cubic(p0, p1, p2, p3, mid)[0] - x
                    if fa * fm <= 0:
                        hi = mid
                    else:
                        lo, fa = mid, fm
                found.append(cubic(p0, p1, p2, p3, (lo+hi)/2)[1])
            current = p3
        else:
            raise AssertionError(f'unexpected path op {op}')
    return found


class IndependentEatonPlotTests(unittest.TestCase):
    @unittest.skipUnless(PDF.exists(), 'archive the pinned Eaton source PDF')
    def test_plot_readings_enclose_independent_source_centerlines(self):
        self.assertEqual(hashlib.sha256(PDF.read_bytes()).hexdigest(), PDF_SHA)
        javascript = """import d from './data/designSynthesisDevices.json' with {type:'json'};
import {evaluateEatonConstantCurrentPlot as evaluate} from './analysis/designSynthesisEatonCurveResearch.mjs';
const cases=JSON.parse(process.argv[1]);
console.log(JSON.stringify(cases.map(([id,page,voltageVac,currentA])=>({id,page,voltageVac,currentA,...evaluate({device:d.records.find(r=>r.id===id),voltageVac,currentA})}))));"""
        cases = [[part, page, voltage, current] for part, page in PARTS for voltage in (240, 480, 600) for current in CURRENTS]
        output = subprocess.check_output(['node', '--input-type=module', '-e', javascript, json.dumps(cases)], cwd=ROOT, text=True)
        results = json.loads(output)
        evaluated = 0
        with pdfplumber.open(PDF) as pdf:
            for result in results:
                if result['status'] != 'evaluated-graphical-conservative-envelope':
                    self.assertIsNone(result['plotUpperTimeSeconds'])
                    continue
                page = pdf.pages[result['page'] - 1]
                xmin, xmax, ymin, ymax = grid(page)
                x = xmin + (math.log10(result['currentA']) - 1) * (xmax - xmin) / 5
                tail = {240: 6, 480: 7, 600: 8}[result['voltageVac']]
                ys = [y for i in (1, 3, 5, tail) for y in intersections(page.curves[i]['path'], x)
                      if ymin <= y <= ymax]
                self.assertTrue(ys, f"no original source intersection for {result['id']} {result['currentA']}")
                source_time = 10 ** (4 - 6 * (min(ys)-ymin)/(ymax-ymin))
                self.assertGreaterEqual(result['plotUpperTimeSeconds'] * (1 + 1e-8), source_time,
                    f"reported graphical envelope below raw source centerline: {result['id']} {result['voltageVac']}V {result['currentA']}A")
                evaluated += 1
        self.assertGreaterEqual(evaluated, 25)
        print(f'Independently checked {evaluated} evaluated readings against original source paths')


if __name__ == '__main__':
    unittest.main()
