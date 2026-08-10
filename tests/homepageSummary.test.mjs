import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  collectHomepageSummary,
  homeCableFrom,
  homeCableSize,
  homeCableTag,
  homeCableTo,
  meaningfulHomeRecords,
  numericPercent
} from '../src/homepageSummary.js';

describe('homepage summary model', () => {
  it('filters placeholder rows and normalizes common cable fields', () => {
    const cable = { cable_id: 'C-1', source_tag: 'SW-1', load_tag: 'M-1', wire_size: '4/0' };
    assert.deepEqual(meaningfulHomeRecords([{}, { _ui: true }, cable]), [cable]);
    assert.equal(homeCableTag(cable), 'C-1');
    assert.equal(homeCableFrom(cable), 'SW-1');
    assert.equal(homeCableTo(cable), 'M-1');
    assert.equal(homeCableSize(cable), '4/0');
    assert.equal(numericPercent({ fillPercent: '42%' }, ['fillPercent']), 42);
  });

  it('builds workflow totals from injected canonical readers', () => {
    const readErrors = [];
    const summary = collectHomepageSummary({
      readers: {
        getEquipment: () => [{ tag: 'SW-1' }],
        getLoads: () => { throw new Error('unavailable'); },
        getOneLine: () => ({ sheets: [{ components: [{ id: 'SW-1' }] }] }),
        getCables: () => [{ tag: 'C-1', from: 'SW-1', to: 'M-1' }],
        getTrays: () => [{ tray_id: 'T-1', fill_pct: 20 }],
        getConduits: () => [{ conduit_id: 'R-1', fill_pct: '60%' }],
        getDuctbanks: () => [],
        getStudies: () => ({ shortCircuit: { status: 'saved' }, empty: null }),
        getLifecyclePackages: () => [{ id: 'PKG-1' }],
        getReportSnapshots: () => ({ issued: {} }),
        getReconcilePending: () => true,
        getRouteResults: () => ({ status: 'complete' }),
        getDesignBasis: () => ({}),
        getDesignGateApprovals: () => ({}),
        getStudyApprovals: () => ({}),
        getProjectInputFingerprint: () => 'fingerprint'
      },
      services: {
        getCableReadiness: cables => ({ total: cables.length, scheduleReady: 1, routingReady: 0 }),
        countOneLineComponents: oneLine => oneLine.sheets[0].components.length,
        buildWorkflowCoreDiagnostics: input => ({
          input,
          workflowSteps: [{ key: 'basis', complete: true }],
          designRules: { errors: 0, warnings: 1 },
          readyForDeliverables: false,
          nextAction: { label: 'Continue' }
        }),
        getStepStatus: key => ({ key, complete: false })
      },
      workflowSteps: [{ key: 'basis' }, { key: 'schedule' }],
      onReadError: error => readErrors.push(error.message)
    });

    assert.deepEqual(readErrors, ['unavailable']);
    assert.equal(summary.loads.length, 0);
    assert.equal(summary.raceways, 2);
    assert.equal(summary.averageFill, 40);
    assert.equal(summary.routeWarnings, 1);
    assert.equal(summary.studyCount, 1);
    assert.equal(summary.reportCount, 2);
    assert.equal(summary.completeCount, 1);
    assert.equal(summary.nextStep.key, 'schedule');
    assert.equal(summary.workflowDiagnostics.input.currentInputFingerprint, 'fingerprint');
  });
});
