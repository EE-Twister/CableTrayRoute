#!/usr/bin/env python3
"""Derive a small, source-bound Eaton chart-research dataset from audited geometry.

This output preserves disconnected source paths and is not a device catalog or
qualified protective-device setting. The original extractor must be run first.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

GEOMETRY_SHA256 = '95be04baa2f414d24273c66c9d1fe5a55c8e7150f8ac1d91629b4c0a70b7134b'
PDF_SHA256 = 'b7e6ccdb7229f5f2c30573c1dbc64b42fbd22b8e640ecd7ceb82b943cc8d22ff'
PARTS = {'FD3020', 'HFD3080', 'HFD3150', 'FD3175', 'HFD3200', 'FD3225'}


def build(source: Path, destination: Path):
    data = source.read_bytes()
    if hashlib.sha256(data).hexdigest() != GEOMETRY_SHA256:
        raise ValueError('Audited geometry SHA-256 mismatch; no dataset written')
    original = json.loads(data)
    if original['source']['sha256'] != PDF_SHA256:
        raise ValueError('Unexpected manufacturer source fingerprint')
    records = []
    for item in original['records']:
        if item['part'] not in PARTS:
            continue
        curves = {entry['index']: entry for entry in item['curves']}
        voltages = {}
        used_indices = set()
        for domain in item['voltageCandidateDomains']:
            indices = domain['maximumCurveIndices']
            used_indices.update(indices)
            voltages[str(domain['voltageV'])] = indices
        selected = [{'sourceCurveIndex': index, 'strokeWidthPt': curves[index]['strokeWidthPt'],
                     'runs': curves[index]['plottedPolylineRunsPt']} for index in sorted(used_indices)]
        calibration = item['axisCalibration']
        records.append({'id': item['catalogId'], 'part': item['part'], 'page': item['page'],
                        'figure': item['figure'], 'curveId': item['curveId'],
                        'sourceStatus': item['status'], 'plotBoundsPt': item['plotBoundsPt'],
                        'axes': {'x': calibration['xCurrentA'], 'y': calibration['yTimeSeconds']},
                        'voltageCurves': voltages, 'curves': selected})
    if {row['part'] for row in records} != PARTS or any(set(row['voltageCurves']) != {'240', '480', '600'} for row in records):
        raise ValueError('Audited part or voltage coverage changed')
    output = {'schema': 'eaton-f-frame-graphical-clearing-research-v1',
              'source': {'pdfSha256': PDF_SHA256, 'geometrySha256': GEOMETRY_SHA256,
                         'document': 'TC01200002E, April 2022',
                         'url': original['source']['url']},
              'flatteningMaximumDeviationPt': original['method']['flatteningMaximumDeviationPt'],
              'records': records}
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(output, separators=(',', ':'), ensure_ascii=False) + '\n', encoding='utf-8')
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--geometry', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    result = build(args.geometry, args.output)
    print(json.dumps({'parts': len(result['records']), 'bytes': args.output.stat().st_size}))


if __name__ == '__main__':
    main()
