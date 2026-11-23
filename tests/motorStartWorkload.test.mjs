import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { runMotorStart, MOTOR_START_LIMITS } from '../analysis/motorStartCalc.mjs';

const motor = { id: 'M', type: 'motor', hp: 100, voltage: 480, inertia: 5, thevenin_r: 0.01, thevenin_x: 0.03 };
const run = components => runMotorStart({ oneLine: { sheets: [{ components }] } });
const limit = components => assert.throws(() => run(components), { code: 'MOTOR_START_WORK_LIMIT' });
const expected = { inrushKA: 0.66, voltageSagPct: 4.19, accelTime: 11.17, starterType: 'dol' };
assert.deepEqual(run([motor]), { M: expected });
for (const curve of ['0:20 25:30 50:40 100:70', '0:10 0:20 50:35 50:40 100:60', '10:20 20:40']) {
  const expectedCurve = { ...expected, accelTime: 60.01 };
  assert.deepEqual(run([{ ...motor, load_torque_curve: curve }]), { M: expectedCurve });
  assert.deepEqual(run([{ ...motor, props: { load_torque: curve.split(' ') } }]), { M: expectedCurve });
}
// Reported trigger: zero inertia and a long curve whose first point is above
// zero, forcing every old linear search to traverse the complete curve.
const hugeCurve = Array.from({ length: 100000 }, () => '1:1').join(',');
for (const nested of [false, true]) {
  for (const alias of ['load_torque_curve', 'load_torque']) {
    for (const curve of [hugeCurve, hugeCurve.split(',')]) {
      const component = { ...motor, inertia: 0 };
      if (nested) component.props = { [alias]: curve };
      else component[alias] = curve;
      limit([component]);
    }
  }
}
limit(Array.from({ length: MOTOR_START_LIMITS.motors + 1 }, (_, index) => ({ ...motor, id: String(index) })));
const maximumCurve = Array.from({ length: MOTOR_START_LIMITS.curvePoints }, (_, index) => `${index + 1}:1`).join(',');
limit(Array.from({ length: 17 }, (_, index) => ({ ...motor, id: String(index), load_torque_curve: maximumCurve })));
limit([{ ...motor, load_torque_curve: '0:0', props: { load_torque: hugeCurve } }]);
assert.throws(() => run([{ ...motor, load_torque: ['not-a-point'] }]), { code: 'MOTOR_START_CURVE_INVALID' });
const started = performance.now();
const bounded = run([{ ...motor, inertia: 0, load_torque_curve: maximumCurve }]);
assert.equal(bounded.M.accelTime, 60.01);
assert.ok(performance.now() - started < 2000, 'bounded worst-case curve must finish promptly');
assert.equal(run([{ id: 'legacy', type: 'motor', hp: 100 }]).legacy.accelTime, 60.01, 'legacy defaults remain supported');
console.log('✓ actual motor study rejects oversized aliases, preserves baseline results and bounds stalled acceleration');
