/**
 * Tests for analysis/heatTraceReport.mjs
 */

import assert from 'assert';
import { runHeatTraceSizingAnalysis } from '../analysis/heatTraceSizing.mjs';
import { generateProjectReport } from '../analysis/projectReport.mjs';
import {
  buildHeatTraceBranchSchedule,
  buildHeatTraceReport,
  renderHeatTraceReportHTML,
} from '../analysis/heatTraceReport.mjs';

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

const baseInputs = {
  pipeNps: '1',
  insulationThicknessIn: 1,
  insulationType: 'mineralWool',
  lineLengthFt: 200,
  maintainTempC: 4.4,
  ambientTempC: -23.3,
  windSpeedMph: 5,
  safetyMarginPct: 15,
  maxCircuitLengthFt: 300,
  pipeMaterial: 'carbonSteel',
  environment: 'outdoor-sheltered',
  voltageV: 240,
  heatTraceCableType: 'selfRegulating',
};

function makeCase(name, overrides = {}) {
  const inputs = { ...baseInputs, ...overrides };
  const result = runHeatTraceSizingAnalysis(inputs);
  return {
    id: name.toLowerCase(),
    name,
    unitSystem: 'imperial',
    inputs,
    result,
    loadAmps: result.installedLoadAmps,
    createdAt: '2026-04-23T12:00:00.000Z',
    updatedAt: '2026-04-23T12:30:00.000Z',
  };
}

describe('heat trace branch schedule', () => {
  it('sums watts and branch current across saved cases', () => {
    const first = makeCase('HT-1');
    const second = makeCase('HT-2', { lineLengthFt: 100 });
    const schedule = buildHeatTraceBranchSchedule([first, second]);
    const expectedWatts = first.result.installedTotalWatts + second.result.installedTotalWatts;
    const expectedRequiredWatts = first.result.totalCircuitWatts + second.result.totalCircuitWatts;

    assert.strictEqual(schedule.rows.length, 2);
    assert.strictEqual(schedule.summary.branchCount, 2);
    assert.strictEqual(schedule.summary.totalConnectedWatts, Number(expectedWatts.toFixed(1)));
    assert.strictEqual(schedule.summary.totalRequiredWatts, Number(expectedRequiredWatts.toFixed(1)));
    assert.strictEqual(
      schedule.summary.totalLoadAmps,
      Number(schedule.rows.reduce((sum, row) => sum + row.loadAmps, 0).toFixed(2))
    );
    assert.strictEqual(schedule.summary.byVoltage.length, 1);
    assert.strictEqual(schedule.summary.byVoltage[0].count, 2);
    assert.strictEqual(schedule.rows[0].heatTraceCableTypeLabel, 'Self-regulating');
    assert.strictEqual(schedule.rows[0].traceRunCount, 1);
    assert.strictEqual(schedule.rows[0].totalWatts, first.result.installedTotalWatts);
  });

  it('normalizes legacy cases with missing load amps, result, and updatedAt', () => {
    const schedule = buildHeatTraceBranchSchedule([{
      id: 'legacy-1',
      name: 'Legacy branch',
      unitSystem: 'imperial',
      inputs: { ...baseInputs, lineLengthFt: 125, heatTraceCableType: undefined },
      createdAt: '2026-04-23T12:00:00.000Z',
    }]);

    assert.strictEqual(schedule.rows.length, 1);
    assert.ok(schedule.rows[0].result);
    assert.ok(schedule.rows[0].loadAmps > 0);
    assert.strictEqual(schedule.rows[0].updatedAt, '2026-04-23T12:00:00.000Z');
    assert.strictEqual(schedule.rows[0].heatTraceCableType, 'selfRegulating');
    assert.strictEqual(schedule.rows[0].traceRunCount, 1);
    assert.strictEqual(schedule.rows[0].componentAllowanceLengthFt, 0);
    assert.notStrictEqual(schedule.rows[0].status, 'invalid');
  });

  it('includes run count, component allowances, and installed load in normalized rows', () => {
    const branch = makeCase('HT-Components', {
      traceRunCount: 2,
      componentAllowances: [
        { type: 'valve', label: 'Block <Valve>', quantity: 1, equivalentLengthFtEach: 5 },
      ],
    });
    const schedule = buildHeatTraceBranchSchedule([branch]);
    const row = schedule.rows[0];

    assert.strictEqual(row.traceRunCount, 2);
    assert.strictEqual(row.componentAllowanceLengthFt, 5);
    assert.strictEqual(row.effectiveTraceLengthFt, 205);
    assert.strictEqual(row.totalWatts, branch.result.installedTotalWatts);
    assert.strictEqual(row.requiredWatts, branch.result.totalCircuitWatts);
  });
});

describe('heat trace report payload', () => {
  it('includes active case, saved branches, warnings, basis, and approval', () => {
    const activeResult = runHeatTraceSizingAnalysis(baseInputs);
    const branch = makeCase('HT-1', { lineLengthFt: 400, maxCircuitLengthFt: 300, heatTraceCableType: 'mineralInsulated' });
    const report = buildHeatTraceReport({
      activeResult,
      activeInputs: baseInputs,
      circuitCases: [branch],
      approval: { status: 'approved', reviewedBy: 'PE-1' },
      projectName: 'Demo Project',
    });

    assert.strictEqual(report.projectName, 'Demo Project');
    assert.ok(report.activeCase);
    assert.strictEqual(report.branchSchedule.summary.branchCount, 1);
    assert.strictEqual(report.branchSchedule.summary.overLimitCount, 1);
    assert.ok(report.calculationBasis.assumptions.some(item => item.includes('Upstream feeder')));
    assert.ok(report.calculationBasis.assumptions.some(item => item.includes('Cable type')));
    assert.ok(report.calculationBasis.assumptions.some(item => item.includes('Component allowances')));
    assert.strictEqual(report.branchSchedule.rows[0].heatTraceCableTypeLabel, 'Mineral insulated');
    assert.ok(report.warnings.some(item => item.source === 'HT-1'));
    assert.strictEqual(report.approval.status, 'approved');
  });

  it('escapes branch names and user-entered values in HTML output', () => {
    const report = buildHeatTraceReport({
      activeResult: runHeatTraceSizingAnalysis(baseInputs),
      activeInputs: baseInputs,
      circuitCases: [{
        ...makeCase('<img src=x onerror=alert(1)>', {
          componentAllowances: [
            { type: 'custom', label: '<svg onload=alert(2)>', quantity: 1, equivalentLengthFtEach: 3 },
          ],
        }),
      }],
      approval: { status: '<script>alert(1)</script>' },
      projectName: '<b>Unsafe</b>',
    });
    const html = renderHeatTraceReportHTML(report);

    assert.ok(!html.includes('<img src=x'));
    assert.ok(!html.includes('<script>alert(1)</script>'));
    assert.ok(!html.includes('<svg onload=alert(2)>'));
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
    assert.ok(html.includes('&lt;svg onload=alert(2)&gt;'));
    assert.ok(html.includes('&lt;b&gt;Unsafe&lt;/b&gt;'));
  });
});

describe('project report integration', () => {
  it('adds a heat trace section when heat trace study results exist', () => {
    const branch = makeCase('HT-1');
    const projectReport = generateProjectReport({
      projectName: 'Demo Project',
      studies: {
        heatTraceSizing: branch.result,
        heatTraceSizingCircuits: [branch],
      },
      approvals: {
        heatTraceSizing: { status: 'pending' },
      },
    });

    assert.ok(projectReport.heatTrace);
    assert.strictEqual(projectReport.heatTrace.branchSchedule.summary.branchCount, 1);
    assert.strictEqual(projectReport.heatTrace.approval.status, 'pending');
  });
});
