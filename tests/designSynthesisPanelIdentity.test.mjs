import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDesignSynthesisPanelIdentityPlan } from '../analysis/designSynthesisPanelIdentity.mjs';

const groups = [
  { voltage: 480, loadIds: ['M01', 'M02'] },
  { voltage: 480, loadIds: ['M03', 'M04'] },
];

test('initial generation assigns deterministic DP identities and baseline', () => {
  const result = buildDesignSynthesisPanelIdentityPlan(groups);
  assert.equal(result.ok, true);
  assert.deepEqual(result.assignments, ['DP-01', 'DP-02']);
  assert.deepEqual(result.updatedBaseline, { panels: [{ id: 'DP-01', loadIds: ['M01', 'M02'] }, { id: 'DP-02', loadIds: ['M03', 'M04'] }], nextPanelNumber: 3 });
});

test('exact groups retain identities and new groups never reuse removed IDs', () => {
  const result = buildDesignSynthesisPanelIdentityPlan([
    { loadIds: ['M03', 'M04'] },
    { loadIds: ['M05'] },
  ], { panels: [{ id: 'DP-01', loadIds: ['M01', 'M02'] }, { id: 'DP-02', loadIds: ['M03', 'M04'] }], nextPanelNumber: 3 });
  assert.deepEqual(result.assignments, ['DP-02', 'DP-03']);
});

test('changed groups use largest overlap and do not give unrelated groups historical IDs', () => {
  const result = buildDesignSynthesisPanelIdentityPlan([
    { loadIds: ['M02', 'M03', 'M05'] },
    { loadIds: ['NEW'] },
  ], { panels: [{ id: 'DP-01', loadIds: ['M01', 'M02', 'M03'] }, { id: 'DP-02', loadIds: ['M04', 'M05'] }], nextPanelNumber: 3 });
  assert.deepEqual(result.assignments, ['DP-01', 'DP-03']);
});

test('baseline validation is strict and inputs remain unchanged', () => {
  const input = [{ loadIds: ['M01'] }];
  const before = structuredClone(input);
  const bad = buildDesignSynthesisPanelIdentityPlan(input, { panels: [{ id: 'DP-01', loadIds: ['M01'] }, { id: 'DP-01', loadIds: ['M02'] }], nextPanelNumber: 1, extra: true });
  assert.equal(bad.ok, false);
  assert.deepEqual(input, before);
  assert.ok(bad.issues.some(item => item.path === 'generationBaseline.extra'));
  assert.ok(bad.issues.some(item => item.path.endsWith('.id')));
});

test('rejects null baseline, unknown panel fields, aliases, and case-colliding load IDs', () => {
  assert.equal(buildDesignSynthesisPanelIdentityPlan(groups, null).ok, false);
  const bad = buildDesignSynthesisPanelIdentityPlan(groups, {
    panels: [
      { id: 'DP-01', loadIds: ['M01'], extra: true },
      { id: 'dp-1', loadIds: ['m02'] },
      { id: 'DP-01', loadIds: ['M03'] },
    ],
    nextPanelNumber: 4,
  });
  assert.equal(bad.ok, false);
  assert.ok(bad.issues.some(item => item.path.endsWith('.extra')));
  assert.ok(bad.issues.some(item => item.message.includes('Duplicate baseline panel id')));
});

test('rejects empty groups and unsafe allocation values', () => {
  assert.equal(buildDesignSynthesisPanelIdentityPlan([{ loadIds: [] }]).ok, false);
  assert.equal(buildDesignSynthesisPanelIdentityPlan([{ loadIds: ['M01'] }], { panels: [], nextPanelNumber: Number.MAX_SAFE_INTEGER + 1 }).ok, false);
  assert.equal(buildDesignSynthesisPanelIdentityPlan([{ loadIds: ['M01'] }], { panels: [], nextPanelNumber: 0 }).ok, false);
});

test('never returns an un-replayable high-water baseline', () => {
  const exact = buildDesignSynthesisPanelIdentityPlan([{ loadIds: ['M01'] }], { panels: [{ id: 'DP-01', loadIds: ['M01'] }], nextPanelNumber: Number.MAX_SAFE_INTEGER });
  assert.equal(exact.ok, true);
  assert.equal(buildDesignSynthesisPanelIdentityPlan([], exact.updatedBaseline).ok, true);
  const overflow = buildDesignSynthesisPanelIdentityPlan([{ loadIds: ['M02'] }], { panels: [], nextPanelNumber: Number.MAX_SAFE_INTEGER });
  assert.equal(overflow.ok, false);
});
