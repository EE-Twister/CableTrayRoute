import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareMotorDesignCurrentReference, validateMotorDesignCurrentReference } from '../analysis/motorDesignCurrentReference.mjs';
import { validateDesignSynthesisMotorInputs } from '../analysis/designSynthesisMotors.mjs';
import { buildDesignSynthesisProjectEquipmentAdoption } from '../analysis/designSynthesisProjectEquipment.mjs';

function equipment(id, hp = 10, nameplate = 16.8) {
  return { id, tag: id, category: 'Motor', voltage: 480, phases: 3, kw: 8, powerFactor: 0.8, duty: 'continuous', x: 0, y: 0, z: 0,
    motorRatedVoltageV: 460, motorNameplateHorsepower: hp, motorNameplateCurrentA: nameplate, motorNameplateFrequencyHz: 60,
    motorRotorType: 'squirrel-cage', motorStarterType: 'dol', motorLockedRotorCurrentA: 121, motorLockedRotorPowerFactor: 0.254 };
}

function adopt(rows) {
  return buildDesignSynthesisProjectEquipmentAdoption({ equipment: rows, loads: [], selectedEquipmentIds: rows.map(row => row.id), projectId: 'Project', scenario: 'base', projectFingerprint: 'fixture', acknowledgements: { electricalInputKW: true, voltageLineToLine: true, coordinatesFeet: true } });
}

for (const count of [25, 50]) test(`${count} motors preserve nameplate and independently checked historical screening currents through adoption`, () => {
  const rows = Array.from({ length: count }, (_, i) => i % 2 ? equipment(`M${i}`, 40, 48) : equipment(`M${i}`));
  const original = structuredClone(rows);
  const result = prepareMotorDesignCurrentReference(rows, rows.map(row => row.id));
  assert.equal(result.ok, true, result.issues.join('; '));
  assert.deepEqual(rows, original);
  assert.equal(result.rows[0].motorFullLoadCurrentA, 16.8); // 10 hp table 14 A, nameplate 16.8 A
  assert.equal(result.rows[1].motorFullLoadCurrentA, 52); // 40 hp table 52 A, nameplate 48 A
  const adoption = adopt(result.rows);
  assert.equal(adoption.ok, true, JSON.stringify(adoption.issues));
  assert.equal(adoption.selectedRows.length, count);
  assert.equal(adoption.selectedRows[0].motor.nameplateCurrentA, 16.8);
  assert.equal(adoption.selectedRows[1].motor.fullLoadCurrentA, 52);
  assert.match(adoption.selectedRows[1].motor.fullLoadCurrentBasis.reference, /nyecountynv.gov/);
});

test('changed inputs and edited values cannot silently retain a stale table basis', () => {
  const result = prepareMotorDesignCurrentReference([equipment('M')], ['M']);
  const motorRow = adopt(result.rows).selectedRows[0];
  assert.equal(validateMotorDesignCurrentReference(motorRow), null);
  for (const change of [row => { row.motor.nameplateCurrentA = 20; }, row => { row.motor.nameplateHorsepower = 40; }, row => { row.voltage = 208; }, row => { row.motor.fullLoadCurrentA = 14; }, row => { row.motor.rotorType = 'synchronous'; }]) {
    const changed = structuredClone(motorRow); change(changed);
    assert.match(validateMotorDesignCurrentReference(changed), /stale or invalid/);
    assert.ok(validateDesignSynthesisMotorInputs({ equipment: [changed] }).inputIssues.some(issue => issue.code === 'MOTOR_DESIGN_CURRENT_REFERENCE_STALE'));
  }
  const changed = { ...result.rows[0], motorNameplateCurrentA: 20 };
  assert.equal(adopt([changed]).ok, false);
  const refreshed = prepareMotorDesignCurrentReference([changed], ['M']);
  assert.equal(refreshed.rows[0].motorFullLoadCurrentA, 20);
  assert.equal(adopt(refreshed.rows).ok, true);
});

test('unsupported or conflicting selected rows reject the entire update', () => {
  const good = equipment('A');
  for (const overrides of [{ motorRotorType: '' }, { motorNameplateHorsepower: 15 }, { motorNameplateFrequencyHz: 50 }, { voltage: 208 }, { category: 'VFD' }, { motorFullLoadCurrentA: 12, motorFullLoadCurrentReference: 'Independent basis' }]) {
    const rows = [good, { ...equipment('B'), ...overrides }];
    const before = structuredClone(rows);
    const result = prepareMotorDesignCurrentReference(rows, ['A', 'B']);
    assert.equal(result.ok, false, JSON.stringify(overrides));
    assert.equal(result.rows, null);
    assert.deepEqual(rows, before);
  }
  assert.equal(prepareMotorDesignCurrentReference([good], ['A', 'missing']).ok, false);
});
