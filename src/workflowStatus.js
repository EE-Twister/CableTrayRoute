import { getTrays, getCables, getDuctbanks, getConduits, getOneLine } from '../dataStore.mjs';

export const workflowOrder = [
  { key: 'cableSchedule', label: '1. Cable Schedule', href: 'cableschedule.html' },
  { key: 'racewaySchedule', label: '2. Raceway Schedule', href: 'racewayschedule.html' },
  { key: 'ductbankSchedule', label: '3. Ductbank', href: 'ductbankroute.html' },
  { key: 'traySchedule', label: '4. Tray Fill', href: 'cabletrayfill.html' },
  { key: 'conduitSchedule', label: '5. Conduit Fill', href: 'conduitfill.html' },
  { key: 'optimalRoute', label: '6. Optimal Cable Route', href: 'optimalRoute.html' },
  { key: 'oneLineDiagram', label: '7. One-Line Diagram', href: 'oneline.html' }
];

function pluralize(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function getStepStatus(key) {
  if (key === 'cableSchedule') {
    const count = getCables().length;
    if (count > 0) return { complete: true, label: pluralize(count, 'cable', 'cables') };
    return { complete: false, label: 'Add cables to begin', hint: 'Define the cables to be routed.' };
  }
  if (key === 'racewaySchedule') {
    const trays = getTrays().length;
    const conduits = getConduits().length;
    const ductbanks = getDuctbanks().length;
    const total = trays + conduits + ductbanks;
    if (total > 0) {
      const parts = [];
      if (trays > 0) parts.push(pluralize(trays, 'tray', 'trays'));
      if (conduits > 0) parts.push(pluralize(conduits, 'conduit', 'conduits'));
      if (ductbanks > 0) parts.push(pluralize(ductbanks, 'ductbank', 'ductbanks'));
      return { complete: true, label: parts.join(', ') };
    }
    return { complete: false, label: 'Add trays or conduits', hint: 'Catalog the raceway infrastructure.' };
  }
  if (key === 'ductbankSchedule') {
    const count = getDuctbanks().length;
    if (count > 0) return { complete: true, label: pluralize(count, 'ductbank', 'ductbanks') };
    return { complete: false, label: 'Optional — no ductbanks yet', hint: 'Analyze underground ductbanks for thermal constraints.' };
  }
  if (key === 'traySchedule') {
    const count = getTrays().length;
    if (count > 0) return { complete: true, label: pluralize(count, 'tray', 'trays') };
    return { complete: false, label: 'Add trays in Raceway Schedule', hint: 'Tray fill requires trays defined in Raceway Schedule.' };
  }
  if (key === 'conduitSchedule') {
    const count = getConduits().length;
    if (count > 0) return { complete: true, label: pluralize(count, 'conduit', 'conduits') };
    return { complete: false, label: 'Add conduits in Raceway Schedule', hint: 'Conduit fill requires conduits defined in Raceway Schedule.' };
  }
  if (key === 'optimalRoute') {
    const cables = getCables().length;
    const trays = getTrays().length;
    if (cables > 0 && trays > 0) return { complete: true, label: `${pluralize(cables, 'cable', 'cables')} ready to route` };
    if (cables === 0) return { complete: false, label: 'Needs cables first', hint: 'Define cables in Cable Schedule before routing.' };
    return { complete: false, label: 'Needs raceway data', hint: 'Add trays or conduits in Raceway Schedule before routing.' };
  }
  if (key === 'oneLineDiagram') {
    const { sheets } = getOneLine();
    const componentCount = sheets.reduce((sum, s) => sum + (s.components || []).length, 0);
    if (componentCount > 0) return { complete: true, label: pluralize(componentCount, 'component', 'components') };
    return { complete: false, label: 'Not started', hint: 'Draw a single-line diagram and export to PDF or DXF.' };
  }
  return { complete: false, label: 'Not started', hint: null };
}

window.addEventListener('DOMContentLoaded', () => {
  const cards = document.querySelectorAll('.workflow-grid .workflow-card');
  let completeCount = 0;

  cards.forEach(card => {
    const key = card.dataset.storageKey;
    const statusEl = card.querySelector('.status');
    if (!statusEl || !key) return;

    const { complete, label, hint } = getStepStatus(key);

    statusEl.textContent = label;

    if (complete) {
      card.classList.add('complete');
      statusEl.classList.add('status-complete');
      statusEl.setAttribute('aria-label', `Complete — ${label}`);
      completeCount += 1;
    } else {
      statusEl.classList.add('status-incomplete');
      if (hint) {
        card.setAttribute('title', hint);
        card.setAttribute('aria-description', hint);
      }
    }
  });

  const progressText = document.getElementById('workflow-progress-text');
  if (progressText) {
    progressText.textContent = `${completeCount} of ${workflowOrder.length} workflow steps complete.`;
  }

  const progressTrack = document.getElementById('workflow-progress-bar-track');
  const progressFill = document.getElementById('workflow-progress-fill');
  if (progressTrack && progressFill) {
    const pct = Math.round((completeCount / workflowOrder.length) * 100);
    progressFill.style.width = `${pct}%`;
    progressTrack.setAttribute('aria-valuenow', completeCount);
  }

  const nextStep = workflowOrder.find(step => !getStepStatus(step.key).complete);
  const nextStepEl = document.getElementById('workflow-next-step');
  if (nextStepEl) {
    if (nextStep) {
      nextStepEl.textContent = 'Next recommended step: ';
      const link = document.createElement('a');
      link.href = nextStep.href;
      link.textContent = nextStep.label;
      nextStepEl.appendChild(link);
    } else {
      nextStepEl.textContent = 'All workflow steps are complete. You are ready to generate reports.';
    }
  }
});
