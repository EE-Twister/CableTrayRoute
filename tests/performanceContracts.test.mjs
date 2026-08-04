import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  PERFORMANCE_BUDGETS,
  PERFORMANCE_METRICS,
  PERFORMANCE_PROFILE_BUDGETS,
  evaluatePerformanceBudget,
  evaluatePerformanceProfiles,
  evaluatePerformanceReport,
} from '../src/performance/performanceContracts.js';

describe('performance contracts', () => {
  it('defines enforceable budgets for the critical workflows', () => {
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
    assert.equal(report.length, 5);
    assert.equal(report.find(result => result.name === PERFORMANCE_METRICS.startup).durationMs, 25);

    const missing = evaluatePerformanceReport([]);
    assert.ok(missing.every(result => !result.passed));
    assert.ok(missing.every(result => result.reason.includes('was not recorded')));
  });

  it('enforces responsiveness and retained-growth profiles', () => {
    assert.equal(PERFORMANCE_PROFILE_BUDGETS['startup:oneline'].maxStorageReads, 80);
    assert.equal(PERFORMANCE_BUDGETS[PERFORMANCE_METRICS.routingRecalculation].maxMs, 1000);
    assert.equal(PERFORMANCE_PROFILE_BUDGETS['routing-recalculation'].maxLongTaskMs, 80);
    assert.equal(PERFORMANCE_PROFILE_BUDGETS['routing-recalculation-steady-state'].maxDurationMs, 1500);
    assert.equal(PERFORMANCE_PROFILE_BUDGETS['routing-recalculation'].maxHeapGrowthBytes, 4 * 1024 * 1024);
    assert.equal(PERFORMANCE_PROFILE_BUDGETS['routing-recalculation-steady-state'].maxHeapGrowthBytes, 1024 * 1024);
    const profiles = Object.keys(PERFORMANCE_PROFILE_BUDGETS).map(name => ({
      name,
      durationMs: 10,
      elementDelta: 0,
      heapGrowthBytes: 0,
      longTasks: [],
      storageReads: { total: 1 },
    }));
    assert.ok(evaluatePerformanceProfiles(profiles).every(result => result.passed));

    profiles[0].heapGrowthBytes = PERFORMANCE_PROFILE_BUDGETS[profiles[0].name].maxHeapGrowthBytes + 1;
    const failed = evaluatePerformanceProfiles(profiles)[0];
    assert.equal(failed.passed, false);
    assert.ok(failed.failures.some(reason => reason.includes('heap growth')));
    assert.equal(evaluatePerformanceProfiles([]).length, 6);
    assert.ok(evaluatePerformanceProfiles([]).every(result => !result.passed));
  });

  it('bounds retained browser measurements', async () => {
    globalThis.window = { dispatchEvent() {} };
    const metrics = await import(`../src/performance/performanceMetrics.js?bounded=${Date.now()}`);
    for (let index = 0; index < 205; index += 1) {
      metrics.recordPerformanceMeasurement('ctr.test', index);
    }
    const retained = metrics.getPerformanceMeasurements('ctr.test');
    assert.equal(retained.length, 200);
    assert.equal(retained[0].durationMs, 5);
    delete globalThis.window;
  });
});
