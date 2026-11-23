import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assessHeatTraceCase,
  buildHeatTraceCaseProvenance,
} from '../src/components/heatTraceLifecycle.mjs';
import { buildHeatTraceBranchSchedule } from '../analysis/heatTraceReport.mjs';
import { captureStudyRunContext } from '../analysis/studyLifecycle.mjs';

const result = {
  totalCircuitWatts: 120,
  installedTotalWatts: 140,
  lineLengthFt: 100,
  recommendedCableRatingWPerFt: 2,
  installedWPerFt: 2,
};

function context(inputs, projectSnapshot = { source: 'project-a' }) {
  return captureStudyRunContext('heatTraceSizing', {
    inputs,
    options: { unitSystem: 'imperial' },
    projectSnapshot,
    projectIdentity: { projectId: 'heat-trace-test', projectName: 'Heat Trace Test' },
    scenario: 'base',
  });
}

test('heat trace case provenance qualifies the case independently', () => {
  const caseItem = { id: 'ht-1', inputs: { lineLengthFt: 100 }, result };
  const provenance = buildHeatTraceCaseProvenance(caseItem, context(caseItem.inputs));
  const saved = { ...caseItem, _provenance: provenance };
  assert.equal(assessHeatTraceCase(saved, context(caseItem.inputs)).freshness, 'current');
  assert.equal(assessHeatTraceCase(saved, context(caseItem.inputs)).eligible, true);
  assert.equal(assessHeatTraceCase(saved, context({ lineLengthFt: 110 })).freshness, 'stale');
});

test('legacy and stale branch rows are withheld in the schedule', () => {
  const currentCase = { id: 'ht-current', inputs: { lineLengthFt: 100 }, result };
  const currentProvenance = buildHeatTraceCaseProvenance(currentCase, context(currentCase.inputs));
  const staleCase = {
    id: 'ht-stale',
    inputs: { lineLengthFt: 100 },
    result,
    _provenance: buildHeatTraceCaseProvenance(
      { id: 'ht-stale', inputs: { lineLengthFt: 90 }, result },
      context({ lineLengthFt: 90 }),
    ),
  };
  const currentAssessment = assessHeatTraceCase({ ...currentCase, _provenance: currentProvenance }, context(currentCase.inputs));
  const staleAssessment = assessHeatTraceCase(staleCase, context(staleCase.inputs));
  const schedule = buildHeatTraceBranchSchedule([
    { ...currentCase, _lifecycleAssessment: currentAssessment },
    { ...staleCase, _lifecycleAssessment: staleAssessment },
    {
      id: 'ht-legacy',
      inputs: { lineLengthFt: 100 },
      result,
      _lifecycleAssessment: assessHeatTraceCase(
        { id: 'ht-legacy', inputs: { lineLengthFt: 100 }, result },
        context({ lineLengthFt: 100 }),
      ),
    },
  ]);
  assert.equal(schedule.rows[0].lifecycleEligible, true);
  assert.equal(schedule.rows[1].status, 'invalid');
  assert.equal(schedule.rows[1].lifecycleStatus, 'stale');
  assert.equal(schedule.rows[2].status, 'invalid');
  assert.equal(schedule.rows[2].lifecycleStatus, 'unknown');
  assert.equal(schedule.summary.branchCount, 3);
  assert.equal(schedule.summary.eligibleBranchCount, 1);
  assert.equal(schedule.summary.totalConnectedWatts, currentCase.result.installedTotalWatts);
});
