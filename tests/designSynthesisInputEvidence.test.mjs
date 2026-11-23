import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDesignSynthesisInputEvidence, validateDesignSynthesisInputEvidence } from '../analysis/designSynthesisInputEvidence.mjs';

const base = () => ({ supply: { id: 'S1' }, equipment: [{ id: 'M1', kw: 10 }], provenance: 'synthetic' });

test('records explicit units, classifications, and default versus provided values', () => {
  const input = base();
  input.supply.frequencyHz = 50;
  input.equipment[0].powerFactor = 0.9;
  input.equipment[0].duty = 'intermittent';
  const evidence = buildDesignSynthesisInputEvidence(input);
  assert.equal(evidence.valid, true);
  assert.deepEqual(evidence.units, { coordinate: 'ft', corridor: 'in', voltage: 'V', power: 'kW', capacity: 'kVA', frequency: 'Hz', motorVoltage: 'V', motorCurrent: 'A', motorPowerFactor: 'per-unit', impedance: 'ohm per phase' });
  assert.equal(evidence.records.supply.classification, 'synthetic');
  assert.deepEqual(evidence.records.equipment[0].values.powerFactor, { value: 0.9, basis: 'provided' });
  assert.deepEqual(evidence.records.equipment[0].values.duty, { value: 'intermittent', basis: 'provided' });
  assert.deepEqual(evidence.records.equipment[0].values.frequencyHz, { value: 50, basis: 'inherited', source: 'supply.frequencyHz' });
  assert.deepEqual(evidence.records.equipment[0].values.ratingsBasis, { value: 'electrical-input-kW', basis: 'default' });
  assert.deepEqual(evidence.records.equipment[0].values.kw, { value: 10, basis: 'provided' });
  assert.deepEqual(evidence.records.equipment[0].values.x, undefined);
  assert.deepEqual(evidence.records.supply.values.voltage, undefined);
});

test('per-record provenance overrides the input default and retains documents without verification claims', () => {
  const input = base();
  input.equipment[0].provenance = { kind: 'document-referenced', note: 'rating sheet' };
  input.equipment[0].sourceDocuments = [{ id: 'sheet-1', revision: 'A' }];
  const before = structuredClone(input);
  const evidence = buildDesignSynthesisInputEvidence(input);
  assert.deepEqual(input, before);
  assert.equal(evidence.records.equipment[0].classification, 'document-referenced');
  assert.deepEqual(evidence.records.equipment[0].sourceDocuments, input.equipment[0].sourceDocuments);
  assert.equal(evidence.records.equipment[0].verified, undefined);
});

test('implicit records remain user-supplied and document classification requires documents', () => {
  const input = { supply: { id: 'S1' }, equipment: [{ id: 'M1' }] };
  assert.equal(buildDesignSynthesisInputEvidence(input).records.equipment[0].classification, 'user-supplied');
  input.provenance = 'document-referenced';
  const result = validateDesignSynthesisInputEvidence(input);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some(issue => issue.path === 'supply.sourceDocuments'));
});

test('invalid provenance shapes and kinds are blocking', () => {
  for (const provenance of ['verified', 4, { kind: 'synthetic', note: 3 }, { kind: 'document-referenced', references: 'bad' }, { kind: 'synthetic', extra: true }]) {
    const result = validateDesignSynthesisInputEvidence({ supply: { id: 'S1' }, equipment: [], provenance });
    assert.equal(result.ok, false, JSON.stringify(provenance));
  }
});

test('record evidence arrays and effective frequency are validated', () => {
  const malformed = { supply: { id: 'S1', sourceDocuments: [{}] }, equipment: [{ id: 'M1', sourceDocuments: 'sheet' }] };
  assert.equal(validateDesignSynthesisInputEvidence(malformed).ok, false);
  const conflict = { supply: { id: 'S1', frequencyHz: 60 }, equipment: [{ id: 'M1', frequencyHz: 50 }] };
  const result = validateDesignSynthesisInputEvidence(conflict);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some(issue => issue.path === 'equipment[0].frequencyHz'));
  const inherited = buildDesignSynthesisInputEvidence({ supply: { id: 'S1' }, criteria: { frequencyHz: 50 }, equipment: [{ id: 'M1' }] });
  assert.deepEqual(inherited.records.equipment[0].values.frequencyHz, { value: 50, basis: 'inherited', source: 'criteria.frequencyHz' });
});

test('frequency aliases cannot hide invalid values or conflict across supply, criteria and equipment', () => {
  for (const input of [
    { supply: { frequencyHz: 60, frequency: 50 } },
    { supply: { frequencyHz: 60 }, criteria: { frequency: 50 } },
    { supply: { frequencyHz: 60 }, equipment: [{ frequencyHz: 60, frequency: 50 }] },
    { supply: { frequencyHz: null } }, { supply: { frequency: '60' } },
    { supply: { frequencyHz: 60 }, equipment: [{ frequency: 0 }] },
  ]) assert.equal(validateDesignSynthesisInputEvidence(input).ok, false, JSON.stringify(input));
  assert.equal(validateDesignSynthesisInputEvidence({ supply: { frequency: 60, frequencyHz: 60 }, criteria: { frequency: 60 }, equipment: [{ frequency: 60 }] }).ok, true);
});

test('empty evidence arrays are valid absence for non-document records', () => {
  const input = { supply: { id: 'S1', sourceDocuments: [], references: [] }, equipment: [{ id: 'M1', sourceDocuments: [], references: [] }] };
  assert.equal(validateDesignSynthesisInputEvidence(input).ok, true);
  input.provenance = 'document-referenced';
  const result = validateDesignSynthesisInputEvidence(input);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some(issue => issue.path === 'supply.sourceDocuments'));
});
