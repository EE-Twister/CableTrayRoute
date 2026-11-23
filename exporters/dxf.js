import { Drawing } from './simpleDxf.js';

function sanitizeDXFText(value) {
  const text = String(value ?? '');
  const withoutControls = text.replace(/[\r\n\u0000-\u001F\u007F]/g, ' ').trim();
  return withoutControls || 'Component';
}

function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function buildDXF(components = [], { reviewNotice = '' } = {}) {
  const d = new Drawing();
  if (reviewNotice) {
    const x = components.length ? Math.min(...components.map(component => toFiniteNumber(component?.x))) : 0;
    const y = components.length ? Math.min(...components.map(component => toFiniteNumber(component?.y))) - 20 : -20;
    d.drawText(x, y, 8, reviewNotice);
  }
  components.forEach(c => {
    const x = toFiniteNumber(c.x);
    const y = toFiniteNumber(c.y);
    const name = sanitizeDXFText(c.subtype || 'Component');
    d.drawText(x, y, 5, name);
  });
  return d.toDxfString();
}

export function exportDXF(components = [], options = {}) {
  const content = buildDXF(components, options);
  const blob = new Blob([content], { type: 'application/dxf' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'oneline.dxf';
  a.click();
  URL.revokeObjectURL(a.href);
}

export function exportDWG(components = [], options = {}) {
  const content = buildDXF(components, options);
  const blob = new Blob([content], { type: 'application/acad' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'oneline.dwg';
  a.click();
  URL.revokeObjectURL(a.href);
}
