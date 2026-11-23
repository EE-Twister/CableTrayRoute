import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { applyMotorReferenceProfile, MOTOR_REFERENCE_PROFILES, validateMotorOperatingReference } from '../analysis/motorReferenceProfiles.mjs';
import { buildDesignSynthesisProjectEquipmentAdoption, validateDesignSynthesisProjectEquipmentAdoption } from '../analysis/designSynthesisProjectEquipment.mjs';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';

test('exact 460 V manufacturer nameplate and typical starting data are copied without inventing a design basis', () => {
  const expected = [
    ['baldor-gnem2332t-460-60', 10, 16.8, 121, 0.254],
    ['baldor-ccpx32446t-460-60', 40, 48, 338, 0.27],
  ];
  for (const [id, hp, current, starting, pf] of expected) {
    const rows = [{ id: 'M1', category: 'Motor', voltage: 480, phases: 3, kw: 8, powerFactor: 0.8, x: 1, y: 2, z: 0, owner: { value: 'retained' } }];
    const before = structuredClone(rows);
    const result = applyMotorReferenceProfile(rows, ['M1'], id);
    assert.equal(result.ok, true, result.issues.join('; '));
    const motor = result.rows[0];
    assert.equal(motor.motorRatedVoltageV, 460);
    assert.equal(motor.motorNameplateHorsepower, hp);
    assert.equal(motor.motorNameplateCurrentA, current);
    assert.equal(motor.motorLockedRotorCurrentA, starting);
    assert.equal(motor.motorLockedRotorPowerFactor, pf);
    assert.equal(motor.motorNameplateFrequencyHz, 60);
    assert.equal(motor.motorStarterType, 'dol');
    assert.equal(motor.motorFullLoadCurrentA, undefined);
    assert.equal(motor.motorFullLoadCurrentReference, undefined);
    assert.equal(motor.motorRotorType, undefined);
    assert.equal(motor.kw, 8); assert.equal(motor.powerFactor, 0.8);
    assert.match(motor.motorDataReference, /typical, not guaranteed/);
    assert.match(motor.motorDataReference, /not verified installed/);
    assert.ok(motor.motorDataReference.includes(MOTOR_REFERENCE_PROFILES.find(row => row.id === id).sha256));
    assert.deepEqual(rows, before);
  }
});

test('conflicts, unsupported classifications and ambiguous selection prevent the entire update', () => {
  const good = { id: 'A', category: 'Motor', voltage: 480, phases: 3 };
  const variants = [
    { id: 'B', model: 'OTHER' }, { id: 'B', manufacturer: 'Other' }, { id: 'B', voltage: 208 }, { id: 'B', phases: 1 },
    { id: 'B', motorNameplateCurrentA: 13 }, { id: 'B', motorStarterType: 'vfd' }, { id: 'B', category: 'VFD' },
    { id: 'B', category: 'Motor Control' }, { id: 'B', motor: { ratedVoltageV: 460 } }, { id: 'B', motorDataReference: { bad: true } },
  ];
  for (const bad of variants) {
    const rows = [good, bad]; const before = structuredClone(rows);
    const result = applyMotorReferenceProfile(rows, ['A', 'B'], 'baldor-gnem2332t-460-60');
    assert.equal(result.ok, false, JSON.stringify(bad));
    assert.equal(result.rows, null);
    assert.deepEqual(rows, before);
  }
  assert.equal(applyMotorReferenceProfile([good], ['A', 'missing'], 'baldor-gnem2332t-460-60').ok, false);
  assert.equal(applyMotorReferenceProfile([good, good], ['A'], 'baldor-gnem2332t-460-60').ok, false);
  assert.equal(applyMotorReferenceProfile([good], ['A'], 'unknown').ok, false);
});

test('explicit full-load option uses exact source values and checks the independent three-phase current', () => {
  for (const [id, hp, efficiency, pf, manufacturerCurrent] of [
    ['baldor-gnem2332t-460-60', 10, 0.911, 0.61, 16.8],
    ['baldor-ccpx32446t-460-60', 40, 0.942, 0.83, 48.1],
  ]) {
    const rows = [{ id: 'M1', category: 'Motor', voltage: 480, phases: 3, x: 0, y: 0, z: 0 }];
    const result = applyMotorReferenceProfile(rows, ['M1'], id, { useTypicalFullLoad: true });
    assert.equal(result.ok, true, result.issues.join('; '));
    const row = result.rows[0];
    assert.equal(row.kw, hp * 0.7457 / efficiency);
    assert.equal(row.powerFactor, pf);
    assert.equal(row.ratingsBasis, 'electrical-input-kW');
    assert.equal(row.duty, 'continuous');
    assert.equal(row.motorOperatingBasis.sourcePage, 6);
    assert.equal(row.motorOperatingBasis.loadFraction, 1);
    assert.match(row.motorOperatingBasis.limitation, /not guaranteed/);
    const independentCurrent = row.kw * 1000 / (Math.sqrt(3) * 460 * pf);
    assert.ok(Math.abs(independentCurrent - manufacturerCurrent) < 0.25, `${id} source rounding comparison`);
    assert.equal(validateMotorOperatingReference(row), null);
    const reordered = { ...row, motorOperatingBasis: Object.fromEntries(Object.entries(row.motorOperatingBasis).reverse()) };
    assert.equal(validateMotorOperatingReference(reordered), null, 'JSON key order is not provenance');
    for (const change of [
      item => { item.kw += 1; }, item => { item.powerFactor = 0.99; }, item => { item.voltage = 460; },
      item => { item.motorNameplateHorsepower += 1; }, item => { item.motorNameplateCurrentA += 1; },
      item => { item.model = 'different-model'; }, item => { item.manufacturer = 'different-manufacturer'; },
      item => { item.motorOperatingBasis.sourceSha256 = 'changed'; }, item => { item.duty = 'intermittent'; },
      item => { item.motorOperatingBasis = null; }, item => { item.frequency = 50; },
      item => { item.frequencyHz = 60; item.frequency = 50; }, item => { item.frequencyHz = null; },
    ]) {
      const changed = structuredClone(row); change(changed);
      assert.ok(validateMotorOperatingReference(changed), `changed input must make ${id} stale`);
    }
    assert.deepEqual(rows, [{ id: 'M1', category: 'Motor', voltage: 480, phases: 3, x: 0, y: 0, z: 0 }]);
  }
});

test('full-load option is atomic and never replaces incompatible owner inputs', () => {
  const base = { id: 'A', category: 'Motor', voltage: 480, phases: 3 };
  for (const bad of [{ kw: 8 }, { powerFactor: 0.8 }, { ratingsBasis: 'shaft-output-kW' }, { duty: 'intermittent' }, { voltage: 208 }, { phases: 1 }, { voltage: null }, { frequencyHz: 50 }, { frequencyHz: 60, frequency: 50 }, { frequencyHz: null }, { frequencyHz: [60] }, { motorOperatingBasis: null }, { motorOperatingBasis: [] }, { motorOperatingBasis: { unexpected: true } }]) {
    const rows = [base, { ...base, ...bad, id: 'B' }];
    const before = structuredClone(rows);
    const result = applyMotorReferenceProfile(rows, ['A', 'B'], 'baldor-gnem2332t-460-60', { useTypicalFullLoad: true });
    assert.equal(result.ok, false, JSON.stringify(bad));
    assert.equal(result.rows, null);
    assert.deepEqual(rows, before);
  }
  assert.equal(applyMotorReferenceProfile([base], ['A'], 'baldor-gnem2332t-460-60', { useTypicalFullLoad: 'false' }).ok, false);
});

for (const count of [25, 50]) test(`${count} equipment loads carry a manufacturer-derived operating basis into synthesis`, () => {
  const input = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-industrial.json', import.meta.url), 'utf8'));
  const originals = input.equipment;
  const equipment = Array.from({ length: count }, (_, index) => ({ ...originals[index % originals.length], id: `L-${index}`, tag: `L-${index}`, kw: 2, category: 'Load', powerFactor: 0.9, duty: 'continuous' }));
  const motor = equipment[0];
  delete motor.kw; delete motor.powerFactor; delete motor.duty;
  Object.assign(motor, { category: 'Motor', motorFullLoadCurrentA: 16.8, motorFullLoadCurrentReference: 'Illustrative design current; applicability unverified', motorRotorType: 'squirrel-cage' });
  const selected = applyMotorReferenceProfile(equipment, [motor.id], 'baldor-gnem2332t-460-60', { useTypicalFullLoad: true });
  assert.equal(selected.ok, true, selected.issues.join('; '));
  const context = { equipment: selected.rows, loads: [], selectedEquipmentIds: equipment.map(row => row.id), projectId: 'Named', scenario: 'base', projectFingerprint: 'fixture', acknowledgements: { electricalInputKW: true, voltageLineToLine: true, coordinatesFeet: true } };
  const adoption = buildDesignSynthesisProjectEquipmentAdoption(context);
  assert.equal(adoption.ok, true, JSON.stringify(adoption.issues));
  assert.deepEqual(adoption.selectedRows[0].motorOperatingBasis, selected.rows[0].motorOperatingBasis);
  input.equipment = adoption.selectedRows;
  input.supply.motorStartingImpedance = { rOhm: 0.006, xOhm: 0.015, reference: 'Synthetic source study' };
  input.criteria.motorStarting = { minimumVoltagePu: 0.8 };
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.loads.length, count);
  assert.equal(proposal.status, 'blocked');
  assert.ok(proposal.issues.some(item => item.code === 'MOTOR_PROTECTION_UNRESOLVED'));
  assert.equal(proposal.inputEvidence.records.equipment[0].values.kw.basis, 'manufacturer-reference-derived');
  assert.equal(proposal.inputEvidence.records.equipment[0].values.powerFactor.basis, 'manufacturer-reference-derived');
  assert.deepEqual(proposal.inputEvidence.records.equipment[0].values.motorOperatingBasis.value, selected.rows[0].motorOperatingBasis);
  const changed = structuredClone(context); changed.equipment[0].kw += 1;
  assert.ok(buildDesignSynthesisProjectEquipmentAdoption(changed).issues.some(item => item.code === 'MOTOR_OPERATING_REFERENCE_STALE'));
  input.equipment[0].powerFactor = 0.8;
  const stale = generateDesignProposal(input);
  assert.ok(stale.issues.some(item => item.code === 'MOTOR_OPERATING_REFERENCE_STALE'));
  assert.equal(stale.inputEvidence.records.equipment[0].values.kw.basis, 'provided');
  assert.equal(stale.inputEvidence.records.equipment[0].values.powerFactor.basis, 'provided');
});

test('linked equipment and load accept equivalent manufacturer aliases but reject conflicts', () => {
  const initial = { id: 'M1', tag: 'M1', category: 'Motor', voltage: 480, phases: 3, x: 1, y: 0, z: 0, motorFullLoadCurrentA: 16.8, motorFullLoadCurrentReference: 'Synthetic design reference', motorRotorType: 'squirrel-cage', manufacturer: 'ABB Baldor', model: 'GNEM2332T' };
  const reference = applyMotorReferenceProfile([initial], ['M1'], 'baldor-gnem2332t-460-60', { useTypicalFullLoad: true }).rows[0];
  const context = { equipment: [reference], loads: [{ id: 'L1', equipmentId: 'M1', tag: 'L1', kw: reference.kw, manufacturer: 'Baldor', model: 'GNEM2332T', motorOperatingBasis: Object.fromEntries(Object.entries(reference.motorOperatingBasis).reverse()) }], selectedEquipmentIds: ['M1'], projectId: 'Named', scenario: 'base', projectFingerprint: 'fixture', acknowledgements: { electricalInputKW: true, voltageLineToLine: true, coordinatesFeet: true } };
  const mapped = buildDesignSynthesisProjectEquipmentAdoption(context);
  assert.equal(mapped.ok, true, JSON.stringify(mapped.issues));
  const conflict = structuredClone(context);
  conflict.loads[0].manufacturer = 'Other';
  assert.ok(buildDesignSynthesisProjectEquipmentAdoption(conflict).issues.some(item => item.code === 'project_motor_operating_reference_conflict'));
});

for (const count of [25, 50]) test(`${count} motors can explicitly adopt the same rated-load reference atomically`, () => {
  const equipment = Array.from({ length: count }, (_, index) => ({ id: `M-${index}`, category: 'Motor', voltage: 480, phases: 3, x: index, y: 0, z: 0, motorFullLoadCurrentA: 16.8, motorFullLoadCurrentReference: 'Synthetic design reference', motorRotorType: 'squirrel-cage' }));
  const ids = equipment.map(row => row.id);
  const updated = applyMotorReferenceProfile(equipment, ids, 'baldor-gnem2332t-460-60', { useTypicalFullLoad: true });
  assert.equal(updated.ok, true, updated.issues.join('; '));
  assert.ok(updated.rows.every(row => validateMotorOperatingReference(row) === null));
  const mapped = buildDesignSynthesisProjectEquipmentAdoption({ equipment: updated.rows, loads: [], selectedEquipmentIds: ids, projectId: 'Named', scenario: 'base', projectFingerprint: 'fixture', acknowledgements: { electricalInputKW: true, voltageLineToLine: true, coordinatesFeet: true } });
  assert.equal(mapped.ok, true, JSON.stringify(mapped.issues));
  assert.equal(mapped.selectedRows.length, count);
  const conflicting = structuredClone(equipment); conflicting[count - 1].powerFactor = 0.8;
  const blocked = applyMotorReferenceProfile(conflicting, ids, 'baldor-gnem2332t-460-60', { useTypicalFullLoad: true });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.rows, null);
});

for (const count of [25, 50]) test(`${count} selected motor references retain design-current provenance through project adoption`, () => {
  const equipment = Array.from({ length: count }, (_, index) => ({ id: `M-${index}`, tag: `M-${index}`, category: 'Motor', voltage: 480, phases: 3, kw: 8, powerFactor: 0.61, duty: 'continuous', x: index, y: 0, z: 0, motorFullLoadCurrentA: 14, motorFullLoadCurrentReference: 'User-selected design current for testing; applicability unverified', motorRotorType: 'squirrel-cage' }));
  const selectedEquipmentIds = equipment.map(row => row.id);
  const filled = applyMotorReferenceProfile(equipment, selectedEquipmentIds, 'baldor-gnem2332t-460-60');
  assert.equal(filled.ok, true, filled.issues.join('; '));
  const context = { equipment: filled.rows, loads: [], selectedEquipmentIds, projectId: 'Named', scenario: 'base', projectFingerprint: 'fixture', acknowledgements: { electricalInputKW: true, voltageLineToLine: true, coordinatesFeet: true } };
  const adoption = buildDesignSynthesisProjectEquipmentAdoption(context);
  assert.equal(adoption.ok, true, JSON.stringify(adoption.issues));
  assert.equal(adoption.selectedRows.length, count);
  for (const row of adoption.selectedRows) {
    assert.equal(row.motor.fullLoadCurrentA, 14);
    assert.equal(row.motor.nameplateCurrentA, 16.8);
    assert.match(row.sourceDocuments[0], /GNEM2332T/);
  }
  assert.equal(validateDesignSynthesisProjectEquipmentAdoption({ ...context, adoption: adoption.adoption, rows: adoption.selectedRows }).ok, true);
});

for (const count of [25, 50]) test(`${count} equipment rows generate from a referenced project motor without altering owner records`, () => {
  const input = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-industrial.json', import.meta.url), 'utf8'));
  const originalRows = input.equipment;
  const equipment = Array.from({ length: count }, (_, index) => ({ ...originalRows[index % originalRows.length], id: `L-${index}`, tag: `L-${index}`, kw: 2, category: 'Load', powerFactor: 0.9, duty: 'continuous' }));
  Object.assign(equipment[0], { category: 'Motor', kw: Math.sqrt(3) * 460 * 16.8 * 0.61 / 1000, powerFactor: 0.61, motorFullLoadCurrentA: 14, motorFullLoadCurrentReference: 'Illustrative table current; applicability not verified', motorRotorType: 'squirrel-cage' });
  const referenced = applyMotorReferenceProfile(equipment, ['L-0'], 'baldor-gnem2332t-460-60');
  assert.equal(referenced.ok, true);
  const before = structuredClone(referenced.rows);
  const context = { equipment: referenced.rows, loads: [], selectedEquipmentIds: equipment.map(row => row.id), projectId: 'Named', scenario: 'base', projectFingerprint: 'fixture', acknowledgements: { electricalInputKW: true, voltageLineToLine: true, coordinatesFeet: true } };
  const adoption = buildDesignSynthesisProjectEquipmentAdoption(context);
  assert.equal(adoption.ok, true, JSON.stringify(adoption.issues));
  input.equipment = adoption.selectedRows;
  input.supply.motorStartingImpedance = { rOhm: 0.006, xOhm: 0.015, reference: 'Synthetic source study' };
  input.criteria.motorStarting = { minimumVoltagePu: 0.8 };
  input.criteria.motorStarter = { controlVoltageV: 24, controlCurrentType: 'DC', branchProtectionMethod: 'inverse-time-breaker', instantaneousPickupA: 150 };
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.loads.length, count);
  assert.equal(proposal.motorStarterCandidates.cases[0].candidate.overloadRelay.catalogNumber, '3RU2126-4BB0');
  assert.equal(proposal.status, 'blocked');
  assert.ok(proposal.issues.some(item => item.code === 'MOTOR_PROTECTION_UNRESOLVED'));
  assert.deepEqual(referenced.rows, before);
});
