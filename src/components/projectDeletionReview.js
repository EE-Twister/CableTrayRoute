import { openModal } from './modal.js';

const COLLECTION_LABELS = {
  equipment: 'Equipment',
  panels: 'Panel',
  loads: 'Load',
  cables: 'Cable'
};

const DEPENDENCY_LABELS = {
  loads: 'load reference',
  cables: 'cable endpoint',
  oneLine: 'One-Line link'
};

function appendTextElement(parent, tagName, text, className = '') {
  const element = parent.ownerDocument.createElement(tagName);
  element.textContent = text;
  if (className) element.className = className;
  parent.appendChild(element);
  return element;
}

export function confirmProjectEntityDeletion({
  collection,
  records = [],
  getImpact,
  title
} = {}) {
  const selected = Array.isArray(records) ? records.filter(Boolean) : [];
  if (!selected.length || typeof getImpact !== 'function') return Promise.resolve(false);
  const impact = getImpact(collection, selected);
  const recordLabel = COLLECTION_LABELS[collection] || 'Shared Record';
  const count = selected.length;
  const dependencyCount = impact?.counts?.total || 0;
  return openModal({
    title: title || `Review ${recordLabel} Deletion`,
    description: `Review the project references affected by deleting ${count} ${recordLabel.toLowerCase()} record${count === 1 ? '' : 's'}.`,
    primaryText: dependencyCount ? 'Delete and Flag Links' : 'Delete',
    secondaryText: 'Cancel',
    variant: 'danger',
    closeOnBackdrop: false,
    defaultWidth: 'medium',
    render: body => {
      const selectedLabels = impact.records.map(record => record.label).slice(0, 6);
      appendTextElement(body, 'strong', `Selected: ${selectedLabels.join(', ')}${impact.records.length > selectedLabels.length ? ` and ${impact.records.length - selectedLabels.length} more` : ''}`);

      if (!dependencyCount) {
        appendTextElement(body, 'p', 'No dependent load, cable, or One-Line references were found.');
        return;
      }

      appendTextElement(
        body,
        'p',
        `${dependencyCount} dependent reference${dependencyCount === 1 ? '' : 's'} will need review after deletion. Dependent engineering records will be retained.`,
        'modal-message'
      );
      const summary = body.ownerDocument.createElement('ul');
      Object.entries(DEPENDENCY_LABELS).forEach(([key, label]) => {
        const dependencyTotal = impact.counts[key] || 0;
        if (!dependencyTotal) return;
        appendTextElement(summary, 'li', `${dependencyTotal} ${label}${dependencyTotal === 1 ? '' : 's'}`);
      });
      body.appendChild(summary);

      const details = body.ownerDocument.createElement('ul');
      details.className = 'modal-review-list';
      impact.dependencies.slice(0, 10).forEach(dependency => {
        appendTextElement(details, 'li', dependency.message);
      });
      if (impact.dependencies.length > 10) {
        appendTextElement(details, 'li', `${impact.dependencies.length - 10} additional references will appear in Dashboard Data Links.`);
      }
      body.appendChild(details);
      appendTextElement(body, 'p', 'Deletion does not approve removal of dependent data. Relink or deliberately remove each retained record from Dashboard Data Links.', 'field-hint');
    }
  }).then(Boolean);
}

export default confirmProjectEntityDeletion;
