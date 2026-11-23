import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';
import { previewDesignProposal } from '../src/design-synthesis/applyProposal.mjs';
import { buildOneLineProjectView } from '../analysis/projectIntegration.mjs';
import { fingerprintStudyValue } from '../analysis/studyLifecycle.mjs';

function fixture() {
  const input = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-industrial.json', import.meta.url), 'utf8'));
  input.equipment = input.equipment.slice(0, 2);
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.status, 'proposal', JSON.stringify(proposal.issues));
  return proposal;
}

test('diagram deduplication retains cable fields not supplied identically by the canonical record', () => {
  const proposal = fixture();
  const connection = proposal.oneLine.sheets[0].connections[0];
  const annotation = { text: 'Owner-specific drawing annotation', dimensions: [1, 2, 3] };
  connection.cable.ownerAnnotation = annotation;
  connection.cable.ownerEmptyString = '';
  connection.cable.ownerFalse = false;
  connection.cable.ownerNull = null;
  const before = structuredClone(proposal);
  const preview = previewDesignProposal(proposal);
  assert.equal(preview.ok, true, JSON.stringify(preview.errors));
  assert.deepEqual(proposal, before, 'Preview remains read-only');
  const storedConnection = preview.proposal.oneLine.sheets[0].connections[0];
  assert.deepEqual(storedConnection.cable?.ownerAnnotation, annotation);
  assert.equal(storedConnection.cable?.ownerEmptyString, '');
  assert.equal(storedConnection.cable?.ownerFalse, false);
  assert.equal(storedConnection.cable?.ownerNull, null);
  const hydrated = buildOneLineProjectView(preview.proposal.oneLine, { cables: preview.proposal.cables });
  assert.deepEqual(hydrated.sheets[0].connections[0].cable.ownerAnnotation, annotation);
});

test('diagram compaction does not replace an explicit contradictory circuit identity', () => {
  const proposal = fixture();
  proposal.oneLine.sheets[0].connections[0].circuitId = 'owner-unresolved-circuit';
  const preview = previewDesignProposal(proposal);
  const row = preview.proposal?.oneLine?.sheets?.[0]?.connections?.[0];
  assert.ok(row);
  assert.equal(row.circuitId, 'owner-unresolved-circuit');
  assert.deepEqual(row.cable, proposal.oneLine.sheets[0].connections[0].cable, 'Conflicting reference is not eligible for deduplication');
});

test('distinct diagram values survive even when the existing short fingerprints collide', () => {
  const proposal = fixture();
  const connection = proposal.oneLine.sheets[0].connections[0];
  const canonical = proposal.cables.find(cable => cable.id === connection.cable.id);
  const canonicalValue = 'annotation-oasjve-q0q';
  const diagramValue = 'annotation--falet6-18yu';
  assert.notEqual(canonicalValue, diagramValue);
  assert.equal(fingerprintStudyValue(canonicalValue), fingerprintStudyValue(diagramValue), 'Literal independent collision reproducer');
  canonical.ownerAnnotation = canonicalValue;
  connection.cable.ownerAnnotation = diagramValue;
  const preview = previewDesignProposal(proposal);
  assert.equal(preview.ok, true, JSON.stringify(preview.errors));
  assert.equal(preview.proposal.oneLine.sheets[0].connections[0].cable.ownerAnnotation, diagramValue,
    'A matching 32-bit fingerprint is not proof of equal field values');
});

test('a nonmatching custom embedded cable identity is retained during reference deduplication', () => {
  const proposal = fixture();
  const connection = proposal.oneLine.sheets[0].connections[0];
  connection.cable.id = 'owner-specific-drawing-alias';
  const preview = previewDesignProposal(proposal);
  assert.equal(preview.ok, true, JSON.stringify(preview.errors));
  const compact = preview.proposal.oneLine.sheets[0].connections[0];
  assert.equal(compact.cable.id, 'owner-specific-drawing-alias');
  assert.equal(compact.cableRef, connection.cableRef);
  assert.equal(compact.cableId, connection.cableId);
});
