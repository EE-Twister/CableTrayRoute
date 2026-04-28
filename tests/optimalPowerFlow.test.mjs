import assert from 'node:assert';

function describe(name, fn) {
  console.log(name);
  fn();
}

function it(name, fn) {
  try {
    fn();
    console.log('  \u2713', name);
  } catch (err) {
    console.log('  \u2717', name);
    console.error(err);
    process.exitCode = 1;
  }
}

const {
  buildOptimalPowerFlowPackage,
  evaluateOptimalPowerFlowCandidate,
  normalizeOptimalPowerFlowCase,
  renderOptimalPowerFlowHTML,
  runOptimalPowerFlow,
  solveEconomicDispatch,
} = await import('../analysis/optimalPowerFlow.mjs');

const twoBusModel = {
  buses: [
    { id: 'source', type: 'slack', baseKV: 13.8, generation: { kw: 500, kvar: 0 } },
    { id: 'load', type: 'PQ', baseKV: 13.8, load: { kw: 150, kvar: 40 } },
  ],
  branches: [
    { id: 'feeder', from: 'source', to: 'load', impedance: { r: 0.02, x: 0.04 }, rating: 250 },
  ],
};

describe('optimal power flow normalization', () => {
  it('normalizes legacy/minimal cases with missing-data warnings', () => {
    const normalized = normalizeOptimalPowerFlowCase({});
    assert.strictEqual(normalized.version, 'optimal-power-flow-v1');
    assert.deepStrictEqual(normalized.generators, []);
    assert(normalized.warnings.some(warning => warning.code === 'missing-network'));
    assert(normalized.warnings.some(warning => warning.code === 'missing-generators'));
  });
});

describe('economic dispatch', () => {
  it('respects generator min/max and equal incremental cost for quadratic curves', () => {
    const caseData = normalizeOptimalPowerFlowCase({
      model: twoBusModel,
      totalDemandKw: 180,
      generators: [
        { id: 'G1', tag: 'Gen 1', busId: 'source', pMinKw: 20, pMaxKw: 200, costPerKwh: 10, costQuadratic: 0.02 },
        { id: 'G2', tag: 'Gen 2', busId: 'source', pMinKw: 10, pMaxKw: 200, costPerKwh: 12, costQuadratic: 0.01 },
      ],
    });
    const dispatch = solveEconomicDispatch(caseData);
    assert(dispatch.feasible);
    assert(Math.abs(dispatch.totalDispatchedKw - 180) < 1e-4);
    const g1 = dispatch.dispatchRows.find(row => row.generatorId === 'G1');
    const g2 = dispatch.dispatchRows.find(row => row.generatorId === 'G2');
    assert(g1.dispatchedKw >= 20 && g1.dispatchedKw <= 200);
    assert(g2.dispatchedKw >= 10 && g2.dispatchedKw <= 200);
    assert(Math.abs(g1.marginalCost - g2.marginalCost) < 0.01);
  });

  it('reports infeasible capacity when demand exceeds enabled generation', () => {
    const caseData = normalizeOptimalPowerFlowCase({
      model: twoBusModel,
      totalDemandKw: 500,
      generators: [
        { id: 'G1', busId: 'source', pMaxKw: 100, costPerKwh: 20 },
      ],
    });
    const dispatch = solveEconomicDispatch(caseData);
    assert.strictEqual(dispatch.feasible, false);
    assert(dispatch.warnings.some(warning => warning.code === 'insufficient-generation-capacity'));
    assert.strictEqual(dispatch.totalDispatchedKw, 100);
  });
});

describe('OPF candidate evaluation', () => {
  it('runs load-flow feasibility and flags voltage or branch loading violations', () => {
    const caseData = normalizeOptimalPowerFlowCase({
      model: twoBusModel,
      totalDemandKw: 150,
      generators: [
        { id: 'G1', busId: 'source', pMaxKw: 300, costPerKwh: 15 },
      ],
      constraints: {
        voltageMinPu: 1.01,
        voltageMaxPu: 1.05,
        branchLoadingMaxPct: 40,
      },
    });
    const dispatch = solveEconomicDispatch(caseData);
    const evaluation = evaluateOptimalPowerFlowCandidate(caseData, dispatch, { baseMVA: 1 });
    assert(evaluation.loadFlowResult.converged);
    assert(evaluation.violations.some(row => row.status === 'fail'));
    assert(evaluation.constraintRows.some(row => row.metric === 'voltagePu'));
    assert(evaluation.constraintRows.some(row => row.metric === 'branchLoadingPct'));
  });

  it('produces deterministic objective summaries for supported objective modes', () => {
    const cost = runOptimalPowerFlow({
      model: twoBusModel,
      totalDemandKw: 150,
      generators: [
        { id: 'G1', busId: 'source', pMaxKw: 300, costPerKwh: 15 },
      ],
      constraints: { objectiveMode: 'cost' },
    }, { baseMVA: 1 });
    const losses = runOptimalPowerFlow({
      model: twoBusModel,
      totalDemandKw: 150,
      generators: [
        { id: 'G1', busId: 'source', pMaxKw: 300, costPerKwh: 15 },
      ],
      constraints: { objectiveMode: 'losses' },
    }, { baseMVA: 1 });
    assert.strictEqual(cost.summary.objectiveMode, 'cost');
    assert.strictEqual(losses.summary.objectiveMode, 'losses');
    assert(Number.isFinite(cost.objective.score));
    assert(Number.isFinite(losses.objective.score));
  });
});

describe('OPF package and rendering', () => {
  it('includes dispatch, constraints, warnings, assumptions, and escaped HTML output', () => {
    const pkg = buildOptimalPowerFlowPackage({
      projectName: '<Plant>',
      model: twoBusModel,
      totalDemandKw: 150,
      generators: [
        { id: 'G1', tag: '<Gen A>', busId: 'source', pMaxKw: 300, costPerKwh: 15 },
      ],
    });
    assert(pkg.summary);
    assert(pkg.dispatchRows.length > 0);
    assert(pkg.constraintRows.length > 0);
    assert(Array.isArray(pkg.warnings));
    assert(pkg.assumptions.length > 0);
    const html = renderOptimalPowerFlowHTML(pkg);
    assert(html.includes('Optimal Power Flow'));
    assert(!html.includes('<Gen A>'));
    assert(html.includes('&lt;Gen A&gt;'));
  });
});
