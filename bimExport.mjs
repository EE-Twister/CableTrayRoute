/**
 * Minimal helpers for exporting data to BIM formats.
 * These functions explore generating Revit-friendly JSON and
 * a very small IFC stub so panel schedules and cables can be
 * shared with other BIM environments.
 */

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
