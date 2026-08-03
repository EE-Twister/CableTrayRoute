export const PERFORMANCE_METRICS = Object.freeze({
  startup: 'ctr.startup',
  projectImport: 'ctr.project-import',
  oneLineRender: 'ctr.oneline-render',
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
    description: 'A complete synchronous One-Line SVG render.',
  }),
  [PERFORMANCE_METRICS.routingRecalculation]: Object.freeze({
    maxMs: 30000,
    description: 'Routing request through worker calculation and user-visible result rendering.',
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
