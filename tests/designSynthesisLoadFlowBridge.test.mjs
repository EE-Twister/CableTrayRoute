import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildDesignSynthesisOneLine } from '../analysis/designSynthesisOneLine.mjs';
import { buildLoadFlowModel } from '../analysis/loadFlowModel.js';
import { runLoadFlow } from '../analysis/loadFlow.js';

test('design-synthesis one-line exposes one explicit branch per cable and preserves sourced impedance', () => {
  const oneLine = buildDesignSynthesisOneLine({
    supply: { id: 'S', tag: 'S', voltage: 480, phases: 3 },
    loads: [{ id: 'L', tag: 'L', kw: 10, voltage: 480, phases: 3, powerFactor: 0.9 }],
    cables: [{ id: 'C', from: 'S', to: 'L', conductor_size: '#8 AWG', ampacityA: 80, lengthFt: 150 }],
  });
  oneLine.sheets[0].connections[0].rating = 1;
  const model = buildLoadFlowModel(oneLine);
  assert.equal(model.buses.length, 2);
  assert.equal(model.branches.length, 1);
  assert.equal(model.branches[0].rating, 80);
  // Independent value from the pinned Southwire row: 0.810 ohm/kft at 75 C.
  assert.deepEqual(model.branches[0].impedance, { r: 0.810 * 150 / 1000, x: 0.052 * 150 / 1000 });
  const result = runLoadFlow(model, { baseMVA: 1, balanced: true, maxIterations: 60 });
  assert.equal(result.buses.length, 2);
  assert.equal(result.summary.totalLoadKW, 10);
  assert.ok(result.summary.totalLossKW > 0);
});
