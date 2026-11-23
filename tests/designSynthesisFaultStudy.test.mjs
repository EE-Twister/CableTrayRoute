import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateDesignSynthesisFaultStudy } from '../analysis/designSynthesisFaultStudy.mjs';
import { buildDesignSynthesisOneLine } from '../analysis/designSynthesisOneLine.mjs';
import { listTransformerProfiles } from '../analysis/designSynthesisTransformers.mjs';

const supply = { id: 'UTILITY', tag: 'UTILITY', type: 'source', voltage: 480, phases: 3, availableFaultCurrentKA: 20 };
const cable = { id: 'C-LOAD', tag: 'C-LOAD', from: 'UTILITY', to: 'MOTOR', lengthFt: 100, length: 100, conductor_size: '#8 AWG', r_ohm_per_kft: 0.810, x_ohm_per_kft: 0.052, impedanceBasis: 'Southwire SPEC45301 rev1.000.008', cableStockId: '606939' };
const motor = { id: 'MOTOR', type: 'load', tag: 'MOTOR', voltage: 480, phases: 3, motor: { ratedVoltageV: 460 } };
const cAdd = (a, b) => ({ re: a.re + b.re, im: a.im + b.im });
const cDiv = (a, b) => ({ re: (a.re * b.re + a.im * b.im) / (b.re ** 2 + b.im ** 2), im: (a.im * b.re - a.re * b.im) / (b.re ** 2 + b.im ** 2) });
function simpleProposal() {
  const equipment = [supply, motor];
  const loads = [motor];
  const cables = [structuredClone(cable)];
  return { inputs: { original: { supply } }, equipment, loads, cables, oneLine: buildDesignSynthesisOneLine({ supply, loads, cables }) };
}
function study(sources = [{ equipmentId: 'UTILITY', emfPhaseV: { re: 480 / Math.sqrt(3), im: 0 }, impedance: { rOhm: 0.01, xOhm: 0.01 }, inService: true, reference: 'Utility source equivalent basis' }, { equipmentId: 'MOTOR', emfPhaseV: { re: 460 / Math.sqrt(3), im: 0 }, impedance: { rOhm: 0.5, xOhm: 0.2 }, inService: true, reference: 'Motor equivalent basis' }]) {
  return { networkBaseMVA: 1, sourceInventory: { status: 'complete', reference: 'Reviewed source inventory document' }, sources };
}

test('explicit source and motor equivalents solve all generated buses with original equipment identities', () => {
  const result = evaluateDesignSynthesisFaultStudy({ proposal: simpleProposal(), faultStudy: study() });
  assert.equal(result.status, 'evaluated', JSON.stringify(result.issues));
  assert.equal(result.scope, 'initial-symmetrical-rms-only');
  assert.equal(result.sourceInventory.verificationStatus, 'not-verified');
  assert.equal(result.coverage.status, 'complete');
  assert.deepEqual(result.cases.map(item => item.busId), ['UTILITY', 'MOTOR']);
  const motorCase = result.cases.find(item => item.busId === 'MOTOR');
  assert.ok(motorCase.sourceFaultContributions.some(item => item.sourceId === 'UTILITY'));
  assert.ok(motorCase.sourceFaultContributions.every(item => ['UTILITY', 'MOTOR'].includes(item.sourceId)));
});

test('missing known motor equivalent and incomplete inventory block without assuming zero', () => {
  const incomplete = study().sources.filter(item => item.equipmentId !== 'MOTOR');
  const result = evaluateDesignSynthesisFaultStudy({ proposal: simpleProposal(), faultStudy: { ...study(incomplete), sourceInventory: { status: 'partial', reference: 'Partial list' } } });
  assert.equal(result.status, 'blocked');
  assert.equal(result.coverage.status, 'incomplete');
  assert.deepEqual(result.coverage.missingEquipmentIds, ['MOTOR']);
  assert.equal(result.cases.length, 0);
  assert.ok(result.issues.some(item => item.code === 'FAULT_STUDY_SOURCE_INVENTORY_INCOMPLETE'));
});

test('utility equivalent is checked only against the declared external upper bound', () => {
  const highUtility = study();
  highUtility.sources[0].impedance = { rOhm: 0.005, xOhm: 0.005 };
  const result = evaluateDesignSynthesisFaultStudy({ proposal: simpleProposal(), faultStudy: highUtility });
  assert.equal(result.status, 'blocked');
  assert.ok(result.issues.some(item => item.code === 'FAULT_STUDY_UTILITY_BOUND_EXCEEDED'));
});

test('one-line cable/model drift blocks network adaptation', () => {
  const proposal = simpleProposal();
  proposal.oneLine.sheets[0].connections[0].cable.lengthFt += 1;
  const result = evaluateDesignSynthesisFaultStudy({ proposal, faultStudy: study() });
  assert.equal(result.status, 'blocked');
  assert.ok(result.issues.some(item => item.code === 'FAULT_STUDY_ONELINE_CABLE_MISMATCH'));
});

test('blocked study fingerprints include final network changes and one-line extras are rejected', () => {
  const proposal = simpleProposal();
  const first = evaluateDesignSynthesisFaultStudy({ proposal, faultStudy: study() });
  proposal.cables[0].lengthFt += 1;
  const staleLine = evaluateDesignSynthesisFaultStudy({ proposal, faultStudy: study() });
  assert.equal(staleLine.status, 'blocked');
  assert.notEqual(staleLine.modelInputFingerprint, first.modelInputFingerprint);
  const extra = simpleProposal();
  extra.oneLine.sheets[0].components.push({ id: 'UNMODELED', type: 'bus', voltage: 480, phases: 3 });
  const extraResult = evaluateDesignSynthesisFaultStudy({ proposal: extra, faultStudy: study() });
  assert.ok(extraResult.issues.some(item => item.code === 'FAULT_STUDY_ONELINE_EXTRA_COMPONENT'));
});

test('nested unknown fields and empty fault bus lists block before solving', () => {
  const nested = study();
  nested.sources[1].impedance.unmodeled = 1;
  let result = evaluateDesignSynthesisFaultStudy({ proposal: simpleProposal(), faultStudy: nested });
  assert.equal(result.status, 'blocked');
  assert.equal(result.cases.length, 0);
  assert.ok(result.issues.some(item => item.code === 'FAULT_STUDY_UNKNOWN_FIELD'));
  result = evaluateDesignSynthesisFaultStudy({ proposal: simpleProposal(), faultStudy: { ...study(), faultBusIds: [] } });
  assert.equal(result.status, 'blocked');
  assert.equal(result.cases.length, 0);
  assert.ok(result.issues.some(item => item.code === 'FAULT_STUDY_NO_FAULT_BUSES'));
});

test('transformer requires an explicitly referenced phase assumption and models primary-referred series R/X', () => {
  const sourced = listTransformerProfiles().find(row => row.ratedKVA === 75);
  const tx = { ...sourced, id: 'TX-1', type: 'transformer', primaryBusId: 'BPRI', secondaryBusId: 'BSEC' };
  const primaryCable = { id: 'C-PRI', from: 'UTILITY', to: 'BPRI', lengthFt: 100, conductor_size: '#8 AWG', r_ohm_per_kft: 0.810, x_ohm_per_kft: 0.052, impedanceBasis: 'Southwire SPEC45301 rev1.000.008' };
  const secondaryCable = { id: 'C-SEC', from: 'BSEC', to: 'PANEL', lengthFt: 100, conductor_size: '#8 AWG', r_ohm_per_kft: 0.810, x_ohm_per_kft: 0.052, impedanceBasis: 'Southwire SPEC45301 rev1.000.008' };
  const branch = { id: 'C-BRANCH', from: 'PANEL', to: 'MOTOR', lengthFt: 100, conductor_size: '#8 AWG', r_ohm_per_kft: 0.810, x_ohm_per_kft: 0.052, impedanceBasis: 'Southwire SPEC45301 rev1.000.008' };
  const panel = { id: 'PANEL', type: 'panel', voltage: 208, phases: 3 };
  const primaryBus = { id: 'BPRI', tag: 'BPRI', type: 'bus', voltage: 480, phases: 3 };
  const secondaryBus = { id: 'BSEC', tag: 'BSEC', type: 'bus', voltage: 208, phases: 3 };
  const load = { ...motor, voltage: 208, motor: { ratedVoltageV: 208 } };
  const equipment = [supply, primaryBus, secondaryBus, tx, panel, load];
  const cables = [primaryCable, secondaryCable, branch];
  const oneLine = buildDesignSynthesisOneLine({ supply, panels: [panel], loads: [load], cables, transformers: [tx], terminalBuses: [primaryBus, secondaryBus] });
  const proposal = { inputs: { original: { supply } }, equipment, loads: [load], cables, oneLine, transformer: structuredClone(tx) };
  const input = { ...study(), sources: study().sources.map(row => row.equipmentId === 'MOTOR' ? { ...row, emfPhaseV: { re: 208 / Math.sqrt(3), im: 0 } } : row), transformerPhase: { degrees: 0, reference: 'Referenced magnitude-only winding phase assumption' } };
  let result = evaluateDesignSynthesisFaultStudy({ proposal, faultStudy: input });
  assert.equal(result.status, 'evaluated', JSON.stringify(result.issues));
  const transformerBranch = result.cases[0].branchTerminalCurrents.find(item => item.branchId === tx.id);
  assert.ok(transformerBranch);
  assert.equal(transformerBranch.fromBusId, 'BPRI');
  assert.equal(transformerBranch.toBusId, 'BSEC');
  const primaryZBase = 480 ** 2 / (tx.seriesModel.sourceBasisKVA * 1000);
  const transformerZPri = { re: tx.seriesModel.rPercent / 100 * primaryZBase, im: tx.seriesModel.xPercent / 100 * primaryZBase };
  const utilityPathPri = cAdd(cAdd({ re: 0.01, im: 0.01 }, { re: 0.810 * 100 / 1000, im: 0.052 * 100 / 1000 }), transformerZPri);
  const turnsRatioSquared = (tx.secondaryVoltageVac / tx.primaryVoltageVac) ** 2;
  const utilityPathSec = cAdd({ re: utilityPathPri.re * turnsRatioSquared, im: utilityPathPri.im * turnsRatioSquared }, { re: 2 * 0.810 * 100 / 1000, im: 2 * 0.052 * 100 / 1000 });
  const expectedUtilityInfeed = cDiv({ re: 208 / Math.sqrt(3), im: 0 }, utilityPathSec);
  const expectedMotorInfeed = cDiv({ re: 208 / Math.sqrt(3), im: 0 }, { re: 0.5, im: 0.2 });
  const expectedTotal = cAdd(expectedUtilityInfeed, expectedMotorInfeed);
  const motorResult = result.cases.find(item => item.busId === 'MOTOR');
  const motorFault = motorResult.fault.faultCurrentRmsKA;
  assert.ok(Math.abs(motorFault - Math.hypot(expectedTotal.re, expectedTotal.im) / 1000) < 1e-8, `${JSON.stringify({ motorFault, expectedTotal, expectedUtilityInfeed, expectedMotorInfeed, sourceFaultContributions: motorResult.sourceFaultContributions })}`);
  const zeroPhaseTotal = motorFault;
  input.transformerPhase = { degrees: 30, reference: 'Explicit 30 degree study assumption' };
  result = evaluateDesignSynthesisFaultStudy({ proposal, faultStudy: input });
  assert.equal(result.status, 'evaluated', JSON.stringify(result.issues));
  assert.notEqual(result.cases.find(item => item.busId === 'MOTOR').fault.faultCurrentRmsKA, zeroPhaseTotal);
  input.transformerPhase = undefined;
  result = evaluateDesignSynthesisFaultStudy({ proposal, faultStudy: input });
  assert.equal(result.status, 'blocked');
  assert.ok(result.issues.some(item => item.code === 'FAULT_STUDY_TRANSFORMER_PHASE_REQUIRED'));
  const tampered = structuredClone(proposal);
  tampered.transformer.seriesModel.xPercent += 0.25;
  result = evaluateDesignSynthesisFaultStudy({ proposal: tampered, faultStudy: { ...input, transformerPhase: { degrees: 0, reference: 'Explicit test phase assumption' } } });
  assert.equal(result.status, 'blocked');
  assert.ok(result.issues.some(item => item.code === 'FAULT_STUDY_TRANSFORMER_MODEL_UNSUPPORTED'));
});
