import assert from 'node:assert/strict';
import {
  buildCustomCurveSubmission,
  getCustomCurvePromotionError
} from '../../analysis/tcc/customCurveEvidenceModel.mjs';

console.log('TCC custom curve evidence model');

const base = {
  name: 'Example breaker',
  manufacturer: 'Example',
  deviceType: 'breaker',
  profiles: [{ id: 'curve-1', name: 'Curve 1', curve: [{ current: 10, time: 1 }, { current: 100, time: 0.1 }] }],
  axes: { currentMin: 10, currentMax: 100, timeMin: 0.1, timeMax: 1 },
  bounds: { left: 0, right: 0, top: 0, bottom: 0 },
  settings: {},
  calculationReady: false
};

{
  const { payload, assessment } = buildCustomCurveSubmission(base);
  assert.equal(payload.curve.length, 2);
  assert.equal(payload.libraryStatus, undefined);
  assert.ok(assessment);
  assert.equal(getCustomCurvePromotionError(false, assessment), '');
  console.log('  ✓ preserves screening payload construction without promotion');
}

{
  const result = buildCustomCurveSubmission({ ...base, calculationReady: true });
  const error = getCustomCurvePromotionError(true, result.assessment);
  assert.match(error, /^Calculation-ready promotion needs /);
  assert.match(error, /Save as screening only/);
  console.log('  ✓ blocks calculation-ready promotion when source evidence is incomplete');
}
