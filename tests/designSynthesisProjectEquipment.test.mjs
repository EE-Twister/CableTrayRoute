import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyProjectEquipmentIdentityMap,
  buildDesignSynthesisProjectEquipmentAdoption,
  mergeAdoptedProjectRecord,
  validateDesignSynthesisProjectEquipmentAdoption,
} from '../analysis/designSynthesisProjectEquipment.mjs';
import { fingerprintStudyValue } from '../analysis/studyLifecycle.mjs';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';
import fs from 'node:fs';

function fixture() {
  return {
    equipment: [{ id: 'EQ-1', tag: 'MOTOR-EQUIP', voltage: 480, phases: 3, x: 0, y: 12, z: 3, owner: 'Ops' }],
    loads: [{ id: 'LOAD-1', equipmentId: 'EQ-1', tag: 'MOTOR-LOAD', kw: 7.5, voltage: 480, phases: 3, owner: 'Process' }],
    selectedEquipmentIds: ['EQ-1'], projectId: 'Named project', scenario: 'base', projectFingerprint: 'inputs-1',
    acknowledgements: { electricalInputKW: true, voltageLineToLine: true, coordinatesFeet: true },
  };
}

test('frequency aliases survive project handoff and conflicting or malformed values block review', () => {
  const input = fixture();
  input.equipment[0].frequency = '60';
  input.loads[0].frequencyHz = 60;
  const reviewed = buildDesignSynthesisProjectEquipmentAdoption(input);
  assert.equal(reviewed.ok, true, JSON.stringify(reviewed.issues));
  assert.equal(reviewed.selectedRows[0].frequencyHz, 60);
  const changed = structuredClone(input); changed.loads[0].frequencyHz = 50;
  assert.ok(buildDesignSynthesisProjectEquipmentAdoption(changed).issues.some(item => item.code === 'project_equipment_frequency_conflict'));
  assert.equal(validateDesignSynthesisProjectEquipmentAdoption({ ...changed, adoption: reviewed.adoption, rows: reviewed.selectedRows }).ok, false);
  for (const value of [null, '', '60 Hz', 0, [], NaN]) {
    const invalid = fixture(); invalid.equipment[0].frequencyHz = value;
    assert.ok(buildDesignSynthesisProjectEquipmentAdoption(invalid).issues.some(item => item.code === 'project_equipment_frequency_invalid'), String(value));
  }
  const aliases = fixture(); aliases.equipment[0].frequencyHz = 60; aliases.equipment[0].frequency = 50;
  assert.ok(buildDesignSynthesisProjectEquipmentAdoption(aliases).issues.some(item => item.code === 'project_equipment_frequency_conflict'));
});

for (const count of [25, 50]) test(`${count} project loads preserve frequency and a 50 Hz record blocks a 60 Hz proposal`, () => {
  const sample = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-industrial.json', import.meta.url), 'utf8'));
  const source = sample.equipment;
  const equipment = Array.from({ length: count }, (_, index) => ({ ...source[index % source.length], id: `E-${index}`, tag: `E-${index}`, kw: 2, frequencyHz: index === count - 1 ? 50 : 60 }));
  const context = { equipment, loads: [], selectedEquipmentIds: equipment.map(row => row.id), projectId: 'Named', scenario: 'base', projectFingerprint: 'fixture', acknowledgements: { electricalInputKW: true, voltageLineToLine: true, coordinatesFeet: true } };
  const mapped = buildDesignSynthesisProjectEquipmentAdoption(context);
  assert.equal(mapped.ok, true, JSON.stringify(mapped.issues));
  assert.equal(mapped.selectedRows[count - 1].frequencyHz, 50);
  sample.equipment = mapped.selectedRows;
  const proposal = generateDesignProposal(sample);
  assert.equal(proposal.status, 'blocked');
  assert.equal(proposal.loads.length, 0);
  assert.ok(proposal.issues.some(item => item.path === `equipment[${count - 1}].frequencyHz`));
  equipment[count - 1].frequencyHz = 60;
  const corrected = buildDesignSynthesisProjectEquipmentAdoption(context);
  sample.equipment = corrected.selectedRows;
  const regenerated = generateDesignProposal(sample);
  assert.equal(regenerated.loads.length, count);
  assert.equal(regenerated.inputEvidence.records.equipment[count - 1].values.frequencyHz.value, 60);
});

test('a 50 Hz source or criteria alias cannot bypass the 60 Hz synthesis limit', () => {
  for (const location of ['supply', 'criteria']) {
    const input = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-industrial.json', import.meta.url), 'utf8'));
    delete input.supply.frequencyHz; delete input.supply.frequency;
    delete input.criteria.frequencyHz; delete input.criteria.frequency;
    input[location].frequency = 50;
    const proposal = generateDesignProposal(input);
    assert.equal(proposal.status, 'blocked');
    assert.equal(proposal.loads.length, 0);
    assert.ok(proposal.issues.some(item => item.code === 'UNSUPPORTED_FREQUENCY'));
  }
});

test('adoption binds exact distinct equipment and load identities and schedule tags', () => {
  const input = fixture();
  const result = buildDesignSynthesisProjectEquipmentAdoption(input);
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  assert.equal(result.selectedRows[0].id, 'EQ-1');
  assert.equal(result.selectedRows[0].projectLoadId, 'LOAD-1');
  assert.equal(result.adoption.pairs[0].equipmentTag, 'MOTOR-EQUIP');
  assert.equal(result.adoption.pairs[0].loadTag, 'MOTOR-LOAD');
  const proposal = applyProjectEquipmentIdentityMap({
    loads: [{ id: 'EQ-1', tag: 'MOTOR-EQUIP' }],
    panels: [{ id: 'P-1', loadIds: ['EQ-1'], breakers: ['MOTOR-EQUIP'] }],
  }, result.adoption);
  assert.deepEqual(proposal.loads[0], { id: 'LOAD-1', tag: 'MOTOR-LOAD', equipmentId: 'EQ-1', projectEquipmentId: 'EQ-1' });
  assert.deepEqual(proposal.panels[0].loadIds, ['LOAD-1']);
  assert.deepEqual(proposal.panels[0].breakers, ['MOTOR-LOAD']);
});

test('equipment ratings can produce a reviewed proposed load without a preexisting load record', () => {
  const input = fixture();
  input.equipment[0].kw = '7.5';
  input.equipment[0].powerFactor = '0.9';
  input.equipment[0].duty = 'continuous';
  input.loads = [];
  const reviewed = buildDesignSynthesisProjectEquipmentAdoption(input);
  assert.equal(reviewed.ok, true, JSON.stringify(reviewed.issues));
  assert.equal(reviewed.adoption.pairs[0].sourceKind, 'equipment-only');
  assert.equal(reviewed.adoption.pairs[0].loadFingerprint, null);
  assert.equal(reviewed.adoption.pairs[0].loadId, 'DS-LOAD-EQ-1');
  assert.equal(reviewed.selectedRows[0].kw, 7.5);
  assert.equal(reviewed.selectedRows[0].powerFactor, 0.9);
  assert.equal(validateDesignSynthesisProjectEquipmentAdoption({ ...input, adoption: reviewed.adoption, rows: reviewed.selectedRows }).ok, true);
  const mapped = applyProjectEquipmentIdentityMap({ loads: [{ id: 'EQ-1', tag: 'MOTOR-EQUIP' }] }, reviewed.adoption);
  assert.equal(mapped.loads[0].id, 'DS-LOAD-EQ-1');
  assert.equal(mapped.loads[0].equipmentId, 'EQ-1');
});

test('flat equipment motor ratings preserve distinct explicit currents and require complete, consistent data', () => {
  const input = fixture();
  input.loads = [];
  Object.assign(input.equipment[0], { category: 'Motor', kw: '7.5', powerFactor: '0.88', duty: 'continuous', motorRatedVoltageV: '460', motorFullLoadCurrentA: '14', motorFullLoadCurrentReference: 'Specified design-current basis', motorNameplateCurrentA: '12.8', motorNameplateHorsepower: '10', motorNameplateFrequencyHz: '60', motorLockedRotorCurrentA: '90', motorLockedRotorPowerFactor: '0.3', motorStarterType: 'dol', motorRotorType: 'squirrel-cage' });
  const reviewed = buildDesignSynthesisProjectEquipmentAdoption(input);
  assert.equal(reviewed.ok, true, JSON.stringify(reviewed.issues));
  assert.deepEqual(reviewed.selectedRows[0].motor, { ratedVoltageV: 460, fullLoadCurrentA: 14, fullLoadCurrentBasis: { reference: 'Specified design-current basis' }, nameplateCurrentA: 12.8, nameplateHorsepower: 10, nameplateFrequencyHz: 60, lockedRotorCurrentA: 90, lockedRotorPowerFactor: 0.3, starterType: 'dol', rotorType: 'squirrel-cage' });
  assert.equal(validateDesignSynthesisProjectEquipmentAdoption({ ...input, adoption: reviewed.adoption, rows: reviewed.selectedRows }).ok, true);
  const changed = structuredClone(input); changed.equipment[0].motorFullLoadCurrentA = '15';
  assert.equal(validateDesignSynthesisProjectEquipmentAdoption({ ...changed, adoption: reviewed.adoption, rows: reviewed.selectedRows }).ok, false);
  const missing = structuredClone(input); missing.equipment[0].motorFullLoadCurrentReference = '';
  assert.ok(buildDesignSynthesisProjectEquipmentAdoption(missing).issues.some(item => item.code === 'MOTOR_FLC_BASIS_REQUIRED'));
  const conflict = structuredClone(input); conflict.equipment[0].motor = { ...reviewed.selectedRows[0].motor, nameplateCurrentA: 13 };
  assert.ok(buildDesignSynthesisProjectEquipmentAdoption(conflict).issues.some(item => item.code === 'project_motor_record_conflict'));
  const invalid = structuredClone(input); invalid.equipment[0].motorLockedRotorCurrentA = '90 amps';
  assert.ok(buildDesignSynthesisProjectEquipmentAdoption(invalid).issues.some(item => item.code === 'project_motor_value_invalid'));
  const unsupported = structuredClone(input); unsupported.equipment[0].motorStarterType = 'vfd';
  assert.ok(buildDesignSynthesisProjectEquipmentAdoption(unsupported).issues.some(item => item.code === 'project_motor_starter_unsupported'));
});

test('unconfirmed coordinate units are blocked during the review itself', () => {
  const input = fixture(); input.acknowledgements.coordinatesFeet = false;
  assert.ok(buildDesignSynthesisProjectEquipmentAdoption(input).issues.some(item => item.code === 'project_equipment_coordinate_units_unconfirmed'));
});

test('equipment-only load identity and later linked-record conflicts are not silently adopted', () => {
  const input = fixture();
  input.equipment[0].kw = 7.5;
  input.loads = [];
  const reviewed = buildDesignSynthesisProjectEquipmentAdoption(input);
  assert.equal(reviewed.ok, true);
  const added = { ...input, loads: [{ id: 'OTHER', equipmentId: 'EQ-1', tag: 'OTHER', kw: 7.5, voltage: 480, phases: 3 }] };
  assert.ok(validateDesignSynthesisProjectEquipmentAdoption({ ...added, adoption: reviewed.adoption, rows: reviewed.selectedRows }).issues.some(item => item.code === 'project_equipment_load_changed'));
  const collision = { ...input, loads: [{ id: 'ds-load-eq-1', equipmentId: 'OTHER', tag: 'OTHER', kw: 1 }] };
  assert.ok(buildDesignSynthesisProjectEquipmentAdoption(collision).issues.some(item => item.code === 'project_generated_load_identity_collision'));
  const conflicting = fixture();
  conflicting.equipment[0].kw = 8;
  assert.ok(buildDesignSynthesisProjectEquipmentAdoption(conflicting).issues.some(item => item.code === 'project_equipment_load_conflict'));
});

test('review requires named current project, scenario, exact fingerprint, and literal acknowledgements', () => {
  const input = fixture();
  const built = buildDesignSynthesisProjectEquipmentAdoption(input);
  assert.equal(validateDesignSynthesisProjectEquipmentAdoption({ ...input, adoption: built.adoption, rows: built.selectedRows }).ok, true);
  for (const key of ['projectId', 'scenario', 'projectFingerprint']) {
    const absent = { ...input, [key]: null, adoption: built.adoption, rows: built.selectedRows };
    assert.equal(validateDesignSynthesisProjectEquipmentAdoption(absent).ok, false, `${key} is required`);
  }
  const malformed = structuredClone(built.adoption);
  malformed.acknowledgements.coordinatesFeet = 'true';
  const invalid = { ...malformed }; delete invalid.bindingFingerprint;
  const rehashed = { ...invalid, bindingFingerprint: fingerprintStudyValue(invalid) };
  assert.equal(validateDesignSynthesisProjectEquipmentAdoption({ ...input, adoption: rehashed, rows: built.selectedRows }).ok, false);
});

test('adoption rejects ambiguous tags and conflicting motor records', () => {
  const duplicateTags = fixture();
  duplicateTags.equipment.push({ ...duplicateTags.equipment[0], id: 'EQ-2' });
  duplicateTags.loads.push({ ...duplicateTags.loads[0], id: 'LOAD-2', equipmentId: 'EQ-2' });
  duplicateTags.selectedEquipmentIds.push('EQ-2');
  assert.equal(buildDesignSynthesisProjectEquipmentAdoption(duplicateTags).ok, false);

  const motor = fixture();
  motor.equipment[0].motor = { hp: 10, flaA: 12.4 };
  motor.loads[0].motor = { hp: 10, flaA: 12.5 };
  assert.ok(buildDesignSynthesisProjectEquipmentAdoption(motor).issues.some(item => item.code === 'project_motor_record_conflict'));
});

test('equipment eligibility matches complete classification labels without rejecting combustion loads', () => {
  const blower = fixture();
  blower.equipment[0].type = 'load';
  blower.equipment[0].subCategory = 'Combustion blower';
  assert.equal(buildDesignSynthesisProjectEquipmentAdoption(blower).ok, true);
  for (const alias of ['utility_source', 'distributionpanel', 'panelboard', 'busbar', 'main-source']) {
    const excluded = fixture();
    excluded.equipment[0].subCategory = alias;
    assert.equal(buildDesignSynthesisProjectEquipmentAdoption(excluded).ok, false, alias);
  }
});

test('canonical motor indicators and malformed motor properties cannot downgrade to a nonmotor row', () => {
  for (const marker of [null, false, true, [], 'motor data']) {
    const input = fixture();
    input.equipment[0].motor = marker;
    assert.equal(buildDesignSynthesisProjectEquipmentAdoption(input).ok, false, `equipment.motor=${JSON.stringify(marker)}`);
    input.equipment[0].motor = undefined;
    input.loads[0].motor = marker;
    assert.equal(buildDesignSynthesisProjectEquipmentAdoption(input).ok, false, `load.motor=${JSON.stringify(marker)}`);
  }
  for (const [field, value] of [
    ['type', 'vfd'], ['subtype', 'soft_starter'], ['loadType', 'Motor'], ['mccUnitType', 'motor_starter'], ['starterType', 'dol'],
  ]) {
    const input = fixture();
    input.equipment[0][field] = value;
    assert.equal(buildDesignSynthesisProjectEquipmentAdoption(input).ok, false, `${field}=${value}`);
    assert.ok(buildDesignSynthesisProjectEquipmentAdoption(input).issues.some(item => item.code.startsWith('project_motor_')));
  }
  for (const classification of ['vfd', 'soft_starter']) {
    const input = fixture();
    input.equipment[0].type = classification;
    input.equipment[0].motor = { starterType: 'dol' };
    const result = buildDesignSynthesisProjectEquipmentAdoption(input);
    assert.equal(result.ok, false);
    assert.ok(result.issues.some(item => item.code === 'project_motor_starter_unsupported'));
  }
  const valid = fixture();
  valid.equipment[0].type = 'motor';
  valid.equipment[0].motor = { starterType: 'dol', nameplateHorsepower: 10 };
  const mapped = buildDesignSynthesisProjectEquipmentAdoption(valid);
  assert.equal(mapped.ok, true, JSON.stringify(mapped.issues));
  assert.deepEqual(mapped.selectedRows[0].motor, valid.equipment[0].motor);
});

test('motor data references on equipment or linked loads cannot silently become nonmotor designs', () => {
  for (const collection of ['equipment', 'loads']) {
    const input = fixture();
    input[collection][0].motorDataReference = 'Manufacturer motor nameplate';
    const result = buildDesignSynthesisProjectEquipmentAdoption(input);
    assert.equal(result.ok, false, `${collection} reference alone requires a motor record`);
    assert.ok(result.issues.some(item => item.code === 'project_motor_basis_incomplete'));
    input[collection][0].motorDataReference = '  ';
    assert.equal(buildDesignSynthesisProjectEquipmentAdoption(input).ok, true, 'blank references do not classify ordinary equipment');
  }
});

test('selective ownership restores originally absent values and keeps owner fields', () => {
  const initial = { id: 'EQ-1', tag: 'MOTOR-EQUIP', owner: 'Operations' };
  const applied = mergeAdoptedProjectRecord({ current: initial, generated: { panelId: 'P-1' }, collection: 'equipment' });
  assert.equal(applied.ok, true);
  assert.equal(applied.record.owner, 'Operations');
  assert.equal(applied.record.panelId, 'P-1');
  const updated = mergeAdoptedProjectRecord({
    current: { ...applied.record, owner: 'New owner edit' }, generated: {}, collection: 'equipment', priorAdoption: applied.adoption,
  });
  assert.equal(updated.ok, true);
  assert.equal(Object.hasOwn(updated.record, 'panelId'), false);
  assert.equal(updated.record.owner, 'New owner edit');
});

test('selective ownership detects manual edits to generated fields without overwriting them', () => {
  const applied = mergeAdoptedProjectRecord({ current: { id: 'LOAD-1', kw: 7.5 }, generated: { panelId: 'P-1' }, collection: 'loads' });
  const manuallyEdited = mergeAdoptedProjectRecord({ current: { ...applied.record, panelId: 'FIELD-PANEL' }, generated: {}, collection: 'loads', priorAdoption: applied.adoption });
  assert.equal(manuallyEdited.ok, false);
  assert.equal(manuallyEdited.issue.code, 'adopted_generated_field_modified');
});
