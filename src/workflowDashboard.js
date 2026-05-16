import { workflowOrder, getStepStatus, getCableReadiness, countOneLineComponents } from './workflowStatus.js';
import {
  getEquipment, getLoads, getCables, getTrays, getConduits, getDuctbanks, getStudies,
  getStudyApprovals, getOneLine,
  getLifecyclePackages, getReportSnapshots, getItem, addLifecyclePackage, deleteLifecyclePackage,
} from '../dataStore.mjs';
import { trayFillPercent } from '../analysis/designRuleChecker.mjs';
import { buildLifecyclePackage, summarizePackage } from '../analysis/lifecyclePackage.mjs';
import { runDesignCoach } from '../analysis/designCoach.mjs';
import { evaluateEquipment, summariseEvaluation } from '../analysis/equipmentEvaluation.mjs';
import { buildWorkflowCoreDiagnostics } from '../analysis/projectWorkflowCore.mjs';
import protectiveDevices from '../data/protectiveDevices.mjs';
import '../site.js';

// Studies tracked in the dashboard with display labels and their storage keys
const STUDY_DEFINITIONS = [
  { key: 'arcFlash',     label: 'Arc Flash',           href: 'arcFlash.html' },
  { key: 'shortCircuit', label: 'Short Circuit',        href: 'shortCircuit.html' },
  { key: 'loadFlow',     label: 'Load Flow',            href: 'loadFlow.html' },
  { key: 'harmonics',       label: 'Harmonics',            href: 'harmonics.html' },
  { key: 'voltageFlicker',  label: 'Voltage Flicker',      href: 'voltageflicker.html' },
  { key: 'motorStart',      label: 'Motor Starting',       href: 'motorStart.html' },
  { key: 'heatTraceSizing', label: 'Heat Trace Sizing', href: 'heattracesizing.html' },
  { key: 'busDuctSizing',          label: 'Bus Duct Sizing',        href: 'busdust.html' },
  { key: 'sustainabilityFootprint', label: 'Sustainability Footprint', href: 'sustainability.html' },
  { key: 'dissimilarMetals', label: 'Dissimilar Metals', href: 'dissimilarmetals.html' },
  { key: 'bessHazard', label: 'BESS Hazard (HMA)', href: 'bessHazard.html' },
  { key: 'reliability',  label: 'Reliability / N-1',    href: 'reliability.html' },
  { key: 'contingency',  label: 'N-1 Contingency',      href: 'contingency.html' },
  { key: 'insulationCoordination', label: 'Insulation Coordination', href: 'insulationcoordination.html' },
  { key: 'lighting',               label: 'Egress Lighting',         href: 'lighting.html' },
  { key: 'trustCenter',            label: 'Trust Center',            href: 'trustcenter.html' },
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

function getOpenCoachItemCount() {
  try {
    const { summary } = runDesignCoach({
      cables: getCables() || [],
      trays: getTrays() || [],
      studies: getStudies() || {},
    });
    return summary.safety + summary.compliance;
  } catch (_) {
    return 0;
  }
}

function getEquipmentFailCount() {
  try {
    const components = (getOneLine()?.sheets ?? []).flatMap(s => s.components ?? []);
    const evals = evaluateEquipment(components, getCables() || [], getStudies() || {}, protectiveDevices);
    return summariseEvaluation(evals).fail;
  } catch (_) {
    return 0;
  }
}

function renderKpiStrip(container) {
  if (!container) return;

  const { workflowCompletionPct, nextRequiredStep } = getWorkflowMetrics();
  const trayViolations = getTrayViolationsCount();
  const studiesCompletedCount = getStudiesCompletedCount();
  const openCoachItems = getOpenCoachItemCount();
  const equipFailCount = getEquipmentFailCount();
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
      href: nextRequiredStep ? nextRequiredStep.step.href : 'projectreport.html',
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
      href: 'demandschedule.html',
    },
    {
      label: 'Design coach items',
      value: openCoachItems,
      helper: openCoachItems > 0
        ? `${openCoachItems} safety/compliance item(s) need attention.`
        : 'No open safety or compliance recommendations.',
      href: 'designcoach.html',
      warn: openCoachItems > 0,
    },
    {
      label: 'Equipment failures',
      value: equipFailCount,
      helper: equipFailCount > 0
        ? `${equipFailCount} equipment item(s) exceed their duty rating.`
        : 'No equipment duty failures detected.',
      href: 'equipmentevaluation.html',
      warn: equipFailCount > 0,
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
    progressTrack.setAttribute('aria-valuemax', workflowOrder.length);
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

  const equipment = getEquipment().filter(row => Object.values(row || {}).some(value => String(value ?? '').trim() !== '')).length;
  const loads = getLoads().filter(row => Object.values(row || {}).some(value => String(value ?? '').trim() !== '')).length;
  const cables = getCables();
  const cableReadiness = getCableReadiness(cables);
  const oneLineComponents = countOneLineComponents(getOneLine());
  const trays = getTrays().length;
  const conduits = getConduits().length;
  const ductbanks = getDuctbanks().length;
  const raceways = trays + conduits + ductbanks;
  const trayViolations = getTrayViolationsCount();
  const studiesStatus = getStepStatus('studies');
  const deliverablesStatus = getStepStatus('deliverables');

  const stats = [
    {
      label: 'Equipment',
      value: equipment,
      href: 'equipmentlist.html',
      icon: 'icons/equipment.svg',
      subtitle: 'linked to Equipment List',
      state: equipment > 0 ? 'linked' : 'neutral',
    },
    {
      label: 'Loads',
      value: loads,
      href: 'loadlist.html',
      icon: 'icons/load.svg',
      subtitle: 'linked to Load List',
      state: loads > 0 ? 'linked' : 'neutral',
    },
    {
      label: 'One-Line Components',
      value: oneLineComponents,
      href: 'oneline.html',
      icon: 'icons/oneline.svg',
      subtitle: 'reconcile schedules explicitly',
      state: oneLineComponents > 0 ? 'linked' : 'neutral',
    },
    {
      label: 'Cables',
      value: cableReadiness.total,
      href: 'cableschedule.html',
      icon: 'icons/components/Feeder.svg',
      subtitle: `${cableReadiness.scheduleReady} schedule-ready, ${cableReadiness.routingReady} routing-ready`,
      state: cableReadiness.total > 0 ? (cableReadiness.missingSchedule > 0 ? 'warn' : 'linked') : 'neutral',
    },
    {
      label: 'Raceways',
      value: raceways,
      href: 'racewayschedule.html',
      icon: 'icons/components/Busway.svg',
      subtitle: `${trays} tray(s), ${conduits} conduit(s), ${ductbanks} ductbank(s)`,
      state: raceways > 0 ? 'linked' : 'neutral',
    },
    {
      label: 'Trays over 80% fill',
      value: trayViolations,
      href: 'cabletrayfill.html',
      icon: 'icons/components/Breaker.svg',
      subtitle: trayViolations > 0
        ? `${trayViolations} warning${trayViolations === 1 ? '' : 's'} need mitigation.`
        : 'No active fill warnings.',
      state: trayViolations > 0 ? 'warn' : 'neutral',
    },
    {
      label: 'Studies',
      value: studiesStatus.complete ? studiesStatus.label : 0,
      href: 'demandschedule.html',
      icon: 'icons/toolbar/validate.svg',
      subtitle: studiesStatus.hint || studiesStatus.label,
      state: studiesStatus.complete ? 'linked' : 'neutral',
    },
    {
      label: 'Deliverables',
      value: deliverablesStatus.complete ? deliverablesStatus.label : 0,
      href: 'projectreport.html',
      icon: 'icons/toolbar/copy.svg',
      subtitle: deliverablesStatus.hint || deliverablesStatus.label,
      state: deliverablesStatus.complete ? 'linked' : 'neutral',
    },
  ];

  container.innerHTML = '';
  const list = document.createElement('ul');
  list.className = 'dash-stat-list';
  list.setAttribute('role', 'list');

  stats.forEach(({ label, value, href, icon, subtitle, state }) => {
    const li = document.createElement('li');
    li.className = 'dash-stat-item';
    if (state) {
      li.classList.add(`dash-stat-item--${state}`);
    }

    const iconEl = document.createElement('img');
    iconEl.src = icon;
    iconEl.alt = '';
    iconEl.className = 'dash-stat-icon';
    iconEl.setAttribute('aria-hidden', 'true');

    const valueEl = document.createElement('a');
    valueEl.href = href;
    valueEl.className = 'dash-stat-value';
    valueEl.textContent = value;

    const labelEl = document.createElement('span');
    labelEl.className = 'dash-stat-label';
    labelEl.textContent = label;

    li.appendChild(iconEl);
    li.appendChild(valueEl);
    li.appendChild(labelEl);
    if (subtitle) {
      const subtitleEl = document.createElement('span');
      subtitleEl.className = 'dash-stat-subtitle';
      subtitleEl.textContent = subtitle;
      li.appendChild(subtitleEl);
    }
    list.appendChild(li);
  });

  container.appendChild(list);
}

function currentCoreDiagnostics() {
  return buildWorkflowCoreDiagnostics({
    equipment: getEquipment(),
    loads: getLoads(),
    oneLine: getOneLine(),
    cables: getCables(),
    trays: getTrays(),
    conduits: getConduits(),
    ductbanks: getDuctbanks(),
    studies: getStudies(),
    reportSnapshots: getReportSnapshots(),
    deliverables: getLifecyclePackages(),
    latestRouteResults: getItem('latestRouteResults', null),
    reconcilePending: Boolean(getItem('oneLineScheduleReconcilePending', false))
  });
}

function renderWorkflowCoreDiagnostics() {
  const diagnostics = currentCoreDiagnostics();
  const nextEl = document.getElementById('dashboard-next-action-strip');
  if (nextEl) {
    const action = diagnostics.nextAction;
    nextEl.innerHTML = `
      <div>
        <strong>Next action: ${esc(action.label)}</strong>
        <p>${esc(action.detail)}</p>
      </div>
      <a class="btn primary-btn" href="${esc(action.href)}">Open Step</a>
    `;
  }

  const blockersEl = document.getElementById('dashboard-blockers');
  if (blockersEl) {
    const actionable = diagnostics.blockers.filter(item => item.severity !== 'info');
    if (!actionable.length) {
      blockersEl.innerHTML = '<p class="text-muted">No critical workflow blockers found. Review studies and deliverables next.</p>';
    } else {
      blockersEl.innerHTML = `
        <ul class="dashboard-blocker-list">
          ${actionable.map(item => `
            <li class="dashboard-blocker dashboard-blocker--${esc(item.severity)}">
              <div>
                <strong>${esc(item.step)}: ${esc(item.label)}</strong>
                <span>${esc(item.detail)}</span>
              </div>
              <a class="btn" href="${esc(item.href)}">Fix</a>
            </li>
          `).join('')}
        </ul>
      `;
    }
  }

  const healthEl = document.getElementById('dashboard-health');
  if (healthEl) {
    const health = diagnostics.health;
    const metrics = [
      ['Equipment', health.equipment],
      ['Loads', `${health.completeLoads}/${health.loads} complete`],
      ['One-Line', `${health.oneLineComponents} components`],
      ['Cable Schedule', `${health.scheduleReady}/${health.cableRows} schedule-ready`],
      ['Routing', `${health.routingReady}/${health.cableRows} routing-ready`],
      ['Route Results', health.routeResults],
      ['Pull Cards', `${health.pullGroups} pull group${health.pullGroups === 1 ? '' : 's'}`],
      ['Spool Sheets', `${health.spoolSheets} spool${health.spoolSheets === 1 ? '' : 's'}`],
      ['Raceways', health.raceways],
      ['Studies', health.studies],
      ['Report Snapshots', health.reportSnapshots],
      ['Release Packages', health.lifecyclePackages],
      ['Deliverables', health.deliverables]
    ];
    healthEl.innerHTML = `
      <div class="dashboard-health-grid">
        ${metrics.map(([label, value]) => `
          <article class="workflow-summary-card">
            <span>${esc(label)}</span>
            <strong>${esc(value)}</strong>
          </article>
        `).join('')}
      </div>
      ${health.reconcilePending ? '<p class="dashboard-reconcile-warning">One-Line changes are pending schedule reconcile.</p>' : ''}
    `;
  }
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

// ---------------------------------------------------------------------------
// Release Package panel (Gap #71)
// ---------------------------------------------------------------------------

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderPackageHistory(container) {
  if (!container) return;
  const packages = getLifecyclePackages();
  if (!packages.length) {
    container.innerHTML = '<p class="text-muted">No packages released yet.</p>';
    return;
  }

  const table = document.createElement('table');
  table.className = 'data-table pkg-history-table';
  table.setAttribute('aria-label', 'Released packages');
  table.innerHTML = `
    <thead>
      <tr>
        <th>Revision</th>
        <th>Date</th>
        <th>Author</th>
        <th>Status</th>
        <th>Cables</th>
        <th>Studies</th>
        <th>Actions</th>
      </tr>
    </thead>`;

  const tbody = document.createElement('tbody');
  for (const pkg of packages) {
    const date = pkg.createdAt ? pkg.createdAt.slice(0, 10) : '—';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${esc(pkg.revisionLabel)}</td>
      <td>${esc(date)}</td>
      <td>${esc(pkg.author)}</td>
      <td><span class="pkg-status-badge pkg-status--${esc(pkg.status.toLowerCase().replace(/ /g, '-'))}">${esc(pkg.status)}</span></td>
      <td>${esc(pkg.summary?.cableCount ?? 0)}</td>
      <td>${esc(pkg.summary?.studyCount ?? 0)}</td>
      <td>
        <a href="projectreport.html?pkg=${esc(pkg.id)}" class="btn btn-sm">Load in Report Builder</a>
        <button class="btn btn-sm btn-danger pkg-delete-btn" data-pkg-id="${esc(pkg.id)}" aria-label="Delete package ${esc(pkg.revisionLabel)}">Delete</button>
      </td>`;
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);

  container.innerHTML = '';
  container.appendChild(table);

  container.querySelectorAll('.pkg-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-pkg-id');
      if (!id) return;
      if (!window.confirm(`Delete package "${btn.getAttribute('aria-label').replace('Delete package ', '')}"?`)) return;
      deleteLifecyclePackage(id);
      renderPackageHistory(container);
    });
  });
}

function initReleasePackageForm() {
  const form       = document.getElementById('release-pkg-form');
  const statusEl   = document.getElementById('release-pkg-status');
  const historyEl  = document.getElementById('pkg-history');

  if (!form) return;

  // Initial render of history
  renderPackageHistory(historyEl);

  form.addEventListener('submit', e => {
    e.preventDefault();

    const revisionLabel = (document.getElementById('pkg-revision')?.value || '').trim() || 'Rev 0';
    const author        = (document.getElementById('pkg-author')?.value   || '').trim();
    const status        = document.getElementById('pkg-status')?.value    || 'Draft';
    const notes         = (document.getElementById('pkg-notes')?.value    || '').trim();

    const projectData = {
      cables:    getCables(),
      trays:     getTrays(),
      studies:   getStudies(),
      approvals: getStudyApprovals(),
      oneLine:   getOneLine(),
    };

    const summary = summarizePackage(projectData);
    const pkg = buildLifecyclePackage({ revisionLabel, author, status, notes }, projectData);

    addLifecyclePackage(pkg);

    if (statusEl) {
      statusEl.textContent = `Package "${revisionLabel}" released — ${summary.cableCount} cable(s), ${summary.studyCount} study result(s).`;
    }

    renderPackageHistory(historyEl);

    // Reset form fields
    document.getElementById('pkg-revision').value = '';
    document.getElementById('pkg-author').value   = '';
    document.getElementById('pkg-notes').value    = '';
    document.getElementById('pkg-status').value   = 'Draft';
  });
}

window.addEventListener('DOMContentLoaded', () => {
  renderKpiStrip(document.getElementById('dashboard-kpi-strip'));
  renderWorkflowCoreDiagnostics();
  renderWorkflowSteps(document.getElementById('workflow-step-grid'));
  renderProjectSummary(document.getElementById('project-summary'));
  renderStudiesSummary(document.getElementById('studies-summary'));
  initReleasePackageForm();
});
