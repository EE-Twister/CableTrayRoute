import assert from 'node:assert/strict';
import {
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
