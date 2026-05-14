const DEFAULT_WIDTH = 860;
const DEFAULT_HEIGHT = 430;
const FLOOR_GRID_STEPS = 5;

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizePoint(point) {
  if (!point || typeof point !== 'object') return null;
  return {
    xFt: finite(point.xFt ?? point.x ?? point[0]),
    yFt: finite(point.yFt ?? point.y ?? point[1]),
    zFt: finite(point.zFt ?? point.z ?? point[2])
  };
}

function collectPoints(scene) {
  const points = [];
  (scene.segments || []).forEach((segment) => {
    const start = normalizePoint(segment.start);
    const end = normalizePoint(segment.end);
    if (start) points.push(start);
    if (end) points.push(end);
  });
  (scene.markers || []).forEach((marker) => {
    const point = normalizePoint(marker.point);
    if (point) points.push(point);
  });
  (scene.callouts || []).forEach((callout) => {
    const point = normalizePoint(callout.point);
    if (point) points.push(point);
  });
  return points;
}

function boundsFor(points) {
  if (!points.length) {
    return {
      minX: 0,
      maxX: 10,
      minY: 0,
      maxY: 10,
      minZ: 0,
      maxZ: 10
    };
  }
  return points.reduce((bounds, point) => ({
    minX: Math.min(bounds.minX, point.xFt),
    maxX: Math.max(bounds.maxX, point.xFt),
    minY: Math.min(bounds.minY, point.yFt),
    maxY: Math.max(bounds.maxY, point.yFt),
    minZ: Math.min(bounds.minZ, point.zFt),
    maxZ: Math.max(bounds.maxZ, point.zFt)
  }), {
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
    minZ: Infinity,
    maxZ: -Infinity
  });
}

function expandBounds(bounds) {
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const depth = Math.max(1, bounds.maxY - bounds.minY);
  const height = Math.max(1, bounds.maxZ - bounds.minZ);
  return {
    minX: bounds.minX - Math.max(2, width * 0.12),
    maxX: bounds.maxX + Math.max(2, width * 0.12),
    minY: bounds.minY - Math.max(2, depth * 0.12),
    maxY: bounds.maxY + Math.max(2, depth * 0.12),
    minZ: Math.min(0, bounds.minZ - Math.max(1, height * 0.12)),
    maxZ: bounds.maxZ + Math.max(2, height * 0.18)
  };
}

function rawProject(point) {
  const x = finite(point.xFt);
  const y = finite(point.yFt);
  const z = finite(point.zFt);
  return {
    x: (x - y) * 0.866,
    y: (x + y) * 0.5 - z * 0.92
  };
}

function createProjector(bounds, width, height) {
  const corners = [
    { xFt: bounds.minX, yFt: bounds.minY, zFt: bounds.minZ },
    { xFt: bounds.maxX, yFt: bounds.minY, zFt: bounds.minZ },
    { xFt: bounds.maxX, yFt: bounds.maxY, zFt: bounds.minZ },
    { xFt: bounds.minX, yFt: bounds.maxY, zFt: bounds.minZ },
    { xFt: bounds.minX, yFt: bounds.minY, zFt: bounds.maxZ },
    { xFt: bounds.maxX, yFt: bounds.minY, zFt: bounds.maxZ },
    { xFt: bounds.maxX, yFt: bounds.maxY, zFt: bounds.maxZ },
    { xFt: bounds.minX, yFt: bounds.maxY, zFt: bounds.maxZ }
  ].map(rawProject);
  const projectedBounds = corners.reduce((acc, point) => ({
    minX: Math.min(acc.minX, point.x),
    maxX: Math.max(acc.maxX, point.x),
    minY: Math.min(acc.minY, point.y),
    maxY: Math.max(acc.maxY, point.y)
  }), {
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity
  });
  const projectedWidth = Math.max(1, projectedBounds.maxX - projectedBounds.minX);
  const projectedHeight = Math.max(1, projectedBounds.maxY - projectedBounds.minY);
  const scale = Math.min((width - 120) / projectedWidth, (height - 110) / projectedHeight);
  const offsetX = width / 2 - ((projectedBounds.minX + projectedBounds.maxX) / 2) * scale;
  const offsetY = height / 2 - ((projectedBounds.minY + projectedBounds.maxY) / 2) * scale + 16;

  return {
    scale,
    project(point) {
      const projected = rawProject(normalizePoint(point));
      return {
        x: projected.x * scale + offsetX,
        y: projected.y * scale + offsetY
      };
    }
  };
}

function renderGrid(bounds, projector) {
  const lines = [];
  const stepX = (bounds.maxX - bounds.minX) / FLOOR_GRID_STEPS;
  const stepY = (bounds.maxY - bounds.minY) / FLOOR_GRID_STEPS;
  for (let i = 0; i <= FLOOR_GRID_STEPS; i++) {
    const x = bounds.minX + stepX * i;
    const a = projector.project({ xFt: x, yFt: bounds.minY, zFt: bounds.minZ });
    const b = projector.project({ xFt: x, yFt: bounds.maxY, zFt: bounds.minZ });
    lines.push(`<line class="iso-grid-line" x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}"></line>`);
  }
  for (let i = 0; i <= FLOOR_GRID_STEPS; i++) {
    const y = bounds.minY + stepY * i;
    const a = projector.project({ xFt: bounds.minX, yFt: y, zFt: bounds.minZ });
    const b = projector.project({ xFt: bounds.maxX, yFt: y, zFt: bounds.minZ });
    lines.push(`<line class="iso-grid-line" x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}"></line>`);
  }
  return `<g class="iso-grid" aria-hidden="true">${lines.join('')}</g>`;
}

function renderAxes(bounds, projector) {
  const origin = projector.project({ xFt: bounds.minX, yFt: bounds.minY, zFt: bounds.minZ });
  const xEnd = projector.project({ xFt: bounds.minX + Math.min(12, Math.max(4, bounds.maxX - bounds.minX) * 0.25), yFt: bounds.minY, zFt: bounds.minZ });
  const yEnd = projector.project({ xFt: bounds.minX, yFt: bounds.minY + Math.min(12, Math.max(4, bounds.maxY - bounds.minY) * 0.25), zFt: bounds.minZ });
  const zEnd = projector.project({ xFt: bounds.minX, yFt: bounds.minY, zFt: bounds.minZ + Math.min(12, Math.max(4, bounds.maxZ - bounds.minZ) * 0.45) });
  return `
    <g class="iso-axes" aria-hidden="true">
      <line x1="${origin.x.toFixed(1)}" y1="${origin.y.toFixed(1)}" x2="${xEnd.x.toFixed(1)}" y2="${xEnd.y.toFixed(1)}"></line>
      <line x1="${origin.x.toFixed(1)}" y1="${origin.y.toFixed(1)}" x2="${yEnd.x.toFixed(1)}" y2="${yEnd.y.toFixed(1)}"></line>
      <line x1="${origin.x.toFixed(1)}" y1="${origin.y.toFixed(1)}" x2="${zEnd.x.toFixed(1)}" y2="${zEnd.y.toFixed(1)}"></line>
      <text x="${xEnd.x + 8}" y="${xEnd.y + 4}">X</text>
      <text x="${yEnd.x - 14}" y="${yEnd.y + 4}">Y</text>
      <text x="${zEnd.x + 6}" y="${zEnd.y - 6}">Z</text>
    </g>`;
}

function renderSegment(segment, projector, selectedId) {
  const start = projector.project(segment.start);
  const end = projector.project(segment.end);
  const id = esc(segment.id || '');
  const className = [
    'iso-segment',
    segment.className || '',
    segment.status ? `iso-segment--${segment.status}` : '',
    selectedId && segment.id === selectedId ? 'is-selected' : ''
  ].filter(Boolean).join(' ');
  const label = esc(segment.label || segment.id || '');
  return `
    <g class="iso-segment-group" data-iso-id="${id}" data-iso-kind="${esc(segment.kind || 'segment')}" tabindex="0" role="button" aria-label="${label}">
      <line class="${className}" x1="${start.x.toFixed(1)}" y1="${start.y.toFixed(1)}" x2="${end.x.toFixed(1)}" y2="${end.y.toFixed(1)}"></line>
    </g>`;
}

function renderMarker(marker, projector, selectedId) {
  const point = projector.project(marker.point);
  const id = esc(marker.id || '');
  const isSelected = selectedId && marker.id === selectedId;
  const className = [
    'iso-marker',
    marker.kind ? `iso-marker--${marker.kind}` : '',
    marker.status ? `iso-marker--${marker.status}` : '',
    isSelected ? 'is-selected' : ''
  ].filter(Boolean).join(' ');
  const label = esc(marker.label || marker.id || '');
  const shape = marker.shape === 'square'
    ? `<rect x="${(point.x - 5).toFixed(1)}" y="${(point.y - 5).toFixed(1)}" width="10" height="10" rx="2"></rect>`
    : marker.shape === 'diamond'
      ? `<path d="M ${point.x.toFixed(1)} ${(point.y - 7).toFixed(1)} L ${(point.x + 7).toFixed(1)} ${point.y.toFixed(1)} L ${point.x.toFixed(1)} ${(point.y + 7).toFixed(1)} L ${(point.x - 7).toFixed(1)} ${point.y.toFixed(1)} Z"></path>`
      : `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="6"></circle>`;
  return `
    <g class="${className}" data-iso-id="${id}" data-iso-kind="${esc(marker.kind || 'marker')}" tabindex="0" role="button" aria-label="${label}">
      ${shape}
      <text x="${(point.x + 10).toFixed(1)}" y="${(point.y - 8).toFixed(1)}">${label}</text>
    </g>`;
}

function renderCallout(callout, projector) {
  const point = projector.project(callout.point);
  return `<text class="iso-callout ${esc(callout.className || '')}" x="${point.x.toFixed(1)}" y="${point.y.toFixed(1)}">${esc(callout.label)}</text>`;
}

export function renderIsometricSvg(scene = {}, options = {}) {
  const width = options.width || DEFAULT_WIDTH;
  const height = options.height || DEFAULT_HEIGHT;
  const points = collectPoints(scene);
  const bounds = expandBounds(boundsFor(points));
  const projector = createProjector(bounds, width, height);
  const title = esc(options.title || scene.title || 'Isometric layout');
  const desc = esc(options.desc || scene.description || 'Schematic isometric layout generated from physical coordinates.');
  const selectedId = options.selectedId || scene.selectedId || '';
  const segments = (scene.segments || []).map(segment => renderSegment(segment, projector, selectedId)).join('');
  const markers = (scene.markers || []).map(marker => renderMarker(marker, projector, selectedId)).join('');
  const callouts = (scene.callouts || []).map(callout => renderCallout(callout, projector)).join('');

  return `
    <svg class="iso-svg ${esc(options.className || '')}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${esc(options.titleId || 'iso-svg-title')} ${esc(options.descId || 'iso-svg-desc')}">
      <title id="${esc(options.titleId || 'iso-svg-title')}">${title}</title>
      <desc id="${esc(options.descId || 'iso-svg-desc')}">${desc}</desc>
      ${renderGrid(bounds, projector)}
      ${renderAxes(bounds, projector)}
      <g class="iso-segments">${segments}</g>
      <g class="iso-markers">${markers}</g>
      <g class="iso-callouts">${callouts}</g>
    </svg>`;
}

export function hasRenderableIsometricData(scene = {}) {
  return collectPoints(scene).length >= 2;
}
