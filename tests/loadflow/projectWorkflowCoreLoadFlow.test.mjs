import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { buildLoadFlowModel } from '../../analysis/loadFlowModel.js';
import { runLoadFlow } from '../../analysis/loadFlow.js';

const sample = JSON.parse(await readFile(
  new URL('../../samples/project-workflow-core.json', import.meta.url),
  'utf8'
));

describe('Project Workflow Core load flow', () => {
  it('derives source and fuse-fed branch topology from the project One-Line', () => {
    const model = buildLoadFlowModel(sample.oneLine);

    assert.equal(model.buses.length, 3);
    assert.equal(model.buses.filter(bus => bus.busType === 'slack').length, 1);
    assert.deepEqual(
      model.branches.map(branch => branch.id).sort(),
      ['comp-fuse-mcc-101', 'comp-fuse-mcc-102']
    );

    const result = runLoadFlow(model, { baseMVA: 100, balanced: true });
    assert.equal(result.converged, true);
    assert.equal(result.buses.length, 3);
    assert.ok(result.lines.length >= 2);
  });
});
