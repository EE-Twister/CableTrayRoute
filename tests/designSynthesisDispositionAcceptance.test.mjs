import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';

const sample = () => JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-industrial.json', import.meta.url), 'utf8'));

test('all successful input loads have indexed acceptance records preserving their original inputs', () => {
  const input = sample();
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.status, 'proposal');
  assert.equal(proposal.loadDispositions.length, 30);
  assert.deepEqual(proposal.loadDispositions.map(row => row.inputIndex), Array.from({ length: 30 }, (_, index) => index));
  assert.ok(proposal.loadDispositions.every(row => row.status === 'accepted'));
  assert.deepEqual(proposal.loadDispositions.map(row => row.original), input.equipment);
});

test('early input failure accounts for malformed, duplicate, and otherwise valid rows without implying acceptance', () => {
  const input = sample();
  input.equipment[0].kw = -10;
  input.equipment[1] = null;
  input.equipment[3].id = input.equipment[2].id;
  const original = structuredClone(input);
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.status, 'blocked');
  assert.equal(proposal.cables.length, 0);
  assert.equal(proposal.loadDispositions.length, 30);
  assert.deepEqual(proposal.loadDispositions.map(row => row.original), input.equipment);
  assert.equal(proposal.loadDispositions[0].status, 'rejected');
  assert.equal(proposal.loadDispositions[1].status, 'rejected');
  assert.equal(proposal.loadDispositions[3].status, 'rejected');
  assert.ok(proposal.loadDispositions[0].issues.some(issue => issue.code === 'INVALID_LOAD_KW'));
  assert.ok(proposal.loadDispositions[3].issues.some(issue => issue.code === 'DUPLICATE_ID'));
  assert.equal(proposal.loadDispositions[4].status, 'deferred');
  assert.ok(!proposal.loadDispositions.some(row => row.status === 'accepted'));
  assert.deepEqual(input, original);
});

test('global failure defers input rows and identifies the reason without discarding them', () => {
  const input = sample();
  input.supply.capacityKva = 1;
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.status, 'blocked');
  assert.equal(proposal.loadDispositions.length, input.equipment.length);
  assert.ok(proposal.loadDispositions.every(row => row.status === 'deferred'));
  assert.ok(proposal.globalBlockingIssues.some(issue => issue.code === 'SOURCE_CAPACITY_EXCEEDED'));
});
