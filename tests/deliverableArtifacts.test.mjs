import test from 'node:test';
import assert from 'node:assert/strict';
import {
  artifactSourceStatus,
  buildArtifactRegisterRows,
  normalizeDeliverableArtifact,
  upsertArtifactList,
} from '../analysis/deliverableArtifacts.mjs';

test('deliverable artifact normalization preserves project-control metadata', () => {
  const artifact = normalizeDeliverableArtifact({
    id: 'sub-01',
    type: 'submittal',
    title: 'Cable Package',
    revision: 'A',
    status: 'issued',
    includedSections: ['cables', 'cables', 'raceways'],
    sourceFingerprint: 'abc',
  });
  assert.equal(artifact.id, 'sub-01');
  assert.equal(artifact.status, 'issued');
  assert.deepEqual(artifact.includedSections, ['cables', 'raceways']);
  assert.equal(artifactSourceStatus(artifact, 'abc'), 'current');
  assert.equal(artifactSourceStatus(artifact, 'def'), 'stale');
});

test('upsertArtifactList replaces matching ids and register rows stay newest first', () => {
  const artifacts = upsertArtifactList([
    { id: 'one', title: 'Old', generatedAt: '2026-01-01T00:00:00.000Z' },
  ], {
    id: 'one',
    title: 'New',
    generatedAt: '2026-02-01T00:00:00.000Z',
  });
  assert.equal(artifacts.length, 1);
  assert.equal(artifacts[0].title, 'New');
  assert.equal(buildArtifactRegisterRows(artifacts)[0].id, 'one');
});

