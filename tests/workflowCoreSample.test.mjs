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
  reportSnapshots: payload.settings.reportSnapshots,
  deliverables: payload.settings.lifecyclePackages,
  reconcilePending: payload.settings.oneLineScheduleReconcilePending
});

assert.equal(diagnostics.health.equipment, 5);
assert.equal(diagnostics.health.completeLoads, 3);
assert.equal(diagnostics.health.scheduleReady, 4);
assert.equal(diagnostics.health.routingReady, 4);
assert.equal(diagnostics.blockers.filter(item => item.severity === 'critical').length, 0);

console.log('✓ workflow core sample');
