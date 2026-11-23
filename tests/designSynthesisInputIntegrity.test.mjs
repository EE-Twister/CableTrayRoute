import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';
import { validateDesignSynthesisInput } from '../analysis/designSynthesisInput.mjs';

const sample = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-industrial.json', import.meta.url), 'utf8'));

function checkedInput(mutator) {
  const input = structuredClone(sample);
  mutator(input);
  return input;
}

test('corridor permission aliases require booleans and cannot contradict', () => {
  const stringFlag = checkedInput(input => { input.corridors.edges[0].permitted = 'false'; });
  const contradiction = checkedInput(input => { input.corridors.edges[0].permitted = true; input.corridors.edges[0].allowed = false; });
  assert.equal(generateDesignProposal(stringFlag).status, 'blocked');
  assert.ok(generateDesignProposal(stringFlag).issues.some(issue => issue.code === 'INVALID_CORRIDOR_PERMISSION'));
  assert.ok(generateDesignProposal(contradiction).issues.some(issue => issue.code === 'CONFLICTING_CORRIDOR_PERMISSION'));
  assert.equal(sample.corridors.edges[0].permitted, undefined);
});

test('frequency aliases validate every supplied value and conflict', () => {
  for (const value of [null, true, false, '60', Number.NaN, 50]) {
    const input = checkedInput(item => { item.supply.frequencyHz = value; item.supply.frequency = 60; });
    const result = validateDesignSynthesisInput(input);
    assert.equal(result.ok, false, `frequencyHz=${String(value)} should be rejected`);
  }
  const conflicting = checkedInput(input => { input.criteria.frequencyHz = 60; input.criteria.frequency = 50; });
  const equipmentConflict = checkedInput(input => { input.equipment[0].frequencyHz = 60; input.equipment[0].frequency = 50; });
  assert.ok(validateDesignSynthesisInput(conflicting).issues.some(issue => issue.code === 'CONFLICTING_FREQUENCY_ALIASES'));
  assert.ok(validateDesignSynthesisInput(equipmentConflict).issues.some(issue => issue.code === 'CONFLICTING_FREQUENCY_ALIASES'));
});

test('external minimum conductor ampacity is rejected instead of overwritten', () => {
  const input = checkedInput(item => { item.criteria.minimumConductorAmpacity = 1; });
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.status, 'blocked');
  assert.ok(proposal.issues.some(issue => issue.code === 'UNSUPPORTED_EXTERNAL_AMPACITY'));
  assert.equal(proposal.inputs.original.criteria.minimumConductorAmpacity, 1);
});

test('unknown criteria keys are explicit blockers instead of ignored defaults', () => {
  const input = checkedInput(item => { item.criteria.voltageDropLimitPercent = 0.1; });
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.status, 'blocked');
  assert.ok(proposal.issues.some(issue => issue.code === 'UNKNOWN_DESIGN_CRITERION' && issue.path === 'criteria.voltageDropLimitPercent'));
  assert.equal(proposal.inputs.original.criteria.voltageDropLimitPercent, 0.1);
});

test('available fault current requires a finite positive number', () => {
  for (const value of [true, false, '20', null, 0, -1, Number.NaN]) {
    const input = checkedInput(item => { item.supply.availableFaultCurrentKA = value; });
    const proposal = generateDesignProposal(input);
    assert.equal(proposal.status, 'blocked', `availableFaultCurrentKA=${String(value)} should be rejected`);
    assert.ok(proposal.issues.some(issue => issue.code === 'INVALID_AVAILABLE_FAULT_CURRENT'));
  }
});
