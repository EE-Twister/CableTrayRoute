/**
 * Unit tests for analysis/chartExportUtils.mjs
 * Run with: node tests/tcc/chartExport.test.mjs
 */

import assert from 'assert';
import {
  EXPORT_INLINE_STYLES,
  EXPORT_SCALE,
  SVG_DOWNLOAD_FILENAME,
  PNG_DOWNLOAD_FILENAME,
  buildSvgDownloadMarkup,
  computeCanvasDimensions,
} from '../../analysis/chartExportUtils.mjs';

function describe(name, fn) { console.log(name); fn(); }
function it(name, fn) {
  try { fn(); console.log('  \u2713', name); }
  catch (err) { console.log('  \u2717', name); console.error(err); process.exitCode = 1; }
}

// ──────────────────────────────────────────────────────────────────────────────

describe('EXPORT_INLINE_STYLES', () => {
  it('is a non-empty string', () => {
    assert.strictEqual(typeof EXPORT_INLINE_STYLES, 'string');
    assert.ok(EXPORT_INLINE_STYLES.length > 0);
  });

  it('includes annotation-anchor rule', () => {
    assert.ok(EXPORT_INLINE_STYLES.includes('.annotation-layer .annotation-anchor'),
      'missing annotation-anchor selector');
  });

  it('includes annotation-label-bg rule', () => {
    assert.ok(EXPORT_INLINE_STYLES.includes('.annotation-layer .annotation-label-bg'),
      'missing annotation-label-bg selector');
  });

  it('includes annotation-text rule', () => {
    assert.ok(EXPORT_INLINE_STYLES.includes('.annotation-layer .annotation-text'),
      'missing annotation-text selector');
  });

  it('includes annotation-connector rule', () => {
    assert.ok(EXPORT_INLINE_STYLES.includes('.annotation-layer .annotation-connector'),
      'missing annotation-connector selector');
  });
});

// ──────────────────────────────────────────────────────────────────────────────

describe('EXPORT_SCALE', () => {
  it('is the number 2', () => {
    assert.strictEqual(EXPORT_SCALE, 2);
  });
});

// ──────────────────────────────────────────────────────────────────────────────

describe('SVG_DOWNLOAD_FILENAME / PNG_DOWNLOAD_FILENAME', () => {
  it('SVG filename ends with .svg', () => {
    assert.ok(SVG_DOWNLOAD_FILENAME.endsWith('.svg'),
      `Expected .svg extension, got: ${SVG_DOWNLOAD_FILENAME}`);
  });

  it('PNG filename ends with .png', () => {
    assert.ok(PNG_DOWNLOAD_FILENAME.endsWith('.png'),
      `Expected .png extension, got: ${PNG_DOWNLOAD_FILENAME}`);
  });
});

// ──────────────────────────────────────────────────────────────────────────────

describe('buildSvgDownloadMarkup', () => {
  const minimalSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"></svg>';

  it('prepends an XML declaration', () => {
    const result = buildSvgDownloadMarkup(minimalSvg);
    assert.ok(result.startsWith('<?xml version="1.0" encoding="UTF-8"?>'),
      'Expected XML declaration at start');
  });

  it('preserves the original SVG markup', () => {
    const result = buildSvgDownloadMarkup(minimalSvg);
    assert.ok(result.includes(minimalSvg), 'Original SVG content should be preserved');
  });

  it('separates declaration from SVG with a newline', () => {
    const result = buildSvgDownloadMarkup(minimalSvg);
    const lines = result.split('\n');
    assert.ok(lines[0].startsWith('<?xml'), 'First line should be XML declaration');
    assert.ok(lines[1].startsWith('<svg'), 'Second line should start with SVG');
  });

  it('handles an empty string input without throwing', () => {
    const result = buildSvgDownloadMarkup('');
    assert.strictEqual(typeof result, 'string');
    assert.ok(result.includes('<?xml'));
  });
});

// ──────────────────────────────────────────────────────────────────────────────

describe('computeCanvasDimensions', () => {
  it('returns 2× dimensions for default 800×600 SVG', () => {
    const { canvasWidth, canvasHeight } = computeCanvasDimensions(800, 600);
    assert.strictEqual(canvasWidth, 1600);
    assert.strictEqual(canvasHeight, 1200);
  });

  it('applies default EXPORT_SCALE (2) when no scale argument is given', () => {
    const { canvasWidth, canvasHeight } = computeCanvasDimensions(400, 300);
    assert.strictEqual(canvasWidth, 800);
    assert.strictEqual(canvasHeight, 600);
  });

  it('accepts a custom scale override', () => {
    const { canvasWidth, canvasHeight } = computeCanvasDimensions(800, 600, 3);
    assert.strictEqual(canvasWidth, 2400);
    assert.strictEqual(canvasHeight, 1800);
  });

  it('returns integer-compatible values for standard SVG sizes', () => {
    const { canvasWidth, canvasHeight } = computeCanvasDimensions(1024, 768);
    assert.strictEqual(canvasWidth % 1, 0, 'canvasWidth should be an integer');
    assert.strictEqual(canvasHeight % 1, 0, 'canvasHeight should be an integer');
  });
});
