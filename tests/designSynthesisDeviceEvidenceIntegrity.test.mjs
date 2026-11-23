import assert from 'node:assert/strict';
import test from 'node:test';
import { fingerprintStudyValue } from '../analysis/studyLifecycle.mjs';
import { resolveDesignSynthesisDeviceEvidence, resolveDesignSynthesisTransformerDeviceEvidence } from '../src/design-synthesis/applyProposal.mjs';

test('referenced cable evidence rejects changed map contents and mismatched inline device', () => {
  const record = { id: 'test-breaker', catalogNumber: 'FD3020', continuousCurrentA: 20, evaluatedVoltageVac: 480,
    curveSourceResearch: { clearingEvaluation: 'unevaluated' } };
  const ref = fingerprintStudyValue(record);
  const cable = { protectiveDeviceEvidenceRef: ref, protectiveDevice: { id: record.id, catalogNumber: record.catalogNumber, continuousCurrentA: 20, evaluatedVoltageVac: 480 } };
  assert.deepEqual(resolveDesignSynthesisDeviceEvidence(cable, { [ref]: record }), record);
  assert.equal(resolveDesignSynthesisDeviceEvidence(cable, { [ref]: { ...record, continuousCurrentA: 200 } }), null);
  assert.equal(resolveDesignSynthesisDeviceEvidence(cable, {}), null);
  assert.equal(resolveDesignSynthesisDeviceEvidence({ ...cable, protectiveDevice: { ...cable.protectiveDevice, evaluatedVoltageVac: 208 } }, { [ref]: record }), null);
  assert.equal(resolveDesignSynthesisDeviceEvidence({ ...cable, protectiveDevice: {} }, { [ref]: record }), null);
  assert.equal(resolveDesignSynthesisDeviceEvidence({ ...cable, protectiveDeviceEvidenceRef: '' }, { [ref]: record }), null);
  assert.equal(resolveDesignSynthesisDeviceEvidence(cable, { encoding: 'design-synthesis-device-evidence-future-v2', [ref]: record }), null,
    'An unreadable envelope must not impersonate a plain evidence map');
  assert.deepEqual(resolveDesignSynthesisDeviceEvidence({ protectiveDevice: { id: 'legacy' } }, {}), { id: 'legacy' });
});

test('transformer evidence verifies the same reference and inline binding on both sides', () => {
  const record = { id: 'breaker', catalogNumber: 'FD3125', continuousCurrentA: 125 };
  const ref = fingerprintStudyValue(record);
  for (const [side, field] of [['primary', 'primaryProtectiveDevice'], ['secondary', 'secondaryMainDevice']]) {
    const transformer = { [field]: { id: record.id, catalogNumber: record.catalogNumber }, [`${field}EvidenceRef`]: ref };
    assert.deepEqual(resolveDesignSynthesisTransformerDeviceEvidence(transformer, side, { [ref]: record }), record);
    assert.equal(resolveDesignSynthesisTransformerDeviceEvidence(transformer, side, { [ref]: { ...record, catalogNumber: 'FD3175' } }), null);
    assert.equal(resolveDesignSynthesisTransformerDeviceEvidence({ ...transformer, [field]: { id: 'other' } }, side, { [ref]: record }), null);
  }
});
