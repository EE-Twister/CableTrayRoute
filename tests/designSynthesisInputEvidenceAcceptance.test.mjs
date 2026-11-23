import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';

const sample = () => JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-industrial.json', import.meta.url), 'utf8'));

test('generated evidence identifies synthetic inputs and distinguishes supplied values from effective defaults', () => {
  const input = sample();
  delete input.equipment[0].powerFactor;
  delete input.equipment[0].duty;
  delete input.equipment[0].ratingsBasis;
  input.supply.frequencyHz = 60;
  const original = structuredClone(input);
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.status, 'proposal');
  assert.deepEqual(input, original);
  const evidence = proposal.inputEvidence;
  assert.equal(evidence.valid, true);
  assert.equal(evidence.units.coordinate, 'ft');
  assert.equal(evidence.units.corridor, 'in');
  assert.equal(evidence.records.supply.classification, 'synthetic');
  assert.equal(evidence.records.supply.values.powerFactor, undefined);
  assert.equal(evidence.records.supply.values.duty, undefined);
  const row = evidence.records.equipment.find(item => item.id === input.equipment[0].id);
  assert.equal(row.classification, 'synthetic');
  assert.deepEqual(row.values.kw, { value: input.equipment[0].kw, basis: 'provided' });
  assert.deepEqual(row.values.powerFactor, { value: 1, basis: 'default' });
  assert.deepEqual(row.values.duty, { value: 'continuous', basis: 'default' });
  assert.deepEqual(row.values.ratingsBasis, { value: 'electrical-input-kW', basis: 'default' });
  assert.deepEqual(row.values.frequencyHz, { value: 60, basis: 'inherited', source: 'supply.frequencyHz' });
  const normalized = proposal.loads.find(item => item.id === row.id);
  assert.equal(normalized.powerFactor, row.values.powerFactor.value);
  assert.equal(normalized.duty, row.values.duty.value);
  assert.equal(normalized.kva, input.equipment[0].kw);
});

test('changing provenance changes proposal identity and per-record document evidence remains unverified', () => {
  const input = sample();
  const before = generateDesignProposal(input);
  input.provenance = { kind: 'user-supplied', note: 'Imported equipment list' };
  const after = generateDesignProposal(input);
  assert.notEqual(after.inputSignature, before.inputSignature);
  input.equipment[0].provenance = { kind: 'document-referenced', note: 'Nameplate transcription' };
  input.equipment[0].sourceDocuments = [{ id: 'nameplate-1', revision: 'A' }];
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.status, 'proposal');
  const row = proposal.inputEvidence.records.equipment[0];
  assert.equal(row.classification, 'document-referenced');
  assert.deepEqual(row.sourceDocuments, input.equipment[0].sourceDocuments);
  assert.equal(row.verified, undefined);
  assert.equal(row.approved, undefined);
  assert.equal(proposal.inputEvidence.records.equipment[1].classification, 'user-supplied');
});

test('invalid or conflicting input evidence blocks synthesis before generating circuits', () => {
  for (const mutate of [
    input => { input.provenance = 'verified'; },
    input => { input.equipment[0].sourceDocuments = [{}]; },
    input => { input.equipment[0].provenance = 'document-referenced'; input.equipment[0].sourceDocuments = []; },
    input => { input.equipment[0].frequencyHz = 50; },
  ]) {
    const input = sample();
    mutate(input);
    const proposal = generateDesignProposal(input);
    assert.equal(proposal.status, 'blocked');
    assert.equal(proposal.cables.length, 0);
    assert.ok(proposal.issues.some(item => item.code === 'INVALID_PROVENANCE'));
  }
});
