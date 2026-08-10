import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  DEFAULT_INRUSH_DURATION,
  buildCableCurve,
  buildMotorStartingCurve,
  buildTransformerDamageCurve,
  collectMotorOperatingData,
  computeTransformerInrush,
  inferVoltage,
  parseVoltageFieldValue,
  resolveMotorThermalLimit,
  resolveTransformerOperatingPoint
} from '../../analysis/tcc/equipmentOverlayModel.mjs';

const nearlyEqual = (actual, expected, tolerance = 1e-9) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`
  );
};

const transformer = {
  type: 'transformer',
  phases: 3,
  kva_hv: 1000,
  volts_hv: 12470,
  kva_lv: 1000,
  volts_lv: 480
};

const lvFullLoadAmps = 1000000 / (Math.sqrt(3) * 480);

console.log('TCC equipment overlay model');

{
  const operating = resolveTransformerOperatingPoint(transformer, 480, 3);
  assert.ok(operating);
  assert.equal(operating.side, 'LV');
  assert.equal(operating.volts, 480);
  assert.equal(operating.phases, 3);
  nearlyEqual(operating.fla, lvFullLoadAmps);

  const inrush = computeTransformerInrush(transformer, 480, 3);
  assert.ok(inrush);
  nearlyEqual(inrush.current, lvFullLoadAmps * 12);
  assert.equal(inrush.duration, DEFAULT_INRUSH_DURATION);
  assert.equal(inrush.multipleEstimated, true);
  assert.equal(inrush.durationEstimated, true);
  console.log('  ✓ selects the referenced transformer side and preserves default inrush semantics');
}

{
  const damage = buildTransformerDamageCurve(transformer, 480, 3);
  assert.ok(damage);
  assert.equal(damage.curve.length, 7);
  assert.deepEqual(damage.curve.map(point => point.time), [0.1, 0.5, 2, 10, 30, 300, 600]);
  nearlyEqual(damage.curve[0].current, lvFullLoadAmps * 40);
  nearlyEqual(damage.curve.at(-1).current, lvFullLoadAmps * 1.5);
  console.log('  ✓ preserves the transformer damage template and three-phase current basis');
}

{
  const cable = buildCableCurve({
    conductors: '3 x #2 AWG',
    parallel_count: 2,
    conductor_material: 'copper',
    insulation_rating: 90,
    ampacity: 230
  }, 3);
  assert.ok(cable);
  assert.equal(cable.curve.length, 13);
  assert.equal(cable.conductorsPerPhase, 1);
  assert.equal(cable.parallel, 2);
  assert.equal(cable.ampacity, 230);
  assert.equal(cable.materialEstimated, false);
  assert.equal(cable.insulationEstimated, false);

  const oneSecondPoint = cable.curve.find(point => point.time === 1);
  const independentlyCalculatedCurrent = 143 * (66360 * 0.000506707478 * 2);
  nearlyEqual(oneSecondPoint.current, independentlyCalculatedCurrent, 1e-8);
  cable.curve.forEach((point, index) => {
    if (!index) return;
    assert.ok(point.current < cable.curve[index - 1].current);
  });
  console.log('  ✓ preserves the cable I²t curve units and parallel-conductor scaling');
}

{
  const motor = {
    phases: 3,
    voltage: 480,
    hp: 100,
    power_factor: 0.85,
    efficiency: 90,
    locked_rotor_multiple: 6,
    starting_time_s: 5,
    stall_time_s: 10,
    service_factor: 1.15
  };
  const base = collectMotorOperatingData(motor, 480, 3);
  assert.ok(base);
  const expectedFla = (100 * 746) / (Math.sqrt(3) * 480 * 0.85 * 0.9);
  nearlyEqual(base.fla, expectedFla);
  nearlyEqual(base.lockedRotor, expectedFla * 6);
  assert.equal(base.startTime, 5);

  const startCurve = buildMotorStartingCurve({
    fla: base.fla,
    lockedRotor: base.lockedRotor,
    startTime: base.startTime
  });
  [1, 5, 5.005, 5.5055].forEach((expected, index) => {
    nearlyEqual(startCurve[index].time, expected, 1e-12);
  });
  assert.deepEqual(startCurve.map(point => point.current), [base.lockedRotor, base.lockedRotor, base.fla, base.fla]);

  const thermal = resolveMotorThermalLimit(motor, 480, 3, base);
  assert.ok(thermal);
  nearlyEqual(thermal.continuousCurrent, expectedFla * 1.15);
  assert.equal(thermal.stallTime, 10);
  thermal.curve.forEach((point, index) => {
    if (!index) return;
    assert.ok(point.time > thermal.curve[index - 1].time);
    assert.ok(point.current <= thermal.curve[index - 1].current);
  });
  console.log('  ✓ preserves motor FLA, starting, and thermal-limit calculations');
}

{
  assert.equal(parseVoltageFieldValue(13.8, 'baseKV'), 13800);
  assert.equal(parseVoltageFieldValue('13.8 kV', 'baseKV'), 13800);
  assert.equal(parseVoltageFieldValue('480 V', 'baseKV'), 480);
  assert.equal(inferVoltage({ props: { baseKV: '13.8 kV' } }), 13800);
  assert.equal(resolveTransformerOperatingPoint({}, 480, 3), null);
  assert.equal(buildCableCurve({ conductor_size: 'unknown' }), null);
  assert.equal(collectMotorOperatingData({ voltage: 480 }, 480, 3), null);
  console.log('  ✓ preserves unit parsing and withholds incomplete overlay results');
}

{
  const source = await readFile(new URL('../../analysis/tcc/equipmentOverlayModel.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\b(?:document|window|HTMLElement|HTMLCanvasElement|d3)\b/);
  console.log('  ✓ remains independent of browser and chart APIs');
}
