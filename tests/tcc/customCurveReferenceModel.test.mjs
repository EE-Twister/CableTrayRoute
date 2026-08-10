import assert from 'node:assert/strict';
import {
  computeCustomCurvePlotMetrics,
  customCurveDataToPixel,
  customCurvePixelToData,
  generateCustomCurveLogGrid,
  readCustomCurveAxes,
  readCustomCurveBounds
} from '../../analysis/tcc/customCurveReferenceModel.mjs';

console.log('TCC custom curve reference model');

{
  const axes = readCustomCurveAxes({
    currentMin: { value: '10' },
    currentMax: { value: '10000' },
    timeMin: { value: '0.01' },
    timeMax: { value: '100' }
  });
  const bounds = readCustomCurveBounds({
    left: { value: '20' }, right: { value: '30' }, top: { value: '10' }, bottom: { value: '40' }
  });
  const metrics = computeCustomCurvePlotMetrics({
    canvas: { width: 1000, height: 600 },
    axisValues: axes.values,
    axisValid: axes.valid,
    bounds
  });
  const source = { current: 1000, time: 1 };
  const pixel = customCurveDataToPixel(source, metrics);
  const roundTrip = customCurvePixelToData(pixel.x, pixel.y, metrics);
  assert.ok(Math.abs(roundTrip.current - source.current) < 1e-9);
  assert.ok(Math.abs(roundTrip.time - source.time) < 1e-9);
  console.log('  ✓ preserves logarithmic canvas/data round trips');
}

{
  assert.equal(readCustomCurveAxes({ currentMin: { value: '0' } }).valid, false);
  assert.deepEqual(generateCustomCurveLogGrid(10, 100).major, [10, 100]);
  assert.deepEqual(generateCustomCurveLogGrid(0, 100), { major: [], minor: [] });
  console.log('  ✓ rejects invalid axes and preserves decade grid generation');
}
