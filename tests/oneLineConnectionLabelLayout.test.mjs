import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  boxesOverlap,
  resolveRenderedConnectionLabelCollisions,
  symmetricOffsets
} from '../src/one-line/connectionLabelLayout.mjs';

class FakeLabel {
  constructor({ x, y, width = 40, height = 12 }) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  }

  getAttribute(name) {
    return name === 'y' ? String(this.y) : null;
  }

  setAttribute(name, value) {
    if (name === 'y') this.y = Number(value);
  }

  getBoundingClientRect() {
    return {
      left: this.x,
      top: this.y,
      right: this.x + this.width,
      bottom: this.y + this.height,
      width: this.width,
      height: this.height
    };
  }
}

describe('One-Line rendered connection label layout', () => {
  it('builds deterministic symmetric search offsets', () => {
    assert.deepEqual(symmetricOffsets(10, 30), [0, -10, 10, -20, 20, -30, 30]);
  });

  it('treats touching edges as non-overlapping and honors padding', () => {
    const first = { left: 0, top: 0, right: 10, bottom: 10 };
    const second = { left: 10, top: 0, right: 20, bottom: 10 };
    assert.equal(boxesOverlap(first, second), false);
    assert.equal(boxesOverlap(first, second, 1), true);
  });

  it('moves connection labels away from rendered equipment and prior cable labels', () => {
    const obstacle = new FakeLabel({ x: 0, y: 0, width: 80, height: 16 });
    const first = new FakeLabel({ x: 10, y: 0 });
    const second = new FakeLabel({ x: 10, y: 0 });

    resolveRenderedConnectionLabelCollisions({
      connectionLabels: [first, second],
      obstacleLabels: [obstacle],
      padding: 0,
      offsets: [0, -18, 18, -36, 36]
    });

    assert.equal(first.y, -18);
    assert.equal(second.y, 18);
  });
});
