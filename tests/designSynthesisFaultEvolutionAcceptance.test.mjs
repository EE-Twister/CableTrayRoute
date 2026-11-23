import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';
import { evaluateDesignSynthesisFaultEvolution } from '../analysis/designSynthesisFaultEvolution.mjs';
import { faultEvolutionFixture, add, scale, divide, squaredMagnitude, cableOhms, remoteLoadFaultOracle } from './helpers/faultEvolutionFixture.mjs';

const near = (actual, expected) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= 2e-9 * Math.max(1, Math.abs(expected)), `${actual} versus ${expected}`);
const phasorNear = (actualKA, expectedA) => { near(actualKA.re * 1000, expectedA.re); near(actualKA.im * 1000, expectedA.im); };
const resultOf = proposal => proposal.faultEvolutionValidation;
const history = (result, cableId, faultBusId, caseKind = 'generated-bus-fault') => result.deviceHistories.find(row => row.placementId === `cable:${cableId}` && row.faultBusId === faultBusId && row.caseKind === caseKind);
const evaluate = (proposal, extra = {}) => evaluateDesignSynthesisFaultEvolution({ proposal, ...extra });

test('one utility linear suppression has independent T/3 exposure and exact zero endpoint without opening its impedance', () => {
  const input = faultEvolutionFixture(25, false);
  input.faultEvolution.profiles[0].points.at(-1).emfMultiplier = 0;
  const proposal = generateDesignProposal(input);
  const result = resultOf(proposal);
  assert.equal(result.status, 'evaluated', JSON.stringify(result.issues));
  assert.equal(evaluate(proposal).status, 'evaluated', 'Omitted evaluator context must resolve the saved current profile.');
  const branch = proposal.cables.find(row => row.to === 'L-01');
  const feeder = proposal.cables.find(row => row.to === 'DP-01');
  const source = input.faultStudy.sources[0];
  const z = add(add({ re: source.impedance.rOhm, im: source.impedance.xOhm }, cableOhms(feeder)), cableOhms(branch));
  const expectedA = divide(source.emfPhaseV, z);
  const trace = history(result, branch.id, 'L-01');
  assert.ok(trace);
  phasorNear(trace.timeRows[0].currentKA, expectedA);
  near(trace.timeRows.at(-1).currentRmsKA, 0);
  near(trace.currentSquaredExposureA2S, squaredMagnitude(expectedA) * input.faultEvolution.horizonS / 3);
  assert.equal(result.protectionAdequacy, 'unevaluated');
  assert.equal(result.scope, 'supplied-source-quasi-steady-rms-phasor-history');
});

for (const count of [25, 50]) test(`${count} loads: separate complex nodal oracle verifies final device currents and exact piecewise exposure`, () => {
  const input = faultEvolutionFixture(count);
  input.faultStudy.sources[1].emfPhaseV = { re: 0, im: 460 / Math.sqrt(3) };
  input.faultEvolution.profiles[0].points = [{ timeS: 0, emfMultiplier: 1 }, { timeS: 0.05, emfMultiplier: 0.95 }, { timeS: 0.1, emfMultiplier: 0.9 }];
  input.faultEvolution.profiles[1].points = [{ timeS: 0, emfMultiplier: 1 }, { timeS: 0.02, emfMultiplier: 0.4 }, { timeS: 0.1, emfMultiplier: 0 }];
  const proposal = generateDesignProposal(input);
  const result = resultOf(proposal);
  assert.equal(result.status, 'evaluated', JSON.stringify(result.issues));
  assert.deepEqual(result.timeKnotsS, [0, 0.02, 0.05, 0.1]);
  const motorId = input.equipment.at(-1).id;
  const branch = proposal.cables.find(row => row.to === motorId);
  const trace = history(result, branch.id, 'L-01');
  assert.ok(trace);
  const multiplier = (points, time) => {
    const rightIndex = points.findIndex(row => row.timeS >= time);
    if (rightIndex === 0) return points[0].emfMultiplier;
    const left = points[rightIndex - 1]; const right = points[rightIndex];
    return left.emfMultiplier + (right.emfMultiplier - left.emfMultiplier) * (time - left.timeS) / (right.timeS - left.timeS);
  };
  const current = time => remoteLoadFaultOracle(proposal, input, multiplier(input.faultEvolution.profiles[0].points, time), multiplier(input.faultEvolution.profiles[1].points, time)).motorFromCurrentA;
  for (const row of trace.timeRows) phasorNear(row.currentKA, current(row.timeS));
  let exposure = 0;
  // Simpson's independent quadratic integral is exact here; the runtime uses
  // endpoint complex dot products, rather than these midpoint circuit solves.
  for (let index = 1; index < result.timeKnotsS.length; index += 1) {
    const left = result.timeKnotsS[index - 1]; const right = result.timeKnotsS[index];
    exposure += (right - left) / 6 * (squaredMagnitude(current(left)) + 4 * squaredMagnitude(current((left + right) / 2)) + squaredMagnitude(current(right)));
  }
  near(trace.currentSquaredExposureA2S, exposure);
  assert.equal(proposal.distributionBaseline, null);
  assert.equal(result.protectionAdequacy, 'unevaluated');
  assert.ok(proposal.issues.some(row => row.code === 'MOTOR_PROTECTION_UNRESOLVED'));
});

test('zero motor EMF retains the passive internal impedance and differs from an opened motor source', () => {
  const input = faultEvolutionFixture();
  const proposal = generateDesignProposal(input);
  const result = resultOf(proposal);
  assert.equal(result.status, 'evaluated', JSON.stringify(result.issues));
  const branch = proposal.cables.find(row => row.to === 'L-01');
  const row = history(result, branch.id, 'L-01').timeRows.at(-1);
  const expected = remoteLoadFaultOracle(proposal, input, 1, 0).faultCurrentA;
  phasorNear(row.currentKA, expected);
  const feeder = proposal.cables.find(item => item.to === 'DP-01');
  const source = input.faultStudy.sources[0];
  const opened = divide(source.emfPhaseV, add(add({ re: source.impedance.rOhm, im: source.impedance.xOhm }, cableOhms(feeder)), cableOhms(branch)));
  assert.ok(Math.abs(Math.sqrt(squaredMagnitude(opened)) - row.currentRmsKA * 1000) > 1, 'Opening a motor source is a different network from suppressing its EMF.');
});

test('reverse motor feed and the immediate load-side cut use signed phasors at the correct fault side', () => {
  const input = faultEvolutionFixture();
  const proposal = generateDesignProposal(input);
  const result = resultOf(proposal);
  const motorId = input.equipment.at(-1).id;
  const branch = proposal.cables.find(row => row.to === motorId);
  const feeder = proposal.cables.find(row => row.to === 'DP-01');
  const motor = input.faultStudy.sources[1];
  const utility = input.faultStudy.sources[0];
  const reverse = scale(divide(motor.emfPhaseV, add(add({ re: motor.impedance.rOhm, im: motor.impedance.xOhm }, cableOhms(branch)), cableOhms(feeder))), -1);
  phasorNear(history(result, branch.id, 'S').timeRows[0].currentKA, reverse);
  const immediate = history(result, branch.id, 'DP-01', 'immediate-load-side-zero-impedance-fault');
  assert.ok(immediate, 'Immediate downstream fault must be distinct from the upstream bus fault.');
  const expected = divide(utility.emfPhaseV, add({ re: utility.impedance.rOhm, im: utility.impedance.xOhm }, cableOhms(feeder)));
  phasorNear(immediate.timeRows[0].currentKA, expected);
});

test('interior phasor cancellation produces a true current minimum between supplied knots', () => {
  const input = faultEvolutionFixture();
  input.faultStudy.sources[0].impedance = { rOhm: 0.1, xOhm: 0.1 };
  input.faultEvolution.profiles[0].points.at(-1).emfMultiplier = 0;
  input.faultEvolution.profiles[1].points.at(-1).emfMultiplier = 1;
  const preliminary = generateDesignProposal(input);
  const feeder = preliminary.cables.find(row => row.to === 'DP-01');
  const motorCable = preliminary.cables.find(row => row.to === input.equipment.at(-1).id);
  const utility = input.faultStudy.sources[0]; const motor = input.faultStudy.sources[1];
  const zUtility = add({ re: utility.impedance.rOhm, im: utility.impedance.xOhm }, cableOhms(feeder));
  const zMotor = add({ re: motor.impedance.rOhm, im: motor.impedance.xOhm }, cableOhms(motorCable));
  const angle = Math.PI + Math.atan2(zMotor.im, zMotor.re) - Math.atan2(zUtility.im, zUtility.re);
  motor.emfPhaseV = { re: 460 / Math.sqrt(3) * Math.cos(angle), im: 460 / Math.sqrt(3) * Math.sin(angle) };
  const proposal = generateDesignProposal(input);
  const result = resultOf(proposal);
  assert.equal(result.status, 'evaluated', JSON.stringify(result.issues));
  const trace = history(result, proposal.cables.find(row => row.to === 'L-01').id, 'L-01');
  const expectedTime = input.faultEvolution.horizonS * (1 - Math.sqrt(squaredMagnitude(divide(motor.emfPhaseV, zMotor))) / Math.sqrt(squaredMagnitude(divide(utility.emfPhaseV, zUtility))));
  near(trace.currentExtrema.minimumTimeS, expectedTime);
  near(trace.currentExtrema.minimumRmsKA, 0);
  assert.ok(trace.currentExtrema.minimumTimeS > 0 && trace.currentExtrema.minimumTimeS < input.faultEvolution.horizonS);
  assert.ok(trace.timeRows.every(row => row.currentRmsKA > 0.01), 'Both sampled endpoints are positive despite an interior cancellation.');
});

test('an exact zero-impedance feeder keeps its recovered tie-current history', () => {
  const input = faultEvolutionFixture(25, false);
  input.overrides.panelLocations['DP-01'].x = 0;
  input.faultEvolution.profiles[0].points.at(-1).emfMultiplier = 0.25;
  const proposal = generateDesignProposal(input);
  const result = resultOf(proposal);
  assert.equal(result.status, 'evaluated', JSON.stringify(result.issues));
  const feeder = proposal.cables.find(row => row.to === 'DP-01');
  assert.equal(feeder.lengthFt, 0);
  const branch = proposal.cables.find(row => row.to === 'L-01');
  const source = input.faultStudy.sources[0];
  const expected = divide(source.emfPhaseV, add({ re: source.impedance.rOhm, im: source.impedance.xOhm }, cableOhms(branch)));
  const trace = history(result, feeder.id, 'L-01');
  phasorNear(trace.timeRows[0].currentKA, expected);
  phasorNear(trace.timeRows.at(-1).currentKA, scale(expected, 0.25));
  near(trace.currentSquaredExposureA2S, squaredMagnitude(expected) * 0.1 * (1 + 0.25 + 0.25 ** 2) / 3);
});

test('25 mixed-voltage loads preserve transformer secondary-main current and exposure bases', () => {
  const input = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-industrial.json', import.meta.url), 'utf8'));
  const originals = input.equipment;
  input.equipment = Array.from({ length: 25 }, (_, index) => ({ ...originals[index % originals.length], id: `MV-${index + 1}`, tag: `MV-${index + 1}`, voltage: index < 20 ? 208 : 480, kw: index < 20 ? 1 : 3, powerFactor: 0.9, phases: 3 }));
  input.faultStudy = {
    networkBaseMVA: 1, sourceInventory: { status: 'complete', reference: 'Synthetic mixed-voltage inventory.' },
    sources: [{ equipmentId: input.supply.id, emfPhaseV: { re: 480 / Math.sqrt(3), im: 0 }, impedance: { rOhm: 0.006, xOhm: 0.015 }, inService: true, reference: 'Synthetic utility equivalent.' }],
    transformerPhase: { degrees: 30, reference: 'Explicit synthetic clock assumption, not inferred from winding labels.' },
  };
  input.faultEvolution = faultEvolutionFixture(25, false).faultEvolution;
  input.faultEvolution.profiles[0].equipmentId = input.supply.id;
  input.faultEvolution.profiles[0].points.at(-1).emfMultiplier = 0.5;
  const proposal = generateDesignProposal(input);
  const result = resultOf(proposal);
  assert.equal(result.status, 'evaluated', JSON.stringify(result.issues));
  const transformer = proposal.transformer;
  assert.ok(transformer);
  const primaryCable = proposal.cables.find(row => row.transformerSide === 'primary');
  const primary = history(result, primaryCable.id, 'MV-1');
  const secondary = result.deviceHistories.find(row => row.placementId === `secondary-main:${transformer.id}` && row.faultBusId === 'MV-1' && row.caseKind === 'generated-bus-fault');
  assert.ok(secondary);
  const ratio = transformer.primaryVoltageVac / transformer.secondaryVoltageVac;
  for (let index = 0; index < primary.timeRows.length; index += 1) near(secondary.timeRows[index].currentRmsKA, primary.timeRows[index].currentRmsKA * ratio);
  near(secondary.currentSquaredExposureA2S, primary.currentSquaredExposureA2S * ratio ** 2);
  assert.ok(result.deviceHistories.some(row => row.placementId === secondary.placementId && row.caseKind === 'immediate-load-side-zero-impedance-fault'));
});

test('missing, extra, unknown, malformed and unbounded profiles suppress all temporal numbers', () => {
  const mutations = [
    input => { input.faultEvolution.profiles.pop(); },
    input => { input.faultEvolution.profiles.push(structuredClone(input.faultEvolution.profiles[0])); },
    input => { input.faultEvolution.profiles[0].equipmentId = 'UNKNOWN'; },
    input => { input.faultEvolution.profiles[0].points[0].emfMultiplier = 0.9; },
    input => { input.faultEvolution.profiles[0].points[1].timeS = 0; },
    input => { input.faultEvolution.profiles[0].points[1].emfMultiplier = -1; },
    input => { input.faultEvolution.profiles[0].points = {}; },
    input => { input.faultEvolution.profiles[0].source.reference = ''; },
    input => { input.faultEvolution.profiles[0].conditions.voltageRangeV = [1, 460]; },
    input => { input.faultEvolution.profiles[0].conditions.frequencyHz = 50; },
    input => { input.faultEvolution.profiles[0].points[1].timeS = 0.2; },
    input => { input.faultEvolution.horizonS = 0; },
    input => { input.faultEvolution.assumedDecayTimeS = 0.03; },
    input => { input.faultStudy.faultBusIds = ['S']; },
  ];
  for (const mutate of mutations) {
    const input = faultEvolutionFixture(); mutate(input);
    const proposal = generateDesignProposal(input);
    const result = resultOf(proposal);
    assert.equal(result.status, 'blocked', JSON.stringify(input.faultEvolution));
    assert.equal(result.deviceHistories.length, 0);
    assert.equal(result.faultCases.length, 0);
    assert.ok(result.issues.length);
  }
});

test('tampered cached initial fault or device-current evidence cannot support a fresh history', () => {
  for (const target of ['network', 'device']) {
    const proposal = generateDesignProposal(faultEvolutionFixture());
    if (target === 'network') proposal.faultStudyValidation.cases[0].fault.totalFaultCurrentKA.re += 1;
    else proposal.deviceFaultValidation.placements[0].cases[0].throughDeviceCurrentKA.re += 1;
    const result = evaluate(proposal);
    assert.equal(result.status, 'blocked', target);
    assert.deepEqual(result.deviceHistories, []);
  }
});

test('malformed explicit context, numeric overflow and wrong source applicability never throw or return histories', () => {
  const proposal = generateDesignProposal(faultEvolutionFixture());
  for (const value of [null, [], 1, { profiles: null }, { schemaVersion: '1.0.0', profiles: [null] }]) {
    let result;
    assert.doesNotThrow(() => { result = evaluate(proposal, { faultEvolution: value }); });
    assert.equal(result.status, 'blocked');
    assert.deepEqual(result.deviceHistories, []);
  }
  const input = faultEvolutionFixture();
  input.faultEvolution.horizonS = 1e308;
  for (const profile of input.faultEvolution.profiles) profile.points.at(-1).timeS = 1e308;
  const result = resultOf(generateDesignProposal(input));
  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.deviceHistories, []);
});
