import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CSS_LAYER_ORDER,
  CSS_LINE_BUDGETS,
  countCssLines,
  inspectCssArchitecture
} from '../scripts/checkCssArchitecture.mjs';

describe('CSS architecture', () => {
  it('enforces ordered layers, shared tokens, and ratcheted stylesheet budgets', async () => {
    const result = await inspectCssArchitecture();
    assert.deepEqual(result.failures, []);
    assert.ok(result.localImportCount >= 25);
    Object.entries(CSS_LINE_BUDGETS).forEach(([relativePath, budget]) => {
      assert.ok(result.measurements[relativePath].lines <= budget);
    });
  });

  it('keeps cascade layers ordered from foundations to overrides', () => {
    assert.deepEqual(CSS_LAYER_ORDER, [
      'tokens',
      'base',
      'layout',
      'components',
      'pages',
      'utilities',
      'overrides'
    ]);
    assert.equal(countCssLines('one\ntwo\n'), 2);
  });
});
