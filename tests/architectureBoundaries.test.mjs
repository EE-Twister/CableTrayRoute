import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ENTRYPOINT_BUDGETS,
  REQUIRED_BOUNDARIES,
  countSourceLines,
  inspectArchitectureBoundaries
} from '../scripts/checkArchitectureBoundaries.mjs';
import { createRoutingState } from '../src/routing/routingState.mjs';

describe('architecture boundaries', () => {
  it('keeps decomposed entrypoints within their ratcheted size budgets', async () => {
    const result = await inspectArchitectureBoundaries();
    assert.deepEqual(result.failures, []);
    Object.entries(ENTRYPOINT_BUDGETS).forEach(([relativePath, budget]) => {
      assert.ok(result.measurements[relativePath].lines <= budget);
    });
  });

  it('requires explicit production-module seams for every large entrypoint', () => {
    assert.deepEqual(Object.keys(REQUIRED_BOUNDARIES).sort(), [
      'analysis/tcc.js',
      'app.mjs',
      'cableschedule.js',
      'cathodicprotection.js',
      'ductbankroute.js',
      'oneline.js',
      'site.js',
      'src/panelSchedule.js'
    ]);
    Object.values(REQUIRED_BOUNDARIES).forEach(imports => assert.ok(imports.length >= 2));
  });

  it('counts source lines consistently and creates isolated routing state', () => {
    assert.equal(countSourceLines('one\ntwo\n'), 2);
    const first = createRoutingState();
    const second = createRoutingState();
    first.cableList.push({ id: 'C-1' });
    first.expandedPullGroupIds.add('group-1');
    assert.deepEqual(second.cableList, []);
    assert.equal(second.expandedPullGroupIds.size, 0);
  });
});
