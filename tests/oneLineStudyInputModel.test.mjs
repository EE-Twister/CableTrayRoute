import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createStudyInputFieldSpecs,
  isDefaultHarmonicSourceMeta,
  resolveStudyInputFieldSpecs
} from '../src/one-line/studyInputModel.mjs';

const fieldSpecs = createStudyInputFieldSpecs({
  getHarmonicProfileOptions: () => [{ value: 'custom', label: 'Custom' }],
  getDefaultHarmonicProfileId: () => 'custom',
  getDefaultHarmonicSpectrum: () => ''
});

describe('One-Line study input model', () => {
  it('assembles transformer and arc-flash inputs for diagram assets', () => {
    const specs = resolveStudyInputFieldSpecs({ type: 'transformer', category: 'equipment' }, fieldSpecs);
    const names = new Set(specs.map(spec => spec.name));
    assert.equal(names.has('mtbf'), true);
    assert.equal(names.has('clearing_time'), true);
    assert.equal(names.has('inrush_multiple'), true);
    assert.equal(names.has('harmonics'), false);
  });

  it('adds harmonic and motor inputs for a VFD', () => {
    const specs = resolveStudyInputFieldSpecs({ type: 'motor_controller', subtype: 'vfd' }, fieldSpecs);
    const names = new Set(specs.map(spec => spec.name));
    assert.equal(names.has('harmonicProfileId'), true);
    assert.equal(names.has('full_load_amps'), true);
    assert.equal(isDefaultHarmonicSourceMeta({ subtype: 'vfd' }), true);
  });

  it('excludes non-assets through the controller-supplied asset predicate', () => {
    const specs = resolveStudyInputFieldSpecs({ type: 'annotation' }, fieldSpecs, {
      isDiagramAssetComponentMeta: () => false
    });
    assert.deepEqual(specs, []);
  });
});
