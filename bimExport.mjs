/**
 * Minimal helpers for exporting data to BIM formats.
 * These functions explore generating Revit-friendly JSON and
 * a very small IFC stub so panel schedules and cables can be
 * shared with other BIM environments.
 */

import { Drawing } from 'dxf-writer';

export function exportRevitJSON(panels = [], cables = []) {
  const blob = new Blob([JSON.stringify({ panels, cables }, null, 2)], {
    type: 'application/json'
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'bim.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

export function buildIFC(panels = [], cables = []) {
  const lines = [
    'ISO-10303-21;',
    'HEADER;',
    "FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');",
    "FILE_NAME('cabletray.ifc','',(''),(''),'','', '');",
    "FILE_SCHEMA(('IFC4'));",
    'ENDSEC;',
    'DATA;',
    `// Panels: ${panels.length}`,
    `// Cables: ${cables.length}`,
    'ENDSEC;',
    'END-ISO-10303-21;'
  ];
  return lines.join('\n');
}

export function exportIFC(panels = [], cables = []) {
  const content = buildIFC(panels, cables);
  const blob = new Blob([content], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'cabletray.ifc';
  a.click();
  URL.revokeObjectURL(a.href);
}

export function exportRoutesDXF(routes = []) {
  const d = new Drawing();
  routes.forEach(r => {
    (r.segments || []).forEach(seg => {
      const s = seg.start || [0,0,0];
      const e = seg.end || [0,0,0];
      d.drawLine3d(s[0], s[1], s[2], e[0], e[1], e[2]);
    });
  });
  const blob = new Blob([d.toDxfString()], { type: 'application/dxf' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'routes.dxf';
  a.click();
  URL.revokeObjectURL(a.href);
}
