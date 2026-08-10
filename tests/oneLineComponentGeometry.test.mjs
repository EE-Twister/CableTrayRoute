import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyIndustrySymbolGeometry,
  categoryForType,
  getIndustrySymbolProfile,
  normalizePortsForCategory,
  normalizeRotation,
  visualSizeForRotation
} from '../src/one-line/componentGeometry.mjs';

describe('One-Line component geometry', () => {
  it('normalizes rotation and visual dimensions', () => {
    assert.equal(normalizeRotation(-90), 270);
    assert.deepEqual(visualSizeForRotation(80, 40, 90), { width: 40, height: 80 });
    assert.deepEqual(visualSizeForRotation(80, 40, 180), { width: 80, height: 40 });
  });

  it('classifies palette categories and industry symbol profiles', () => {
    assert.equal(categoryForType('breaker'), 'protection');
    assert.equal(categoryForType('generator'), 'sources');
    assert.equal(getIndustrySymbolProfile({ type: 'transformer', subtype: 'three_winding' }), 'transformer3');
    assert.equal(getIndustrySymbolProfile({ type: 'motor_load' }), 'motor');
  });

  it('converts legacy default transformer geometry while preserving center', () => {
    const transformer = { type: 'transformer', x: 100, y: 100, width: 80, height: 40 };
    assert.equal(applyIndustrySymbolGeometry(transformer), true);
    assert.deepEqual(
      { x: transformer.x, y: transformer.y, width: transformer.width, height: transformer.height },
      { x: 102, y: 78, width: 76, height: 84 }
    );
    assert.deepEqual(transformer.ports, [{ x: 38, y: 0 }, { x: 38, y: 84 }]);
  });

  it('creates evenly spaced bus ports and vertical feeder ports', () => {
    const bus = { type: 'bus', width: 100, height: 20 };
    applyIndustrySymbolGeometry(bus);
    assert.deepEqual(bus.ports.at(0), { x: 0, y: 0 });
    assert.deepEqual(bus.ports.at(-1), { x: 100, y: 20 });
    assert.deepEqual(
      normalizePortsForCategory('protection', [{ x: 0, y: 20 }, { x: 80, y: 20 }], 'breaker', '', 80, 40),
      [{ x: 40, y: 0 }, { x: 40, y: 40 }]
    );
  });
});
