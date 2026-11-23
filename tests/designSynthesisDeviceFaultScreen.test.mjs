import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';
import { evaluateDesignSynthesisDeviceFaultScreen } from '../analysis/designSynthesisDeviceFaultScreen.mjs';

const complex = (re, im = 0) => ({ re, im });
function inputFixture() {
  const input = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-tray-congestion.json', import.meta.url), 'utf8'));
  input.equipment = Array.from({ length: 25 }, (_, index) => ({ ...input.equipment[0], id: `L-${String(index + 1).padStart(2, '0')}`, tag: `L-${String(index + 1).padStart(2, '0')}` }));
  input.faultStudy = {
    networkBaseMVA: 1,
    sourceInventory: { status: 'complete', reference: 'Test source inventory; not field verified' },
    sources: [{ equipmentId: 'S', emfPhaseV: complex(480 / Math.sqrt(3)), impedance: { rOhm: 0.006, xOhm: 0.015 }, inService: true, reference: 'Explicit test utility equivalent' }],
  };
  return input;
}

test('finalized proposal attaches source-end device screening with signed current phasors and a virtual load-side fault', () => {
  const proposal = generateDesignProposal(inputFixture());
  const validation = proposal.deviceFaultValidation;
  assert.ok(validation);
  assert.equal(validation.scope, 'initial-symmetrical-rms-only');
  assert.equal(validation.coverage.status, 'complete');
  assert.equal(validation.coverage.expectedFaultBusIds.length, proposal.equipment.filter(row => ['source', 'panel', 'load', 'bus'].includes(row.type)).length);
  assert.equal(validation.placements.length, proposal.cables.length);
  assert.ok(validation.placements.every(row => row.proposedLocation.description.includes('not an installed fact')));
  const first = validation.placements.find(row => row.kind === 'cable-source-end');
  assert.ok(first.cases.some(row => row.kind === 'immediate-load-side-zero-impedance-fault'));
  assert.ok(first.cases.every(row => Number.isFinite(row.throughDeviceCurrentKA.re) && Number.isFinite(row.throughDeviceCurrentKA.im)));
  assert.equal(first.comparisons.protectionAdequacy, 'unevaluated');
  assert.ok(['not-exceeded', 'exceeds-rating', 'not-compared'].includes(first.comparisons.maximumThroughDeviceInitialRms.status));
  assert.equal(proposal.checks.find(row => row.id === 'deviceFaultScreen').status, 'unevaluated');
  assert.equal(proposal.motorApplyEligible, undefined);
});

test('explicit source network exposes only source-bound hypothetical constant-current plot research', () => {
  const input = inputFixture();
  input.faultStudy.sources[0].impedance = { rOhm: 2.75, xOhm: 0.015 };
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.deviceFaultValidation.status, 'evaluated');
  const placement = proposal.deviceFaultValidation.placements.find(row => row.device?.id === 'eaton_series_c_fd3020');
  const research = placement?.comparisons?.constantCurrentCurveResearch;
  assert.equal(research?.status, 'evaluated-graphical-conservative-envelope');
  assert.equal(research.currentA, placement.comparisons.maximumThroughDeviceInitialRms.valueKA * 1000);
  assert.ok(research.plotUpperTimeSeconds > 8 && research.plotUpperTimeSeconds < 12);
  assert.equal(placement.comparisons.protectionAdequacy, 'unevaluated');
  assert.match(research.intendedUse, /not actual clearing/);
  const modified = structuredClone(proposal);
  const cable = modified.cables.find(row => `cable:${row.id}` === placement.id);
  cable.protectiveDevice.tripUnitModel = 'changed';
  const altered = evaluateDesignSynthesisDeviceFaultScreen({ proposal: modified });
  const alteredResearch = altered.placements.find(row => row.id === placement.id)?.comparisons?.constantCurrentCurveResearch;
  assert.equal(alteredResearch?.status, 'unsupported-or-changed-device');
  assert.equal(alteredResearch.plotUpperTimeSeconds, null);
  const stale = structuredClone(proposal);
  stale.faultStudyValidation.cases[0].fault.faultCurrentRmsKA += 1;
  const rejected = evaluateDesignSynthesisDeviceFaultScreen({ proposal: stale });
  assert.equal(rejected.status, 'blocked');
  assert.ok(rejected.placements.every(row => !row.comparisons.constantCurrentCurveResearch));
});

test('a partial faultBusIds study cannot become a non-exceeded device screen', () => {
  const input = inputFixture();
  input.faultStudy.faultBusIds = ['S'];
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.faultStudyValidation.status, 'evaluated');
  assert.equal(proposal.deviceFaultValidation.status, 'blocked');
  assert.equal(proposal.deviceFaultValidation.coverage.status, 'incomplete');
  assert.ok(proposal.deviceFaultValidation.issues.some(row => row.code === 'DEVICE_FAULT_SCREEN_FAULT_COVERAGE_INCOMPLETE'));
  assert.ok(proposal.deviceFaultValidation.placements.every(row => row.comparisons.maximumThroughDeviceInitialRms.status === 'not-compared'));
});

test('a changed final cable endpoint invalidates the prior fault result before device comparison', () => {
  const proposal = generateDesignProposal(inputFixture());
  const cable = proposal.cables[0];
  cable.to = 'OTHER-BUS';
  const result = evaluateDesignSynthesisDeviceFaultScreen({ proposal });
  assert.equal(result.status, 'blocked');
  assert.ok(result.issues.some(row => row.code === 'DEVICE_FAULT_SCREEN_STALE_NETWORK' || row.code === 'DEVICE_FAULT_SCREEN_CABLE_ENDPOINT_MISMATCH'));
});

test('standalone rating exceedance is distinct from conditional assembly rating metadata', () => {
  const proposal = generateDesignProposal(inputFixture());
  const placement = proposal.deviceFaultValidation.placements.find(row => row.device?.standaloneInterruptingRating?.currentKA > 0);
  assert.ok(placement);
  const cable = proposal.cables.find(row => row.id === placement.proposedLocation.branchId);
  cable.protectiveDevice.interruptingRatingKA = 0.001;
  cable.protectiveDevice.conditionalCombination = { assemblySCCRKA: 100, reference: 'Not used for standalone comparison' };
  const screen = evaluateDesignSynthesisDeviceFaultScreen({ proposal });
  const updated = screen.placements.find(row => row.id === placement.id);
  assert.equal(updated.comparisons.maximumThroughDeviceInitialRms.status, 'exceeds-rating');
  assert.equal(updated.device.conditionalCombinationRating.status, 'unevaluated');
  assert.equal(updated.comparisons.protectionAdequacy, 'unevaluated');
  assert.ok(screen.issues.some(row => row.code === 'DEVICE_FAULT_SCREEN_RATING_EXCEEDED'));
});

test('motor research candidates preserve standalone 65 kA rating separately from conditional combination metadata', () => {
  const input = inputFixture();
  const motor = input.equipment[24];
  Object.assign(motor, { kw: 9, powerFactor: 0.86, duty: 'continuous', ratingsBasis: 'electrical-input-kW', motor: {
    ratedVoltageV: 460, fullLoadCurrentA: 14, fullLoadCurrentBasis: { reference: 'Synthetic referenced motor current' },
    nameplateCurrentA: 12.8, nameplateHorsepower: 10, nameplateFrequencyHz: 60,
    lockedRotorCurrentA: 90, lockedRotorPowerFactor: 0.3, starterType: 'dol', rotorType: 'squirrel-cage',
  } });
  input.faultStudy.sources.push({ equipmentId: motor.id, emfPhaseV: complex(460 / Math.sqrt(3)), impedance: { rOhm: 1, xOhm: 3 }, inService: true, reference: 'Explicit test motor equivalent' });
  input.supply.motorStartingImpedance = { rOhm: 0.006, xOhm: 0.015, reference: 'Separate test starting source' };
  input.criteria.motorStarting = { minimumVoltagePu: 0.8 };
  input.criteria.motorStarter = { controlVoltageV: 24, controlCurrentType: 'DC', branchProtectionMethod: 'inverse-time-breaker', instantaneousPickupA: 150 };
  const proposal = generateDesignProposal(input);
  const placement = proposal.deviceFaultValidation.placements.find(row => row.proposedLocation.branchId === `C-${motor.id}`);
  assert.equal(placement.device.standaloneInterruptingRating.currentKA, 65);
  assert.equal(placement.ratingComparable, true);
  assert.equal(placement.device.conditionalCombinationRating.status, 'unevaluated');
  assert.equal(placement.comparisons.protectionAdequacy, 'unevaluated');
});

test('mutated current cases with an unchanged model fingerprint are rejected as stale', () => {
  const proposal = generateDesignProposal(inputFixture());
  const row = proposal.faultStudyValidation.cases[0];
  row.fault.totalFaultCurrentKA.re += 0.5;
  const result = evaluateDesignSynthesisDeviceFaultScreen({ proposal });
  assert.equal(result.status, 'blocked');
  assert.ok(result.issues.some(item => item.code === 'DEVICE_FAULT_SCREEN_STALE_NETWORK'));
  assert.ok(result.placements.every(item => item.comparisons.maximumThroughDeviceInitialRms.status === 'not-compared'));
});

test('orphaned interrupting-rating field references cannot be rescued by unrelated source documents', () => {
  const proposal = generateDesignProposal(inputFixture());
  const cable = proposal.cables[0];
  cable.protectiveDevice.fieldSources = { '/interruptingRatings': ['orphan-rating-source'] };
  cable.protectiveDevice.sourceDocuments = [{ id: 'unrelated-device-source', title: 'Unrelated breaker information' }];
  cable.protectiveDevice.sourceIds = [];
  const screen = evaluateDesignSynthesisDeviceFaultScreen({ proposal });
  const placement = screen.placements.find(row => row.proposedLocation.branchId === cable.id);
  assert.equal(placement.ratingComparable, false);
  assert.equal(placement.device.standaloneInterruptingRating.provenanceStatus, 'missing');
  assert.equal(placement.comparisons.maximumThroughDeviceInitialRms.status, 'not-compared');
  assert.ok(screen.issues.some(row => row.code === 'DEVICE_FAULT_SCREEN_RATING_NOT_COMPARABLE'));
});

test('mixed-voltage proposal screens transformer primary and the complete secondary panel-feeder cut', () => {
  const input = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-industrial.json', import.meta.url), 'utf8'));
  const sourceRows = input.equipment;
  input.equipment = Array.from({ length: 10 }, (_, index) => ({ ...sourceRows[index % sourceRows.length], id: `MV-${index + 1}`, tag: `MV-${index + 1}`, voltage: index < 8 ? 208 : 480, kw: index < 8 ? 1 : 3, powerFactor: 0.9, phases: 3 }));
  input.faultStudy = {
    networkBaseMVA: 1,
    sourceInventory: { status: 'complete', reference: 'Synthetic mixed-voltage inventory' },
    sources: [{ equipmentId: input.supply.id, emfPhaseV: complex(480 / Math.sqrt(3)), impedance: { rOhm: 0.006, xOhm: 0.015 }, inService: true, reference: 'Explicit utility equivalent' }],
    transformerPhase: { degrees: 0, reference: 'Explicit zero-angle assumption' },
  };
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.deviceFaultValidation.status, 'evaluated', JSON.stringify(proposal.deviceFaultValidation.issues));
  const tx = proposal.transformer;
  const primaryCable = proposal.cables.find(row => row.transformerSide === 'primary');
  const primary = proposal.deviceFaultValidation.placements.find(row => row.proposedLocation.branchId === primaryCable.id);
  assert.ok(primary.aliases.includes(`transformer.${tx.id}.primaryProtectiveDevice`));
  const secondary = proposal.deviceFaultValidation.placements.find(row => row.id === `secondary-main:${tx.id}`);
  assert.equal(secondary.kind, 'aggregate-secondary-main');
  assert.deepEqual(secondary.proposedLocation.branchIds, proposal.cables.filter(row => row.from === tx.secondaryBusId && proposal.equipment.some(item => item.id === row.to && item.type === 'panel')).map(row => row.id));
  assert.equal(secondary.device.standaloneInterruptingRating.applicableAtLocationVoltage, true);
  assert.equal(secondary.device.standaloneInterruptingRating.voltageApplicability, 'manufacturer-documented-straight-voltage-rating-used-at-lower-system-voltage');
  assert.ok(secondary.cases.some(row => row.aggregateSourceReference?.branchId === tx.id));
});

test('an initial-RMS exceedance adds a blocking proposal issue and clears the distribution baseline', () => {
  const input = inputFixture();
  const motor = input.equipment[24];
  Object.assign(motor, { kw: 9, powerFactor: 0.86, duty: 'continuous', ratingsBasis: 'electrical-input-kW', motor: {
    ratedVoltageV: 460, fullLoadCurrentA: 14, fullLoadCurrentBasis: { reference: 'Synthetic referenced motor current' },
    nameplateCurrentA: 12.8, nameplateHorsepower: 10, nameplateFrequencyHz: 60,
    lockedRotorCurrentA: 90, lockedRotorPowerFactor: 0.3, starterType: 'dol', rotorType: 'squirrel-cage',
  } });
  input.supply.availableFaultCurrentKA = 17.2;
  input.faultStudy.sources[0].impedance = { rOhm: 0.006, xOhm: 0.015 };
  input.faultStudy.sources.push({ equipmentId: motor.id, emfPhaseV: complex(460 / Math.sqrt(3)), impedance: { rOhm: 0.01, xOhm: 0.01 }, inService: true, reference: 'Explicit high infeed test equivalent' });
  input.supply.motorStartingImpedance = { rOhm: 0.006, xOhm: 0.015, reference: 'Separate test starting source' };
  input.criteria.motorStarting = { minimumVoltagePu: 0.8 };
  input.criteria.motorStarter = { controlVoltageV: 24, controlCurrentType: 'DC', branchProtectionMethod: 'inverse-time-breaker', instantaneousPickupA: 150 };
  input.protectiveDevices = JSON.parse(fs.readFileSync(new URL('../data/designSynthesisDevices.json', import.meta.url), 'utf8')).records;
  for (const device of input.protectiveDevices) {
    for (const rating of device.interruptingRatings || []) rating.currentKA = 18;
  }
  const proposal = generateDesignProposal(input);
  assert.ok(proposal.deviceFaultValidation.issues.some(row => row.code === 'DEVICE_FAULT_SCREEN_RATING_EXCEEDED'));
  assert.ok(proposal.issues.some(row => row.code === 'DEVICE_FAULT_SCREEN_RATING_EXCEEDED'));
  assert.equal(proposal.checks.find(row => row.id === 'deviceFaultScreen').status, 'fail');
  assert.equal(proposal.status, 'blocked');
  assert.equal(proposal.distributionBaseline, null);
});

test('absent optional fault study preserves the proposal contract without adding device screen data', () => {
  const input = inputFixture();
  delete input.faultStudy;
  const proposal = generateDesignProposal(input);
  assert.equal(Object.hasOwn(proposal, 'deviceFaultValidation'), false);
  assert.equal(proposal.checks.some(row => row.id === 'deviceFaultScreen'), false);
});
