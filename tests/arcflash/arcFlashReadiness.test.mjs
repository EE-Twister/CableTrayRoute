import assert from 'node:assert/strict';
import {
  arcFlashReadinessLabel,
  arcFlashResultEntries,
  formatArcFlashClearingBasis,
  isArcFlashLabelEligible,
  summarizeArcFlashResults,
} from '../../studies/arcFlashReadiness.mjs';

const complete = {
  calculationStatus: 'calculated',
  incidentEnergy: 4.2,
  boundary: 900,
  clearingTime: 0.08,
  nominalVoltage: 480,
  workingDistance: 455,
  upstreamDevice: 'CB-1',
  requiredInputs: [],
  calculationInputs: {
    clearingTimeSource: 'protective-device-total-clearing-curve',
    withinModelRange: true,
  },
};

const incomplete = {
  ...complete,
  calculationStatus: 'incomplete',
  requiredInputs: ['Provide a calculation-ready protective-device record.'],
  calculationInputs: {
    clearingTimeSource: 'default-screening-assumption',
    withinModelRange: false,
  },
};

assert.equal(isArcFlashLabelEligible(complete), true);
assert.equal(isArcFlashLabelEligible(incomplete), false);
const unevaluated = { equipmentTag: 'BUS3', incidentEnergy: null, calculationStatus: 'unevaluated', requiredInputs: ['Available fault current'] };
assert.equal(isArcFlashLabelEligible(unevaluated), false);
assert.equal(arcFlashReadinessLabel(unevaluated), 'Inputs required');
assert.equal(arcFlashReadinessLabel(complete), 'Label eligible');
assert.equal(arcFlashReadinessLabel(incomplete), 'Outside model range');
assert.equal(formatArcFlashClearingBasis(complete), 'Reviewed total-clearing curve');
assert.equal(formatArcFlashClearingBasis(incomplete), '0.2 s screening assumption');

const results = { BUS1: complete, BUS2: incomplete, BUS3: unevaluated, _runMetadata: { runAt: '2026-08-24' } };
assert.equal(arcFlashResultEntries(results).length, 3);
assert.equal(arcFlashResultEntries(results, 'BUS1').length, 1);

const summary = summarizeArcFlashResults(results);
assert.deepEqual(
  {
    status: summary.status,
    total: summary.total,
    labelEligible: summary.labelEligible,
    incomplete: summary.incomplete,
    outsideModelRange: summary.outsideModelRange,
    invalid: summary.invalid,
    assumedClearingTime: summary.assumedClearingTime,
  },
  {
    status: 'review',
    total: 3,
    labelEligible: 1,
    incomplete: 2,
    outsideModelRange: 1,
    invalid: 0,
    assumedClearingTime: 1,
  },
);

// A boundary shorter than the working distance at > 1.2 cal/cm² (for example
// 42 in stored as 42 mm) is invalid: never label eligible, never "normal".
const inchBoundary = { ...complete, incidentEnergy: 3.8, boundary: 42, workingDistance: 457.2 };
assert.equal(isArcFlashLabelEligible(inchBoundary), false);
assert.equal(arcFlashReadinessLabel(inchBoundary), 'Invalid result');
assert.equal(isArcFlashLabelEligible({ ...inchBoundary, boundary: 1066.8 }), true);
const invalidSummary = summarizeArcFlashResults({ BUS1: complete, BUS4: inchBoundary });
assert.equal(invalidSummary.status, 'review');
assert.equal(invalidSummary.invalid, 1);
assert.equal(invalidSummary.labelEligible, 1);
assert.match(invalidSummary.title, /^1 location\(s\) need engineering follow-up$/);
assert.match(invalidSummary.summary, /check boundary units/);
assert.equal(summarizeArcFlashResults({ BUS1: complete }).invalid, 0);

console.log('arc flash readiness model tests passed');
