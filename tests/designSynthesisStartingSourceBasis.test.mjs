import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { deriveStartingSourceBasis, prepareStartingSourceBasis, startingCaseFromFaultStudy, validateStartingSourceBasis } from '../analysis/designSynthesisStartingSourceBasis.mjs';
import { analyzeDesignSynthesisSourceFaultConsistency } from '../analysis/designSynthesisSourceFault.mjs';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';

const supply = () => ({ id: 'S', voltage: 480, phases: 3, availableFaultCurrentKA: 20 });
const startingCase = () => ({ faultCurrentKA: 10, xOverR: 2, reference: 'Synthetic source case and X/R', confirmedSourceOnlyStartingCase: true });

test('a referenced fault-study utility equivalent can be reviewed as an independent starting-case snapshot', () => {
  const model = { sources: [{ equipmentId: 'S', inService: true, reference: 'Utility case A', emfPhaseV: { re: 480 / Math.sqrt(3), im: 0 }, impedance: { rOhm: 0.006, xOhm: 0.015 } }] };
  const before = structuredClone(model);
  const copied = startingCaseFromFaultStudy(supply(), model);
  assert.equal(copied.ok, true, copied.issues.join('; '));
  assert.equal(copied.requested.confirmedSourceOnlyStartingCase, false);
  assert.ok(Math.abs(copied.requested.faultCurrentKA - 17.153801) < 1e-6);
  assert.equal(copied.requested.xOverR, 2.5);
  assert.match(copied.requested.reference, /Utility case A/);
  assert.equal(prepareStartingSourceBasis(supply(), copied.requested).ok, false);
  const reviewed = prepareStartingSourceBasis(supply(), { ...copied.requested, confirmedSourceOnlyStartingCase: true });
  assert.equal(reviewed.ok, true, reviewed.issues.join('; '));
  assert.ok(Math.abs(reviewed.impedance.rOhm - 0.006) < 1e-15);
  assert.ok(Math.abs(reviewed.impedance.xOhm - 0.015) < 1e-15);
  assert.deepEqual(model, before);
  model.sources[0].impedance.rOhm = 0.01;
  assert.equal(validateStartingSourceBasis(reviewed.source), null);
});

test('fault-study copying rejects ambiguous, incompatible, unreferenced, unbounded or unrepresentable equivalents', () => {
  const row = { equipmentId: 'S', inService: true, reference: 'Case A', emfPhaseV: { re: 480 / Math.sqrt(3), im: 0 }, impedance: { rOhm: 0.006, xOhm: 0.015 } };
  for (const sources of [[], [row, row], [{ ...row, equipmentId: 'other' }], [{ ...row, inService: false }], [{ ...row, reference: ' ' }], [{ ...row, emfPhaseV: { re: 480, im: 0 } }], [{ ...row, impedance: { rOhm: 0, xOhm: 0.015 } }], [{ ...row, impedance: { rOhm: 0.001, xOhm: 0.001 } }], [{ ...row, impedance: { rOhm: 0.006, xOhm: -0.015 } }]]) {
    assert.equal(startingCaseFromFaultStudy(supply(), { sources }).ok, false, JSON.stringify(sources));
  }
  assert.equal(startingCaseFromFaultStudy(supply(), '{invalid').ok, false);
  assert.equal(startingCaseFromFaultStudy({ ...supply(), phases: 1 }, { sources: [row] }).ok, false);
});

test('three-phase source current and X/R produce independently calculated per-phase R and X', () => {
  const source = supply(); const request = startingCase(); const before = structuredClone(source);
  const result = prepareStartingSourceBasis(source, request);
  assert.equal(result.ok, true, result.issues?.join('; '));
  assert.ok(Math.abs(result.impedance.rOhm - 480 / (10000 * Math.sqrt(15))) < 1e-15);
  assert.ok(Math.abs(result.impedance.xOhm - 2 * 480 / (10000 * Math.sqrt(15))) < 1e-15);
  assert.equal(result.source.availableFaultCurrentKA, 20);
  assert.equal(validateStartingSourceBasis(result.source), null);
  assert.equal(analyzeDesignSynthesisSourceFaultConsistency({ source: result.source }).comparison.relation, 'below-declared-bound');
  assert.deepEqual(source, before);
  const resistive = deriveStartingSourceBasis(source, { ...request, xOverR: 0 });
  assert.equal(resistive.impedance.xOhm, 0);
  assert.ok(resistive.impedance.rOhm > 0);
});

test('source case is explicit, bounded, finite and never overwrites independent impedance', () => {
  for (const invalid of [{ faultCurrentKA: 0 }, { faultCurrentKA: 21 }, { faultCurrentKA: '10' }, { xOverR: -1 }, { xOverR: Infinity }, { reference: ' ' }, { confirmedSourceOnlyStartingCase: false }]) assert.equal(deriveStartingSourceBasis(supply(), { ...startingCase(), ...invalid }).ok, false, JSON.stringify(invalid));
  assert.equal(deriveStartingSourceBasis({ ...supply(), phases: 1 }, startingCase()).ok, false);
  assert.equal(deriveStartingSourceBasis({ ...supply(), availableFaultCurrentKA: undefined }, startingCase()).ok, false);
  const independentlyProvided = { ...supply(), motorStartingImpedance: { rOhm: 0.01, xOhm: 0.02, reference: 'Owner data' } };
  assert.equal(prepareStartingSourceBasis(independentlyProvided, startingCase()).ok, false);
  const reviewed = prepareStartingSourceBasis(supply(), startingCase()).source;
  const changedSource = { ...reviewed, voltage: 416 };
  assert.ok(validateStartingSourceBasis(changedSource));
  const refreshed = prepareStartingSourceBasis(changedSource, startingCase());
  assert.equal(refreshed.ok, true, refreshed.issues?.join('; '));
  assert.equal(validateStartingSourceBasis(refreshed.source), null);
  const edited = structuredClone(reviewed); edited.motorStartingImpedance.rOhm *= 2;
  assert.equal(prepareStartingSourceBasis(edited, startingCase()).ok, false);
});

test('changed inputs or source-case evidence block the derived basis', () => {
  const source = prepareStartingSourceBasis(supply(), startingCase()).source;
  for (const change of [row => { row.id = 'other'; }, row => { row.voltage = 416; }, row => { row.phases = 1; }, row => { row.availableFaultCurrentKA = 21; }, row => { row.motorStartingImpedance.xOhm *= 2; }, row => { row.motorStartingImpedance.reference = 'changed'; }, row => { row.motorStartingImpedanceBasis.xOverR = 5; }, row => { row.motorStartingImpedanceBasis.confirmedSourceOnlyStartingCase = false; }, row => { row.motorStartingImpedanceBasis = null; }]) {
    const altered = structuredClone(source); change(altered);
    assert.ok(validateStartingSourceBasis(altered));
    assert.ok(analyzeDesignSynthesisSourceFaultConsistency({ source: altered }).issues.some(item => item.code === 'SOURCE_STARTING_BASIS_STALE'));
  }
});

for (const count of [25, 50]) test(`${count} loads carry the source-case conversion into the motor study and invalidate changed inputs`, () => {
  const input = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-industrial.json', import.meta.url), 'utf8'));
  const originals = input.equipment;
  input.equipment = Array.from({ length: count }, (_, index) => ({ ...originals[index % originals.length], id: `L-${index}`, tag: `L-${index}`, kw: 2, powerFactor: 0.9, duty: 'continuous' }));
  Object.assign(input.equipment[0], { kw: 8, powerFactor: 0.8, ratingsBasis: 'electrical-input-kW', motor: { ratedVoltageV: 460, fullLoadCurrentA: 14, fullLoadCurrentBasis: { reference: 'Synthetic design current' }, nameplateCurrentA: 12.8, lockedRotorCurrentA: 90, lockedRotorPowerFactor: 0.3, starterType: 'dol' } });
  input.supply.availableFaultCurrentKA = 20;
  input.supply = prepareStartingSourceBasis(input.supply, { ...startingCase(), faultCurrentKA: 17 }).source;
  input.criteria.motorStarting = { minimumVoltagePu: 0.7 };
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.loads.length, count);
  assert.equal(proposal.sourceFaultConsistency.status, 'pass');
  assert.equal(proposal.motorStartingValidation.cases.length, 1);
  assert.equal(proposal.motorStartingValidation.status, 'pass');
  assert.equal(proposal.inputEvidence.records.supply.values.motorStartingImpedance.basis, 'source-case-derived');
  assert.equal(proposal.inputs.original.supply.motorStartingImpedanceBasis.faultCurrentKA, 17);
  assert.equal(proposal.status, 'blocked');
  assert.ok(proposal.issues.some(item => item.code === 'MOTOR_PROTECTION_UNRESOLVED'));
  const changed = structuredClone(input); changed.supply.voltage = 416;
  const stale = generateDesignProposal(changed);
  assert.equal(stale.loads.length, 0);
  assert.ok(stale.issues.some(item => item.code === 'SOURCE_STARTING_BASIS_STALE'));
});
