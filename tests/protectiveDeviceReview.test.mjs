import assert from 'node:assert/strict';

import {
  mergeProtectiveDeviceReview,
  normalizeReviewCurve
} from '../analysis/protectiveDeviceReview.mjs';

const device = {
  id: 'review_fixture',
  type: 'breaker',
  vendor: 'Example',
  name: 'Example breaker',
  curve: [
    { current: 100, time: 10 },
    { current: 1000, time: 1 }
  ],
  curveEvidence: {
    document: 'Manufacturer TCC',
    revision: '2025-01',
    curveNumber: 'TCC-1',
    extractionMethod: 'manufacturer spreadsheet'
  },
  libraryStatus: 'screening',
  researchStatus: 'candidate'
};

assert.deepEqual(
  normalizeReviewCurve([
    { current: '1000', time: '1' },
    { current: 0, time: 10 },
    { current: 100, time: 10 }
  ]),
  [
    { current: 100, time: 10 },
    { current: 1000, time: 1 }
  ]
);

const review = {
  deviceId: device.id,
  libraryCurve: [
    { current: 100, time: 10 },
    { current: 1000, time: 1 },
    { current: 10000, time: 0.1 }
  ],
  sourceCurve: [
    { current: 100, time: 10.2 },
    { current: 1000, time: 1.02 },
    { current: 10000, time: 0.1 }
  ],
  curveEvidence: {
    reviewer: 'Independent engineer',
    sourceId: 'manufacturer-tcc'
  },
  curveValidation: {
    spotChecks: [
      { current: 100, expectedTime: 10.2, actualTime: 10, relativeError: 0.02, sourceId: 'manufacturer-tcc' },
      { current: 1000, expectedTime: 1.02, actualTime: 1, relativeError: 0.0196, sourceId: 'manufacturer-tcc' },
      { current: 10000, expectedTime: 0.1, actualTime: 0.1, relativeError: 0, sourceId: 'manufacturer-tcc' }
    ],
    notes: 'Three source spot checks completed.'
  },
  review: {
    reviewer: 'Independent engineer',
    reviewedOn: '2026-08-01',
    notes: 'Configuration and curve applicability reviewed.'
  },
  lastVerified: '2026-08-01',
  libraryStatus: 'calculation_ready',
  researchStatus: 'reviewed'
};

const merged = mergeProtectiveDeviceReview(device, review);
assert.notEqual(merged, device);
assert.deepEqual(merged.curve, review.libraryCurve);
assert.equal(merged.curveEvidence.reviewer, 'Independent engineer');
assert.equal(merged.curveValidation.spotChecks.length, 3);
assert.deepEqual(merged.review, review.review);
assert.equal(merged.libraryStatus, 'calculation_ready');
assert.equal(merged.researchStatus, 'reviewed');
assert.equal(device.libraryStatus, 'screening');
assert.equal(device.curve.length, 2);

const unchanged = mergeProtectiveDeviceReview(device, null);
assert.equal(unchanged, device);

console.log('Protective device review tests passed.');
