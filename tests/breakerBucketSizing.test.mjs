import assert from 'node:assert/strict';
import {
  CONSERVATIVE_FEEDER_BREAKER_BUCKET_ROWS,
  approximateFeederBreakerBucketSize,
  parseBreakerAmpFrame
} from '../src/mcc-lineup/breakerBucketSizing.mjs';

assert.equal(CONSERVATIVE_FEEDER_BREAKER_BUCKET_ROWS.length, 6);
assert.deepEqual(parseBreakerAmpFrame({ breakerA: '100AT/250AF' }), {
  frameA: 250,
  tripA: 100,
  source: 'af-label'
});
assert.deepEqual(parseBreakerAmpFrame({ breakerA: '100/250' }), {
  frameA: 250,
  tripA: 100,
  source: 'rating-pair'
});
assert.deepEqual(parseBreakerAmpFrame({ breakerFrameA: '400', breakerA: '300' }), {
  frameA: 400,
  tripA: 300,
  source: 'frame-field'
});
assert.equal(parseBreakerAmpFrame({ breakerA: '250' }).reason, 'missing-explicit-frame', 'a lone rating must not be treated as amp frame');
assert.equal(parseBreakerAmpFrame({ breakerA: '400AT/250AF' }).reason, 'trip-above-frame');

const sizingCases = [
  [125, 12, 2],
  [126, 18, 3],
  [250, 18, 3],
  [251, 30, 5],
  [400, 30, 5],
  [401, 42, 7],
  [600, 42, 7],
  [601, 66, 11],
  [800, 66, 11],
  [801, 72, 12],
  [2500, 72, 12]
];
sizingCases.forEach(([frameA, heightIn, sizeUnits]) => {
  const estimate = approximateFeederBreakerBucketSize({
    breakerFrameA: frameA,
    unitHeightIn: 6,
    usableBucketHeightIn: 72
  });
  assert.equal(estimate.heightIn, heightIn, `${frameA} AF should use the conservative planning height`);
  assert.equal(estimate.sizeUnits, sizeUnits, `${frameA} AF should convert inches to MCC units`);
});

assert.equal(approximateFeederBreakerBucketSize({ breakerFrameA: 2501 }).reason, 'custom-size-required');
assert.equal(approximateFeederBreakerBucketSize({ breakerFrameA: 800, usableBucketHeightIn: 60 }).reason, 'lineup-too-short');
assert.equal(approximateFeederBreakerBucketSize({ breakerFrameA: 250, unitHeightIn: 0 }).reason, 'invalid-unit-height');
assert.match(approximateFeederBreakerBucketSize({ breakerFrameA: 400 }).basis, /400 AF/);

console.log('MCC feeder-breaker bucket sizing screening tests passed');
