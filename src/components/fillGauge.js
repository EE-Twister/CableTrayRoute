/**
 * fillGauge.js — Reusable semi-circular SVG fill gauge component.
 *
 * Usage:
 *   import { createFillGauge } from './src/components/fillGauge.js';
 *   const gauge = createFillGauge('my-container-id', { label: 'Tray Fill %' });
 *   gauge.update(35.2);
 */

const DEFAULT_ZONES = [
  { limit: 40,  color: '#28a745' }, // green  — safe (0–40%)
  { limit: 50,  color: '#ffc107' }, // yellow — caution (40–50%)
  { limit: 200, color: '#dc3545' }, // red    — over limit (50%+)
];

/**
 * @param {string} containerId - ID of the DOM element to render into.
 * @param {object} [options]
 * @param {number} [options.width=200]         - SVG viewBox width in px.
 * @param {number} [options.strokeWidth=18]    - Arc stroke width.
 * @param {string} [options.label='Fill %']    - Label shown below numeric value.
 * @param {Array}  [options.zones]             - Color zone thresholds.
 * @returns {{ update: function(number): void }}
 */
export function createFillGauge(containerId, options = {}) {
  const {
    width = 200,
    strokeWidth = 18,
    label = 'Fill %',
    zones = DEFAULT_ZONES,
  } = options;

  const height = Math.round(width * 0.62);
  const cx = width / 2;
  const cy = height - strokeWidth / 2 - 2; // arc center near bottom of viewport
  const r  = cx - strokeWidth;             // radius leaves room for stroke

  const container = document.getElementById(containerId);
  if (!container) return { update: () => {} };

  const svgNS = 'http://www.w3.org/2000/svg';

  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('role', 'meter');
  svg.setAttribute('aria-label', `${label} gauge`);
  svg.setAttribute('aria-valuemin', '0');
  svg.setAttribute('aria-valuemax', '100');
  svg.setAttribute('aria-valuenow', '0');

  // ── Track: grey full semicircle ───────────────────────────────────────────
  const track = document.createElementNS(svgNS, 'path');
  track.setAttribute('fill', 'none');
  track.setAttribute('stroke', 'var(--border-color, #cbd5e1)');
  track.setAttribute('stroke-width', String(strokeWidth));
  track.setAttribute('stroke-linecap', 'round');
  track.setAttribute('d', semicircleArc(cx, cy, r));

  // ── Fill arc: updates on each .update() call ──────────────────────────────
  const fillArc = document.createElementNS(svgNS, 'path');
  fillArc.setAttribute('fill', 'none');
  fillArc.setAttribute('stroke-width', String(strokeWidth));
  fillArc.setAttribute('stroke-linecap', 'round');
  fillArc.setAttribute('stroke', zones[0].color);
  // Start collapsed (zero-length arc at leftmost point)
  fillArc.setAttribute('d', `M ${cx - r} ${cy} L ${cx - r} ${cy}`);

  // ── Zone tick marks at 40 % and 50 % ─────────────────────────────────────
  const ticks = [40, 50].map(pct => {
    const { x, y } = arcPoint(cx, cy, r, pct);
    const inner = arcPoint(cx, cy, r - strokeWidth * 0.65, pct);
    const outer = arcPoint(cx, cy, r + strokeWidth * 0.65, pct);
    const line = document.createElementNS(svgNS, 'line');
    line.setAttribute('x1', String(inner.x));
    line.setAttribute('y1', String(inner.y));
    line.setAttribute('x2', String(outer.x));
    line.setAttribute('y2', String(outer.y));
    line.setAttribute('stroke', 'var(--text-color, #1e293b)');
    line.setAttribute('stroke-width', '2');
    line.setAttribute('stroke-linecap', 'round');
    return line;
  });

  // ── Numeric value text ────────────────────────────────────────────────────
  const valueText = document.createElementNS(svgNS, 'text');
  valueText.setAttribute('x', String(cx));
  valueText.setAttribute('y', String(cy - 4));
  valueText.setAttribute('text-anchor', 'middle');
  valueText.setAttribute('dominant-baseline', 'auto');
  valueText.setAttribute('font-size', String(Math.round(width * 0.15)));
  valueText.setAttribute('font-weight', 'bold');
  valueText.setAttribute('fill', 'var(--text-color, #1e293b)');
  valueText.textContent = '—';

  // ── Label text ────────────────────────────────────────────────────────────
  const labelText = document.createElementNS(svgNS, 'text');
  labelText.setAttribute('x', String(cx));
  labelText.setAttribute('y', String(height - 2));
  labelText.setAttribute('text-anchor', 'middle');
  labelText.setAttribute('font-size', String(Math.round(width * 0.088)));
  labelText.setAttribute('fill', 'var(--text-muted, #64748b)');
  labelText.textContent = label;

  svg.appendChild(track);
  svg.appendChild(fillArc);
  ticks.forEach(t => svg.appendChild(t));
  svg.appendChild(valueText);
  svg.appendChild(labelText);
  container.appendChild(svg);

  // ── Public API ────────────────────────────────────────────────────────────
  function update(percentage) {
    const pct = Math.max(0, percentage);
    const color = getZoneColor(pct, zones);

    if (pct <= 0) {
      fillArc.setAttribute('d', `M ${cx - r} ${cy} L ${cx - r} ${cy}`);
    } else if (pct >= 100) {
      // Draw full semicircle for 100 %+
      fillArc.setAttribute('d', semicircleArc(cx, cy, r));
    } else {
      const { x: xe, y: ye } = arcPoint(cx, cy, r, pct);
      fillArc.setAttribute('d', `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${xe} ${ye}`);
    }

    fillArc.setAttribute('stroke', color);
    valueText.textContent = `${percentage.toFixed(1)}%`;
    valueText.setAttribute('fill', color);
    svg.setAttribute('aria-valuenow', percentage.toFixed(1));
  }

  return { update };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Convert a fill percentage (0–100) to an (x, y) point on the gauge arc.
 * 0 % → leftmost point, 100 % → rightmost point, 50 % → top.
 */
function arcPoint(cx, cy, r, pct) {
  // Map 0% → 180°, 100% → 0° in standard trig (counter-clockwise from right)
  const theta = Math.PI - (pct / 100) * Math.PI;
  return {
    x: cx + r * Math.cos(theta),
    y: cy - r * Math.sin(theta), // SVG Y is inverted
  };
}

/** Full semicircle from left (180°) to right (0°) through the top. */
function semicircleArc(cx, cy, r) {
  return `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
}

function getZoneColor(pct, zones) {
  for (const zone of zones) {
    if (pct <= zone.limit) return zone.color;
  }
  return zones[zones.length - 1].color;
}
