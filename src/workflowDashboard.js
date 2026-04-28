import { workflowOrder, getStepStatus } from './workflowStatus.js';
import {
  addProjectRevision,
  addStudyPackage,
  addDesignCoachDecision,
  getActiveBimConnectorPackageId,
  getActiveStudyPackageId,
  getBimElements,
  getBimConnectorPackages,
  getBimIssues,
  getCables,
  getConduits,
  getCurrentScenario,
  getDesignCoachDecisions,
  getDrcAcceptedFindings,
  getDuctbanks,
  getEquipment,
  getFieldObservations,
  getItem,
  getLoads,
  getOneLine,
  getPanels,
  getProjectRevisions,
  getProductCatalogRows,
  getStudies,
  getStudyApprovals,
  getStudyPackages,
  getTrays,
  setActiveStudyPackageId,
  setStudyApproval,
} from '../dataStore.mjs';
import { getProjectState } from '../projectStorage.js';
import { generateProjectReport } from '../analysis/projectReport.mjs';
import { buildDesignCoachPackage } from '../analysis/designCoach.mjs';
import { buildFieldCommissioningPackage } from '../analysis/fieldCommissioning.mjs';
import { buildBimRoundTripPackage } from '../analysis/bimRoundTrip.mjs';
import { buildConnectorReadinessPackage } from '../analysis/bimConnectorContract.mjs';
import {
  captureLifecycleSnapshot,
  createProjectRevision,
  createStudyPackage,
  diffProjectRevisions,
  estimateLifecycleBytes,
  summarizeLifecycleLineage,
} from '../analysis/projectLifecycle.mjs';
import { runDRC, trayFillPercent } from '../analysis/designRuleChecker.mjs';
import '../site.js';

// Studies tracked in the dashboard with display labels and their storage keys
const STUDY_DEFINITIONS = [
  { key: 'arcFlash',     label: 'Arc Flash',           href: 'arcFlash.html' },
  { key: 'shortCircuit', label: 'Short Circuit',        href: 'shortCircuit.html' },
  { key: 'loadFlow',     label: 'Load Flow',            href: 'loadFlow.html' },
  { key: 'optimalPowerFlow', label: 'Optimal Power Flow', href: 'optimalpowerflow.html' },
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
    {
      label: 'Cables',
      value: cables,
      href: 'cableschedule.html',
      icon: 'icons/components/Feeder.svg',
      subtitle: 'linked to Cable Schedule',
      state: 'linked',
    },
    {
      label: 'Trays',
      value: trays,
      href: 'racewayschedule.html',
      icon: 'icons/components/Busway.svg',
      subtitle: 'linked to Raceway Schedule',
      state: 'linked',
    },
    {
      label: 'Conduits',
      value: conduits,
      href: 'racewayschedule.html',
      icon: 'icons/components/Bus.svg',
      subtitle: 'linked to Raceway Schedule',
      state: 'linked',
    },
    {
      label: 'Ductbanks',
      value: ductbanks,
      href: 'ductbankroute.html',
      icon: 'icons/ductbank.svg',
      subtitle: 'linked to Ductbank Route',
      state: 'linked',
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

function renderSampleProjectsPanel(container) {
  if (!container) return;
  const sampleInfo = getItem('sampleProjectInfo', null);
  container.innerHTML = '';

  if (sampleInfo?.id) {
    const summary = document.createElement('p');
    summary.className = 'text-muted';
    summary.textContent = `Current project was opened from the ${sampleInfo.title || sampleInfo.id} sample.`;
    container.appendChild(summary);

    const list = document.createElement('ul');
    list.className = 'dash-stat-list';
    list.setAttribute('role', 'list');
    [
      ['Domain', sampleInfo.domain || 'Sample'],
      ['Start page', sampleInfo.startPage || 'workflowdashboard.html'],
      ['Opened', sampleInfo.openedAt ? formatDate(sampleInfo.openedAt) : 'this session'],
    ].forEach(([label, value]) => {
      const item = document.createElement('li');
      item.className = 'dash-stat-item';
      const valueEl = document.createElement('span');
      valueEl.className = 'dash-stat-value';
      valueEl.textContent = value;
      const labelEl = document.createElement('span');
      labelEl.className = 'dash-stat-label';
      labelEl.textContent = label;
      item.appendChild(valueEl);
      item.appendChild(labelEl);
      list.appendChild(item);
    });
    container.appendChild(list);
  } else {
    const empty = document.createElement('p');
    empty.className = 'text-muted';
    empty.textContent = 'Open a curated demo project to explore a complete workflow without manual setup.';
    container.appendChild(empty);
  }

  const actions = document.createElement('div');
  actions.className = 'controls-row';
  const galleryLink = document.createElement('a');
  galleryLink.className = 'btn primary-btn';
  galleryLink.href = 'samplegallery.html';
  galleryLink.textContent = 'Open Sample Gallery';
  actions.appendChild(galleryLink);
  if (sampleInfo?.startPage) {
    const startLink = document.createElement('a');
    startLink.className = 'btn secondary-btn';
    startLink.href = sampleInfo.startPage;
    startLink.textContent = 'Resume Guided Start';
    actions.appendChild(startLink);
  }
  container.appendChild(actions);
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

function currentProjectName() {
  const state = getProjectState();
  return state?.name || 'Untitled Project';
}

function buildTrayCableMap(cables = []) {
  return cables.reduce((acc, cable) => {
    const raceway = cable.route_preference || cable.raceway;
    if (!raceway) return acc;
    if (!acc[raceway]) acc[raceway] = [];
    acc[raceway].push(cable);
    return acc;
  }, {});
}

function buildCurrentDesignCoachPackage() {
  const cables = getCables();
  const trays = getTrays();
  const conduits = getConduits();
  const ductbanks = getDuctbanks();
  const studies = getStudies();
  const approvals = getStudyApprovals();
  const lifecycle = summarizeLifecycleLineage({
    projectRevisions: getProjectRevisions(),
    studyPackages: getStudyPackages(),
    activeStudyPackageId: getActiveStudyPackageId(),
  });
  const report = generateProjectReport({
    cables,
    trays,
    conduits,
    ductbanks,
    equipment: getEquipment(),
    panels: getPanels(),
    oneLine: getOneLine(),
    projectName: currentProjectName(),
    studies,
    approvals,
    lifecycle,
    productCatalog: getProductCatalogRows(),
    fieldObservations: getFieldObservations(),
    bimElements: getBimElements(),
    bimIssues: getBimIssues(),
    bimConnectorPackages: getBimConnectorPackages(),
    activeBimConnectorPackageId: getActiveBimConnectorPackageId(),
  });
  const drcResult = runDRC({
    trays,
    cables,
    trayCableMap: buildTrayCableMap(cables),
  }, { acceptedFindings: getDrcAcceptedFindings() });

  return buildDesignCoachPackage({
    context: {
      projectReport: report,
      studies,
      approvals,
      lifecycle,
      drcResult,
    },
    decisions: getDesignCoachDecisions(),
  });
}

function buildCurrentLifecycleSnapshot() {
  return captureLifecycleSnapshot({
    projectName: currentProjectName(),
    scenario: getCurrentScenario(),
    cables: getCables(),
    trays: getTrays(),
    conduits: getConduits(),
    ductbanks: getDuctbanks(),
    equipment: getEquipment(),
    panels: getPanels(),
    loads: getLoads(),
    oneLine: getOneLine(),
    studies: getStudies(),
    approvals: getStudyApprovals(),
    drcAcceptedFindings: getDrcAcceptedFindings(),
    designCoachDecisions: getDesignCoachDecisions(),
    fieldObservations: getFieldObservations(),
    bimElements: getBimElements(),
    bimIssues: getBimIssues(),
    bimConnectorPackages: getBimConnectorPackages(),
    activeBimConnectorPackageId: getActiveBimConnectorPackageId(),
    assumptions: {
      lifecycle: 'Local lifecycle package captures the current browser project state for engineering review and report lineage.',
    },
  });
}

function formatDate(value) {
  if (!value) return 'n/a';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function diffSummaryText(diff = {}) {
  const summary = diff.summary || {};
  const parts = [
    `${summary.schedulesAdded || 0} added`,
    `${summary.schedulesRemoved || 0} removed`,
    `${summary.schedulesChanged || 0} schedule changes`,
    `${summary.oneLineChanged || 0} one-line changes`,
    `${summary.studiesChanged || 0} study changes`,
  ];
  return parts.join(' | ');
}

function renderLifecycleReleases(container) {
  if (!container) return;
  const revisions = getProjectRevisions();
  const packages = getStudyPackages();
  const activeId = getActiveStudyPackageId();
  const lineage = summarizeLifecycleLineage({
    projectRevisions: revisions,
    studyPackages: packages,
    activeStudyPackageId: activeId,
  });

  container.innerHTML = '';

  const summary = document.createElement('p');
  summary.className = 'text-muted';
  summary.textContent = `${lineage.packageCount} package${lineage.packageCount === 1 ? '' : 's'} captured. Active package: ${lineage.activePackage?.revision || 'none'}.`;
  container.appendChild(summary);

  if (!packages.length) {
    const empty = document.createElement('p');
    empty.className = 'report-empty';
    empty.textContent = 'No lifecycle release packages have been captured for this scenario.';
    container.appendChild(empty);
    return;
  }

  const list = document.createElement('ul');
  list.className = 'dash-study-list';
  list.setAttribute('role', 'list');

  [...packages].reverse().forEach(pkg => {
    const li = document.createElement('li');
    li.className = 'dash-study-item';

    const title = document.createElement('span');
    title.className = 'dash-study-name';
    title.textContent = `${pkg.revision} - ${pkg.name}`;

    const meta = document.createElement('span');
    meta.className = 'dash-stat-subtitle';
    meta.textContent = `${pkg.status} | ${formatDate(pkg.createdAt)} | ${pkg.author || 'Unassigned'} | ${pkg.studyCount || 0} studies | ${pkg.modelHash || 'no hash'}`;

    const diff = document.createElement('span');
    diff.className = 'dash-stat-subtitle';
    diff.textContent = `Diff: ${diffSummaryText(pkg.diffFromPrevious)}`;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn secondary-btn';
    button.textContent = pkg.id === activeId ? 'Active' : 'Set Active';
    button.disabled = pkg.id === activeId;
    button.addEventListener('click', () => {
      setActiveStudyPackageId(pkg.id);
      renderLifecycleReleases(container);
      renderDesignCoach();
    });

    li.appendChild(title);
    li.appendChild(meta);
    li.appendChild(diff);
    li.appendChild(button);
    list.appendChild(li);
  });

  container.appendChild(list);
}

function wireLifecycleReleaseForm() {
  const form = document.getElementById('lifecycle-release-form');
  const statusEl = document.getElementById('lifecycle-release-status');
  const listEl = document.getElementById('lifecycle-release-list');
  if (!form) return;

  function setStatus(message, variant = 'info') {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = `report-status report-status--${variant}`;
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    try {
      const formData = new FormData(form);
      const revisions = getProjectRevisions();
      const snapshot = buildCurrentLifecycleSnapshot();
      const projectRevision = createProjectRevision({
        name: formData.get('lifecycle-name') || `${currentProjectName()} Release`,
        revision: formData.get('lifecycle-revision') || `R${revisions.length + 1}`,
        author: formData.get('lifecycle-author') || '',
        status: formData.get('lifecycle-status') || 'released',
        scenario: getCurrentScenario(),
        snapshot,
        notes: formData.get('lifecycle-notes') || '',
      });
      const previousRevision = revisions[revisions.length - 1] || null;
      const diffFromPrevious = previousRevision ? diffProjectRevisions(previousRevision, projectRevision) : diffProjectRevisions(null, projectRevision);
      const lifecyclePackage = createStudyPackage({
        projectRevision,
        diffFromPrevious,
        reportMetadata: {
          projectName: currentProjectName(),
          releaseSource: 'workflowdashboard.html',
          localStorageBytes: estimateLifecycleBytes(projectRevision),
        },
        lineage: {
          previousRevisionId: previousRevision?.id || '',
          scenario: getCurrentScenario(),
        },
      });

      addProjectRevision(projectRevision);
      addStudyPackage(lifecyclePackage);
      setActiveStudyPackageId(lifecyclePackage.id);
      renderLifecycleReleases(listEl);
      renderDesignCoach();
      setStatus(`Lifecycle package ${lifecyclePackage.revision} captured and set active.`, 'success');
    } catch (err) {
      console.error('[workflowDashboard] Lifecycle release failed:', err);
      setStatus(err.message || 'Lifecycle package capture failed.', 'error');
    }
  });

  renderLifecycleReleases(listEl);
}

function actionBadge(action) {
  const span = document.createElement('span');
  span.className = `dash-badge dash-badge--${action.severity === 'high' || action.severity === 'critical' ? 'warning' : 'neutral'}`;
  span.textContent = `${action.severity} / ${action.category}`;
  return span;
}

function addCoachDecision(action, decision, applyResult = null) {
  addDesignCoachDecision({
    actionId: action.id,
    fingerprint: action.fingerprint,
    decision,
    decidedAt: new Date().toISOString(),
    decidedBy: '',
    note: '',
    ...(applyResult ? { applyResult } : {}),
  });
}

function applyCoachAction(action) {
  if (!action?.apply) return { status: 'skipped', message: 'No apply action is available.' };
  if (action.apply.kind === 'setActiveStudyPackage' && action.apply.packageId) {
    setActiveStudyPackageId(action.apply.packageId);
    return { status: 'applied', message: `Active study package set to ${action.apply.packageId}.` };
  }
  if (action.apply.kind === 'initializePendingApproval' && action.apply.studyKey) {
    setStudyApproval(action.apply.studyKey, {
      status: 'pending',
      reviewedBy: '',
      approvedAt: new Date().toISOString().slice(0, 10),
      note: 'Initialized from Design Coach action queue.',
    });
    return { status: 'applied', message: `Pending approval initialized for ${action.apply.studyKey}.` };
  }
  return { status: 'blocked', message: `Unsupported apply action: ${action.apply.kind || 'unknown'}.` };
}

function renderDesignCoach() {
  const summaryEl = document.getElementById('design-coach-summary');
  const actionsEl = document.getElementById('design-coach-actions');
  if (!summaryEl || !actionsEl) return;

  const coach = buildCurrentDesignCoachPackage();
  summaryEl.innerHTML = '';
  actionsEl.innerHTML = '';

  const summary = document.createElement('p');
  summary.className = 'text-muted';
  summary.textContent = `${coach.summary.total} open action${coach.summary.total === 1 ? '' : 's'} | ${coach.summary.highPriority} high priority | ${coach.summary.applyAvailable} apply-ready.`;
  summaryEl.appendChild(summary);

  if (!coach.actions.length) {
    const empty = document.createElement('p');
    empty.className = 'report-empty';
    empty.textContent = 'No open design coach actions.';
    actionsEl.appendChild(empty);
    return;
  }

  const list = document.createElement('ul');
  list.className = 'dash-study-list';
  list.setAttribute('role', 'list');

  coach.actions.slice(0, 12).forEach(action => {
    const li = document.createElement('li');
    li.className = 'dash-study-item';

    const link = document.createElement('a');
    link.className = 'dash-study-name';
    link.href = action.pageHref || 'workflowdashboard.html';
    link.textContent = action.title;

    const description = document.createElement('span');
    description.className = 'dash-stat-subtitle';
    description.textContent = action.description;

    const recommendation = document.createElement('span');
    recommendation.className = 'dash-stat-subtitle';
    recommendation.textContent = action.recommendation;

    const actions = document.createElement('span');
    actions.className = 'controls-row';

    ['accepted', 'rejected', 'dismissed'].forEach(decision => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn secondary-btn';
      button.textContent = decision[0].toUpperCase() + decision.slice(1);
      button.addEventListener('click', () => {
        addCoachDecision(action, decision);
        renderDesignCoach();
      });
      actions.appendChild(button);
    });

    if (action.apply) {
      const applyBtn = document.createElement('button');
      applyBtn.type = 'button';
      applyBtn.className = 'btn primary-btn';
      applyBtn.textContent = 'Apply';
      applyBtn.addEventListener('click', () => {
        const applyResult = applyCoachAction(action);
        addCoachDecision(action, 'accepted', applyResult);
        renderLifecycleReleases(document.getElementById('lifecycle-release-list'));
        renderDesignCoach();
      });
      actions.appendChild(applyBtn);
    }

    li.appendChild(actionBadge(action));
    li.appendChild(link);
    li.appendChild(description);
    li.appendChild(recommendation);
    li.appendChild(actions);
    list.appendChild(li);
  });

  actionsEl.appendChild(list);
}

function renderBimCoordinationPanel(container) {
  if (!container) return;
  const pkg = buildBimRoundTripPackage({
    projectName: currentProjectName(),
    bimElements: getBimElements(),
    bimIssues: getBimIssues(),
    cables: getCables(),
    trays: getTrays(),
    conduits: getConduits(),
    equipment: getEquipment(),
  });
  container.innerHTML = '';
  const summary = pkg.summary || {};
  const connector = buildConnectorReadinessPackage({
    packages: getBimConnectorPackages(),
    activePackageId: getActiveBimConnectorPackageId(),
    projectState: {
      projectName: currentProjectName(),
      bimElements: getBimElements(),
      bimIssues: getBimIssues(),
      cables: getCables(),
      trays: getTrays(),
      conduits: getConduits(),
      equipment: getEquipment(),
    },
  });
  const list = document.createElement('ul');
  list.className = 'dash-stat-list';
  list.setAttribute('role', 'list');
  [
    ['Elements', summary.elementCount || 0, 'linked'],
    ['Mapped', summary.mappedCount || 0, 'linked'],
    ['Unmapped', summary.unmappedCount || 0, summary.unmappedCount ? 'warn' : 'neutral'],
    ['Quantity deltas', summary.changedGroups || 0, summary.changedGroups ? 'warn' : 'neutral'],
    ['Open issues', summary.openIssues || 0, summary.openIssues ? 'warn' : 'neutral'],
    ['Connector packages', connector.summary?.packageCount || 0, connector.summary?.packageCount ? 'linked' : 'neutral'],
    ['Connector deltas', connector.summary?.quantityDeltas || 0, connector.summary?.quantityDeltas ? 'warn' : 'neutral'],
  ].forEach(([label, value, state]) => {
    const item = document.createElement('li');
    item.className = `dash-stat-item dash-stat-item--${state}`;
    const valueEl = document.createElement('span');
    valueEl.className = 'dash-stat-value';
    valueEl.textContent = value;
    const labelEl = document.createElement('span');
    labelEl.className = 'dash-stat-label';
    labelEl.textContent = label;
    item.appendChild(valueEl);
    item.appendChild(labelEl);
    list.appendChild(item);
  });
  container.appendChild(list);

  const note = document.createElement('p');
  note.className = 'text-muted';
  note.textContent = summary.elementCount
    ? 'Imported BIM elements are available for mapping, reconciliation, and BCF-style issue review.'
    : 'Import BIM element metadata to compare model takeoff quantities against CableTrayRoute schedules.';
  container.appendChild(note);

  const actions = document.createElement('div');
  actions.className = 'controls-row';
  const link = document.createElement('a');
  link.className = 'btn primary-btn';
  link.href = 'bimcoordination.html';
  link.textContent = 'Open BIM Coordination';
  actions.appendChild(link);
  container.appendChild(actions);
}

function renderEquipmentEvaluationPanel(container) {
  if (!container) return;
  const report = generateProjectReport({
    cables: getCables(),
    trays: getTrays(),
    conduits: getConduits(),
    ductbanks: getDuctbanks(),
    equipment: getEquipment(),
    panels: getPanels(),
    oneLine: getOneLine(),
    projectName: currentProjectName(),
    studies: getStudies(),
    approvals: getStudyApprovals(),
    productCatalog: getProductCatalogRows(),
    fieldObservations: getFieldObservations(),
    bimElements: getBimElements(),
    bimIssues: getBimIssues(),
    bimConnectorPackages: getBimConnectorPackages(),
    activeBimConnectorPackageId: getActiveBimConnectorPackageId(),
  });
  const evaluation = report.equipmentEvaluation;
  container.innerHTML = '';

  const summary = evaluation?.summary || {};
  const list = document.createElement('ul');
  list.className = 'dash-stat-list';
  list.setAttribute('role', 'list');
  [
    ['Equipment', summary.equipmentCount || 0, 'linked'],
    ['Pass', summary.pass || 0, 'linked'],
    ['Warn', summary.warn || 0, summary.warn ? 'warn' : 'neutral'],
    ['Fail', summary.fail || 0, summary.fail ? 'warn' : 'neutral'],
    ['Missing data', summary.missingData || 0, summary.missingData ? 'warn' : 'neutral'],
  ].forEach(([label, value, state]) => {
    const item = document.createElement('li');
    item.className = `dash-stat-item dash-stat-item--${state}`;
    const valueEl = document.createElement('span');
    valueEl.className = 'dash-stat-value';
    valueEl.textContent = value;
    const labelEl = document.createElement('span');
    labelEl.className = 'dash-stat-label';
    labelEl.textContent = label;
    item.appendChild(valueEl);
    item.appendChild(labelEl);
    list.appendChild(item);
  });
  container.appendChild(list);

  const note = document.createElement('p');
  note.className = 'text-muted';
  note.textContent = summary.fail
    ? 'One or more equipment ratings are below saved duty values.'
    : summary.missingData
      ? 'Add equipment ratings and saved studies to complete the inventory.'
      : 'Equipment duty inventory has no failed or missing-data rows.';
  container.appendChild(note);

  const actions = document.createElement('div');
  actions.className = 'controls-row';
  const equipmentLink = document.createElement('a');
  equipmentLink.className = 'btn secondary-btn';
  equipmentLink.href = 'equipmentlist.html';
  equipmentLink.textContent = 'Edit Equipment Ratings';
  const reportLink = document.createElement('a');
  reportLink.className = 'btn primary-btn';
  reportLink.href = 'projectreport.html';
  reportLink.textContent = 'Open Report';
  actions.appendChild(equipmentLink);
  actions.appendChild(reportLink);
  container.appendChild(actions);
}

function renderFieldVerificationPanel(container) {
  if (!container) return;
  const pkg = buildFieldCommissioningPackage({
    projectName: currentProjectName(),
    observations: getFieldObservations(),
  });
  container.innerHTML = '';
  const list = document.createElement('ul');
  list.className = 'dash-stat-list';
  list.setAttribute('role', 'list');
  [
    ['Open', pkg.summary.open || 0, pkg.summary.open ? 'warn' : 'neutral'],
    ['Pending review', pkg.summary.pendingReview || 0, pkg.summary.pendingReview ? 'warn' : 'neutral'],
    ['Verified', pkg.summary.verified || 0, 'linked'],
    ['Rejected', pkg.summary.rejected || 0, pkg.summary.rejected ? 'warn' : 'neutral'],
    ['Attachments', pkg.summary.attachmentCount || 0, 'linked'],
  ].forEach(([label, value, state]) => {
    const item = document.createElement('li');
    item.className = `dash-stat-item dash-stat-item--${state}`;
    const valueEl = document.createElement('span');
    valueEl.className = 'dash-stat-value';
    valueEl.textContent = value;
    const labelEl = document.createElement('span');
    labelEl.className = 'dash-stat-label';
    labelEl.textContent = label;
    item.appendChild(valueEl);
    item.appendChild(labelEl);
    list.appendChild(item);
  });
  container.appendChild(list);

  const note = document.createElement('p');
  note.className = 'text-muted';
  note.textContent = pkg.summary.openItems
    ? `${pkg.summary.openItems} field item(s) remain open, pending review, or rejected.`
    : 'No unresolved field verification items.';
  container.appendChild(note);

  const actions = document.createElement('div');
  actions.className = 'controls-row';
  const fieldLink = document.createElement('a');
  fieldLink.className = 'btn primary-btn';
  fieldLink.href = 'fieldview.html';
  fieldLink.textContent = 'Open Field View';
  actions.appendChild(fieldLink);
  container.appendChild(actions);
}

function renderProductCatalogPanel(container) {
  if (!container) return;
  const report = generateProjectReport({
    cables: getCables(),
    trays: getTrays(),
    conduits: getConduits(),
    ductbanks: getDuctbanks(),
    equipment: getEquipment(),
    panels: getPanels(),
    oneLine: getOneLine(),
    projectName: currentProjectName(),
    studies: getStudies(),
    approvals: getStudyApprovals(),
    productCatalog: getProductCatalogRows(),
  });
  const catalog = report.productCatalog;
  container.innerHTML = '';
  const summary = catalog?.summary || {};
  const list = document.createElement('ul');
  list.className = 'dash-stat-list';
  list.setAttribute('role', 'list');
  [
    ['Catalog rows', summary.total || 0, 'linked'],
    ['Approved', summary.approved || 0, 'linked'],
    ['Unapproved', summary.unapproved || 0, summary.unapproved ? 'warn' : 'neutral'],
    ['Stale', summary.stale || 0, summary.stale ? 'warn' : 'neutral'],
    ['Usage warnings', summary.unapprovedUsage || 0, summary.unapprovedUsage ? 'warn' : 'neutral'],
  ].forEach(([label, value, state]) => {
    const item = document.createElement('li');
    item.className = `dash-stat-item dash-stat-item--${state}`;
    const valueEl = document.createElement('span');
    valueEl.className = 'dash-stat-value';
    valueEl.textContent = value;
    const labelEl = document.createElement('span');
    labelEl.className = 'dash-stat-label';
    labelEl.textContent = label;
    item.appendChild(valueEl);
    item.appendChild(labelEl);
    list.appendChild(item);
  });
  container.appendChild(list);

  const note = document.createElement('p');
  note.className = 'text-muted';
  note.textContent = summary.unapprovedUsage
    ? 'Reports include generic, unapproved, stale, or unmatched product selections.'
    : 'Catalog governance is ready for report packaging.';
  container.appendChild(note);

  const actions = document.createElement('div');
  actions.className = 'controls-row';
  const catalogLink = document.createElement('a');
  catalogLink.className = 'btn primary-btn';
  catalogLink.href = 'productcatalog.html';
  catalogLink.textContent = 'Open Product Catalog';
  actions.appendChild(catalogLink);
  container.appendChild(actions);
}

window.addEventListener('DOMContentLoaded', () => {
  renderKpiStrip(document.getElementById('dashboard-kpi-strip'));
  renderWorkflowSteps(document.getElementById('workflow-step-grid'));
  renderProjectSummary(document.getElementById('project-summary'));
  renderSampleProjectsPanel(document.getElementById('sample-projects-panel'));
  renderStudiesSummary(document.getElementById('studies-summary'));
  renderFieldVerificationPanel(document.getElementById('field-verification-panel'));
  renderBimCoordinationPanel(document.getElementById('bim-coordination-panel'));
  renderProductCatalogPanel(document.getElementById('product-catalog-panel'));
  renderEquipmentEvaluationPanel(document.getElementById('equipment-evaluation-panel'));
  wireLifecycleReleaseForm();
  renderDesignCoach();
});
