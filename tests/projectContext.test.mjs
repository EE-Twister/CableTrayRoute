import assert from 'node:assert/strict';
import {
  importedProjectName,
  normalizeActiveProjectName,
  recoverActiveProjectName,
  resolveActiveProjectName
} from '../src/projectContext.js';

assert.equal(normalizeActiveProjectName('  MCC Expansion  '), 'MCC Expansion');
assert.equal(normalizeActiveProjectName('default'), '');
assert.equal(normalizeActiveProjectName(' DEFAULT '), '');
assert.equal(normalizeActiveProjectName(null), '');

assert.equal(
  resolveActiveProjectName('', 'default', 'Recovered Project'),
  'Recovered Project',
  'the canonical project name should recover a missing URL/global context'
);
assert.equal(
  resolveActiveProjectName('URL Project', 'Global Project', 'Stored Project'),
  'URL Project',
  'the explicit URL project should remain authoritative'
);
assert.equal(resolveActiveProjectName('', 'default', ''), '');

assert.equal(recoverActiveProjectName({
  hashName: '',
  currentProjectId: 'default',
  readStoredProjectName: () => 'Recovered Project'
}), 'Recovered Project');
let readError = null;
assert.equal(recoverActiveProjectName({
  currentProjectId: 'default',
  readStoredProjectName: () => { throw new Error('storage unavailable'); },
  onReadError: error => { readError = error; }
}), '');
assert.equal(readError?.message, 'storage unavailable');

console.log('✓ project context resolves named projects without treating default as a name');

assert.equal(importedProjectName('Plant A.ctr.json', []), 'Plant A');
assert.equal(importedProjectName('backup.JSON', []), 'backup');
assert.equal(importedProjectName('C:\\exports\\Unit 4.ctr.json', []), 'Unit 4');
assert.equal(importedProjectName('', []), 'Imported Project');
assert.equal(importedProjectName('default.ctr.json', []), 'Imported Project', 'reserved name falls back');
assert.equal(importedProjectName('Plant A.ctr.json', ['plant a', 'Plant A (2)']), 'Plant A (3)');

console.log('✓ imported project files get a unique project name from the file name');

