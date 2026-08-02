import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildCustomCurveBaseDevice,
  normalizeCustomCurveSequences,
  sanitizeCustomCurve,
  sanitizeCustomCurveProfiles
} from '../analysis/tcc/customCurveModel.mjs';

const curve = [
  { current: 100, time: 10 },
  { current: 1000, time: 0.1 }
];

describe('TCC custom curve model', () => {
  it('sanitizes imported curve metadata and drops unsupported settings', () => {
    const result = sanitizeCustomCurve({
      id: 'main',
      name: ' Main Breaker ',
      manufacturer: ' Example ',
      curve,
      settings: { pickup: '125', unknown: 99 },
      interruptingRatings: [{ voltage: 480, valueKA: 35 }, { voltage: -1, valueKA: 10 }],
      evidence: { document: ' Data Sheet ', reviewer: ' Engineer ' },
      libraryStatus: 'calculation_ready'
    });

    assert.equal(result.name, 'Main Breaker');
    assert.equal(result.manufacturer, 'Example');
    assert.deepEqual(result.settings, { pickup: 125 });
    assert.equal(result.interruptingRatings.length, 1);
    assert.deepEqual(result.curveEvidence, { document: 'Data Sheet', reviewer: 'Engineer' });
    assert.equal(result.curveProfiles[0].id, 'curve-1');
  });

  it('creates unique profile ids and preserves supported curve roles', () => {
    const profiles = sanitizeCustomCurveProfiles([
      { id: 'curve-1', name: 'Melt', role: 'melting', points: curve },
      { id: 'curve-1', name: 'Clear', role: 'clearing', points: curve }
    ]);
    assert.deepEqual(profiles.map(profile => profile.id), ['curve-1', 'curve-1-2']);
    assert.deepEqual(profiles.map(profile => profile.role), ['melting', 'clearing']);
  });

  it('builds catalog-compatible devices and stable sequence ordering', () => {
    const sanitized = sanitizeCustomCurve({ name: 'Custom A', curve });
    const device = buildCustomCurveBaseDevice(sanitized, 'custom:a');
    assert.equal(device.id, 'custom:a');
    assert.equal(device.type, 'custom curve');
    assert.equal(device.curve.length, 2);

    const ordered = normalizeCustomCurveSequences([
      { name: 'B', sequence: 2 },
      { name: 'A', sequence: 1 }
    ]);
    assert.deepEqual(ordered.map(item => [item.name, item.sequence]), [['A', 1], ['B', 2]]);
  });
});
