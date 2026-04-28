import assert from 'node:assert/strict';
import {
  buildLoadDemandGovernancePackage,
  buildPanelDemandSummary,
  calculateDemandForLoads,
  normalizeDemandBasis,
  normalizeLoadDemandRow,
  renderLoadDemandGovernanceHTML,
} from '../analysis/loadDemandGovernance.mjs';

function describe(name, fn) {
  console.log(name);
  fn();
}

function it(name, fn) {
  try {
    fn();
    console.log('  \u2713', name);
  } catch (err) {
    console.error('  \u2717', name, err.message || err);
    process.exitCode = 1;
  }
}

describe('load demand governance', () => {
  it('normalizes legacy load rows with generic class and preserved demand factor', () => {
    const row = normalizeLoadDemandRow({ tag: 'L-1', kw: 10, demandFactor: 80, powerFactor: 0.8, duty: 'Continuous' });
    assert.equal(row.loadClass, 'generic');
    assert.equal(row.continuous, true);
    assert.equal(row.demandFactorPct, 80);
    assert.equal(row.demandKw, 8);
    assert.equal(row.status, 'warn');
  });

  it('normalizes demand basis defaults deterministically', () => {
    const basis = normalizeDemandBasis({});
    assert.equal(basis.enableNoncoincidentGroups, true);
    assert.equal(basis.applyLargestMotorAdder, true);
    assert.equal(basis.largestMotorAdderPct, 25);
    assert.equal(basis.spareFutureAllowancePct, 0);
  });

  it('uses governing demand for noncoincident groups', () => {
    const result = calculateDemandForLoads([
      { tag: 'A', kw: 10, demandFactor: 100, loadClass: 'process', noncoincidentGroup: 'summer' },
      { tag: 'B', kw: 6, demandFactor: 100, loadClass: 'process', noncoincidentGroup: 'summer' },
    ], { applyLargestMotorAdder: false });
    assert.equal(result.groupRows[0].governedDemandKw, 10);
    assert.equal(result.groupRows[0].reductionKw, 6);
    assert.equal(result.summary.governedDemandKw, 10);
  });

  it('adds largest motor and spare/future allowances', () => {
    const result = calculateDemandForLoads([
      { tag: 'M-1', kw: 100, demandFactor: 100, loadClass: 'motor', largestMotorCandidate: true },
      { tag: 'L-1', kw: 20, demandFactor: 50, loadClass: 'lighting' },
    ], { largestMotorAdderPct: 25, spareFutureAllowancePct: 10 });
    assert.equal(result.summary.largestMotorAdderKw, 25);
    assert.equal(result.summary.spareFutureAllowanceKw, 13.5);
    assert.equal(result.summary.governedDemandKw, 148.5);
  });

  it('applies load management limits and measured demand only when selected', () => {
    const managed = calculateDemandForLoads([
      { tag: 'EMS-1', kw: 50, demandFactor: 100, loadClass: 'process', loadManagementLimitKw: 30, measuredDemandSource: 'EMS limit' },
    ], { applyLargestMotorAdder: false });
    assert.equal(managed.summary.governedDemandKw, 30);

    const measured = calculateDemandForLoads([
      { tag: 'L-1', kw: 50, demandFactor: 100, loadClass: 'process' },
    ], { applyLargestMotorAdder: false, useMeasuredDemand: true, measuredDemandKw: 22, measuredDemandSource: 'Utility bill' });
    assert.equal(measured.summary.governedDemandKw, 22);
    assert.equal(measured.summary.measuredDemandApplied, true);
  });

  it('summarizes panel demand and phase balance deterministically', () => {
    const rows = buildPanelDemandSummary({
      panels: [{ id: 'P1', tag: 'P1', voltage: 480, phases: 3, mainRating: 20, phaseBalanceLimitPct: 10 }],
      loads: [
        { tag: 'A', panelId: 'P1', circuit: '1', kw: 10, loadClass: 'lighting' },
        { tag: 'B', panelId: 'P1', circuit: '1', kw: 10, loadClass: 'lighting' },
        { tag: 'C', panelId: 'P1', circuit: '2', kw: 2, loadClass: 'lighting' },
      ],
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].phaseBalance.status, 'fail');
    assert.equal(rows[0].status, 'fail');
  });

  it('builds package JSON and escapes rendered HTML', () => {
    const pkg = buildLoadDemandGovernancePackage({
      projectName: 'Project <A>',
      panels: [{ id: 'P1', tag: 'Panel <1>', voltage: 480, phases: 3 }],
      loads: [{ tag: 'Load <1>', panelId: 'P1', kw: 10, loadClass: 'lighting', demandBasisNote: 'Basis <note>' }],
    });
    assert.equal(pkg.version, 'load-demand-governance-v1');
    assert.equal(pkg.summary.loadCount, 1);
    assert(pkg.assumptions.length > 0);
    const html = renderLoadDemandGovernanceHTML(pkg);
    assert(html.includes('Load &lt;1&gt;'));
    assert(!html.includes('Load <1>'));
  });
});
