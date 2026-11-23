import assert from 'node:assert/strict';
import {
  captureStudyRunContext,
  cloneScenario,
  getScenarioSnapshot,
  saveStudyResult,
  setItem,
  setProjectMeta,
  switchScenario,
} from '../dataStore.mjs';
import { compareProjectScenarios } from '../analysis/scenarioComparison.mjs';
import { initializeProjectStorage } from '../projectStorage.js';

await initializeProjectStorage();
switchScenario('base');
setProjectMeta({ id: 'scenario-lifecycle-project', name: 'Scenario lifecycle' });
setItem('studySettings', { loadFlow: { baseMVA: 100, balanced: true, maxIterations: 50 } });
const context = captureStudyRunContext('loadFlow', {
  inputs: { source: 'base' },
  options: { baseMVA: 100 },
});
saveStudyResult('loadFlow', { buses: [{ id: 'bus-1', Vm: 1 }] }, context);

cloneScenario('future', 'base');
switchScenario('future');
setItem('studySettings', { loadFlow: { baseMVA: 125, balanced: true, maxIterations: 50 } });

const base = getScenarioSnapshot('base');
const future = getScenarioSnapshot('future');
assert.equal(base.projectMeta.id, 'scenario-lifecycle-project');
assert.equal(base.settings.studySettings.loadFlow.baseMVA, 100);
assert.equal(future.settings.studySettings.loadFlow.baseMVA, 125);
assert.ok(base.studyContext.currentStudyContexts.loadFlow);
assert.ok(base.studyContext.assessments.loadFlow);
assert.equal(base.studyContext.assessments.loadFlow.freshness, 'current');
assert.equal(future.studyContext.assessments.loadFlow.freshness, 'stale');

const comparison = compareProjectScenarios(base, future);
const loadFlow = comparison.studies.find(study => study.key === 'loadFlow');
assert.equal(loadFlow.after.freshness, 'stale');

console.log('✓ scenario snapshots include canonical lifecycle contexts and detect per-scenario settings changes');


