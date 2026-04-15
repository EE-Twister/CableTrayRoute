import { workflowOrder, getStepStatus } from './workflowStatus.js';
import { getCables, getTrays, getConduits, getDuctbanks, getStudies } from '../dataStore.mjs';
import { trayFillPercent } from '../analysis/designRuleChecker.mjs';
import '../site.js';

// Studies tracked in the dashboard with display labels and their storage keys
const STUDY_DEFINITIONS = [
  { key: 'arcFlash',     label: 'Arc Flash',           href: 'arcFlash.html' },
  { key: 'shortCircuit', label: 'Short Circuit',        href: 'shortCircuit.html' },
  { key: 'loadFlow',     label: 'Load Flow',            href: 'loadFlow.html' },
  { key: 'harmonics',    label: 'Harmonics',            href: 'harmonics.html' },
  { key: 'motorStart',   label: 'Motor Starting',       href: 'motorStart.html' },
  { key: 'heatTraceSizing', label: 'Heat Trace Sizing', href: 'heattracesizing.html' },
  { key: 'dissimilarMetals', label: 'Dissimilar Metals', href: 'dissimilarmetals.html' },
  { key: 'reliability',  label: 'Reliability / N-1',    href: 'reliability.html' },
  { key: 'contingency',  label: 'N-1 Contingency',      href: 'contingency.html' },
];

function statusIcon(complete) {
  const span = document.createElement('span');
  span.className = complete ? 'dash-icon dash-icon--complete' : 'dash-icon dash-icon--incomplete';
  span.setAttribute('aria-hidden', 'true');
  span.textContent = complete ? '✓' : '✗';
  return span;
}

function renderWorkflowSteps(container) {
  const steps = workflowOrder.map(step => {
    const { complete, label, hint } = getStepStatus(step.key);
    return { step, complete, label, hint };
  });

  const completeCount = steps.filter(s => s.complete).length;

  // Progress bar
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
  const nextStepEl = document.getElementById('workflow-next-step');
  if (nextStepEl) {
    const next = steps.find(s => !s.complete);
    if (next) {
      nextStepEl.textContent = 'Next recommended step: ';
      const link = document.createElement('a');
      link.href = next.step.href;
      link.textContent = next.step.label;
      nextStepEl.appendChild(link);
    } else {
      nextStepEl.textContent = 'All workflow steps are complete. You are ready to generate reports.';
    }
  }

  // Step cards
  if (!container) return;
  container.innerHTML = '';

  const list = document.createElement('ul');
  list.className = 'dash-step-list';
  list.setAttribute('role', 'list');

  steps.forEach(({ step, complete, label, hint }) => {
    const li = document.createElement('li');
    li.className = 'dash-step-card' + (complete ? ' dash-step-card--complete' : '');
    if (hint) li.title = hint;

    const icon = statusIcon(complete);
    const nameEl = document.createElement('a');
    nameEl.href = step.href;
    nameEl.className = 'dash-step-name';
    nameEl.textContent = step.label;

    const labelEl = document.createElement('span');
    labelEl.className = 'dash-step-label';
    labelEl.textContent = label;

    li.appendChild(icon);
    li.appendChild(nameEl);
    li.appendChild(labelEl);
    list.appendChild(li);
  });

  container.appendChild(list);
}

function renderProjectSummary(container) {
  if (!container) return;

  const cables = getCables().length;
  const trays = getTrays().length;
  const conduits = getConduits().length;
  const ductbanks = getDuctbanks().length;
  const trayViolations = getTrays().filter(t => {
    const pct = trayFillPercent(t);
    return pct !== null && pct > 80;
  }).length;

  const stats = [
    { label: 'Cables', value: cables, href: 'cableschedule.html' },
    { label: 'Trays', value: trays, href: 'racewayschedule.html' },
    { label: 'Conduits', value: conduits, href: 'racewayschedule.html' },
    { label: 'Ductbanks', value: ductbanks, href: 'ductbankroute.html' },
    { label: 'Trays over 80% fill', value: trayViolations, href: 'cabletrayfill.html', warn: trayViolations > 0 },
  ];

  container.innerHTML = '';
  const list = document.createElement('ul');
  list.className = 'dash-stat-list';
  list.setAttribute('role', 'list');

  stats.forEach(({ label, value, href, warn }) => {
    const li = document.createElement('li');
    li.className = 'dash-stat-item' + (warn ? ' dash-stat-item--warn' : '');

    const valueEl = document.createElement('a');
    valueEl.href = href;
    valueEl.className = 'dash-stat-value';
    valueEl.textContent = value;

    const labelEl = document.createElement('span');
    labelEl.className = 'dash-stat-label';
    labelEl.textContent = label;

    li.appendChild(valueEl);
    li.appendChild(labelEl);
    list.appendChild(li);
  });

  container.appendChild(list);
}

function renderStudiesSummary(container) {
  if (!container) return;

  const studies = getStudies();

  container.innerHTML = '';
  const list = document.createElement('ul');
  list.className = 'dash-study-list';
  list.setAttribute('role', 'list');

  STUDY_DEFINITIONS.forEach(({ key, label, href }) => {
    const hasResults = !!(studies[key] && (
      Array.isArray(studies[key]) ? studies[key].length > 0
        : typeof studies[key] === 'object' ? Object.keys(studies[key]).length > 0
        : true
    ));

    const li = document.createElement('li');
    li.className = 'dash-study-item' + (hasResults ? ' dash-study-item--run' : '');

    const icon = statusIcon(hasResults);

    const linkEl = document.createElement('a');
    linkEl.href = href;
    linkEl.className = 'dash-study-name';
    linkEl.textContent = label;

    const statusEl = document.createElement('span');
    statusEl.className = 'dash-study-status';
    statusEl.textContent = hasResults ? 'Results saved' : 'Not run';

    li.appendChild(icon);
    li.appendChild(linkEl);
    li.appendChild(statusEl);
    list.appendChild(li);
  });

  container.appendChild(list);
}

window.addEventListener('DOMContentLoaded', () => {
  renderWorkflowSteps(document.getElementById('workflow-step-grid'));
  renderProjectSummary(document.getElementById('project-summary'));
  renderStudiesSummary(document.getElementById('studies-summary'));
});
