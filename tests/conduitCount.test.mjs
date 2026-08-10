import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildRoutingRacewayData,
  formatConduitCountText
} from '../src/routing/routingProjectAdapter.mjs';

describe('routing conduit count', () => {
  it('reflects the actual number of conduit raceways', () => {
    const result = buildRoutingRacewayData({
      manualTrays: [
        { raceway_type: 'conduit' },
        { raceway_type: 'ductbank' },
        { raceway_type: 'conduit' }
      ]
    });

    assert.equal(result.conduitCount, 2);
    assert.equal(formatConduitCountText(result.conduitCount, false), 'Conduits added: 2');
  });

  it('counts conduits nested under stored ductbank data', () => {
    const result = buildRoutingRacewayData({
      ductbankData: {
        ductbanks: [{
          tag: 'DB1',
          outline: [[0, 0, 0], [1, 1, 1]],
          conduits: [
            { conduit_id: 'C1', path: [[0, 0, 0], [1, 0, 0]], diameter: 1 },
            { conduit_id: 'C2', path: [[0, 0, 0], [0, 1, 0]], diameter: 1 }
          ]
        }]
      }
    });

    assert.equal(result.conduitCount, 2);
    assert.equal(result.hasSchedule, true);
    assert.equal(formatConduitCountText(result.conduitCount, result.hasSchedule), 'Conduits added: 2');
  });

  it('explains when scheduled conduits have no valid geometry', () => {
    assert.equal(
      formatConduitCountText(0, true),
      'Conduits added: 0 (No valid conduits found; check geometry or IDs)'
    );
  });
});
