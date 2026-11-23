import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';

const sample = () => JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-industrial.json', import.meta.url), 'utf8'));

function blocked(input, expectedPath) {
  const original = structuredClone(input);
  const proposal = generateDesignProposal(input);
  assert.deepEqual(input, original, 'Validation must not rewrite user-supplied engineering values');
  assert.equal(proposal.status, 'blocked');
  assert.ok(proposal.issues.some(issue => issue.severity === 'blocking' && issue.path === expectedPath), JSON.stringify(proposal.issues));
  assert.equal(proposal.cables.length, 0, 'Invalid permission or source basis must block before cable selection');
  assert.deepEqual(proposal.inputs.original, original);
  assert.equal(proposal.loadDispositions.length, 30);
  assert.ok(proposal.loadDispositions.every(row => row.status !== 'accepted'));
}

test('corridor permissions cannot silently reinterpret text, null, or numeric values', () => {
  for (const field of ['permitted', 'allowed']) {
    for (const value of ['false', 'true', 0, 1, null, [], {}]) {
      const input = sample();
      input.corridors.edges[0][field] = value;
      blocked(input, `corridors.edges[0].${field}`);
    }
  }
});

test('explicit frequency aliases cannot hide a contradictory or invalid supplied value', () => {
  for (const scope of ['supply', 'criteria', 'equipment']) {
    for (const value of [50, null, '60', true, Infinity]) {
      const input = sample();
      const record = scope === 'equipment' ? input.equipment[0] : input[scope];
      record.frequencyHz = 60;
      record.frequency = value;
      const prefix = scope === 'equipment' ? 'equipment[0]' : scope;
      const proposal = generateDesignProposal(input);
      assert.equal(proposal.status, 'blocked', `${scope}: ${String(value)}`);
      assert.ok(proposal.issues.some(issue => issue.severity === 'blocking' && issue.path.startsWith(prefix)));
      assert.equal(proposal.cables.length, 0);
    }
  }
});

test('source fault current requires a finite positive number rather than coercion', () => {
  for (const value of [true, false, '20', null, 0, -1, NaN, Infinity, {}]) {
    const input = sample();
    input.supply.availableFaultCurrentKA = value;
    blocked(input, 'supply.availableFaultCurrentKA');
  }
});

test('an externally supplied conductor minimum cannot be overwritten silently', () => {
  const input = sample();
  input.criteria.minimumConductorAmpacity = 500;
  blocked(input, 'criteria.minimumConductorAmpacity');
});

test('supported equivalent frequency and permission aliases preserve the generated design', () => {
  const input = sample();
  const baseline = generateDesignProposal(input);
  for (const record of [input.supply, input.criteria, ...input.equipment]) {
    record.frequency = 60;
    record.frequencyHz = 60;
  }
  for (const edge of input.corridors.edges) { edge.permitted = true; edge.allowed = true; }
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.status, 'proposal', JSON.stringify(proposal.issues));
  assert.deepEqual(proposal.cables, baseline.cables);
  assert.deepEqual(proposal.panels, baseline.panels);
});
