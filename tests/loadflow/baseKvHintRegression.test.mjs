import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildLoadFlowModel } from '../../analysis/loadFlowModel.js';

function findBus(model, id) {
  return model.buses.find(bus => bus.id === id);
}

describe('load-flow base kV numeric hints', () => {
  it('preserves integer baseKV values as kV for bus modeling', () => {
    const oneLine = {
      activeSheet: 0,
      sheets: [{
        components: [
          { id: 'source', type: 'bus', busType: 'slack', baseKV: 13, connections: [{ target: 'load' }] },
          { id: 'load', type: 'bus', busType: 'PQ', baseKV: 13, connections: [{ target: 'source' }] }
        ],
        connections: []
      }]
    };

    const model = buildLoadFlowModel(oneLine);
    assert.equal(findBus(model, 'source')?.baseKV, 13);
    assert.equal(findBus(model, 'load')?.baseKV, 13);
  });
});
