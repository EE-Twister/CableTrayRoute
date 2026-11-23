import assert from 'node:assert/strict';
import { evaluateSourceBoundCurve } from '../analysis/sourceBoundCurveEvaluator.mjs';

const axes = {
  xAxis: { log10ValuePerPoint: 1, log10ValueIntercept: 0 },
  yAxis: { log10ValuePerPoint: 1, log10ValueIntercept: 0 },
  chartBounds: { xMinPt: 0, xMaxPt: 3, yMinPt: 0, yMaxPt: 3 },
};
const run = (componentId, points, strokeWidthPt = 0) => ({ componentId, points, strokeWidthPt });
const evaluate = (runs, overrides = {}) => evaluateSourceBoundCurve({
  ...axes,
  runs,
  currentA: 10 ** 1.5,
  voltage: 480,
  supportedVoltages: [480],
  ...overrides,
});

function it(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); }
  catch (error) { console.error(`  ✗ ${name}`, error); process.exitCode = 1; }
}

console.log('Source-bound conservative curve evaluation');

it('maps calibrated straight segments in log coordinates and retains provenance', () => {
  const result = evaluate([run('thermal-upper', [{ xPt: 1, yPt: 2 }, { xPt: 2, yPt: 1 }])]);
  assert.equal(result.status, 'evaluated-graphical-conservative-envelope');
  assert.match(result.resultBasis, /not manufacturer-approved/);
  assert.ok(Math.abs(result.timeSeconds - 10 ** 1.5) < 1e-10);
  assert.equal(result.limitingComponentId, 'thermal-upper');
});

it('takes the conservative longest time across vertical and nonmonotonic intersections', () => {
  const result = evaluate([run('folded', [
    { xPt: 1, yPt: 1 }, { xPt: 1.5, yPt: 2 }, { xPt: 1.5, yPt: 0.5 }, { xPt: 2, yPt: 1 },
  ])]);
  assert.equal(result.status, 'evaluated-graphical-conservative-envelope');
  assert.equal(result.timeSeconds, 100);
});

it('accepts exact source endpoints without extrapolation', () => {
  const result = evaluate([run('endpoints', [{ xPt: 1, yPt: 2 }, { xPt: 2, yPt: 1 }])], { currentA: 100 });
  assert.equal(result.timeSeconds, 10);
});

it('fails closed when x uncertainty reaches outside the chart boundary', () => {
  const result = evaluate([run('edge', [{ xPt: 0.01, yPt: 2 }, { xPt: 0.2, yPt: 1 }])], {
    currentA: 1,
    uncertainty: { gridXPt: 0.02 },
  });
  assert.equal(result.status, 'outside-chart-boundary');
  assert.equal(result.timeSeconds, null);
});

it('fails closed when time-coordinate uncertainty reaches beyond the chart bottom', () => {
  const result = evaluate([run('bottom', [{ xPt: 1, yPt: 2.95 }, { xPt: 2, yPt: 2.95 }])], {
    uncertainty: { gridYPt: 0.1 },
  });
  assert.equal(result.status, 'outside-chart-boundary');
  assert.equal(result.timeSeconds, null);
});

it('fails closed across disconnected domain gaps', () => {
  const result = evaluate([
    run('left', [{ xPt: 1, yPt: 2 }, { xPt: 1.4, yPt: 1.6 }]),
    run('right', [{ xPt: 1.6, yPt: 1.4 }, { xPt: 2, yPt: 1 }]),
  ]);
  assert.equal(result.status, 'outside-or-gap');
  assert.equal(result.timeSeconds, null);
});

it('requires the complete x uncertainty band to be covered by the domain union', () => {
  const result = evaluate([run('short-domain', [{ xPt: 1.49, yPt: 2 }, { xPt: 1.51, yPt: 1 }])], {
    uncertainty: { gridXPt: 0.02 },
  });
  assert.equal(result.status, 'outside-or-gap');
});

it('moves the upper time bound conservatively for coordinate and stroke uncertainty', () => {
  const exact = evaluate([run('line', [{ xPt: 1, yPt: 2 }, { xPt: 2, yPt: 1 }])]);
  const uncertain = evaluate([run('line', [{ xPt: 1, yPt: 2 }, { xPt: 2, yPt: 1 }], 0.02)], {
    uncertainty: { flattenPt: 0.01, gridXPt: 0.01, gridYPt: 0.02 },
  });
  assert.ok(uncertain.timeSeconds > exact.timeSeconds);
});

it('selects the longest time from multiple eligible components', () => {
  const result = evaluate([
    run('fast', [{ xPt: 1, yPt: 1 }, { xPt: 2, yPt: 1 }]),
    run('slow', [{ xPt: 1, yPt: 2 }, { xPt: 2, yPt: 2 }]),
  ]);
  assert.equal(result.timeSeconds, 100);
  assert.equal(result.limitingComponentId, 'slow');
});

it('requires an explicit supported voltage and rejects malformed evidence', () => {
  assert.equal(evaluate([run('curve', [{ xPt: 1, yPt: 2 }, { xPt: 2, yPt: 1 }])], { voltage: 208 }).status, 'unsupported-voltage');
  assert.throws(() => evaluate([run('bad', [{ xPt: 1, yPt: 1 }])]), /at least two/);
  assert.throws(() => evaluate([run('bad', [{ xPt: 1, yPt: 1 }, { xPt: 2, yPt: 2 }])], {
    uncertainty: { gridXPt: -1 },
  }), /nonnegative/);
});

it('applies nontrivial axis calibration rather than assuming unit log scales', () => {
  const result = evaluate([run('calibrated', [{ xPt: 0, yPt: 10 }, { xPt: 10, yPt: 0 }])], {
    currentA: 100,
    xAxis: { log10ValuePerPoint: 0.2, log10ValueIntercept: 1 },
    yAxis: { log10ValuePerPoint: -0.2, log10ValueIntercept: 2 },
    chartBounds: { xMinPt: 0, xMaxPt: 10, yMinPt: 0, yMaxPt: 10 },
  });
  assert.equal(result.status, 'evaluated-graphical-conservative-envelope');
  assert.ok(Math.abs(result.timeSeconds - 10) < 1e-10);
});

it('does not claim a bound at a time-axis clipping boundary', () => {
  const result = evaluate([run('edge-time', [{ xPt: 1, yPt: 0 }, { xPt: 2, yPt: 0 }])], {
    yAxis: { log10ValuePerPoint: -1, log10ValueIntercept: 3 },
  });
  assert.equal(result.status, 'outside-chart-boundary');
  assert.equal(result.timeSeconds, null);
});

it('uses the upper time edge for a descending time axis, including a vertical segment', () => {
  const result = evaluate([run('folded-negative', [
    { xPt: 1, yPt: 2 }, { xPt: 1.5, yPt: 1 }, { xPt: 1.5, yPt: 2.5 }, { xPt: 2, yPt: 2 },
  ], 0.02)], { yAxis: { log10ValuePerPoint: -1, log10ValueIntercept: 3 }, uncertainty: { gridYPt: 0.02 } });
  // At x=1.5 the highest time corresponds to y=1; stroke and grid extend it to 0.97.
  assert.equal(result.status, 'evaluated-graphical-conservative-envelope');
  assert.ok(Math.abs(result.timeSeconds - 10 ** 2.03) < 1e-9);
  assert.equal(result.limitingSegmentIndex, 0);
});

it('blocks a source gap inside the stroke uncertainty even if the queried center is covered', () => {
  const result = evaluate([
    run('left', [{ xPt: 1, yPt: 2 }, { xPt: 1.52, yPt: 1 }], 0.1),
    run('right', [{ xPt: 1.54, yPt: 1 }, { xPt: 2, yPt: 1 }], 0.1),
  ]);
  assert.equal(result.status, 'outside-or-gap');
  assert.equal(result.timeSeconds, null);
});

it('blocks a descending-time boundary whose uncertainty extends above the plot', () => {
  const result = evaluate([run('near-top', [{ xPt: 1, yPt: 0.02 }, { xPt: 2, yPt: 0.02 }], 0.1)], {
    yAxis: { log10ValuePerPoint: -1, log10ValueIntercept: 3 },
  });
  assert.equal(result.status, 'outside-chart-boundary');
  assert.equal(result.timeSeconds, null);
});

it('rejects zero-width queries outside all run domains and nonfinite transforms', () => {
  assert.equal(evaluate([run('short', [{ xPt: 1, yPt: 1 }, { xPt: 1.1, yPt: 1 }])]).status, 'outside-or-gap');
  const transformed = evaluate([run('overflow', [{ xPt: 1, yPt: 1 }, { xPt: 2, yPt: 1 }])], {
    yAxis: { log10ValuePerPoint: 1000, log10ValueIntercept: 1000 },
  });
  assert.equal(transformed.status, 'invalid-axis-transform');
  assert.equal(transformed.timeSeconds, null);
});
