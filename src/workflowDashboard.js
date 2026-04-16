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

function getStatusMeta({ complete, label, hint, forStudy = false }) {
  if (complete) {
    return { text: forStudy ? 'Run' : 'Complete', icon: '✓', variant: 'success' };
  }
  const warning = Boolean(hint) && /(needs|require|add|over|warning)/i.test(`${label} ${hint}`);
  if (warning) {
    return { text: 'Warning', icon: '⚠', variant: 'warning' };
  }
  return { text: forStudy ? 'Pending' : 'Pending', icon: '•', variant: 'neutral' };
}

function statusBadge({ complete, label, hint, forStudy = false, extraClass = '' }) {
  const { text, icon, variant } = getStatusMeta({ complete, label, hint, forStudy });
  const span = document.createElement('span');
  span.className = `dash-badge dash-badge--${variant}${extraClass ? ` ${extraClass}` : ''}`;
  span.setAttribute('role', 'status');
  span.setAttribute('aria-label', `Status: ${text}`);

  const iconEl = document.createElement('span');
  iconEl.className = 'dash-badge-icon';
  iconEl.setAttribute('aria-hidden', 'true');
  iconEl.textContent = icon;

  const textEl = document.createElement('span');
  textEl.className = 'dash-badge-text';
  textEl.textContent = text;

  span.appendChild(iconEl);
  span.appendChild(textEl);
  return span;
}

function studyHasResults(studyResult) {
  if (!studyResult) return false;
  if (Array.isArray(studyResult)) return studyResult.length > 0;
  if (typeof studyResult === 'object') return Object.keys(studyResult).length > 0;
  return true;
}

function getWorkflowMetrics() {
  const steps = workflowOrder.map(step => {
    const { complete, label, hint } = getStepStatus(step.key);
    return { step, complete, label, hint };
  });
  const completedCount = steps.filter(({ complete }) => complete).length;
  const workflowCompletionPct = workflowOrder.length
    ? Math.round((completedCount / workflowOrder.length) * 100)
    : 0;
  const nextRequiredStep = steps.find(({ complete }) => !complete) || null;

  return { steps, completedCount, workflowCompletionPct, nextRequiredStep };
}

function getTrayViolationsCount() {
  return getTrays().filter(tray => {
    const pct = trayFillPercent(tray);
    return pct !== null && pct > 80;
  }).length;
}

function getStudiesCompletedCount() {
  const studies = getStudies();
  return STUDY_DEFINITIONS.filter(({ key }) => studyHasResults(studies[key])).length;
}

function renderKpiStrip(container) {
  if (!container) return;

  const { workflowCompletionPct, nextRequiredStep } = getWorkflowMetrics();
  const trayViolations = getTrayViolationsCount();
  const studiesCompletedCount = getStudiesCompletedCount();
  const totalStudies = STUDY_DEFINITIONS.length;

  const kpis = [
    {
      label: 'Workflow complete',
      value: `${workflowCompletionPct}%`,
      helper: `${workflowOrder.length} total workflow steps tracked.`,
      href: '#workflow-progress-text',
    },
    {
      label: 'Next required step',
      value: nextRequiredStep ? nextRequiredStep.step.label : 'Done',
      helper: nextRequiredStep ? 'Recommended next action in the workflow.' : 'All required workflow steps are complete.',
      href: nextRequiredStep ? nextRequiredStep.step.href : 'reporting.html',
    },
    {
      label: 'Tray fill warnings',
      value: trayViolations,
      helper: trayViolations > 0 ? 'Trays currently over 80% fill.' : 'No tray fill warnings above 80%.',
      href: 'cabletrayfill.html',
      warn: trayViolations > 0,
    },
    {
      label: 'Studies completed',
      value: studiesCompletedCount,
      helper: `${studiesCompletedCount} of ${totalStudies} studies have saved results.`,
      href: 'studiesdashboard.html',
    },
  ];

  container.innerHTML = '';
  const list = document.createElement('ul');
  list.className = 'dash-kpi-grid';
  list.setAttribute('role', 'list');

  kpis.forEach(({ label, value, helper, href, warn }) => {
    const li = document.createElement('li');
    li.className = 'dash-kpi-card' + (warn ? ' dash-kpi-card--warn' : '');

    const labelEl = document.createElement('span');
    labelEl.className = 'dash-kpi-label';
    labelEl.textContent = label;

    const valueEl = document.createElement('a');
    valueEl.href = href;
    valueEl.className = 'dash-kpi-value';
    valueEl.textContent = value;

    const helperEl = document.createElement('span');
    helperEl.className = 'dash-kpi-helper';
    helperEl.textContent = helper;

    li.appendChild(labelEl);
    li.appendChild(valueEl);
    li.appendChild(helperEl);
    list.appendChild(li);
  });

  container.appendChild(list);
}

function renderWorkflowSteps(container) {
  const { steps, completedCount, workflowCompletionPct, nextRequiredStep } = getWorkflowMetrics();

  // Progress bar
  const progressText = document.getElementById('workflow-progress-text');
  if (progressText) {
    progressText.textContent = `${completedCount} of ${workflowOrder.length} workflow steps complete.`;
  }
  const progressTrack = document.getElementById('workflow-progress-bar-track');
  const progressFill = document.getElementById('workflow-progress-fill');
  if (progressTrack && progressFill) {
    progressFill.style.width = `${workflowCompletionPct}%`;
    progressTrack.setAttribute('aria-valuenow', completedCount);
  }
  const nextStepEl = document.getElementById('workflow-next-step');
  if (nextStepEl) {
    if (nextRequiredStep) {
      nextStepEl.textContent = 'Next recommended step: ';
      const link = document.createElement('a');
      link.href = nextRequiredStep.step.href;
      link.textContent = nextRequiredStep.step.label;
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

    const nameEl = document.createElement('a');
    nameEl.href = step.href;
    nameEl.className = 'dash-step-name';
    nameEl.textContent = step.label;

    const statusMeta = getStatusMeta({ complete, label, hint });
    const statusPill = statusBadge({ complete, label, hint, extraClass: 'dash-step-status-pill' });

    const statusWrap = document.createElement('span');
    statusWrap.className = 'dash-step-status-wrap';
    statusWrap.appendChild(statusPill);

    if (hint) {
      const hintEl = document.createElement('span');
      hintEl.className = 'dash-step-hint-icon';
      hintEl.setAttribute('aria-label', `Hint: ${hint}`);
      hintEl.title = hint;
      hintEl.textContent = 'ⓘ';
      statusWrap.appendChild(hintEl);
    }

    const labelEl = document.createElement('span');
    labelEl.className = 'dash-step-label';
    labelEl.textContent = label;
    labelEl.setAttribute('aria-label', `${statusMeta.text}: ${label}`);

    li.appendChild(nameEl);
    li.appendChild(statusWrap);
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
  const trayViolations = getTrayViolationsCount();

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
    const hasResults = studyHasResults(studies[key]);

    const li = document.createElement('li');
    li.className = 'dash-study-item' + (hasResults ? ' dash-study-item--run' : '');

    const linkEl = document.createElement('a');
    linkEl.href = href;
    linkEl.className = 'dash-study-name';
    linkEl.textContent = label;

    const statusEl = statusBadge({
      complete: hasResults,
      label: hasResults ? 'Results saved' : 'Not run',
      hint: null,
      forStudy: true,
      extraClass: hasResults ? 'dash-badge--run' : 'dash-badge--pending'
    });
    statusEl.setAttribute('aria-label', hasResults ? 'Status: Run. Results saved.' : 'Status: Pending. Not run.');

    li.appendChild(linkEl);
    li.appendChild(statusEl);
    list.appendChild(li);
  });

  container.appendChild(list);
}

window.addEventListener('DOMContentLoaded', () => {
  renderKpiStrip(document.getElementById('dashboard-kpi-strip'));
  renderWorkflowSteps(document.getElementById('workflow-step-grid'));
  renderProjectSummary(document.getElementById('project-summary'));
  renderStudiesSummary(document.getElementById('studies-summary'));
});
