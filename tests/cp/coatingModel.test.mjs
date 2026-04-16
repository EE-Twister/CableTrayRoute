import assert from 'node:assert/strict';
import { COATING_MODEL_TYPES, parseConditionFactorValues, resolveCoatingModel } from '../../src/studies/cp/coatingModel.js';

(function testParseConditionFactorValues() {
  assert.deepEqual(parseConditionFactorValues('0.1, 0.3, bad, -1'), [0.1, 0.3, -1]);
  assert.deepEqual(parseConditionFactorValues(null), []);
})();

(function testFixedFactorModel() {
  const result = resolveCoatingModel({
    coatingModelType: COATING_MODEL_TYPES.fixed,
    coatingBreakdownFactor: 0.2
  }, { segmentCount: 3 });

  assert.equal(result.effectiveFactor, 0.2);
  assert.equal(result.worstCaseFactor, 0.24);
  assert.deepEqual(result.segmentFactors, [0.2, 0.2, 0.2]);
})();

(function testDegradationCurveModel() {
  const result = resolveCoatingModel({
    coatingModelType: COATING_MODEL_TYPES.degradationCurve,
    coatingInitialBreakdownFactor: 0.1,
    coatingEndOfLifeBreakdownFactor: 0.4,
    coatingDegradationExponent: 2
  }, { segmentCount: 2 });

  assert.equal(result.effectiveFactor, 0.2);
  assert.equal(result.curvePoints.length, 5);
  assert.equal(result.worstCaseFactor, 0.4);
})();

(function testSegmentConditionModel() {
  const result = resolveCoatingModel({
    coatingModelType: COATING_MODEL_TYPES.segmentCondition,
    coatingBreakdownFactor: 0.2,
    segmentConditionFactors: [0.1, 0.2, 0.4]
  }, { segmentCount: 5 });

  assert.deepEqual(result.segmentFactors, [0.1, 0.2, 0.4, 0.2, 0.2]);
  assert.ok(Math.abs(result.effectiveFactor - 0.22) <= 1e-12);
  assert.equal(result.worstCaseFactor, 0.4);
})();

console.log('✓ cp coating model tests passed');
