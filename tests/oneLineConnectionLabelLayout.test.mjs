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

// Mimics an SVG text element inside a zoomed canvas: user units map to screen pixels by `scale`.
class ScaledLabel extends FakeLabel {
  constructor({ scale, withMatrix, ...rest }) {
    super(rest);
    this.scale = scale;
    this.withMatrix = withMatrix;
    this.writes = 0;
    if (!withMatrix) this.getScreenCTM = undefined;
  }

  setAttribute(name, value) {
    if (name === 'y') this.writes += 1;
    super.setAttribute(name, value);
  }

  getScreenCTM() {
    return { a: this.scale, b: 0, c: 0, d: this.scale };
  }

  getBoundingClientRect() {
    return {
      left: this.x * this.scale,
      top: this.y * this.scale,
      right: (this.x + this.width) * this.scale,
      bottom: (this.y + this.height) * this.scale,
      width: this.width * this.scale,
      height: this.height * this.scale
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
  it('places labels identically with and without a screen matrix at any zoom', () => {
    const run = (withMatrix, scale) => {
      const obstacles = [new ScaledLabel({ x: 0, y: 0, width: 200, height: 16, scale, withMatrix })];
      const labels = Array.from({ length: 6 }, (_, i) => new ScaledLabel({ x: 10 + i * 3, y: 0, scale, withMatrix }));
      resolveRenderedConnectionLabelCollisions({
        connectionLabels: labels,
        obstacleLabels: obstacles,
        padding: 2,
        offsets: symmetricOffsets(18, 180)
      });
      return labels.map(label => label.y);
    };
    for (const scale of [1, 0.5, 2.5]) {
      assert.deepEqual(run(true, scale), run(false, scale), `scale ${scale}`);
    }
  });

  it('writes each label position at most once when the screen matrix is available', () => {
    const labels = Array.from({ length: 5 }, () => new ScaledLabel({ x: 10, y: 0, scale: 1, withMatrix: true }));
    resolveRenderedConnectionLabelCollisions({
      connectionLabels: labels,
      obstacleLabels: [new ScaledLabel({ x: 0, y: 0, width: 200, height: 16, scale: 1, withMatrix: true })],
      padding: 0,
      offsets: symmetricOffsets(18, 180)
    });
    labels.forEach(label => assert.ok(label.writes <= 1, `wrote ${label.writes} times`));
  });

  it('scales to a thousand labels without comparing every pair', () => {
    const labels = Array.from({ length: 1000 }, (_, i) => new ScaledLabel({
      x: (i % 16) * 100,
      y: Math.floor(i / 16) * 40,
      scale: 1,
      withMatrix: true
    }));
    const started = Date.now();
    resolveRenderedConnectionLabelCollisions({ connectionLabels: labels, obstacleLabels: [], padding: 2 });
    assert.ok(Date.now() - started < 1000);
  });
});
