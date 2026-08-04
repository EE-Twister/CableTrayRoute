import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createBoxSpatialIndex } from '../src/one-line/renderPerformance.js';

describe('One-Line render performance helpers', () => {
  it('finds nearby label collisions without scanning distant boxes', () => {
    const near = { left: 0, top: 0, right: 40, bottom: 20 };
    const far = { left: 1000, top: 1000, right: 1040, bottom: 1020 };
    const index = createBoxSpatialIndex([near, far], 100);
    const checks = [];
    const overlaps = (candidate, existing) => {
      checks.push(existing);
      return !(candidate.right < existing.left
        || candidate.left > existing.right
        || candidate.bottom < existing.top
        || candidate.top > existing.bottom);
    };

    assert.equal(index.hasOverlap({ left: 35, top: 5, right: 60, bottom: 15 }, overlaps), true);
    assert.equal(checks.includes(near), true);
    assert.equal(checks.includes(far), false);
  });

  it('includes adjacent cells when collision padding crosses a boundary', () => {
    const index = createBoxSpatialIndex([{ left: 101, top: 0, right: 120, bottom: 20 }], 100);
    const candidate = { left: 80, top: 0, right: 90, bottom: 20 };
    const overlapsWithPadding = (box, existing) => box.right + 14 >= existing.left;

    assert.equal(index.hasOverlap(candidate, overlapsWithPadding, 14), true);
  });
});
