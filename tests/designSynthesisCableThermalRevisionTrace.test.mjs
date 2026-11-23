import assert from 'node:assert/strict';
import test from 'node:test';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';
import { validateDesignSynthesisCableFaultWithstandRevision } from '../analysis/designSynthesisCableFaultWithstand.mjs';
import { cableThermalRevisionFixture } from './helpers/cableThermalRevisionFixture.mjs';

const input = cableThermalRevisionFixture({ count: 25, selected: true, maxRevisions: 3, r: 0.004, x: 0.012 });
input.supply.availableFaultCurrentKA = 25;
input.faultEvolution.profiles[0].points = [
  { timeS: 0, emfMultiplier: 1 }, { timeS: 0.03, emfMultiplier: 0.4 }, { timeS: 0.1, emfMultiplier: 0 },
];
const proposal = generateDesignProposal(input);
const validTrace = proposal.cableFaultWithstandRevision;

test('automatic thermal revision trace binds the configured maximum and absolute candidate chronology', () => {
  assert.equal(validateDesignSynthesisCableFaultWithstandRevision(validTrace, proposal), true);

  const wrongBudget = structuredClone(validTrace);
  wrongBudget.revisionBudget.maximum = 64;
  wrongBudget.revisionBudget.remaining = 64 - wrongBudget.revisionBudget.used;
  assert.equal(validateDesignSynthesisCableFaultWithstandRevision(wrongBudget, proposal), false);

  const overlappingCandidate = structuredClone(validTrace);
  overlappingCandidate.history[1].revision = 0;
  assert.equal(validateDesignSynthesisCableFaultWithstandRevision(overlappingCandidate, proposal), false);

  const nestedBeforeCandidate = structuredClone(validTrace);
  nestedBeforeCandidate.history[1].nestedRevisions[0].revision = 0;
  assert.equal(validateDesignSynthesisCableFaultWithstandRevision(nestedBeforeCandidate, proposal), false);
});

test('automatic thermal revision trace requires complete initial identities and sourced stock transitions', () => {
  const missingInitialCable = structuredClone(validTrace);
  missingInitialCable.initialCableSizes.pop();
  assert.equal(validateDesignSynthesisCableFaultWithstandRevision(missingInitialCable, proposal), false);

  const alteredInitialStock = structuredClone(validTrace);
  alteredInitialStock.initialCableSizes[0].stockId = 'unknown-stock';
  assert.equal(validateDesignSynthesisCableFaultWithstandRevision(alteredInitialStock, proposal), false);

  const unknownInitialSize = structuredClone(validTrace);
  unknownInitialSize.initialCableSizes[0].size = 'unsupported conductor';
  assert.equal(validateDesignSynthesisCableFaultWithstandRevision(unknownInitialSize, proposal), false);

  const alteredDeltaStock = structuredClone(validTrace);
  alteredDeltaStock.history[1].conductorChanges[0].toStockId = '606939';
  assert.equal(validateDesignSynthesisCableFaultWithstandRevision(alteredDeltaStock, proposal), false);

  const alteredFeederFloor = structuredClone(validTrace);
  alteredFeederFloor.history[1].requestedFeederFloors['L-01'] = '#750 kcmil';
  assert.equal(validateDesignSynthesisCableFaultWithstandRevision(alteredFeederFloor, proposal), false);
});

test('automatic thermal trace records the selected endpoint conduit and conductor OD change', () => {
  const endpointProposal = generateDesignProposal(cableThermalRevisionFixture({ selected: true, maxRevisions: 2, r: 0.01, x: 0.03, endpoint: true }));
  const changes = endpointProposal.cableFaultWithstandRevision.history.flatMap(row => row.racewayChanges)
    .filter(row => row.id === 'EC-C-L-01-destination');
  assert.equal(changes.length, 2);
  assert.equal(changes[0].before.tradeSize, '1-1/4');
  assert.equal(changes[0].after.tradeSize, '1-1/4');
  assert.equal(changes[0].before.conductorOdsIn[0].outsideDiameterIn, 0.833);
  assert.equal(changes[0].after.conductorOdsIn[0].outsideDiameterIn, 0.910);
  assert.equal(changes[1].before.tradeSize, '1-1/4');
  assert.equal(changes[1].after.tradeSize, '1-1/2');
  assert.equal(changes[1].before.conductorOdsIn[0].outsideDiameterIn, 0.910);
  assert.equal(changes[1].after.conductorOdsIn[0].outsideDiameterIn, 1.012);
  assert.equal(validateDesignSynthesisCableFaultWithstandRevision(endpointProposal.cableFaultWithstandRevision, endpointProposal), true);
});
