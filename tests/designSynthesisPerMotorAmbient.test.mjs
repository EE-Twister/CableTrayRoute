import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { evaluateMotorBranchBreakerCandidate } from '../analysis/designSynthesisMotorBranchBreakers.mjs';
import { validateDesignSynthesisMotorInputs } from '../analysis/designSynthesisMotors.mjs';
import { buildDesignSynthesisProjectEquipmentAdoption, validateDesignSynthesisProjectEquipmentAdoption } from '../analysis/designSynthesisProjectEquipment.mjs';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';
import { inferEquipmentMapping, mapRowsToEquipment } from '../analysis/equipmentWorkflow.mjs';

const motor = () => ({ ratedVoltageV: 460, fullLoadCurrentA: 52, fullLoadCurrentBasis: { reference: 'Synthetic design current' }, nameplateCurrentA: 48, nameplateHorsepower: 40, nameplateFrequencyHz: 60, lockedRotorCurrentA: 338, lockedRotorPowerFactor: 0.27, starterType: 'dol', rotorType: 'squirrel-cage' });
const load = () => ({ id: 'M', voltage: 480, phases: 3, frequencyHz: 60, kw: Math.sqrt(3) * 480 * 48 * 0.86 / 1000, powerFactor: 0.86, duty: 'continuous', ratingsBasis: 'electrical-input-kW', motor: motor() });
const supply = { voltage: 480, phases: 3, frequencyHz: 60, availableFaultCurrentKA: 20 };
const criteria = { code: 'NEC', motorStarter: { branchProtectionMethod: 'inverse-time-breaker', controlVoltageV: 24, controlCurrentType: 'DC', breakerAmbientTemperatureC: 50, breakerAmbientReference: 'Synthetic project enclosure' } };

test('equipment import recognizes and retains both enclosure-basis columns', () => {
  const headers = ['tag', 'Motor 70 A Breaker Enclosure Temperature (°C)', 'Motor Breaker Enclosure Temperature Reference'];
  const mapping = inferEquipmentMapping(headers);
  assert.equal(mapping[headers[1]], 'motorBreakerAmbientTemperatureC');
  assert.equal(mapping[headers[2]], 'motorBreakerAmbientReference');
  const [row] = mapRowsToEquipment([['M1', '70', 'Enclosure study']], headers, mapping);
  assert.equal(row.motorBreakerAmbientTemperatureC, '70');
  assert.equal(row.motorBreakerAmbientReference, 'Enclosure study');
});

test('each motor can inherit, override, or explicitly suppress the project enclosure basis', () => {
  for (const [overrides, basis, temperature, status, candidate] of [
    [{}, 'project', 50, 'unevaluated', true],
    [{ breakerAmbientTemperatureC: 70, breakerAmbientReference: 'Synthetic hot enclosure' }, 'motor', 70, 'fail', false],
    [{ breakerAmbientTemperatureC: null, breakerAmbientReference: null }, 'motor-unset', null, 'unevaluated', true],
  ]) {
    const row = load(); Object.assign(row.motor, overrides);
    const result = evaluateMotorBranchBreakerCandidate({ load: row, supply, criteria });
    const check = result.candidates[0].checks.find(item => item.id === 'breakerAmbientOperatingCurrent');
    assert.equal(check.evidence.basis, basis);
    assert.equal(check.evidence.enclosureTemperatureC, temperature);
    assert.equal(check.status, status);
    assert.equal(Boolean(result.candidate), candidate);
    assert.equal(result.protectionStatus, 'blocked');
  }
  for (const overrides of [{ breakerAmbientTemperatureC: 70 }, { breakerAmbientReference: 'No temperature' }, { breakerAmbientTemperatureC: null, breakerAmbientReference: 'Not a suppression' }, { breakerAmbientTemperatureC: 52, breakerAmbientReference: 'Between table rows' }]) {
    const row = load(); Object.assign(row.motor, overrides);
    assert.equal(evaluateMotorBranchBreakerCandidate({ load: row, supply, criteria }).candidate, null);
    assert.ok(validateDesignSynthesisMotorInputs({ equipment: [row], criteria }).inputIssues.some(item => ['INVALID_BREAKER_AMBIENT_TEMPERATURE', 'BREAKER_AMBIENT_REFERENCE_REQUIRED'].includes(item.code)));
  }
  const small = load(); small.motor.nameplateHorsepower = 10; small.motor.breakerAmbientTemperatureC = 50; small.motor.breakerAmbientReference = 'not transferable';
  assert.equal(validateDesignSynthesisMotorInputs({ equipment: [small], criteria }).inputIssues.some(item => item.code === 'UNSUPPORTED_MOTOR_BREAKER_AMBIENT_BASIS'), false);
  assert.equal(evaluateMotorBranchBreakerCandidate({ load: small, supply, criteria }).candidate, null);
  const manual = load(); manual.motor.breakerAmbientTemperatureC = 50; manual.motor.breakerAmbientReference = 'test';
  assert.ok(validateDesignSynthesisMotorInputs({ equipment: [manual], criteria: { motorStarter: { branchProtectionMethod: 'manual-controller' } } }).inputIssues.some(item => item.code === 'MISMATCHED_MOTOR_BREAKER_AMBIENT_METHOD'));
});

for (const count of [25, 50]) test(`${count} equipment loads preserve distinct enclosure bases through review and generation`, () => {
  const input = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-industrial.json', import.meta.url), 'utf8'));
  const templates = input.equipment;
  const equipment = Array.from({ length: count }, (_, index) => ({ ...templates[index % templates.length], id: `L-${index}`, tag: `L-${index}`, category: 'Load', kw: 2, powerFactor: 0.9, duty: 'continuous' }));
  for (let i = 0; i < 3; i += 1) Object.assign(equipment[i], { category: 'Motor', kw: load().kw, powerFactor: 0.86, ratingsBasis: 'electrical-input-kW', motorRatedVoltageV: 460, motorFullLoadCurrentA: 52, motorFullLoadCurrentReference: 'Synthetic design current', motorNameplateCurrentA: 48, motorNameplateHorsepower: 40, motorNameplateFrequencyHz: 60, motorLockedRotorCurrentA: 338, motorLockedRotorPowerFactor: 0.27, motorStarterType: 'dol', motorRotorType: 'squirrel-cage' });
  Object.assign(equipment[1], { motorBreakerAmbientTemperatureC: '70', motorBreakerAmbientReference: 'Synthetic hot enclosure' });
  equipment[2].motorBreakerAmbientTemperatureC = 'none';
  const context = { equipment, loads: [], selectedEquipmentIds: equipment.map(item => item.id), projectId: 'Named', scenario: 'base', projectFingerprint: 'fixture', acknowledgements: { electricalInputKW: true, voltageLineToLine: true, coordinatesFeet: true } };
  const adopted = buildDesignSynthesisProjectEquipmentAdoption(context);
  assert.equal(adopted.ok, true, JSON.stringify(adopted.issues));
  assert.equal(adopted.selectedRows[1].motor.breakerAmbientTemperatureC, 70);
  assert.equal(adopted.selectedRows[1].motor.breakerAmbientReference, 'Synthetic hot enclosure');
  assert.equal(adopted.selectedRows[2].motor.breakerAmbientTemperatureC, null);
  assert.equal(adopted.selectedRows[2].motor.breakerAmbientReference, null);
  input.equipment = adopted.selectedRows;
  input.supply.availableFaultCurrentKA = 20;
  input.supply.motorStartingImpedance = { rOhm: 0.006, xOhm: 0.015, reference: 'Synthetic source study' };
  input.criteria.motorStarting = { minimumVoltagePu: 0.7 };
  input.criteria.motorStarter = structuredClone(criteria.motorStarter);
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.loads.length, count);
  for (const [id, basis, status] of [['L-0', 'project', 'unevaluated'], ['L-1', 'motor', 'fail'], ['L-2', 'motor-unset', 'unevaluated']]) {
    const result = proposal.motorStarterCandidates.cases.find(item => item.motorId === id);
    const check = result.candidates[0].checks.find(item => item.id === 'breakerAmbientOperatingCurrent');
    assert.equal(check.evidence.basis, basis);
    assert.equal(check.status, status);
    assert.equal(Boolean(result.candidate), status !== 'fail');
  }
  assert.equal(proposal.cables.find(item => item.loadId === 'L-1').protectiveDevice, null);
  assert.equal(proposal.status, 'blocked');
  const changed = structuredClone(context); changed.equipment[1].motorBreakerAmbientTemperatureC = '65';
  assert.equal(validateDesignSynthesisProjectEquipmentAdoption({ ...changed, adoption: adopted.adoption, rows: adopted.selectedRows }).ok, false);
  const conflict = structuredClone(context); conflict.equipment[1].motor = { breakerAmbientTemperatureC: null, breakerAmbientReference: null };
  assert.ok(buildDesignSynthesisProjectEquipmentAdoption(conflict).issues.some(item => item.code === 'project_motor_record_conflict'));
  const contradictoryNone = structuredClone(context); contradictoryNone.equipment[2].motorBreakerAmbientReference = 'Conflicting reference';
  assert.ok(buildDesignSynthesisProjectEquipmentAdoption(contradictoryNone).issues.some(item => item.code === 'project_motor_record_conflict'));
});
