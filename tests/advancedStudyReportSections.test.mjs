import assert from 'node:assert/strict';
import { buildAdvancedStudySections } from '../analysis/projectReport.mjs';
import { getAvailableSections, PRESET_CONFIGS } from '../analysis/reportPackage.mjs';

const runMetadata = {
  valid: true,
  source: 'project-one-line',
  runAt: '2026-07-30T12:00:00.000Z',
  convergence: { message: '24 of 24 cases converged.' },
};

const studies = {
  quasiDynamic: {
    runMetadata,
    convergedCount: 24,
    timestepCount: 24,
    overVoltageCount: 0,
    underVoltageCount: 1,
    totalEnergyLossKwh: 8.2,
    loadFactor: 0.71,
    busEnvelope: [{ id: 'B1', label: 'Main Bus', minVm: 0.94, maxVm: 1.01, minRisk: 'warn', maxRisk: 'pass' }],
    warnings: ['Review the low-voltage interval.'],
  },
  contingency: {
    runMetadata,
    summary: { totalBranches: 1, criticalContingencies: 1, totalViolations: 2 },
    contingencies: [{
      branchName: 'F-1',
      branchType: 'cable',
      converged: true,
      critical: true,
      violations: [{ type: 'voltage' }, { type: 'loading' }],
    }],
  },
  optimalPowerFlow: {
    runMetadata,
    feasible: true,
    demandMW: 10,
    requiredGenMW: 10,
    totalCostPerHr: 420,
    systemLambda: 21,
    dispatch: [{ name: 'GEN-1', output: 10, loadingPct: 50, incrementalCost: 21, cost: 420 }],
    warnings: [],
  },
};

const sections = buildAdvancedStudySections(studies, {});
assert.equal(sections.quasiDynamic.readiness.valid, true);
assert.equal(sections.quasiDynamic.rows[0].risk, 'warning');
assert.equal(sections.contingency.rows[0].violations, 2);
assert.equal(sections.optimalPowerFlow.rows[0].unit, 'GEN-1');
assert.equal(sections.frequencyScan.empty, true);

const available = getAvailableSections({ studies });
assert.equal(available.has('quasiDynamic'), true);
assert.equal(available.has('optimalPowerFlow'), true);
assert.ok(PRESET_CONFIGS.electrical.sections.includes('contingency'));

console.log('advanced study report section tests passed');
