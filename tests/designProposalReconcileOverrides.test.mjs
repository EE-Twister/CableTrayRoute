import assert from 'node:assert/strict';
import test from 'node:test';
import { fingerprintStudyValue } from '../analysis/studyLifecycle.mjs';
import { getPanelLocationOverrideCandidates, reconcileDesignProposal } from '../analysis/designProposalReconcile.mjs';

const marker = { identity: 'DP-01', collection: 'panels', source: 'design-synthesis' };
const base = { id: 'DP-01', tag: 'DP-01', type: 'panel', x: 0, y: 0, z: 0, voltage: 480, phases: 3, loadKva: 100, loadIds: ['M1'], _designSynthesis: marker };
const withoutMarker = value => { const copy = structuredClone(value); delete copy._designSynthesis; return copy; };
const nonLocation = value => { const copy = withoutMarker(value); delete copy.x; delete copy.y; delete copy.z; return copy; };
const snapshot = value => ({ fingerprint: fingerprintStudyValue(withoutMarker(value)), nonLocationFingerprint: fingerprintStudyValue(nonLocation(value)) });

function run(currentPanel, proposalPanel, prior = snapshot(base)) {
  return reconcileDesignProposal({
    current: { panels: [currentPanel], equipment: [], loads: [], cables: [], trays: [], conduits: [] },
    proposal: { panels: [proposalPanel], equipment: [], loads: [], cables: [], trays: [], conduits: [] },
    lastApplied: { records: { panels: { 'DP-01': prior } } },
  });
}

test('accepts only an explicit matching panel-location override', () => {
  const current = { ...base, x: 10, y: 20, z: 0 };
  const proposal = { ...base, x: 10, y: 20, z: 0, locationOverride: { x: 10, y: 20, z: 0, note: 'field verified placement' } };
  const result = run(current, proposal);
  assert.equal(result.ok, true, JSON.stringify(result.conflicts));
  assert.deepEqual(result.next.panels[0].locationOverride, proposal.locationOverride);
});

test('blocks unrelated changes and legacy snapshots without selective baseline', () => {
  const current = { ...base, x: 10, y: 20, z: 0, loadKva: 999 };
  const proposal = { ...base, x: 10, y: 20, z: 0, locationOverride: { x: 10, y: 20, z: 0 } };
  assert.equal(run(current, proposal).conflicts[0].code, 'generated_record_modified');
  const legacy = { fingerprint: fingerprintStudyValue(withoutMarker(base)) };
  const result = run({ ...base, x: 10, y: 20, z: 0 }, proposal, legacy);
  assert.equal(result.conflicts[0].code, 'generated_record_modified');
});

test('malformed override blocks and candidate helper only returns selective-baseline panels', () => {
  const malformed = run({ ...base, x: 10, y: 20 }, { ...base, x: 10, y: 20, z: 0, locationOverride: { x: 'bad', y: 20, z: 0 } });
  assert.equal(malformed.conflicts[0].code, 'invalid_panel_location_override');
  const candidates = getPanelLocationOverrideCandidates({ current: { panels: [{ ...base, x: 10, y: 20, z: 0 }] }, lastApplied: { records: { panels: { 'DP-01': snapshot(base) } } } });
  assert.deepEqual(candidates[0], { panelId: 'DP-01', location: { x: 10, y: 20, z: 0 }, override: { x: 10, y: 20, z: 0 } });
  assert.deepEqual(getPanelLocationOverrideCandidates({ current: { panels: [{ ...base, x: 10, y: 20, z: 0, loadKva: 999 }] }, lastApplied: { records: { panels: { 'DP-01': snapshot(base) } } } }), []);
});

test('mismatched panel and equipment mirror cannot produce or apply a candidate', () => {
  const panel = { ...base, x: 10, y: 20, z: 0 };
  const mirror = { ...base, type: 'panel', x: 0, y: 0, z: 0, _designSynthesis: { ...marker, collection: 'equipment' } };
  const current = { panels: [panel], equipment: [mirror], loads: [], cables: [], trays: [], conduits: [] };
  const proposal = { panels: [{ ...panel, locationOverride: { x: 10, y: 20, z: 0 } }], equipment: [{ ...mirror, x: 10, y: 20, z: 0 }], loads: [], cables: [], trays: [], conduits: [] };
  const lastApplied = { records: { panels: { 'DP-01': snapshot(base) }, equipment: { 'DP-01': snapshot(base) } } };
  assert.deepEqual(getPanelLocationOverrideCandidates({ current, lastApplied })[0].panelId, 'DP-01');
  const result = reconcileDesignProposal({ current, proposal, lastApplied });
  assert.equal(result.ok, true, JSON.stringify(result.conflicts));
  const independentlyChanged = { ...mirror, x: 5 };
  const blocked = reconcileDesignProposal({ current: { ...current, equipment: [independentlyChanged] }, proposal, lastApplied });
  assert.ok(blocked.conflicts.some(item => item.code === 'panel_mirror_mismatch'));
});

test('ignores unrelated manual equipment and handles a missing mirror safely', () => {
  const panel = { ...base, x: 10, y: 20, z: 0 };
  const proposal = { panels: [{ ...panel, locationOverride: { x: 10, y: 20, z: 0 } }], equipment: [], loads: [], cables: [], trays: [], conduits: [] };
  const unrelated = { id: 'MANUAL-1', tag: 'MANUAL-1', x: 9, y: 9, z: 0 };
  const result = reconcileDesignProposal({ current: { panels: [panel], equipment: [unrelated], loads: [], cables: [], trays: [], conduits: [] }, proposal, lastApplied: { records: { panels: { 'DP-01': snapshot(base) } } } });
  assert.equal(result.conflicts.some(item => item.code === 'panel_mirror_mismatch'), false);
  assert.doesNotThrow(() => getPanelLocationOverrideCandidates({ current: { panels: [panel], equipment: [] }, lastApplied: { records: { panels: { 'DP-01': snapshot(base) }, equipment: { 'DP-01': snapshot(base) } } } }));
});

test('same-position mirror with unrelated edits does not produce a candidate', () => {
  const panel = { ...base, x: 10, y: 20, z: 0 };
  const mirror = { ...base, x: 10, y: 20, z: 0, loadKva: 999, _designSynthesis: { ...marker, collection: 'equipment' } };
  const candidates = getPanelLocationOverrideCandidates({ current: { panels: [panel], equipment: [mirror] }, lastApplied: { records: { panels: { 'DP-01': snapshot(base) }, equipment: { 'DP-01': snapshot(base) } } } });
  assert.deepEqual(candidates, []);
});
