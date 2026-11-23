import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';

const complex = (re, im = 0) => ({ re, im });
const add = (a, b) => complex(a.re + b.re, a.im + b.im);
const div = (a, b) => complex((a.re * b.re + a.im * b.im) / (b.re ** 2 + b.im ** 2), (a.im * b.re - a.re * b.im) / (b.re ** 2 + b.im ** 2));
const mag = a => Math.hypot(a.re, a.im);
const close = (actual, expected) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= 1e-8 * Math.max(1, Math.abs(expected)), `${actual} versus ${expected}`);
function fixture(count = 25, motor = true) {
  const input = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-tray-congestion.json', import.meta.url), 'utf8'));
  input.equipment = Array.from({ length: count }, (_, index) => ({ ...input.equipment[0], id: `L-${String(index + 1).padStart(2, '0')}`, tag: `L-${String(index + 1).padStart(2, '0')}` }));
  input.faultStudy = {
    networkBaseMVA: 1,
    sourceInventory: { status: 'complete', reference: 'Synthetic fixture inventory only; no field verification' },
    sources: [{ equipmentId: 'S', emfPhaseV: complex(480 / Math.sqrt(3)), impedance: { rOhm: 0.006, xOhm: 0.015 }, inService: true, reference: 'Synthetic utility initial-current equivalent' }],
  };
  if (motor) {
    Object.assign(input.equipment[count - 1], { kw: 9, powerFactor: 0.86, duty: 'continuous', ratingsBasis: 'electrical-input-kW', motor: {
      ratedVoltageV: 460, fullLoadCurrentA: 14, fullLoadCurrentBasis: { reference: 'Synthetic referenced design current' },
      nameplateCurrentA: 12.8, nameplateHorsepower: 10, nameplateFrequencyHz: 60,
      lockedRotorCurrentA: 90, lockedRotorPowerFactor: 0.3, starterType: 'dol', rotorType: 'squirrel-cage',
    } });
    input.supply.motorStartingImpedance = { rOhm: 0.006, xOhm: 0.015, reference: 'Separate synthetic starting-source equivalent' };
    input.criteria.motorStarting = { minimumVoltagePu: 0.8 };
    input.criteria.motorStarter = { controlVoltageV: 24, controlCurrentType: 'DC', branchProtectionMethod: 'inverse-time-breaker', instantaneousPickupA: 150 };
    input.faultStudy.sources.push({ equipmentId: input.equipment[count - 1].id, emfPhaseV: complex(460 / Math.sqrt(3)), impedance: { rOhm: 1, xOhm: 3 }, inService: true, reference: 'Explicit synthetic initial-current motor equivalent, not inferred from LRA' });
  }
  return input;
}
const faultCase = (proposal, busId) => proposal.faultStudyValidation.cases.find(row => row.fault?.busId === busId);

test('25/50 equipment-first proposals include remote motor infeed using their actual final bypass impedance', () => {
  for (const count of [25, 50]) {
    const input = fixture(count), snapshot = structuredClone(input);
    const proposal = generateDesignProposal(input);
    assert.equal(proposal.faultStudyValidation.status, 'evaluated', JSON.stringify(proposal.faultStudyValidation.issues));
    assert.equal(proposal.faultStudyValidation.scope, 'initial-symmetrical-rms-only');
    assert.equal(proposal.faultStudyValidation.sourceInventory.verificationStatus, 'not-verified');
    const cable = proposal.cables.find(row => row.loadId === input.equipment[count - 1].id);
    assert.equal(cable.conductor_size, '#8 AWG');
    assert.deepEqual(cable.routingDecision.selectedPath, ['BYPASS-A', 'BYPASS-B']);
    const cableZ = complex(0.810 * cable.lengthFt / 1000, 0.052 * cable.lengthFt / 1000);
    const utility = div(complex(480 / Math.sqrt(3)), complex(0.006, 0.015));
    const motor = div(complex(460 / Math.sqrt(3)), add(complex(1, 3), cableZ));
    const upstream = faultCase(proposal, 'S');
    assert.equal(upstream.status, 'evaluated');
    close(upstream.fault.faultCurrentRmsKA, mag(add(utility, motor)) / 1000);
    const motorShare = upstream.sourceFaultContributions.find(row => row.sourceId === cable.loadId);
    close(motorShare.currentKA.re, motor.re / 1000);
    close(motorShare.currentKA.im, motor.im / 1000);
    const local = faultCase(proposal, cable.loadId);
    const localExpected = add(div(complex(480 / Math.sqrt(3)), add(complex(0.006, 0.015), cableZ)), div(complex(460 / Math.sqrt(3)), complex(1, 3)));
    close(local.fault.faultCurrentRmsKA, mag(localExpected) / 1000);
    assert.equal(proposal.status, 'blocked');
    assert.ok(proposal.issues.some(row => row.code === 'MOTOR_PROTECTION_UNRESOLVED'));
    assert.deepEqual(input, snapshot);
  }
});

test('fault totals are distinct from the external utility-only bound', () => {
  const input = fixture();
  input.supply.availableFaultCurrentKA = 17.2;
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.faultStudyValidation.status, 'evaluated', JSON.stringify(proposal.faultStudyValidation.issues));
  assert.ok(faultCase(proposal, 'S').fault.faultCurrentRmsKA > 17.2);
  input.faultStudy.sources[0].emfPhaseV.re *= 2;
  const inconsistent = generateDesignProposal(input);
  assert.equal(inconsistent.faultStudyValidation.status, 'blocked');
  assert.ok(inconsistent.faultStudyValidation.issues.some(row => /BOUND/.test(row.code)));
});

test('edited explicit motor impedance and final routed geometry both change the computed case and identity', () => {
  const input = fixture();
  const first = generateDesignProposal(input);
  input.faultStudy.sources[1].impedance.xOhm = 6;
  const changed = generateDesignProposal(input);
  assert.notEqual(changed.inputSignature, first.inputSignature);
  assert.notEqual(changed.faultStudyValidation.modelInputFingerprint, first.faultStudyValidation.modelInputFingerprint);
  assert.ok(faultCase(changed, 'S').fault.faultCurrentRmsKA < faultCase(first, 'S').fault.faultCurrentRmsKA);
  Object.assign(input.equipment[24], { x: 0, y: 50 });
  const moved = generateDesignProposal(input);
  assert.equal(moved.faultStudyValidation.status, 'evaluated');
  const cable = moved.cables.find(row => row.loadId === 'L-25');
  assert.equal(cable.lengthFt, 50);
  assert.notEqual(moved.faultStudyValidation.modelInputFingerprint, changed.faultStudyValidation.modelInputFingerprint);
  assert.ok(faultCase(moved, 'S').fault.faultCurrentRmsKA > faultCase(changed, 'S').fault.faultCurrentRmsKA);
});

test('missing known motor equivalents and malformed requested study data cannot silently become zero infeed', () => {
  const mutations = [
    input => { input.faultStudy.sources.pop(); },
    input => { input.faultStudy.sourceInventory.status = 'partial'; },
    input => { input.faultStudy.sources.push(structuredClone(input.faultStudy.sources[0])); },
    input => { input.faultStudy.sources[1].equipmentId = 'L-01'; },
    input => { input.faultStudy.faultBusIds = ['DOES-NOT-EXIST']; },
    input => { input.faultStudy.sources[1].impedance.xOhm = '3'; },
    input => { input.faultStudy.sources[0].reference = ''; },
    input => { input.faultStudy.typo = true; },
  ];
  for (const mutate of mutations) {
    const input = fixture(); mutate(input);
    const proposal = generateDesignProposal(input);
    assert.equal(proposal.faultStudyValidation.status, 'blocked', JSON.stringify(input.faultStudy));
    assert.ok(proposal.faultStudyValidation.issues.length);
    assert.equal(proposal.status, 'blocked');
    assert.equal(proposal.faultStudyValidation.cases.length, 0);
  }
});

test('a valid nonmotor initial study retains preliminary Apply eligibility, while an invalid explicit study blocks it', () => {
  const input = fixture(25, false);
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.status, 'proposal', JSON.stringify(proposal.issues));
  assert.equal(proposal.faultStudyValidation.status, 'evaluated');
  close(faultCase(proposal, 'S').fault.faultCurrentRmsKA, 480 / Math.sqrt(3) / Math.hypot(0.006, 0.015) / 1000);
  input.faultStudy.sources = [];
  const invalid = generateDesignProposal(input);
  assert.equal(invalid.faultStudyValidation.status, 'blocked');
  assert.equal(invalid.status, 'blocked');
  assert.equal(invalid.distributionBaseline, null);
});
