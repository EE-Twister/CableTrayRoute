import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildRoutingRacewayData,
  normalizeDuctbankSchedule
} from '../src/routing/routingProjectAdapter.mjs';

describe('routing project adapter warnings', () => {
  it('reports scheduled ductbanks that have no conduits', () => {
    const result = normalizeDuctbankSchedule([{
      tag: 'DB1',
      start_x: 0,
      start_y: 0,
      start_z: 0,
      end_x: 1,
      end_y: 0,
      end_z: 0
    }], []);

    assert.deepEqual(result.ductbanksWithoutConduits, ['DB1']);
  });

  it('warns and skips ductbanks lacking geometry', () => {
    const warnings = [];
    const result = buildRoutingRacewayData({
      ductbankData: { ductbanks: [{ id: 'DB-missing' }] },
      warningLog: message => warnings.push(message)
    });

    assert.deepEqual(result.trayData, []);
    assert.deepEqual(result.geometryWarnings.ductbanks, ['DB-missing']);
    assert.equal(warnings.length, 1);
  });

  it('warns and skips conduits without paths', () => {
    const warnings = [];
    const result = buildRoutingRacewayData({
      ductbankData: {
        ductbanks: [{
          id: 'DB1',
          start_x: 0,
          start_y: 0,
          start_z: 0,
          end_x: 1,
          end_y: 0,
          end_z: 0,
          width: 12,
          height: 12,
          conduits: [{ conduit_id: 'C1', type: 'RMC', trade_size: '1' }]
        }]
      },
      conduitSpecs: { RMC: { 1: 0.887 } },
      warningLog: message => warnings.push(message)
    });

    assert.deepEqual(result.trayData, []);
    assert.deepEqual(result.geometryWarnings.conduits, ['C1']);
    assert.equal(warnings.length, 1);
  });
});
