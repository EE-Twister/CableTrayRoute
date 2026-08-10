import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeOrthogonalPath,
  connectionLabelPosition,
  routeConnection,
  routeMidpoint
} from '../src/one-line/connectionRouting.mjs';

const dependencies = {
  portPosition: component => component.point,
  portDirection: component => component.direction,
  isBusComponent: component => component.type === 'bus',
  routeCandidates: () => []
};

describe('One-Line connection routing', () => {
  it('builds horizontal- and vertical-dominant orthogonal paths', () => {
    assert.deepEqual(computeOrthogonalPath({ x: 0, y: 0 }, { x: 100, y: 40 }), [
      { x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 40 }, { x: 100, y: 40 }
    ]);
    assert.deepEqual(computeOrthogonalPath({ x: 0, y: 0 }, { x: 20, y: 100 }), [
      { x: 0, y: 0 }, { x: 0, y: 50 }, { x: 20, y: 50 }, { x: 20, y: 100 }
    ]);
  });

  it('routes a feeder directly to the projected bus tap', () => {
    const connection = {};
    const path = routeConnection(
      { type: 'bus', x: 0, y: 100, width: 200, height: 20, point: { x: 0, y: 110 } },
      { point: { x: 150, y: 20 }, direction: 'bottom' },
      connection,
      dependencies
    );
    assert.deepEqual(path, [{ x: 150, y: 110 }, { x: 150, y: 20 }]);
    assert.equal(connection.dir, undefined);
  });

  it('preserves manually positioned route handles', () => {
    const connection = { dir: 'h', mid: 70 };
    const path = routeConnection(
      { point: { x: 0, y: 0 }, direction: 'right' },
      { point: { x: 120, y: 80 }, direction: 'left' },
      connection,
      dependencies
    );
    assert.deepEqual(path, [
      { x: 0, y: 0 }, { x: 70, y: 0 }, { x: 70, y: 80 }, { x: 120, y: 80 }
    ]);
  });

  it('adds conductor terminal stubs using injected component semantics', () => {
    const path = routeConnection(
      { type: 'cable', point: { x: 0, y: 0 }, direction: 'right' },
      { type: 'cable', point: { x: 100, y: 0 }, direction: 'left' },
      {},
      { ...dependencies, isConductorSegmentComponent: component => component.type === 'cable' }
    );
    assert.deepEqual(path[0], { x: 0, y: 0 });
    assert.deepEqual(path[1], { x: 18, y: 0 });
    assert.deepEqual(path.at(-2), { x: 82, y: 0 });
    assert.deepEqual(path.at(-1), { x: 100, y: 0 });
  });

  it('computes length-weighted midpoint and label orientation', () => {
    const points = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 20 }];
    assert.deepEqual(routeMidpoint(points), { x: 60, y: 0 });
    assert.deepEqual(connectionLabelPosition(points), { x: 50, y: -11, textAnchor: 'middle' });
  });
});
