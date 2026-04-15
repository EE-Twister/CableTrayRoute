import assert from 'assert';
import { deriveRodLayout, estimateRodLength, normalizePreviewGeometry } from '../src/groundgridPreviewGeometry.js';

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
    assert.strictEqual(normalized.rodSpacingX, 0);
    assert.strictEqual(normalized.rodSpacingY, 0);
    assert.strictEqual(normalized.rodLayout.count, 0);
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

  it('builds intermediate rod layout snapped to conductor intersections', () => {
    const rodLayout = deriveRodLayout({
      hasRods: true,
      nx: 7,
      ny: 7,
      spacingX: 10,
      spacingY: 10,
      rodSpacingX: 20,
      rodSpacingY: 30,
    });

    assert.strictEqual(rodLayout.count, 12);
    assert.strictEqual(rodLayout.intermediateCount, 8);
    assert.strictEqual(rodLayout.axisSpacingX, 20);
    assert.strictEqual(rodLayout.axisSpacingY, 30);
  });

  it('uses corner rods only when intermediate spacing is not provided', () => {
    const normalized = normalizePreviewGeometry({
      gridLxInput: 120,
      gridLyInput: 80,
      burialDepthInput: 1.5,
      hsInput: 0,
      conductorInput: 0.5,
      nxInput: 7,
      nyInput: 5,
      hasRods: true,
      rodSpacingXInput: 0,
      rodSpacingYInput: 0,
    });

    assert.strictEqual(normalized.rodLayout.count, 4);
    assert.strictEqual(normalized.rodLayout.intermediateCount, 0);
  });

  it('keeps corner rods and fills the cross-axis when interstitial spacing is set on one axis', () => {
    const rodLayout = deriveRodLayout({
      hasRods: true,
      nx: 6,
      ny: 6,
      spacingX: 10,
      spacingY: 10,
      rodSpacingX: 20,
      rodSpacingY: 0,
    });

    assert.strictEqual(rodLayout.count, 24);
    assert.strictEqual(rodLayout.intermediateCount, 20);
    assert.ok(rodLayout.points.some(point => point.xIndex === 2 && point.yIndex === 3));
    assert.ok(rodLayout.points.some(point => point.xIndex === 4 && point.yIndex === 1));
  });
});
