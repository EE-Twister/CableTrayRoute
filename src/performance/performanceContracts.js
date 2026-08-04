export const PERFORMANCE_METRICS = Object.freeze({
  startup: 'ctr.startup',
  projectImport: 'ctr.project-import',
  oneLineRender: 'ctr.oneline-render',
  studyRun: 'ctr.tcc-plot',
  routingRecalculation: 'ctr.routing-recalculation',
});

export const PERFORMANCE_BUDGETS = Object.freeze({
  [PERFORMANCE_METRICS.startup]: Object.freeze({
    maxMs: 1500,
    description: 'Navigation start through page initialization readiness.',
  }),
  [PERFORMANCE_METRICS.projectImport]: Object.freeze({
    maxMs: 1500,
    description: 'Schema upgrade, persistence, and derived-state synchronization for a project import.',
  }),
  [PERFORMANCE_METRICS.oneLineRender]: Object.freeze({
    maxMs: 300,
    description: 'An atomic One-Line SVG render of the deterministic 1,000-component large-project fixture.',
  }),
  [PERFORMANCE_METRICS.studyRun]: Object.freeze({
    maxMs: 300,
    description: 'A TCC study run with eight selected protective devices.',
  }),
  [PERFORMANCE_METRICS.routingRecalculation]: Object.freeze({
    maxMs: 1000,
    description: 'Routing request through worker calculation and user-visible result rendering.',
  }),
});

export const PERFORMANCE_PROFILE_BUDGETS = Object.freeze({
  'startup:oneline': Object.freeze({
    maxDurationMs: 750,
    maxLongTaskMs: 250,
    maxHeapGrowthBytes: 16 * 1024 * 1024,
    maxElementGrowth: 2500,
    maxStorageReads: 80,
    description: 'Cold One-Line navigation through its explicit canvas-ready beacon.',
  }),
  'one-line-interactions': Object.freeze({
    maxDurationMs: 1200,
    maxLongTaskMs: 150,
    maxHeapGrowthBytes: 12 * 1024 * 1024,
    maxElementGrowth: 100,
    maxStorageReads: 80,
    description: 'Six consecutive One-Line grid interactions on a 1,000-component drawing.',
  }),
  'repeated-project-loads': Object.freeze({
    maxDurationMs: 1500,
    maxLongTaskMs: 150,
    maxHeapGrowthBytes: 12 * 1024 * 1024,
    maxElementGrowth: 100,
    maxStorageReads: 300,
    description: 'Six alternating imports of the workflow project in one browser session.',
  }),
  'study-runs': Object.freeze({
    maxDurationMs: 1500,
    maxLongTaskMs: 150,
    maxHeapGrowthBytes: 16 * 1024 * 1024,
    maxElementGrowth: 100,
    maxStorageReads: 150,
    description: 'Five consecutive eight-device TCC plot runs in one browser session.',
  }),
  'routing-recalculation': Object.freeze({
    maxDurationMs: 1500,
    maxLongTaskMs: 80,
    maxHeapGrowthBytes: 4 * 1024 * 1024,
    maxElementGrowth: 100,
    maxStorageReads: 250,
    description: 'A second 200-cable route calculation after the initial result is rendered.',
  }),
  'routing-recalculation-steady-state': Object.freeze({
    maxDurationMs: 1500,
    maxLongTaskMs: 80,
    maxHeapGrowthBytes: 1 * 1024 * 1024,
    maxElementGrowth: 100,
    maxStorageReads: 250,
    description: 'A third consecutive 200-cable route calculation after two complete result and viewer render cycles.',
  }),
});

export function evaluatePerformanceBudget(name, durationMs, budgets = PERFORMANCE_BUDGETS) {
  const contract = budgets[name];
  if (!contract) {
    return {
      name,
      durationMs,
      maxMs: null,
      passed: false,
      reason: `No performance budget is defined for ${name}.`,
    };
  }

  const normalizedDuration = Number(durationMs);
  const passed = Number.isFinite(normalizedDuration) && normalizedDuration <= contract.maxMs;
  return {
    name,
    durationMs: normalizedDuration,
    maxMs: contract.maxMs,
    passed,
    reason: passed
      ? ''
      : `${name} took ${normalizedDuration.toFixed(1)}ms; budget is ${contract.maxMs}ms.`,
  };
}

export function evaluatePerformanceReport(measurements, budgets = PERFORMANCE_BUDGETS) {
  return Object.keys(budgets).map(name => {
    const matching = measurements.filter(measurement => measurement.name === name);
    const durationMs = matching.length
      ? Math.max(...matching.map(measurement => Number(measurement.durationMs)))
      : Number.NaN;
    const result = evaluatePerformanceBudget(name, durationMs, budgets);
    return matching.length
      ? result
      : { ...result, reason: `Required performance measurement ${name} was not recorded.` };
  });
}

export function evaluatePerformanceProfiles(profiles, budgets = PERFORMANCE_PROFILE_BUDGETS) {
  return Object.entries(budgets).map(([name, budget]) => {
    const profile = profiles.find(candidate => candidate.name === name);
    if (!profile) {
      return { name, passed: false, failures: [`Required performance profile ${name} was not recorded.`] };
    }
    const longestTaskMs = Math.max(0, ...(profile.longTasks || []).map(task => Number(task.durationMs) || 0));
    const values = {
      durationMs: Number(profile.durationMs),
      longestTaskMs,
      heapGrowthBytes: Number(profile.heapGrowthBytes) || 0,
      elementGrowth: Number(profile.elementDelta) || 0,
      storageReads: Number(profile.storageReads?.total) || 0,
    };
    const failures = [];
    if (!Number.isFinite(values.durationMs) || values.durationMs > budget.maxDurationMs) {
      failures.push(`duration ${values.durationMs.toFixed(1)}ms exceeds ${budget.maxDurationMs}ms`);
    }
    if (values.longestTaskMs > budget.maxLongTaskMs) {
      failures.push(`longest task ${values.longestTaskMs.toFixed(1)}ms exceeds ${budget.maxLongTaskMs}ms`);
    }
    if (values.heapGrowthBytes > budget.maxHeapGrowthBytes) {
      failures.push(`heap growth ${values.heapGrowthBytes} bytes exceeds ${budget.maxHeapGrowthBytes} bytes`);
    }
    if (values.elementGrowth > budget.maxElementGrowth) {
      failures.push(`element growth ${values.elementGrowth} exceeds ${budget.maxElementGrowth}`);
    }
    if (values.storageReads > budget.maxStorageReads) {
      failures.push(`storage reads ${values.storageReads} exceeds ${budget.maxStorageReads}`);
    }
    return { name, ...values, passed: failures.length === 0, failures };
  });
}
