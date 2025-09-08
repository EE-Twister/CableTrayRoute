import { Drawing } from './simpleDxf.js';

function buildDXF(components = []) {
  const d = new Drawing();
  components.forEach(c => {
    const x = c.x || 0;
    const y = c.y || 0;
    const name = c.subtype || 'Component';
    d.drawText(x, y, 5, name);
  });
  return d.toDxfString();
}

export function exportDXF(components = []) {
  const content = buildDXF(components);
  const blob = new Blob([content], { type: 'application/dxf' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'oneline.dxf';
  a.click();
  URL.revokeObjectURL(a.href);
}

export function exportDWG(components = []) {
  const content = buildDXF(components);
  const blob = new Blob([content], { type: 'application/acad' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'oneline.dwg';
  a.click();
  URL.revokeObjectURL(a.href);
}
