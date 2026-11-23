import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';
import { evaluateDesignSynthesisDeviceFaultScreen } from '../analysis/designSynthesisDeviceFaultScreen.mjs';
import { evaluateMotorBranchBreakerCandidate } from '../analysis/designSynthesisMotorBranchBreakers.mjs';
import { evaluateDesignSynthesisFaultScenarios } from '../analysis/designSynthesisFaultScenarios.mjs';
import { compareMotorCombinationInitialRms, motorCombinationBinding } from '../analysis/designSynthesisMotorCombinationFault.mjs';

const motorTypes = [
  { hp: 15, nameplate: 22, flc: 21, pickup: 175, breaker: '3VA5135-6EC31-0AA0' },
  { hp: 25, nameplate: 29.5, flc: 34, pickup: 250, breaker: '3VA5150-6EC31-0AA0' },
  { hp: 30, nameplate: 38, flc: 40, pickup: 480, breaker: '3VA5160-6EC31-0AA0' },
  { hp: 40, nameplate: 48, flc: 52, pickup: 490, breaker: '3VA5170-6EC31-0AA0' }
];
function fixture(count, motorImpedance = { rOhm: 1, xOhm: 3 }) {
  const input = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-tray-congestion.json', import.meta.url), 'utf8'));
  const first = input.equipment[0];
  input.equipment = Array.from({ length: count }, (_, index) => ({ ...first, id: `L-${index}`, tag: `L-${index}` }));
  motorTypes.forEach(({ hp, nameplate, flc, pickup }, index) => Object.assign(input.equipment[index], {
    kw: Math.sqrt(3) * 480 * nameplate * 0.85 / 1000, powerFactor: 0.85, duty: 'continuous', ratingsBasis: 'electrical-input-kW',
    motor: { ratedVoltageV: 460, fullLoadCurrentA: flc, fullLoadCurrentBasis: { reference: 'Synthetic design-current fixture' }, nameplateCurrentA: nameplate, nameplateHorsepower: hp, nameplateFrequencyHz: 60, lockedRotorCurrentA: nameplate * 6, lockedRotorPowerFactor: 0.3, starterType: 'dol', rotorType: 'squirrel-cage', instantaneousPickupA: pickup }
  }));
  input.supply.motorStartingImpedance = { rOhm: 0.006, xOhm: 0.015, reference: 'Synthetic starting source' };
  input.criteria.motorStarting = { minimumVoltagePu: 0.7 };
  input.criteria.motorStarter = { branchProtectionMethod: 'inverse-time-breaker', controlVoltageV: 24, controlCurrentType: 'DC' };
  input.faultStudy = { networkBaseMVA: 1, sourceInventory: { status: 'complete', reference: 'Synthetic inventory; not field verified' }, sources: [
    { equipmentId: 'S', emfPhaseV: { re: 480 / Math.sqrt(3), im: 0 }, impedance: { rOhm: 0.006, xOhm: 0.015 }, inService: true, reference: 'Synthetic utility equivalent' },
    ...motorTypes.map((_, index) => ({ equipmentId: `L-${index}`, emfPhaseV: { re: 460 / Math.sqrt(3), im: 0 }, impedance: { ...motorImpedance }, inService: true, reference: 'Synthetic motor equivalent; not manufacturer or field data' }))
  ] };
  return input;
}
function divideByImpedance(voltage, impedance) {
  const denominator = impedance.re ** 2 + impedance.im ** 2;
  return { re: voltage * impedance.re / denominator, im: -voltage * impedance.im / denominator };
}
function add(a, b) { return { re: a.re + b.re, im: a.im + b.im }; }
function cableImpedance(cable) { return { re: cable.r_ohm_per_kft * cable.lengthFt / 1000, im: cable.x_ohm_per_kft * cable.lengthFt / 1000 }; }
function close(actual, expected) { assert.ok(Math.abs(actual - expected) <= Math.max(1e-8, Math.abs(expected) * 1e-8), `${actual} vs ${expected}`); }

function smallMotorFixture(count, impedance = { rOhm: 1, xOhm: 3 }) {
  const input = fixture(count, impedance);
  const rows = [
    { nameplate: 12.8, flc: 14, relay: '3RU2126-4AB0', breaker: 25 },
    { nameplate: 15, flc: 21, relay: '3RU2126-4AB0', breaker: 30 },
    { nameplate: 17.5, flc: 14, relay: '3RU2126-4BB0', breaker: 25 },
    { nameplate: 17.5, flc: 21, relay: '3RU2126-4BB0', breaker: 30 },
  ];
  rows.forEach((row, index) => {
    const load = input.equipment[index];
    load.kw = Math.sqrt(3) * 480 * row.nameplate * 0.85 / 1000;
    Object.assign(load.motor, { nameplateHorsepower: 10, nameplateCurrentA: row.nameplate, fullLoadCurrentA: row.flc, lockedRotorCurrentA: row.nameplate * 6, instantaneousPickupA: 150 });
  });
  return { input, rows };
}

for (const count of [25, 50]) test(`${count} loads compare each documented small-motor relay and HEAS breaker pair against the network`, () => {
  const { input, rows } = smallMotorFixture(count);
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.faultStudyValidation.status, 'evaluated');
  const panelId = proposal.cables.find(cable => cable.loadId === 'L-0').from;
  const feeder = proposal.cables.find(cable => cable.to === panelId);
  let current = divideByImpedance(480 / Math.sqrt(3), add({ re: 0.006, im: 0.015 }, cableImpedance(feeder)));
  for (let index = 0; index < rows.length; index++) {
    const branch = proposal.cables.find(cable => cable.loadId === `L-${index}`);
    assert.equal(branch.from, panelId);
    current = add(current, divideByImpedance(460 / Math.sqrt(3), add({ re: 1, im: 3 }, cableImpedance(branch))));
  }
  const expected = Math.hypot(current.re, current.im) / 1000;
  rows.forEach((row, index) => {
    const candidate = proposal.motorStarterCandidates.cases.find(item => item.motorId === `L-${index}`).candidate;
    const placement = proposal.deviceFaultValidation.placements.find(item => item.proposedLocation.protectedSideBusId === `L-${index}`);
    assert.equal(candidate.overloadRelay.catalogNumber, row.relay);
    assert.equal(candidate.branchCircuitBreaker.catalogNumber, `3VA51${row.breaker}-6EC31-0AA0`);
    const comparison = placement.comparisons.citedMotorCombinationInitialRms;
    assert.equal(comparison.status, 'not-above-cited-value-unqualified');
    assert.equal(comparison.ratingKA, 65);
    assert.equal(comparison.sourceId, 'siemens-ul-e44653-2025-03-17');
    close(comparison.valueKA, expected);
    assert.equal(placement.device.conditionalCombinationRating.status, 'unevaluated');
    assert.equal(candidate.selectedForApply, false);
  });
  assert.equal(proposal.status, 'blocked');
});

test('small-motor combination source, HEAS class, relay range and exact certificate row are required', () => {
  const { input } = smallMotorFixture(25);
  const original = generateDesignProposal(input);
  const mutations = [
    candidate => { candidate.branchCircuitBreaker.interruptingClass = 'S / SEAS'; },
    candidate => { candidate.overloadRelay.currentSettingMaxA = 20; },
    candidate => { candidate.sources.find(row => row.id === 'siemens-ul-e44653-2025-03-17').sha256 = 'wrong'; },
    candidate => { candidate.sources.find(row => row.id === 'siemens-ul-e44653-2025-03-17').url = 'wrong'; },
    candidate => { candidate.fieldSources = candidate.fieldSources.filter(row => row.pointer !== '/candidate/conditionalCombination/shortCircuitCurrentKA'); },
    candidate => { candidate.conditionalCombination.coordinationType = 'Type 2'; },
  ];
  for (const mutate of mutations) {
    const proposal = structuredClone(original);
    mutate(proposal.motorStarterCandidates.cases.find(row => row.motorId === 'L-0').candidate);
    const validation = evaluateDesignSynthesisDeviceFaultScreen({ proposal });
    const comparison = validation.placements.find(row => row.proposedLocation.protectedSideBusId === 'L-0').comparisons.citedMotorCombinationInitialRms;
    assert.equal(comparison.status, 'not-compared');
    assert.equal(comparison.valueKA, null);
    assert.notEqual(validation.deviceInputFingerprint, original.deviceFaultValidation.deviceInputFingerprint);
  }
  for (const mutate of [
    device => { device.continuousCurrentA = 30; },
    device => { device.poles = 2; },
    device => { device.interruptingRatingVoltageVac = 208; },
    device => { device.fieldSources = device.fieldSources.filter(row => row.pointer !== '/candidate/conditionalCombination/maximumBreakerCurrentA'); },
  ]) {
    const proposal = structuredClone(original);
    mutate(proposal.cables.find(row => row.loadId === 'L-0').protectiveDevice);
    const validation = evaluateDesignSynthesisDeviceFaultScreen({ proposal });
    const comparison = validation.placements.find(row => row.proposedLocation.protectedSideBusId === 'L-0').comparisons.citedMotorCombinationInitialRms;
    assert.equal(comparison.status, 'not-compared');
    assert.equal(comparison.valueKA, null);
    assert.notEqual(validation.deviceInputFingerprint, original.deviceFaultValidation.deviceInputFingerprint);
  }
});

test('small-motor cited value blocks on explicit strong infeed and preserves the independent line-terminal result', () => {
  const { input } = smallMotorFixture(25, { rOhm: 0.001, xOhm: 0.001 });
  input.corridors = { nodes: [{ id: 'N0', x: 0, y: 0, z: 0 }, { id: 'N1', x: 1, y: 0, z: 0 }, { id: 'N2', x: 20, y: 0, z: 0 }], edges: [{ id: 'SHORT', from: 'N0', to: 'N1', widthIn: 24, depthIn: 6, permitted: true }, { id: 'LONG', from: 'N1', to: 'N2', widthIn: 24, depthIn: 6, permitted: true }] };
  input.equipment.slice(0, 4).forEach(load => { load.x = 1; });
  const proposal = generateDesignProposal(input);
  const panel = proposal.cables.find(cable => cable.loadId === 'L-0').from;
  const feeder = proposal.cables.find(cable => cable.to === panel);
  let current = divideByImpedance(480 / Math.sqrt(3), add({ re: 0.006, im: 0.015 }, cableImpedance(feeder)));
  for (let index = 0; index < 4; index++) {
    const cable = proposal.cables.find(row => row.loadId === `L-${index}`);
    current = add(current, divideByImpedance(460 / Math.sqrt(3), add({ re: 0.001, im: 0.001 }, cableImpedance(cable))));
  }
  const expected = Math.hypot(current.re, current.im) / 1000;
  assert.ok(expected > 65, `synthetic current ${expected} kA`);
  const placement = proposal.deviceFaultValidation.placements.find(row => row.proposedLocation.protectedSideBusId === 'L-0');
  close(placement.comparisons.citedMotorCombinationInitialRms.valueKA, expected);
  assert.equal(placement.comparisons.citedMotorCombinationInitialRms.status, 'above-cited-value');
  assert.equal(placement.comparisons.lineTerminalAvailableInitialRms.status, 'exceeds-rating');
  assert.ok(proposal.issues.some(item => item.code === 'DEVICE_FAULT_SCREEN_CITED_COMBINATION_VALUE_EXCEEDED'));
  assert.equal(proposal.status, 'blocked');
});

for (const count of [25, 50]) test(`${count}-load mixed motor proposal binds the exact 35–70 A ratings to the modeled fault locations`, () => {
  const input = fixture(count);
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.faultStudyValidation.status, 'evaluated', JSON.stringify(proposal.faultStudyValidation.issues));
  assert.equal(proposal.deviceFaultValidation.status, 'evaluated', JSON.stringify(proposal.deviceFaultValidation.issues));
  assert.equal(proposal.deviceFaultValidation.coverage.status, 'complete');
  const panelId = proposal.cables.find(cable => cable.loadId === 'L-0').from;
  const feeder = proposal.cables.find(cable => cable.to === panelId);
  assert.ok(feeder);
  let panelFaultA = divideByImpedance(480 / Math.sqrt(3), add({ re: 0.006, im: 0.015 }, cableImpedance(feeder)));
  for (let index = 0; index < motorTypes.length; index++) {
    const branch = proposal.cables.find(cable => cable.loadId === `L-${index}`);
    assert.equal(branch.from, panelId);
    panelFaultA = add(panelFaultA, divideByImpedance(460 / Math.sqrt(3), add({ re: 1, im: 3 }, cableImpedance(branch))));
  }
  const expectedPanelFaultKA = Math.hypot(panelFaultA.re, panelFaultA.im) / 1000;
  assert.ok(expectedPanelFaultKA > 0);
  motorTypes.forEach(({ breaker }, index) => {
    const cable = proposal.cables.find(row => row.loadId === `L-${index}`);
    const placement = proposal.deviceFaultValidation.placements.find(row => row.proposedLocation.branchId === cable.id);
    assert.equal(placement.device.catalogNumber, breaker);
    assert.equal(placement.ratingComparable, true);
    assert.equal(placement.device.standaloneInterruptingRating.provenanceStatus, 'referenced');
    assert.equal(placement.device.standaloneInterruptingRating.currentKA, 65);
    assert.equal(placement.device.standaloneInterruptingRating.voltageVac, 480);
    assert.ok(placement.device.standaloneInterruptingRating.ratingFieldSources.some(item => item.pointer === '/candidate/branchCircuitBreaker/ratedVoltageV'));
    assert.equal(placement.comparisons.lineTerminalAvailableInitialRms.status, 'not-exceeded');
    close(placement.comparisons.lineTerminalAvailableInitialRms.valueKA, expectedPanelFaultKA);
    assert.equal(placement.comparisons.protectionAdequacy, 'unevaluated');
    assert.equal(placement.device.conditionalCombinationRating.metadata.shortCircuitCurrentKA, 25);
    assert.equal(placement.device.conditionalCombinationRating.status, 'unevaluated');
    assert.equal(placement.comparisons.citedMotorCombinationInitialRms.status, 'not-above-cited-value-unqualified');
    close(placement.comparisons.citedMotorCombinationInitialRms.valueKA, expectedPanelFaultKA);
    assert.equal(placement.comparisons.citedMotorCombinationInitialRms.ratingKA, 25);
    assert.equal(proposal.motorStarterCandidates.cases.find(row => row.motorId === `L-${index}`).candidate.selectedForApply, false);
  });
  assert.equal(proposal.status, 'blocked');
  assert.ok(proposal.issues.some(item => item.code === 'MOTOR_PROTECTION_UNRESOLVED'));
});

test('modeled motor contribution can exceed the cited combination value while the standalone rating is not exceeded', () => {
  const input = fixture(25, { rOhm: 0.001, xOhm: 0.001 });
  const proposal = generateDesignProposal(input);
  const feeder = proposal.cables.find(cable => cable.to === proposal.cables.find(row => row.loadId === 'L-0').from);
  let current = divideByImpedance(480 / Math.sqrt(3), add({ re: 0.006, im: 0.015 }, cableImpedance(feeder)));
  for (let index = 0; index < motorTypes.length; index++) {
    const branch = proposal.cables.find(cable => cable.loadId === `L-${index}`);
    current = add(current, divideByImpedance(460 / Math.sqrt(3), add({ re: 0.001, im: 0.001 }, cableImpedance(branch))));
  }
  const expected = Math.hypot(current.re, current.im) / 1000;
  assert.ok(expected > 25 && expected < 65, `synthetic fixture current ${expected} kA`);
  for (let index = 0; index < motorTypes.length; index++) {
    const placement = proposal.deviceFaultValidation.placements.find(row => row.proposedLocation.protectedSideBusId === `L-${index}`);
    close(placement.comparisons.citedMotorCombinationInitialRms.valueKA, expected);
    assert.equal(placement.comparisons.citedMotorCombinationInitialRms.status, 'above-cited-value');
    assert.equal(placement.status, 'blocked');
    assert.equal(placement.comparisons.lineTerminalAvailableInitialRms.status, 'not-exceeded');
    assert.equal(placement.device.conditionalCombinationRating.status, 'unevaluated');
    assert.equal(placement.comparisons.protectionAdequacy, 'unevaluated');
  }
  assert.ok(proposal.issues.some(item => item.code === 'DEVICE_FAULT_SCREEN_CITED_COMBINATION_VALUE_EXCEEDED'));
  assert.equal(proposal.checks.find(item => item.id === 'deviceFaultScreen').status, 'fail');
  assert.equal(proposal.status, 'blocked');
});

test('cited-value boundary retains an unqualified comparison at equality', () => {
  const proposal = generateDesignProposal(fixture(25));
  const cable = proposal.cables.find(row => row.loadId === 'L-0');
  const placement = { _researchDevice: cable.protectiveDevice, _busId: cable.from, proposedLocation: { protectedSideBusId: cable.to, nominalVoltageLLV: 480 }, comparisons: { lineTerminalAvailableInitialRms: { valueKA: 25 } } };
  const binding = motorCombinationBinding(proposal, placement);
  assert.equal(compareMotorCombinationInitialRms(binding, placement, true).status, 'not-above-cited-value-unqualified');
  placement.comparisons.lineTerminalAvailableInitialRms.valueKA = 25.001;
  assert.equal(compareMotorCombinationInitialRms(binding, placement, true).status, 'above-cited-value');
  assert.equal(compareMotorCombinationInitialRms(binding, placement, false).status, 'not-compared');
});

test('cited combination comparison requires matching equipment, source, voltage and fresh complete model', () => {
  const original = generateDesignProposal(fixture(25));
  const mutations = [
    proposal => { proposal.motorStarterCandidates.cases.find(row => row.motorId === 'L-0').candidate.contactor.catalogNumber = 'different'; },
    proposal => { proposal.motorStarterCandidates.cases.find(row => row.motorId === 'L-0').candidate.conditionalCombination.shortCircuitCurrentKA = 65; },
    proposal => { proposal.cables.find(row => row.loadId === 'L-0').protectiveDevice.fieldSources = []; },
    proposal => { proposal.cables.find(row => row.loadId === 'L-0').protectiveDevice.assemblyEvidenceRef.candidateId = 'different'; },
    proposal => { proposal.motorStarterCandidates.cases.find(row => row.motorId === 'L-0').candidate.sources = []; },
    proposal => { proposal.faultStudy.sources[0].impedance.rOhm *= 2; },
    proposal => { proposal.faultStudyValidation.cases[0].fault.totalFaultCurrentKA.re += 1; },
    proposal => { proposal.equipment.find(row => row.id === proposal.cables.find(cable => cable.loadId === 'L-0').from).voltage = 208; },
  ];
  for (const [index, mutate] of mutations.entries()) {
    const proposal = structuredClone(original);
    mutate(proposal);
    const validation = evaluateDesignSynthesisDeviceFaultScreen({ proposal });
    const comparison = validation.placements.find(row => row.proposedLocation.protectedSideBusId === 'L-0').comparisons.citedMotorCombinationInitialRms;
    assert.equal(comparison.status, 'not-compared');
    assert.equal(comparison.valueKA, null);
    if (index < 5) assert.notEqual(validation.deviceInputFingerprint, original.deviceFaultValidation.deviceInputFingerprint);
  }
  const partial = fixture(25);
  partial.faultStudy.faultBusIds = ['S'];
  const proposal = generateDesignProposal(partial);
  const comparison = proposal.deviceFaultValidation.placements.find(row => row.proposedLocation.protectedSideBusId === 'L-0').comparisons.citedMotorCombinationInitialRms;
  assert.equal(comparison.status, 'not-compared');
  assert.equal(comparison.valueKA, null);
});

test('scenario output preserves the cited combination exceedance and scenario identity', () => {
  const input = fixture(25, { rOhm: 0.001, xOhm: 0.001 });
  input.faultScenarios = [{ id: 'motor-infeed', reference: 'Synthetic infeed scenario', study: input.faultStudy }, { id: 'alternate', reference: 'Synthetic alternate condition', study: structuredClone(input.faultStudy) }];
  delete input.faultStudy;
  const proposal = generateDesignProposal(input);
  const scenario = proposal.faultScenarioValidation.scenarios.find(row => row.id === 'motor-infeed');
  assert.ok(scenario.deviceFaultValidation.issues.some(item => item.code === 'DEVICE_FAULT_SCREEN_CITED_COMBINATION_VALUE_EXCEEDED'));
  assert.ok(proposal.issues.some(item => item.code === 'DEVICE_FAULT_SCREEN_CITED_COMBINATION_VALUE_EXCEEDED' && item.path.includes('motor-infeed')));
  assert.equal(proposal.status, 'blocked');
  const changed = structuredClone(proposal);
  changed.motorStarterCandidates.cases.find(row => row.motorId === 'L-0').candidate.contactor.catalogNumber = 'different';
  const reevaluated = evaluateDesignSynthesisFaultScenarios({ proposal: changed, faultScenarios: input.faultScenarios });
  assert.notEqual(reevaluated.modelInputFingerprint, proposal.faultScenarioValidation.modelInputFingerprint);
  assert.equal(reevaluated.scenarios[0].deviceFaultValidation.placements.find(row => row.proposedLocation.protectedSideBusId === 'L-0').comparisons.citedMotorCombinationInitialRms.status, 'not-compared');
});

test('missing voltage provenance or an inapplicable rating voltage blocks comparison', () => {
  const proposal = generateDesignProposal(fixture(25));
  const original = proposal.cables.find(cable => cable.loadId === 'L-1');
  const before = proposal.deviceFaultValidation.deviceInputFingerprint;
  original.protectiveDevice.fieldSources = original.protectiveDevice.fieldSources.filter(item => item.pointer !== '/candidate/branchCircuitBreaker/ratedVoltageV');
  let validation = evaluateDesignSynthesisDeviceFaultScreen({ proposal });
  let placement = validation.placements.find(row => row.proposedLocation.branchId === original.id);
  assert.equal(placement.ratingComparable, false);
  assert.equal(placement.comparisons.lineTerminalAvailableInitialRms.status, 'not-compared');
  assert.ok(validation.issues.some(item => item.code === 'DEVICE_FAULT_SCREEN_RATING_NOT_COMPARABLE'));
  assert.notEqual(validation.deviceInputFingerprint, before);
  const restored = generateDesignProposal(fixture(25));
  const cable = restored.cables.find(item => item.loadId === 'L-1');
  cable.protectiveDevice.interruptingRatingVoltageVac = 208;
  validation = evaluateDesignSynthesisDeviceFaultScreen({ proposal: restored });
  placement = validation.placements.find(row => row.proposedLocation.branchId === cable.id);
  assert.equal(placement.ratingComparable, false);
  assert.equal(placement.comparisons.maximumThroughDeviceInitialRms.status, 'not-compared');
});

test('explicit strong motor infeed can exceed the standalone 65 kA rating despite a 20 kA source-only bound', () => {
  const input = fixture(25, { rOhm: 0.001, xOhm: 0.001 });
  input.corridors = { nodes: [{ id: 'N0', x: 0, y: 0, z: 0 }, { id: 'N1', x: 1, y: 0, z: 0 }, { id: 'N2', x: 20, y: 0, z: 0 }], edges: [{ id: 'SHORT', from: 'N0', to: 'N1', widthIn: 24, depthIn: 6, permitted: true }, { id: 'LONG', from: 'N1', to: 'N2', widthIn: 24, depthIn: 6, permitted: true }] };
  input.equipment.slice(0, 4).forEach(load => { load.x = 1; });
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.inputs.original.supply.availableFaultCurrentKA, 20);
  assert.equal(proposal.faultStudyValidation.status, 'evaluated', JSON.stringify(proposal.faultStudyValidation.issues));
  const placement = proposal.deviceFaultValidation.placements.find(row => row.proposedLocation.branchId === 'C-L-0');
  assert.equal(placement.ratingComparable, true);
  assert.ok(placement.comparisons.lineTerminalAvailableInitialRms.valueKA > 65);
  assert.equal(placement.comparisons.lineTerminalAvailableInitialRms.status, 'exceeds-rating');
  assert.ok(proposal.deviceFaultValidation.issues.some(item => item.code === 'DEVICE_FAULT_SCREEN_RATING_EXCEEDED'));
  assert.ok(proposal.issues.some(item => item.code === 'DEVICE_FAULT_SCREEN_RATING_EXCEEDED'));
  assert.equal(placement.device.conditionalCombinationRating.status, 'unevaluated');
  assert.equal(proposal.status, 'blocked');
});

test('the external source fault bound is not labeled as a local calculated fault current', () => {
  const load = fixture(25).equipment[0];
  Object.assign(load.motor, { nameplateHorsepower: 10, nameplateCurrentA: 16.8, fullLoadCurrentA: 14, instantaneousPickupA: 150 });
  load.kw = Math.sqrt(3) * 480 * 16.8 * 0.85 / 1000;
  load.frequencyHz = 60;
  const result = evaluateMotorBranchBreakerCandidate({ load, supply: { voltage: 480, phases: 3, frequencyHz: 60, availableFaultCurrentKA: 20 }, criteria: { code: 'NEC', motorStarter: { branchProtectionMethod: 'inverse-time-breaker', controlVoltageV: 24, controlCurrentType: 'DC' } } });
  assert.ok(result.candidate);
  assert.equal(result.candidate.conditionalCombination.sourceAvailableFaultCurrentKA, 20);
  assert.equal(Object.hasOwn(result.candidate.conditionalCombination, 'localAvailableFaultCurrentKA'), false);
});
