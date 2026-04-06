/**
 * Pure utility functions for TCC chart SVG/PNG export.
 * Separated from tcc.js so they can be unit-tested in Node.js without browser APIs.
 */

/** CSS rules inlined into exported SVGs to make annotation rendering self-contained.
 *  Annotation elements use class-based styles from panel-schedule.css, which won't
 *  travel with a standalone SVG file. */
export const EXPORT_INLINE_STYLES = `
  .annotation-layer .annotation-anchor { fill: #fff; stroke: #444; stroke-width: 1; }
  .annotation-layer .annotation-label-bg { fill: #fff; stroke: #444; stroke-width: 1; rx: 3; }
  .annotation-layer .annotation-text { font-size: 12px; fill: #111; font-family: Inter, sans-serif; }
  .annotation-layer .annotation-connector { stroke: #444; stroke-width: 1; fill: none; pointer-events: none; }
`.trim();

/** Pixel-density scale applied when rasterising the SVG to PNG (2× ≈ 192 dpi). */
export const EXPORT_SCALE = 2;

export const SVG_DOWNLOAD_FILENAME = 'tcc-chart.svg';
export const PNG_DOWNLOAD_FILENAME = 'tcc-chart.png';

/**
 * Wrap a serialized SVG string with a standard XML declaration so the file
 * is a conformant standalone SVG 1.1 document.
 * @param {string} serialized - output of XMLSerializer.serializeToString()
 * @returns {string}
 */
export function buildSvgDownloadMarkup(serialized) {
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + serialized;
}

/**
 * Compute the pixel dimensions of the canvas used for PNG export.
 * @param {number} svgWidth  - intrinsic width of the SVG element (px)
 * @param {number} svgHeight - intrinsic height of the SVG element (px)
 * @param {number} [scale]   - pixel-density multiplier (default: EXPORT_SCALE)
 * @returns {{ canvasWidth: number, canvasHeight: number }}
 */
export function computeCanvasDimensions(svgWidth, svgHeight, scale = EXPORT_SCALE) {
  return {
    canvasWidth: svgWidth * scale,
    canvasHeight: svgHeight * scale,
  };
}
