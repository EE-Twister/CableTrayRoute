import assert from 'node:assert/strict';
import {
  buildMotorStartProjectInputs,
  summarizeMotorStartDemand,
} from '../analysis/motorStartProjectInputs.mjs';

const projectInputs = buildMotorStartProjectInputs({
  oneLine: {
    sheets: [{
      components: [{
        id: 'MTR-101',
        type: 'motor',
        tag: 'MTR-101',
        voltage: 480,
        props: { thevenin_r: 0.01, thevenin_x: 0.04 },
      }],
    }],
  },
  equipment: [
    { id: 'eq-1', tag: 'MTR-101', category: 'Motor', hp: 100, efficiency: 0.93 },
    { id: 'eq-2', tag: 'P-202', category: 'Motor pump', hp: 50, voltage: 480 },
  ],
  loads: [
    { id: 'load-1', equipmentId: 'eq-1', tag: 'MTR-101', loadType: 'Motor', hp: 100, pf: 0.86 },
    { id: 'load-2', equipmentId: 'eq-2', tag: 'P-202', loadType: 'Motor', hp: 50, pf: 0.84, voltage: '' },
    { id: 'load-3', tag: 'FAN-303', description: 'Exhaust fan motor', hp: 25, voltage: 480 },
  ],
  studies: { loadFlow: { converged: true } },
});

assert.equal(projectInputs.motors.length, 3, 'linked schedule records should merge instead of duplicating motors');
const linked = projectInputs.motors.find(motor => motor.tag === 'MTR-101');
assert.equal(linked.hp, 100, 'equipment horsepower should fill the One-Line record');
assert.equal(linked.pf, 0.86, 'load power factor should fill the One-Line record');
assert.equal(linked.voltage, 480, 'One-Line voltage should be retained');
assert.deepEqual(
  linked.projectSources.map(source => source.label),
  ['Equipment List', 'Load List', 'One-Line'],
  'source provenance should identify every merged project record'
);
assert.ok(projectInputs.motors.some(motor => motor.tag === 'P-202'), 'equipment motors not placed on the One-Line should remain available');
assert.equal(projectInputs.motors.find(motor => motor.tag === 'P-202').voltage, 480, 'blank load fields must not erase populated equipment values');
assert.ok(projectInputs.motors.some(motor => motor.tag === 'FAN-303'), 'load-only motors should remain available');
assert.equal(projectInputs.sourceCounts.loadFlow, 1, 'available Load Flow context should be disclosed');
assert.equal(projectInputs.missing.length, 0);

const empty = buildMotorStartProjectInputs();
assert.deepEqual(empty.motors, []);
assert.equal(empty.missing.length, 1);

const demand = summarizeMotorStartDemand([
  { id: 'M1', label: 'Motor 1', volts: 480, powerFactor: 0.85, hp: 100, efficiency: 0.92 },
  { id: 'M2', label: 'Motor 2', volts: 480, powerFactor: 0.90, hp: 50, efficiency: 0.91 },
], [
  { id: 'M1', label: 'Motor 1', inrushKA: 0.75 },
  { id: 'M2', label: 'Motor 2', inrushKA: 0.40 },
]);

assert.equal(demand.controllingMotor.id, 'M1');
assert.equal(demand.startingKva, 623.54);
assert.equal(demand.startingKw, 530.01);
assert.equal(demand.peakLoadKw, demand.startingKw);
assert.equal(demand.motorDemandSummaries.length, 2);

console.log('motor start project input tests passed');
