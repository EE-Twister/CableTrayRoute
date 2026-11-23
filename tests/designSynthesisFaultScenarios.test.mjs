import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';
import { evaluateDesignSynthesisFaultScenarios } from '../analysis/designSynthesisFaultScenarios.mjs';
import { buildDesignSynthesisOneLine } from '../analysis/designSynthesisOneLine.mjs';

const supply = { id: 'UTILITY', tag: 'UTILITY', type: 'source', voltage: 480, phases: 3, availableFaultCurrentKA: 25 };
const motor = { id: 'MOTOR', tag: 'MOTOR', type: 'load', voltage: 480, phases: 3, motor: { ratedVoltageV: 460 } };
const device = { id: 'BREAKER', type: 'breaker', interruptingRatingKA: 65, interruptingRatingVoltageVac: 480, evaluatedVoltageVac: 480, sourceIds: ['RATING'], sourceDocuments: ['RATING'], fieldSources: [{ pointer: '/candidate/branchCircuitBreaker/interruptingRatingKA', sourceId: 'RATING' }, { pointer: '/candidate/branchCircuitBreaker/ratedVoltageV', sourceId: 'RATING' }] };
const industrialSample = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-industrial.json', import.meta.url), 'utf8'));
function proposal() {
  const cable = { id: 'C-MOTOR', from: 'UTILITY', to: 'MOTOR', lengthFt: 100, conductor_size: '#8 AWG', r_ohm_per_kft: 0.810, x_ohm_per_kft: 0.052, impedanceBasis: 'Southwire SPEC45301 rev1.000.008', cableStockId: '606939', protectiveDevice: structuredClone(device) };
  const equipment = [supply, motor];
  const cables = [cable];
  return { inputs: { original: { supply } }, equipment, loads: [motor], cables, oneLine: buildDesignSynthesisOneLine({ supply, loads: [motor], cables }) };
}
function study({ motorOn = true, rOhm = 0.01, faultBusIds } = {}) {
  return {
    networkBaseMVA: 1,
    sourceInventory: { status: 'complete', reference: 'Synthetic complete inventory A' },
    sources: [
      { equipmentId: 'UTILITY', emfPhaseV: { re: 480 / Math.sqrt(3), im: 0 }, impedance: { rOhm, xOhm: 0.015 }, inService: true, reference: 'Synthetic utility equivalent A' },
      { equipmentId: 'MOTOR', emfPhaseV: { re: 460 / Math.sqrt(3), im: 0 }, impedance: { rOhm: 0.5, xOhm: 0.2 }, inService: motorOn, reference: 'Synthetic motor equivalent A' },
    ],
    ...(faultBusIds ? { faultBusIds } : {}),
  };
}
function scenarios(a = study(), b = study({ motorOn: false })) {
  return [{ id: 'run', reference: 'Run condition', study: a }, { id: 'stopped', reference: 'Stopped motor condition', study: b }];
}

test('scenario envelopes compare independently evaluated motor on and off source cases', () => {
  const p = proposal(); const input = scenarios(); const before = structuredClone(p);
  const result = evaluateDesignSynthesisFaultScenarios({ proposal: p, faultScenarios: input });
  assert.equal(result.status, 'evaluated', JSON.stringify(result.issues));
  assert.equal(result.coverage.scope, 'supplied-scenarios-only');
  assert.equal(result.coverage.verifiedAsExtrema, false);
  assert.equal(result.scenarios.length, 2);
  assert.equal(result.busEnvelopes.length, 2);
  assert.equal(result.deviceEnvelopes.length, 1);
  assert.equal(result.deviceEnvelopes[0].protectionStatus, 'not-evaluated');
  assert.deepEqual(p, before);
  const motorBus = result.busEnvelopes.find(item => item.busId === 'MOTOR');
  assert.ok(motorBus.minimum.valueKA < motorBus.maximum.valueKA);
  assert.deepEqual([motorBus.minimum.scenarioId, motorBus.maximum.scenarioId], ['stopped', 'run']);
});

test('scenario fingerprints include source inputs and preserve equal-value tie ordering', () => {
  const first = evaluateDesignSynthesisFaultScenarios({ proposal: proposal(), faultScenarios: scenarios() });
  const changed = evaluateDesignSynthesisFaultScenarios({ proposal: proposal(), faultScenarios: scenarios(study({ rOhm: 0.02 }), study({ motorOn: false })) });
  assert.notEqual(first.modelInputFingerprint, changed.modelInputFingerprint);
  const changedBoundProposal = proposal();
  changedBoundProposal.inputs.original.supply = { ...supply, availableFaultCurrentKA: 30 };
  const changedBound = evaluateDesignSynthesisFaultScenarios({ proposal: changedBoundProposal, faultScenarios: scenarios() });
  assert.notEqual(first.modelInputFingerprint, changedBound.modelInputFingerprint);
  const tied = evaluateDesignSynthesisFaultScenarios({ proposal: proposal(), faultScenarios: scenarios(study(), study()) });
  const row = tied.busEnvelopes.find(item => item.busId === 'MOTOR');
  assert.equal(row.minimum.scenarioId, 'run');
  assert.equal(row.maximum.scenarioId, 'run');
});

test('malformed, duplicate, unknown-field, legacy-conflict, and partial bus inputs suppress all envelopes', () => {
  const base = scenarios();
  for (const candidate of [
    [{ ...base[0], id: ' ' }, base[1]],
    [base[0], { ...base[1], id: base[0].id }],
    [base[0], { ...base[1], surprise: true }],
    [base[0], { ...base[1], study: { ...base[1].study, sourceInventories: [] } }],
  ]) {
    const result = evaluateDesignSynthesisFaultScenarios({ proposal: proposal(), faultScenarios: candidate });
    assert.equal(result.status, 'blocked');
    assert.deepEqual(result.busEnvelopes, []);
    assert.deepEqual(result.deviceEnvelopes, []);
  }
  const partial = scenarios(study({ faultBusIds: ['MOTOR'] }), study());
  const partialResult = evaluateDesignSynthesisFaultScenarios({ proposal: proposal(), faultScenarios: partial });
  assert.equal(partialResult.status, 'blocked');
  assert.deepEqual(partialResult.busEnvelopes, []);
  const conflictProposal = proposal(); conflictProposal.inputs.original.faultStudy = study();
  const conflict = evaluateDesignSynthesisFaultScenarios({ proposal: conflictProposal, faultScenarios: base });
  assert.ok(conflict.issues.some(item => item.code === 'FAULT_SCENARIO_LEGACY_CONFLICT'));
  assert.equal(conflict.status, 'blocked');
  const repeatedReference = evaluateDesignSynthesisFaultScenarios({ proposal: proposal(), faultScenarios: [{ ...base[0], reference: 'Same engineering document' }, { ...base[1], reference: 'Same engineering document' }] });
  assert.equal(repeatedReference.status, 'evaluated');
});

test('out-of-range scenario counts short-circuit before evaluation', () => {
  const oversized = Array.from({ length: 1000 }, (_, index) => ({ id: `s${index}`, reference: `condition ${index}`, study: study() }));
  const result = evaluateDesignSynthesisFaultScenarios({ proposal: proposal(), faultScenarios: oversized });
  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.scenarios, []);
  assert.deepEqual(result.busEnvelopes, []);
  assert.deepEqual(result.deviceEnvelopes, []);
});

test('rating exceedance keeps the complete numeric envelopes for proposal-level blocking', () => {
  const p = proposal();
  p.cables[0].protectiveDevice.interruptingRatingKA = 0.01;
  const result = evaluateDesignSynthesisFaultScenarios({ proposal: p, faultScenarios: scenarios() });
  assert.equal(result.status, 'evaluated');
  assert.equal(result.coverage.status, 'complete');
  assert.ok(result.busEnvelopes.length > 0);
  assert.ok(result.deviceEnvelopes.length > 0);
  assert.ok(result.scenarios.some(row => row.deviceFaultValidation.issues.some(item => item.code === 'DEVICE_FAULT_SCREEN_RATING_EXCEEDED')));
});

test('invalid standalone rating evidence blocks envelopes even when current phasors are numeric', () => {
  const p = proposal();
  p.cables[0].protectiveDevice.interruptingRatingVoltageVac = 240;
  const result = evaluateDesignSynthesisFaultScenarios({ proposal: p, faultScenarios: scenarios() });
  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.deviceEnvelopes, []);
  assert.ok(result.scenarios.every(row => row.deviceFaultValidation.placements.every(placement => typeof placement.comparisons.lineTerminalAvailableInitialRms.phasorKA.re === 'number')));
  assert.ok(result.scenarios.some(row => row.deviceFaultValidation.issues.some(item => item.code === 'DEVICE_FAULT_SCREEN_RATING_NOT_COMPARABLE')));
});

test('generator integrates source scenarios, fingerprints them, and rejects legacy-study conflicts', () => {
  const input = structuredClone(industrialSample);
  const scenarioStudy = rOhm => ({
    networkBaseMVA: 1,
    sourceInventory: { status: 'complete', reference: 'Same synthetic inventory document' },
    sources: [{ equipmentId: input.supply.id, emfPhaseV: { re: input.supply.voltage / Math.sqrt(3), im: 0 }, impedance: { rOhm, xOhm: 0.015 }, inService: true, reference: 'Same utility equivalent document' }],
  });
  input.faultScenarios = [
    { id: 'nominal', reference: 'Same engineering document', study: scenarioStudy(0.01) },
    { id: 'alternate', reference: 'Same engineering document', study: scenarioStudy(0.02) },
  ];
  const first = generateDesignProposal(input);
  assert.equal(first.faultScenarioValidation.status, 'evaluated', JSON.stringify(first.faultScenarioValidation.issues));
  assert.equal(first.status, 'proposal');
  assert.ok(first.faultScenarioValidation.busEnvelopes.length > 0);
  const changed = structuredClone(input);
  changed.faultScenarios[1].study.sources[0].impedance.rOhm = 0.025;
  const second = generateDesignProposal(changed);
  assert.notEqual(first.inputSignature, second.inputSignature);
  const conflict = structuredClone(input);
  conflict.faultStudy = scenarioStudy(0.01);
  const blocked = generateDesignProposal(conflict);
  assert.equal(blocked.status, 'blocked');
  assert.ok(blocked.issues.some(item => item.code === 'FAULT_SCENARIO_LEGACY_CONFLICT'));
});
