import assert from 'node:assert/strict';
import test from 'node:test';
import { exportLoadFlowResult } from '../studies/loadFlow.js';

test('computed but unsaved Load Flow results cannot be exported', () => {
  const result = {
    persisted: false,
    converged: true,
    buses: [{ id: 'SOURCE', Vm: 1, Va: 0 }],
  };
  assert.equal(exportLoadFlowResult(result), false);
});
