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
assert.equal(arcFlashReadinessLabel(complete), 'Label eligible');
assert.equal(arcFlashReadinessLabel(incomplete), 'Outside model range');
assert.equal(formatArcFlashClearingBasis(complete), 'Reviewed total-clearing curve');
assert.equal(formatArcFlashClearingBasis(incomplete), '0.2 s screening assumption');

const results = { BUS1: complete, BUS2: incomplete, _runMetadata: { runAt: '2026-08-24' } };
assert.equal(arcFlashResultEntries(results).length, 2);
assert.equal(arcFlashResultEntries(results, 'BUS1').length, 1);

const summary = summarizeArcFlashResults(results);
assert.deepEqual(
  {
    status: summary.status,
    total: summary.total,
    labelEligible: summary.labelEligible,
    incomplete: summary.incomplete,
    outsideModelRange: summary.outsideModelRange,
    assumedClearingTime: summary.assumedClearingTime,
  },
  {
    status: 'review',
    total: 2,
    labelEligible: 1,
    incomplete: 1,
    outsideModelRange: 1,
    assumedClearingTime: 1,
  },
);

console.log('arc flash readiness model tests passed');
