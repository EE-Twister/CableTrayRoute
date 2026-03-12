import { getTrays, getCables, getDuctbanks, getConduits, getItem } from '../dataStore.mjs';

const workflowOrder = [
  { key: 'cableSchedule', label: '1. Cable Schedule', href: 'cableschedule.html' },
  { key: 'racewaySchedule', label: '2. Raceway Schedule', href: 'racewayschedule.html' },
  { key: 'ductbankSchedule', label: '3. Ductbank', href: 'ductbankroute.html' },
  { key: 'traySchedule', label: '4. Tray Fill', href: 'cabletrayfill.html' },
  { key: 'conduitSchedule', label: '5. Conduit Fill', href: 'conduitfill.html' },
  { key: 'optimalRoute', label: '6. Optimal Cable Route', href: 'optimalRoute.html' },
  { key: 'oneLineDiagram', label: '7. One-Line Diagram', href: 'oneline.html' }
];

function isStepComplete(key) {
  if (key === 'racewaySchedule') {
    return getDuctbanks().length > 0 || getTrays().length > 0 || getConduits().length > 0;
  }
  if (key === 'optimalRoute') {
    return getCables().length > 0 && getTrays().length > 0;
  }
  return !!getItem(key);
}

window.addEventListener('DOMContentLoaded', () => {
  const cards = document.querySelectorAll('.workflow-grid .workflow-card');
  let completeCount = 0;

  cards.forEach(card => {
    const key = card.dataset.storageKey;
    const statusEl = card.querySelector('.status');
    if (!statusEl || !key) return;

    const complete = isStepComplete(key);
    if (complete) {
      card.classList.add('complete');
      statusEl.textContent = 'Complete';
      statusEl.setAttribute('aria-label', 'Completed');
      completeCount += 1;
      return;
    }

    if (key === 'optimalRoute' && getCables().length > 0) {
      statusEl.textContent = 'Needs raceway data';
      return;
    }

    statusEl.textContent = 'Not started';
  });

  const progressText = document.getElementById('workflow-progress-text');
  if (progressText) {
    progressText.textContent = `${completeCount} of ${workflowOrder.length} workflow steps complete.`;
  }

  const nextStep = workflowOrder.find(step => !isStepComplete(step.key));
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
