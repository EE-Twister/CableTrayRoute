import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createCustomHarmonicProfile,
  defaultHarmonicProfileId,
  estimateVoltageHarmonicPoints,
  findHarmonicProfileById,
  formatHarmonicMetric,
  harmonicThdPercent,
  mergeHarmonicProfiles,
  parseHarmonicSpectrumPoints
} from '../src/one-line/harmonicProfiles.mjs';

describe('One-Line harmonic profiles', () => {
  it('keeps built-in profile IDs authoritative while retaining custom profiles', () => {
    const profiles = mergeHarmonicProfiles([
      { id: 'six_pulse_vfd', label: 'Override', spectrum: '5:99' },
      { id: 'field_profile', label: 'Field profile', spectrum: '5:12 7:8' }
    ]);
    assert.equal(findHarmonicProfileById(profiles, 'six_pulse_vfd').label, '6-pulse VFD / rectifier');
    assert.equal(findHarmonicProfileById(profiles, 'field_profile').custom, true);
    assert.equal(profiles.at(-1).id, 'custom');
  });

  it('normalizes custom profiles and selects defaults by converter type', () => {
    assert.deepEqual(createCustomHarmonicProfile('  Field VFD  ', ' 5:14 7:9 '), {
      id: 'custom_field_vfd',
      label: 'Field VFD',
      spectrum: '5:14 7:9',
      description: 'Custom harmonic profile.',
      custom: true
    });
    assert.equal(defaultHarmonicProfileId({ subtype: 'vfd' }), 'six_pulse_vfd');
    assert.equal(defaultHarmonicProfileId({ type: 'ups' }), 'ups_inverter');
    assert.equal(defaultHarmonicProfileId({ type: 'static_load' }), 'custom');
  });

  it('parses, sorts, deduplicates, and evaluates a harmonic spectrum', () => {
    const points = parseHarmonicSpectrumPoints('7:25 5:35 7:20 11:12');
    assert.deepEqual(points, [
      { order: 5, pct: 35 },
      { order: 7, pct: 20 },
      { order: 11, pct: 12 }
    ]);
    assert.equal(formatHarmonicMetric(harmonicThdPercent(points), 1), '42.1');
  });

  it('estimates voltage harmonics only when the electrical basis is complete', () => {
    const result = estimateVoltageHarmonicPoints([{ order: 5, pct: 30 }], {
      voltage: 480,
      loadKw: 100,
      scMVA: 25
    });
    assert.equal(result.length, 1);
    assert.equal(result[0].order, 5);
    assert.ok(result[0].pct > 0);
    assert.deepEqual(estimateVoltageHarmonicPoints([{ order: 5, pct: 30 }], { voltage: 480 }), []);
  });
});
