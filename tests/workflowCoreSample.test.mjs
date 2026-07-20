import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  getSampleById,
  migrateSampleProject,
  sampleProjectToImportPayload,
  validateSampleProject
} from '../analysis/sampleGallery.mjs';

const sample = getSampleById('project-workflow-core');
assert(sample, 'Project Workflow Core sample should be registered');
assert(sample.pagesUsed.includes('equipmentlist.html'));
assert(sample.pagesUsed.includes('workflowdashboard.html'));
assert.equal(sample.guidedChecklist.length, 8);

const raw = JSON.parse(await readFile(new URL('../samples/project-workflow-core.json', import.meta.url), 'utf8'));
const migrated = migrateSampleProject(raw);
const validation = validateSampleProject(migrated);
assert.equal(validation.valid, true, validation.errors.join(', '));

const payload = sampleProjectToImportPayload(migrated);
assert(Array.isArray(payload.equipment));
assert(Array.isArray(payload.loads));
assert(Array.isArray(payload.cables));
assert(Array.isArray(payload.trays));
assert.equal(payload.settings.oneLineScheduleReconcilePending, false);
assert(payload.settings.studies.demandSchedule);
assert.equal(payload.settings.latestRouteResults.batchResults.length, 14);
assert(payload.settings.latestRouteResults.batchResults.every(result => result.status === 'Routed'));
assert(payload.settings.latestRouteResults.batchResults.every(result => result.segments_count > 0));
assert.equal(payload.settings.latestRouteResults.routedCableNames.length, 14);
assert.equal(payload.settings.latestRouteResults.trayCableMap['TR-PWR-101'].length, 5);
const pumpCable = payload.cables.find(cable => cable.tag === 'CBL-MCC-PMP-101');
const pumpConduit = payload.ductbanks.flatMap(ductbank => ductbank.conduits || [])
  .find(conduit => conduit.conduit_id === 'CND-PMP-101');
assert.deepEqual(
  [pumpConduit.end_x, pumpConduit.end_y, pumpConduit.end_z],
  [pumpCable.end_x, pumpCable.end_y, pumpCable.end_z],
  'the pump cable endpoint must connect to its preferred conduit',
);
assert(payload.settings.reportSnapshots['workflow-core-report']);

const store = {};
global.localStorage = {
  getItem: key => (key in store ? store[key] : null),
  setItem: (key, value) => { store[key] = value; },
  removeItem: key => { delete store[key]; }
};

const { buildWorkflowCoreDiagnostics } = await import('../analysis/projectWorkflowCore.mjs?cache=' + Date.now());
const diagnostics = buildWorkflowCoreDiagnostics({
  equipment: payload.equipment,
  loads: payload.loads,
  oneLine: payload.oneLine,
  cables: payload.cables,
  trays: payload.trays,
  conduits: payload.conduits,
  ductbanks: payload.ductbanks,
  studies: payload.settings.studies,
  latestRouteResults: payload.settings.latestRouteResults,
  reportSnapshots: payload.settings.reportSnapshots,
  deliverables: payload.settings.lifecyclePackages,
  reconcilePending: payload.settings.oneLineScheduleReconcilePending,
  designBasis: payload.settings.designBasis,
  designGateApprovals: payload.settings.designGateApprovals
});

assert.equal(diagnostics.health.equipment, 13);
assert.equal(diagnostics.health.completeLoads, 10);
assert.equal(diagnostics.health.scheduleReady, 14);
assert.equal(diagnostics.health.routingReady, 14);
assert.equal(diagnostics.health.routeResults, 14);
assert(diagnostics.health.pullGroups > 0);
assert(diagnostics.health.spoolSheets > 0);
assert.equal(diagnostics.blockers.filter(item => item.severity === 'critical').length, 1);
assert.equal(diagnostics.blockers.filter(item => item.severity === 'warning').length, 1);
assert.equal(diagnostics.designRules.errors, 2);
assert.equal(diagnostics.designRules.warnings, 8);
assert.equal(diagnostics.cableDeliverables.ready, 14);
assert.equal(diagnostics.readyForDeliverables, false);
assert.equal(diagnostics.workflowSteps.length, 8);
assert.equal(diagnostics.workflowSteps.filter(step => step.complete).length, 6);

console.log('✓ workflow core sample');
