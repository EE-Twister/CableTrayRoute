import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRouteBreakdown } from '../src/routing/routeBreakdown.mjs';

describe('route breakdown', () => {
  it('derives display rows lazily from retained route segments', () => {
    const segment = { type: 'tray', tray_id: 'TR-1', start: [0, 1, 2], end: [3, 4, 5], length: 6.25 };
    const rows = createRouteBreakdown({ route_segments: [segment] }, point => point.join(','), value => value.type);

    assert.equal(rows.length, 1);
    assert.equal(rows[0].tray_id, 'TR-1');
    assert.equal(rows[0].length, '6.25');
    assert.equal(rows[0].sourceSegment, segment);
  });

  it('preserves legacy stored breakdowns', () => {
    const breakdown = [{ segment: 1, tray_id: 'TR-2' }];
    assert.equal(createRouteBreakdown({ breakdown }, String, String), breakdown);
  });
});
