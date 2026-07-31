import assert from 'assert';
import { exportSwitchingProcedureCsv, extractSwitchingDevices, normalizeSwitchingProcedure, SWITCHING_STEP_TYPES, validateSwitchingProcedure } from '../analysis/switchingProcedures.mjs';

const devices = extractSwitchingDevices({ sheets: [{ name: 'Service', components: [
  { id: 'CB-1', label: 'Main Breaker', subtype: 'breaker' },
  { id: 'BUS-1', label: 'Main Bus', subtype: 'bus' },
  { id: 'DS-1', label: 'Tie Disconnect', subtype: 'disconnect_switch' },
] }] });
assert.deepStrictEqual(devices.map(device => device.id), ['CB-1', 'DS-1']);

const safeProcedure = normalizeSwitchingProcedure({
  id: 'SW-1', title: 'Isolate feeder', status: 'reviewed', reviewedBy: 'Engineer A',
  steps: [
    { type: SWITCHING_STEP_TYPES.operate, deviceId: 'CB-1', deviceLabel: 'Main Breaker', action: 'open' },
    { type: SWITCHING_STEP_TYPES.verify },
    { type: SWITCHING_STEP_TYPES.ground },
  ]
});
const safeValidation = validateSwitchingProcedure(safeProcedure);
assert.strictEqual(safeValidation.ready, true);
assert.strictEqual(safeValidation.issues.length, 0);
assert.match(exportSwitchingProcedureCsv(safeProcedure), /SW-1,Isolate feeder,reviewed,1,operate,CB-1,Main Breaker,open/);

const unsafeValidation = validateSwitchingProcedure({
  title: 'Unsafe', steps: [
    { type: SWITCHING_STEP_TYPES.ground },
    { type: SWITCHING_STEP_TYPES.operate, deviceId: 'CB-1', action: 'close' },
  ]
});
assert.strictEqual(unsafeValidation.ready, false);
assert.ok(unsafeValidation.issues.some(issue => issue.code === 'verify-before-ground'));
assert.ok(unsafeValidation.issues.some(issue => issue.code === 'remove-ground-before-close'));

console.log('switching procedure tests passed');
