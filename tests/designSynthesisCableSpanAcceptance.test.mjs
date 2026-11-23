import assert from 'node:assert/strict';
import test from 'node:test';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';
import { evaluateDesignSynthesisCableFaultWithstand } from '../analysis/designSynthesisCableFaultWithstand.mjs';
import { cableThermalRevisionFixture } from './helpers/cableThermalRevisionFixture.mjs';
import { faultEvolutionFixture } from './helpers/faultEvolutionFixture.mjs';

for (const [count, selected] of [[25, true], [50, false]]) {
  test(`${count}-load continuous faults rebuild every span-target pair after automatic conductor trials`, () => {
    const input = cableThermalRevisionFixture({ count, selected, maxRevisions: 3, r: 0.004, x: 0.012 });
    input.supply.availableFaultCurrentKA = 25;
    input.criteria.loadFlow.minimumVoltagePu = 0.99;
    input.cableFaultWithstand.faultSelection.mode = 'all-generated-bus-and-cable-span-faults';
    input.faultEvolution.profiles[0].points = [{ timeS: 0, emfMultiplier: 1 }, { timeS: 0.03, emfMultiplier: 0.4 }, { timeS: 0.1, emfMultiplier: 0 }];
    const proposal = generateDesignProposal(input);
    assert.equal(proposal.status, 'proposal', JSON.stringify(proposal.issues));
    const screen = proposal.cableFaultWithstandValidation;
    assert.equal(screen.status, 'evaluated', JSON.stringify(screen.issues));
    assert.equal(screen.comparison, 'pass');
    assert.equal(screen.coverage.generatedCableSpanCount, proposal.cables.length);
    const targets = selected ? 1 : proposal.cables.length;
    assert.equal(screen.coverage.evaluatedSpanTargetPairCount, proposal.cables.length * targets);
    assert.equal(screen.spanValidation.coverage.evaluatedTerminalCount, 2 * proposal.cables.length * targets);
    assert.equal(screen.coverage.evaluatedComparisonCount, targets * (proposal.cables.length + proposal.faultStudyValidation.cases.length));
    assert.equal(proposal.cableFaultWithstandRevision.revisionBudget.used, 2);
    assert.deepEqual(proposal.inputs.original.criteria, input.criteria);
    const feeder = proposal.cables.find(row => row.id === 'F-DP-01');
    const source = input.faultStudy.sources[0];
    const integral = 0.03 * (1 + 0.4 + 0.4 ** 2) / 3 + 0.07 * 0.4 ** 2 / 3;
    for (const row of screen.cases.filter(item => item.caseKind === 'continuous-cable-span-envelope')) {
      const upstreamR = row.cableId === feeder.id ? 0 : feeder.r_ohm_per_kft * feeder.lengthFt / 1000;
      const upstreamX = row.cableId === feeder.id ? 0 : feeder.x_ohm_per_kft * feeder.lengthFt / 1000;
      const expected = source.emfPhaseV.re ** 2 / ((source.impedance.rOhm + upstreamR) ** 2 + (source.impedance.xOhm + upstreamX) ** 2) * integral;
      assert.ok(Math.abs(row.currentSquaredExposureA2S - expected) <= 2e-9 * Math.max(1, expected));
      assert.equal(row.faultSpanId, row.cableId);
      assert.equal(row.faultPosition, 0);
    }
    const altered = structuredClone(proposal);
    altered.faultStudy.sources[0].impedance.rOhm *= 2;
    assert.equal(evaluateDesignSynthesisCableFaultWithstand({ request: input.cableFaultWithstand, proposal: altered }).status, 'blocked', 'The span network cannot disagree with the applied initial-study fingerprint');
  });
}

test('the continuous mode rejects a restricted initial bus-fault list rather than claiming all generated coverage', () => {
  const input = cableThermalRevisionFixture({ count: 25, selected: true, maxRevisions: 0 });
  input.cableFaultWithstand.faultSelection.mode = 'all-generated-bus-and-cable-span-faults';
  input.faultStudy.faultBusIds = ['DP-01'];
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.cableFaultWithstandValidation.status, 'blocked');
  assert.ok(proposal.cableFaultWithstandValidation.issues.length > 0, JSON.stringify(proposal.cableFaultWithstandValidation));
  assert.equal(proposal.cableFaultWithstandValidation.coverage.status, 'incomplete');
  assert.deepEqual(proposal.cableFaultWithstandValidation.cases, []);
});

test('multisource motor infeed retains complete continuous coverage and its existing motor protection block', () => {
  const input = faultEvolutionFixture(25, true);
  input.criteria.loadFlow = { maxRevisions: 3 };
  input.faultStudy.sources[0].impedance = { rOhm: 0.02, xOhm: 0.06 };
  input.cableFaultWithstand = cableThermalRevisionFixture({ selected: true }).cableFaultWithstand;
  input.cableFaultWithstand.faultSelection.mode = 'all-generated-bus-and-cable-span-faults';
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.cableFaultWithstandValidation.status, 'evaluated', JSON.stringify(proposal.cableFaultWithstandValidation.issues));
  assert.equal(proposal.cableFaultWithstandValidation.comparison, 'pass');
  assert.equal(proposal.cableFaultWithstandValidation.spanValidation.coverage.structuralReduction, 'general-network-port-response');
  assert.equal(proposal.cableFaultWithstandValidation.spanValidation.coverage.evaluatedPairCount, proposal.cables.length);
  assert.equal(proposal.status, 'blocked');
  assert.ok(proposal.issues.some(row => row.code === 'MOTOR_PROTECTION_UNRESOLVED'));
  assert.deepEqual(proposal.faultStudy, input.faultStudy);
  assert.deepEqual(proposal.faultEvolution, input.faultEvolution);
});
