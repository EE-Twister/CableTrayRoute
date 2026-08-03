import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  PERFORMANCE_BUDGETS,
  PERFORMANCE_METRICS,
  evaluatePerformanceBudget,
  evaluatePerformanceReport,
} from '../src/performance/performanceContracts.js';

describe('performance contracts', () => {
  it('defines enforceable budgets for the four critical workflows', () => {
    assert.deepEqual(Object.keys(PERFORMANCE_BUDGETS).sort(), Object.values(PERFORMANCE_METRICS).sort());
    assert.equal(PERFORMANCE_BUDGETS[PERFORMANCE_METRICS.startup].maxMs, 1500);
    Object.values(PERFORMANCE_BUDGETS).forEach(contract => {
      assert.ok(Number.isFinite(contract.maxMs));
      assert.ok(contract.maxMs > 0);
      assert.ok(contract.description.length > 20);
    });
  });

  it('fails durations over budget and unknown metrics', () => {
    const name = PERFORMANCE_METRICS.oneLineRender;
    assert.equal(evaluatePerformanceBudget(name, PERFORMANCE_BUDGETS[name].maxMs).passed, true);
    assert.equal(evaluatePerformanceBudget(name, PERFORMANCE_BUDGETS[name].maxMs + 0.1).passed, false);
    assert.equal(evaluatePerformanceBudget('ctr.unknown', 1).passed, false);
  });

  it('requires every contracted measurement and evaluates the slowest sample', () => {
    const measurements = Object.values(PERFORMANCE_METRICS).map(name => ({ name, durationMs: 1 }));
    measurements.push({ name: PERFORMANCE_METRICS.startup, durationMs: 25 });
    const report = evaluatePerformanceReport(measurements);
    assert.equal(report.length, 4);
    assert.equal(report.find(result => result.name === PERFORMANCE_METRICS.startup).durationMs, 25);

    const missing = evaluatePerformanceReport([]);
    assert.ok(missing.every(result => !result.passed));
    assert.ok(missing.every(result => result.reason.includes('was not recorded')));
  });
});
