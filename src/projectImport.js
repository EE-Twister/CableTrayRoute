import { previewCanonicalProject } from './canonicalProject.mjs';
import { openModal } from './components/modal.js';

export function previewProjectImport(value) {
  return previewCanonicalProject(value);
}

export async function confirmProjectImport(value) {
  const preview = previewProjectImport(value);
  const counts = preview.counts || {};
  const scenarios = preview.scenarioCounts || {};
  const totals = Object.values(scenarios).reduce((sum, value) => ({
    cables: sum.cables + (value.cables || 0),
    equipment: sum.equipment + (value.equipment || 0),
    loads: sum.loads + (value.loads || 0),
    trays: sum.trays + (value.trays || 0),
    conduits: sum.conduits + (value.conduits || 0),
    oneLineSheets: sum.oneLineSheets + (value.oneLineSheets || 0),
  }), { cables: 0, equipment: 0, loads: 0, trays: 0, conduits: 0, oneLineSheets: 0 });
  const scenarioRows = Object.entries(scenarios)
    .map(([name, count]) => `${name}: ${count.cables} cables, ${count.equipment} equipment, ${count.loads} loads`)
    .join('\n');
  const errors = preview.errors || [];
  const result = await openModal({
    title: preview.valid ? 'Review project import' : 'Project import cannot continue',
    description: preview.valid
      ? 'Review the validated project contents before applying them. Your current project remains unchanged until you choose Import.'
      : 'The file was not applied because it failed project validation.',
    primaryText: preview.valid ? 'Import project' : 'Close',
    secondaryText: preview.valid ? 'Cancel' : '',
    onSubmit: () => true,
    render(container) {
      const doc = container.ownerDocument;
      const summary = doc.createElement('div');
      summary.className = 'project-import-preview';
      const heading = doc.createElement('p');
      heading.textContent = preview.valid
        ? `Total across ${counts.scenarios || 1} scenarios: ${totals.cables} cables, ${totals.equipment} equipment, ${totals.loads} loads, ${totals.trays + totals.conduits} raceways, ${totals.oneLineSheets} one-line sheets.`
        : 'No project changes were made.';
      summary.appendChild(heading);
      if (scenarioRows) {
        const scenarioList = doc.createElement('pre');
        scenarioList.className = 'project-import-preview__scenarios';
        scenarioList.textContent = scenarioRows;
        summary.appendChild(scenarioList);
      }
      if (errors.length) {
        const errorList = doc.createElement('ul');
        errorList.className = 'project-import-preview__errors';
        errors.forEach(error => {
          const item = doc.createElement('li');
          item.textContent = `${error.path || '/'} ${error.message || error}`;
          errorList.appendChild(item);
        });
        summary.appendChild(errorList);
      }
      container.appendChild(summary);
    }
  });
  return preview.valid && result === true;
}
