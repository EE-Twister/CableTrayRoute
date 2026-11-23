import assert from 'node:assert/strict';
import test from 'node:test';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';
import { cableThermalRevisionFixture, independentCableThermalRows } from './helpers/cableThermalRevisionFixture.mjs';
import { faultEvolutionFixture, remoteLoadFaultOracle } from './helpers/faultEvolutionFixture.mjs';

const close = (actual, expected) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= 2e-9 * Math.max(1, Math.abs(expected)), `${actual} versus ${expected}`);
function verifyRows(proposal, input) {
  for (const row of independentCableThermalRows(proposal, input)) {
    close(row.currentSquaredExposureA2S, row.expectedExposure);
    close(row.allowableCurrentSquaredExposureA2S, row.expectedAllowance);
    assert.equal(row.comparison, row.expectedExposure <= row.expectedAllowance ? 'pass' : 'fail');
  }
  assert.equal(proposal.cableFaultWithstandValidation.qualificationStatus, 'unevaluated');
  assert.equal(proposal.cableFaultWithstandValidation.protectionAdequacy, 'unevaluated');
}

for (const [count, selected] of [[25, false], [25, true], [50, false]]) {
  test(`${count} loads ${selected ? 'selected' : 'all'}: automatic trial raises only thermal offenders and re-solves the resized network`, () => {
    const input = cableThermalRevisionFixture({ count, selected });
    const original = structuredClone(input);
    const evaluateOnly = structuredClone(input); evaluateOnly.criteria.loadFlow.maxRevisions = 0;
    const initial = generateDesignProposal(evaluateOnly);
    assert.equal(initial.cableFaultWithstandValidation.comparison, 'fail');
    verifyRows(initial, evaluateOnly);
    const offenders = new Set(initial.cableFaultWithstandValidation.cases.filter(row => row.comparison === 'fail').map(row => row.cableId));
    const final = generateDesignProposal(input);
    assert.deepEqual(input, original);
    assert.equal(final.status, 'proposal', JSON.stringify(final.issues));
    assert.equal(final.cableFaultWithstandValidation.comparison, 'pass');
    assert.equal(final.cableFaultWithstandRevision.status, 'complete');
    assert.equal(final.cableFaultWithstandRevision.revisionBudget.maximum, 3);
    assert.equal(final.cableFaultWithstandRevision.revisionBudget.used, 1);
    assert.deepEqual(final.cableFaultWithstandRevision.history.map(row => row.revision), [0, 1]);
    assert.deepEqual(final.faultStudy, initial.faultStudy);
    assert.deepEqual(final.faultEvolution, initial.faultEvolution);
    assert.deepEqual(final.cableFaultWithstand, initial.cableFaultWithstand);
    assert.notEqual(final.faultEvolutionValidation.modelInputFingerprint, initial.faultEvolutionValidation.modelInputFingerprint);
    assert.notEqual(final.cableFaultWithstandValidation.modelInputFingerprint, initial.cableFaultWithstandValidation.modelInputFingerprint);
    assert.equal(final.studyValidation.status, 'pass');
    assert.ok(final.racewayEvaluations.every(row => row.status === 'pass'));
    for (const cable of final.cables) {
      const before = initial.cables.find(row => row.id === cable.id);
      assert.equal(cable.conductor_size, offenders.has(cable.id) ? '#6 AWG' : before.conductor_size);
      if (offenders.has(cable.id)) { assert.equal(cable.cableStockId, '606947'); assert.equal(cable.cable_od, 0.910); assert.equal(cable.r_ohm_per_kft, 0.510); }
      const connection = final.oneLine.sheets[0].connections.find(row => row.cableId === cable.id);
      assert.equal(connection.cable.conductor_size, cable.conductor_size);
      assert.equal(connection.cable.cableStockId, cable.cableStockId);
      assert.equal(connection.cable.lengthFt, cable.lengthFt);
      assert.ok(cable.protectiveDevice);
    }
    verifyRows(final, input);
  });
}

test('zero and one-slot budgets keep the last actual failed model; two slots resize endpoint conduit and pass', () => {
  const cases = [0, 1, 2].map(maxRevisions => {
    const input = cableThermalRevisionFixture({ selected: true, maxRevisions, r: 0.01, x: 0.03, endpoint: true });
    const proposal = generateDesignProposal(input);
    verifyRows(proposal, input);
    assert.ok(proposal.cableFaultWithstandRevision.history.every(row => row.revision <= maxRevisions));
    assert.equal(proposal.cableFaultWithstandRevision.revisionBudget.used, maxRevisions);
    return proposal;
  });
  assert.deepEqual(cases.map(proposal => proposal.cables.find(row => row.id === 'C-L-01').conductor_size), ['#8 AWG', '#6 AWG', '#4 AWG']);
  assert.deepEqual(cases.map(proposal => proposal.status), ['blocked', 'blocked', 'proposal']);
  assert.deepEqual(cases.map(proposal => proposal.cableFaultWithstandValidation.comparison), ['fail', 'fail', 'pass']);
  const initial = cases[0].cables.find(row => row.id === 'C-L-01');
  const final = cases[2].cables.find(row => row.id === 'C-L-01');
  const initialTrade = initial.installationCoverage.segments.find(row => row.conduitId)?.tradeSize;
  const finalTrade = final.installationCoverage.segments.find(row => row.conduitId)?.tradeSize;
  assert.ok(initialTrade && finalTrade);
  assert.notEqual(finalTrade, initialTrade, 'Final endpoint conduit must be sized from the actual larger OD');
  const conduitId = final.installationCoverage.segments.find(row => row.conduitId).conduitId;
  const recorded = JSON.stringify(cases[2].cableFaultWithstandRevision.history.flatMap(row => row.racewayChanges).filter(row => row.id === conduitId));
  assert.ok(recorded.includes(initialTrade) && recorded.includes(finalTrade), 'The trial trace must report the actual endpoint conduit trade-size change');
});

test('resizing reroutes oversized tray reservations through permitted bypasses and blocks when none exists', () => {
  const inputs = [false, true].map(bypass => cableThermalRevisionFixture({ width: 12, bypass }));
  const initialInput = structuredClone(inputs[0]); initialInput.criteria.loadFlow.maxRevisions = 0;
  const initial = generateDesignProposal(initialInput);
  assert.equal(initial.racewayEvaluations.every(row => row.status === 'pass'), true);
  const blocked = generateDesignProposal(inputs[0]);
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.cableFaultWithstandRevision.status, 'stopped');
  assert.ok(blocked.cableFaultWithstandRevision.stopReason);
  assert.notEqual(blocked.cableFaultWithstandRevision.status, 'complete', 'A thermal comparison cannot make an unbuildable route a completed revision');
  if (blocked.cableFaultWithstandValidation.status === 'evaluated') verifyRows(blocked, inputs[0]);
  const rerouted = generateDesignProposal(inputs[1]);
  assert.equal(rerouted.status, 'proposal', JSON.stringify(rerouted.issues));
  assert.ok(rerouted.cables.some(row => row.routingDecision?.selectedPath?.includes('BYPASS-1')));
  assert.ok(rerouted.racewayEvaluations.every(row => row.status === 'pass'));
  assert.equal(rerouted.cableFaultWithstandValidation.comparison, 'pass');
  verifyRows(rerouted, inputs[1]);
});

test('operating and thermal trials consume one absolute budget and retain earlier unaffected conductor floors', () => {
  // Independent symmetric constant-P high-voltage quadratic gives initial .9992346513868007
  // and .9994041531890981 after one operating revision. The fixed criterion lies between them.
  const minimumVoltagePu = 0.9993194022879495;
  const results = [1, 2].map(maxRevisions => {
    const input = cableThermalRevisionFixture({ selected: true, maxRevisions, r: 0.01, x: 0.03 });
    input.criteria.loadFlow.minimumVoltagePu = minimumVoltagePu;
    const proposal = generateDesignProposal(input);
    assert.ok(proposal.cableFaultWithstandRevision.history.every(row => row.revision <= maxRevisions));
    assert.equal(proposal.cableFaultWithstandRevision.revisionBudget.used, maxRevisions);
    assert.equal(proposal.cableFaultWithstandRevision.revisionBudget.remaining, 0);
    assert.equal(proposal.cables.find(row => row.id === 'F-DP-01').conductor_size, '#3 AWG');
    assert.ok(proposal.cables.filter(row => row.loadId && row.id !== 'C-L-01').every(row => row.conductor_size === '#6 AWG'), 'Nonselected branch floors from the earlier operating revision must never shrink');
    assert.equal(proposal.studyValidation.status, 'pass');
    verifyRows(proposal, input);
    return proposal;
  });
  assert.equal(results[0].status, 'blocked');
  assert.equal(results[0].cableFaultWithstandValidation.comparison, 'fail');
  assert.equal(results[0].cables.find(row => row.id === 'C-L-01').conductor_size, '#6 AWG');
  assert.equal(results[1].status, 'proposal', JSON.stringify(results[1].issues));
  assert.equal(results[1].cableFaultWithstandValidation.comparison, 'pass');
  assert.equal(results[1].cables.find(row => row.id === 'C-L-01').conductor_size, '#4 AWG');
  for (const before of results[0].cables) {
    const after = results[1].cables.find(row => row.id === before.id);
    const oldFloor = Math.max(Number(before.designAmpacityA) || 0, Number(before.protectiveRequirement?.ampereRatingA) || 0);
    const newFloor = Math.max(Number(after.designAmpacityA) || 0, Number(after.protectiveRequirement?.ampereRatingA) || 0);
    assert.ok(newFloor >= oldFloor - 1e-12, `The retained operating-current/design floor for ${before.id} shrank: ${oldFloor} to ${newFloor}`);
  }
});

test('a utility-plus-motor network can improve cable thermal duty while motor protection still blocks Apply', () => {
  const input = faultEvolutionFixture(25, true);
  input.faultStudy.sources[0].impedance = { rOhm: 0.02, xOhm: 0.06 };
  input.criteria.loadFlow = { maxRevisions: 3 };
  input.cableFaultWithstand = cableThermalRevisionFixture({ selected: true }).cableFaultWithstand;
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.status, 'blocked');
  assert.ok(proposal.issues.some(row => row.code === 'MOTOR_PROTECTION_UNRESOLVED'));
  assert.equal(proposal.studyValidation.status, 'pass');
  assert.equal(proposal.motorStartingValidation.status, 'pass');
  assert.equal(proposal.cables.find(row => row.id === 'C-L-01').conductor_size, '#6 AWG');
  assert.equal(proposal.cableFaultWithstandRevision.status, 'complete');
  assert.equal(proposal.cableFaultWithstandValidation.comparison, 'pass');
  const initial = remoteLoadFaultOracle(proposal, input, 1, 1).faultCurrentA;
  const final = remoteLoadFaultOracle(proposal, input, 1, 0).faultCurrentA;
  const expected = 0.1 * (initial.re ** 2 + initial.im ** 2 + initial.re * final.re + initial.im * final.im + final.re ** 2 + final.im ** 2) / 3;
  const actual = proposal.cableFaultWithstandValidation.cases.find(row => row.faultBusId === 'L-01').currentSquaredExposureA2S;
  close(actual, expected);
  assert.equal(proposal.cableFaultWithstandValidation.protectionAdequacy, 'unevaluated');
});

test('a failed panel feeder advances through sourced stocks without silently enlarging unselected branches', () => {
  const input = cableThermalRevisionFixture({ maxRevisions: 12, r: 0.004, x: 0.012 });
  input.supply.availableFaultCurrentKA = 25;
  input.cableFaultWithstand.cableSelection = { mode: 'selected', cableIds: ['F-DP-01'] };
  input.cableFaultWithstand.clearing.maximumTotalClearingTimeS = 1;
  input.faultEvolution.horizonS = 1;
  input.faultEvolution.profiles[0].points = [{ timeS: 0, emfMultiplier: 1 }, { timeS: 1, emfMultiplier: 1 }];
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.status, 'proposal', JSON.stringify(proposal.issues));
  const feeder = proposal.cables.find(row => row.id === 'F-DP-01');
  assert.equal(feeder.conductor_size, '350 kcmil');
  assert.equal(feeder.cableStockId, '383646');
  assert.ok(proposal.cables.filter(row => row.loadId).every(row => row.conductor_size === '#8 AWG'));
  assert.equal(proposal.cableFaultWithstandRevision.revisionBudget.used, 9);
  assert.deepEqual(proposal.cableFaultWithstandRevision.history.map(row => row.revision), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  for (const row of independentCableThermalRows(proposal, input, 1)) {
    close(row.currentSquaredExposureA2S, row.expectedExposure);
    close(row.allowableCurrentSquaredExposureA2S, row.expectedAllowance);
    assert.equal(row.comparison, 'pass');
  }
});

test('exhausting the sourced conductor catalog keeps the last 750 kcmil fault exposure and an explicit stop', () => {
  const input = cableThermalRevisionFixture({ maxRevisions: 64, r: 0.003, x: 0.009 });
  input.supply.availableFaultCurrentKA = 35;
  input.cableFaultWithstand.cableSelection = { mode: 'selected', cableIds: ['F-DP-01'] };
  input.cableFaultWithstand.clearing.maximumTotalClearingTimeS = 5;
  input.faultEvolution.horizonS = 5;
  input.faultEvolution.profiles[0].points = [{ timeS: 0, emfMultiplier: 1 }, { timeS: 5, emfMultiplier: 1 }];
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.status, 'blocked');
  assert.equal(proposal.cables.find(row => row.id === 'F-DP-01').conductor_size, '750 kcmil');
  assert.equal(proposal.cableFaultWithstandRevision.status, 'stopped');
  assert.match(proposal.cableFaultWithstandRevision.stopReason, /^no-larger-sourced-conductor/);
  assert.equal(proposal.cableFaultWithstandRevision.revisionBudget.used, 12);
  assert.equal(proposal.cableFaultWithstandValidation.status, 'evaluated');
  assert.equal(proposal.cableFaultWithstandValidation.comparison, 'fail');
  for (const row of independentCableThermalRows(proposal, input, 5)) {
    close(row.currentSquaredExposureA2S, row.expectedExposure);
    close(row.allowableCurrentSquaredExposureA2S, row.expectedAllowance);
  }
});
