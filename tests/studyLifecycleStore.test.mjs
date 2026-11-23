import assert from 'node:assert/strict';
import {
  captureStudyRunContext,
  getStudies,
  getStudyProvenance,
  saveStudyResult,
  setProjectMeta,
  setStudies,
} from '../dataStore.mjs';
import { initializeProjectStorage, redoProjectChange, undoProjectChange } from '../projectStorage.js';

await initializeProjectStorage();
setProjectMeta({ id: 'lifecycle-test-project', name: 'Lifecycle test' });
setStudies({});
const context = captureStudyRunContext('groundGrid', {
  inputs: { rho: 100 },
  options: { currentA: 2000 },
  modelRevision: 'ground-test-v1',
});
const result = { stepSafe: false, touchSafe: true };
setProjectMeta({ id: 'different-project', name: 'Different project' });
assert.throws(() => saveStudyResult('groundGrid', result, context), /different project/);
setProjectMeta({ id: 'lifecycle-test-project', name: 'Lifecycle test' });
saveStudyResult('groundGrid', result, context);
assert.deepEqual(getStudies().groundGrid, result);
assert.equal(getStudyProvenance().groundGrid.schemaVersion, 2);

undoProjectChange();
assert.deepEqual(getStudies(), {});
assert.deepEqual(getStudyProvenance(), {});
redoProjectChange();
assert.deepEqual(getStudies().groundGrid, result);
assert.equal(getStudyProvenance().groundGrid.resultHash !== null, true);

setStudies({ groundGrid: { stepSafe: true } });
assert.equal(getStudyProvenance().groundGrid.freshness, 'unknown');
assert.equal(getStudyProvenance().groundGrid.reason, 'bulk_restore_without_run_context');
const firstUnknownRun = getStudyProvenance().groundGrid.previousRun;
setStudies({ groundGrid: { stepSafe: false, note: 'metadata edit 1' } });
const firstEdit = getStudyProvenance().groundGrid;
setStudies({ groundGrid: { stepSafe: false, note: 'metadata edit 2' } });
const secondEdit = getStudyProvenance().groundGrid;
assert.deepEqual(secondEdit.previousRun, firstUnknownRun);
assert.equal(Object.prototype.hasOwnProperty.call(secondEdit.previousRun, 'previousRun'), false);
assert.ok(JSON.stringify(secondEdit).length < JSON.stringify(firstEdit).length + 200);

console.log('✓ study result and provenance restore atomically and bulk restore stays unknown');
