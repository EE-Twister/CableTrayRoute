import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';
import { buildLoadFlowModel } from '../analysis/loadFlowModel.js';
import { buildOneLineProjectView, normalizeOneLineReferences, normalizeProjectEntities } from '../analysis/projectIntegration.mjs';
import { previewDesignProposal } from '../src/design-synthesis/applyProposal.mjs';

const sample = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-industrial.json', import.meta.url), 'utf8'));

test('top-level One-Line cable projection is stored by canonical reference and hydrates losslessly', () => {
  const proposal = generateDesignProposal(sample);
  assert.equal(proposal.status, 'proposal', JSON.stringify(proposal.issues));
  const preview = previewDesignProposal(proposal);
  assert.equal(preview.ok, true, JSON.stringify(preview.errors));

  const compact = preview.proposal.oneLine;
  const compactConnections = compact.sheets.flatMap(sheet => sheet.connections || []);
  const originalConnections = proposal.oneLine.sheets.flatMap(sheet => sheet.connections || []);
  const canonical = normalizeProjectEntities({ cables: preview.proposal.cables }).cables;
  assert.equal(compactConnections.length, originalConnections.length);
  assert.ok(compactConnections.length > 0);
  for (const connection of compactConnections) {
    const matching = canonical.find(cable => cable.id === connection.circuitId);
    assert.ok(matching, `Connection ${connection.id} must retain an exact canonical circuit reference.`);
    assert.equal(connection.cable?.r_ohm_per_kft, undefined, 'Canonical electrical source fields should not be duplicated.');
    assert.equal(connection.cable?.x_ohm_per_kft, undefined, 'Canonical electrical source fields should not be duplicated.');
  }

  const nestedOriginal = proposal.oneLine.sheets.flatMap(sheet => sheet.components || []).flatMap(component => component.connections || []);
  const nestedCompact = compact.sheets.flatMap(sheet => sheet.components || []).flatMap(component => component.connections || []);
  assert.equal(nestedCompact.length, nestedOriginal.length);
  assert.ok(nestedCompact.some(connection => connection.cable), 'Nested component connections remain intact.');

  const hydrated = buildOneLineProjectView(compact, { cables: preview.proposal.cables });
  const expectedRefs = normalizeOneLineReferences(proposal.oneLine, { cables: preview.proposal.cables });
  const expectedHydrated = buildOneLineProjectView(expectedRefs, { cables: preview.proposal.cables });
  const hydratedCableIds = view => view.sheets.flatMap(sheet => sheet.connections || []).map(connection => connection.cable?.id);
  assert.deepEqual(hydratedCableIds(hydrated), hydratedCableIds(expectedHydrated), 'Canonical hydration restores the same displayed cable identities.');
  const expectedModel = buildLoadFlowModel(proposal.oneLine);
  const actualModel = buildLoadFlowModel(hydrated);
  const electricalBus = bus => ({ id: bus.id, type: bus.type, voltage: bus.voltage, phases: bus.phases, kw: bus.kw,
    powerFactor: bus.powerFactor, busType: bus.busType, load: bus.load, baseKV: bus.baseKV });
  assert.deepEqual(actualModel.buses.map(electricalBus), expectedModel.buses.map(electricalBus));
  assert.deepEqual(actualModel.branches, expectedModel.branches);
});

test('top-level projection retains cable-only custom fields and conflicting circuit identity', () => {
  const proposal = generateDesignProposal(sample);
  const connection = proposal.oneLine.sheets[0].connections[0];
  connection.cable.ownerAssetRegistry = { location: 'north room', retained: true };
  const customPreview = previewDesignProposal(proposal);
  assert.ok(customPreview.proposal.oneLine.sheets[0].connections[0].cable.ownerAssetRegistry);
  assert.equal(customPreview.proposal.oneLine.sheets[0].connections[0].cable.ownerAssetRegistry.location, 'north room');
  assert.equal(customPreview.proposal.oneLine.sheets[0].connections[0].cable.r_ohm_per_kft, undefined,
    'A cable field identical to its canonical schedule source is omitted.');

  const conflicting = structuredClone(proposal);
  conflicting.oneLine.sheets[0].connections[0].circuitId = 'UNMATCHED-CIRCUIT';
  const conflictingPreview = previewDesignProposal(conflicting);
  const retained = conflictingPreview.proposal.oneLine.sheets[0].connections[0];
  assert.equal(retained.circuitId, 'UNMATCHED-CIRCUIT');
  assert.ok(retained.cable, 'A conflicting explicit circuit identity must prevent projection compaction.');

  const customIdentity = structuredClone(proposal);
  const identityConnection = customIdentity.oneLine.sheets[0].connections[0];
  identityConnection.cable.id = 'CUSTOM-DIAGRAM-ID';
  const identityPreview = previewDesignProposal(customIdentity);
  assert.equal(identityPreview.proposal.oneLine.sheets[0].connections[0].cable.id, 'CUSTOM-DIAGRAM-ID',
    'A cable id that differs from its canonical reference is retained as diagram data.');
});
