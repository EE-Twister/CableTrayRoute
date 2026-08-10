import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  chooseDatablockPlacement,
  chooseEngineeringDatablockPlacement,
  createDatablockLayout,
  truncateDatablockLine
} from '../src/one-line/datablockLayout.mjs';

const getComponentBounds = component => ({
  left: component.x,
  top: component.y,
  right: component.x + component.width,
  bottom: component.y + component.height
});

describe('One-Line datablock layout', () => {
  it('builds occupied geometry and reserves additional labels', () => {
    const layout = createDatablockLayout([
      { x: 100, y: 100, width: 80, height: 40 },
      { type: 'dimension', x: 0, y: 0, width: 1000, height: 1000 }
    ], { getComponentBounds });
    assert.deepEqual(layout.content, { minX: 100, minY: 100, maxX: 180, maxY: 140 });
    assert.equal(layout.occupied.length, 1);
    layout.reserve({ x: 200, y: 100, width: 40, height: 20 });
    assert.equal(layout.occupied.length, 2);
  });

  it('uses fallback viewport geometry for an empty diagram', () => {
    const layout = createDatablockLayout([], {
      getComponentBounds,
      fallbackBounds: { minX: 10, minY: 20, width: 500, height: 300 }
    });
    assert.deepEqual(layout.content, { minX: 10, minY: 20, maxX: 510, maxY: 320 });
  });

  it('places generic and engineering datablocks outside component bounds', () => {
    const bounds = { left: 100, top: 100, right: 180, bottom: 140 };
    const layout = { content: { minX: 100, minY: 100, maxX: 180, maxY: 140 }, occupied: [] };
    assert.deepEqual(chooseDatablockPlacement(bounds, 60, 20, layout), {
      side: 'right', x: 194, y: 100
    });
    assert.deepEqual(chooseEngineeringDatablockPlacement({}, bounds, 60, 20, layout), {
      side: 'bottom', x: 110, y: 150
    });
  });

  it('truncates long lines without exceeding the configured limit', () => {
    assert.equal(truncateDatablockLine('Short', 10), 'Short');
    assert.equal(truncateDatablockLine('This is a very long data block line', 16), 'This is a ver...');
  });
});
