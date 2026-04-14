import assert from 'assert';
import { estimateRodLength, normalizePreviewGeometry } from '../src/groundgridPreviewGeometry.js';

function describe(name, fn) {
  console.log(name);
  fn();
}

function it(name, fn) {
  try {
    fn();
    console.log('  \u2713', name);
  } catch (err) {
    console.error('  \u2717', name, err.message || err);
    process.exitCode = 1;
  }
}

describe('groundgrid preview geometry helpers', () => {
  it('normalizes invalid dimensions and keeps a minimum conductor count', () => {
    const normalized = normalizePreviewGeometry({
      gridLxInput: -10,
      gridLyInput: Number.NaN,
      burialDepthInput: 0,
      hsInput: -1,
      conductorInput: Number.NaN,
      nxInput: 1,
      nyInput: 0,
      hasRods: false,
    });

    assert.strictEqual(normalized.gridLx, 1);
    assert.strictEqual(normalized.gridLy, 1);
    assert.strictEqual(normalized.burialDepth, 1);
    assert.strictEqual(normalized.hs, 0);
    assert.strictEqual(normalized.conductorDiameter, 0);
    assert.strictEqual(normalized.nx, 2);
    assert.strictEqual(normalized.ny, 2);
    assert.strictEqual(normalized.spacingX, 1);
    assert.strictEqual(normalized.spacingY, 1);
    assert.strictEqual(normalized.rodLength, 0);
  });

  it('estimates rod length from burial depth and max grid span when enabled', () => {
    const rodLength = estimateRodLength({
      hasRods: true,
      burialDepth: 1.5,
      gridLx: 180,
      gridLy: 120,
    });

    assert.ok(Math.abs(rodLength - 6.9) < 1e-9, `Expected ~6.9, got ${rodLength}`);
  });

  it('returns zero rod length when rods are disabled', () => {
    const rodLength = estimateRodLength({
      hasRods: false,
      burialDepth: 1.5,
      gridLx: 180,
      gridLy: 120,
    });

    assert.strictEqual(rodLength, 0);
  });
});
