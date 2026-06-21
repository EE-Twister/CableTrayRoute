import {
  READINESS_VOCABULARY,
  workflowOrder,
  getStepStatus,
  getCableReadiness,
  countOneLineComponents,
  getContractReadinessCopy
} from './workflowStatus.js';
import { openModal } from './components/modal.js';
import {
  getEquipment, getLoads, getCables, getTrays, getConduits, getDuctbanks, getStudies,
  getStudyApprovals, getOneLine, getDesignBasis, setDesignBasis,
  getDesignGateApprovals, setDesignGateApprovals,
  setOneLine, setCables, setTrays, setConduits, setDuctbanks, setItem,
  getLifecyclePackages, getReportSnapshots, getItem, addLifecyclePackage, deleteLifecyclePackage,
} from '../dataStore.mjs';
import { trayFillPercent } from '../analysis/designRuleChecker.mjs';
import { buildLifecyclePackage, summarizePackage } from '../analysis/lifecyclePackage.mjs';
import { runDesignCoach } from '../analysis/designCoach.mjs';
import { evaluateEquipment, summariseEvaluation } from '../analysis/equipmentEvaluation.mjs';
import { buildGuidedWorkflowRunner, buildWorkflowCoreDiagnostics } from '../analysis/projectWorkflowCore.mjs';
import { buildMinimalDesignAutomation } from '../analysis/workflowAutomation.mjs';
import { buildDesignBasisReview, normalizeDesignBasis, summarizeDesignBasis } from '../analysis/designBasis.mjs';
import protectiveDevices from '../data/protectiveDevices.mjs';
import '../site.js';
import './projectManager.js';

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
  { key: 'cableThermalEnvironment', label: 'Cable Thermal Environment', href: 'cablethermalenv.html' },
  { key: 'optimalPowerFlow', label: 'Optimal Power Flow', href: 'optimalpowerflow.html' },
  { key: 'lighting',               label: 'Egress Lighting',         href: 'lighting.html' },
  { key: 'trustCenter',            label: 'Trust Center',            href: 'trustcenter.html' },
];
const DASHBOARD_READINESS_COPY = getContractReadinessCopy('workflowdashboard.html');

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

function currentDesignBasisSummary() {
  return summarizeDesignBasis(getDesignBasis());
}

function currentDesignBasisReview() {
  return buildDesignBasisReview({
    designBasis: getDesignBasis(),
    designGateApprovals: getDesignGateApprovals(),
    equipment: getEquipment(),
    oneLine: getOneLine(),
    cables: getCables(),
    trays: getTrays(),
    conduits: getConduits(),
    ductbanks: getDuctbanks(),
    studies: getStudies(),
    studyApprovals: getStudyApprovals(),
    routeResults: getItem('latestRouteResults', null),
    tccSettings: getItem('tccSettings', null)
  });
}

function optionHtml(value, current, label = value) {
  return `<option value="${esc(value)}"${String(value) === String(current) ? ' selected' : ''}>${esc(label)}</option>`;
}

function checkedAttr(value) {
  return value ? ' checked' : '';
}

function designBasisStatusText(summary) {
  if (!summary.configured) return 'Not set';
  if (!summary.complete) return 'Needs review';
  return summary.warnings.length ? 'Configured with notes' : 'Configured';
}

function numberInputValue(value) {
  return Number.isFinite(Number(value)) ? String(value) : '';
}

function renderDesignBasisForm(body, controller, basis) {
  body.classList.add('design-basis-modal-body');
  const form = document.createElement('form');
  form.id = 'design-basis-form';
  form.className = 'design-basis-form';
  form.noValidate = true;
  form.innerHTML = `
    <section class="design-basis-section" aria-labelledby="design-basis-code-heading">
      <h3 id="design-basis-code-heading">Code Basis</h3>
      <div class="modal-field-grid">
        <div class="modal-form-field">
          <label for="basis-primary-code">Primary Code</label>
          <select id="basis-primary-code" name="primaryCode">
            ${optionHtml('NEC', basis.codeBasis.primaryCode, 'NEC')}
            ${optionHtml('CEC', basis.codeBasis.primaryCode, 'CEC')}
            ${optionHtml('IEC', basis.codeBasis.primaryCode, 'IEC')}
          </select>
        </div>
        <div class="modal-form-field">
          <label for="basis-edition">Edition</label>
          <input id="basis-edition" name="edition" value="${esc(basis.codeBasis.edition)}" required autocomplete="off">
        </div>
        <div class="modal-form-field">
          <label for="basis-jurisdiction">Jurisdiction</label>
          <input id="basis-jurisdiction" name="jurisdiction" value="${esc(basis.codeBasis.jurisdiction)}" placeholder="State / province / site" autocomplete="off">
        </div>
        <div class="modal-form-field">
          <label for="basis-ahj">AHJ</label>
          <input id="basis-ahj" name="ahj" value="${esc(basis.codeBasis.ahj)}" placeholder="Authority or reviewer" autocomplete="off">
        </div>
        <div class="modal-form-field">
          <label for="basis-units">Units</label>
          <select id="basis-units" name="unitSystem">
            ${optionHtml('imperial', basis.codeBasis.unitSystem, 'Imperial')}
            ${optionHtml('metric', basis.codeBasis.unitSystem, 'Metric')}
          </select>
        </div>
      </div>
    </section>

    <section class="design-basis-section" aria-labelledby="design-basis-sizing-heading">
      <h3 id="design-basis-sizing-heading">Sizing Defaults</h3>
      <div class="modal-field-grid">
        <div class="modal-form-field">
          <label for="basis-conductor-material">Conductor</label>
          <select id="basis-conductor-material" name="conductorMaterial">
            ${optionHtml('copper', basis.sizingDefaults.conductorMaterial, 'Copper')}
            ${optionHtml('aluminum', basis.sizingDefaults.conductorMaterial, 'Aluminum')}
          </select>
        </div>
        <div class="modal-form-field">
          <label for="basis-insulation">Insulation</label>
          <input id="basis-insulation" name="insulationType" value="${esc(basis.sizingDefaults.insulationType)}" autocomplete="off">
        </div>
        <div class="modal-form-field">
          <label for="basis-temp-rating">Temp Rating</label>
          <select id="basis-temp-rating" name="temperatureRatingC">
            ${optionHtml('60', basis.sizingDefaults.temperatureRatingC, '60C')}
            ${optionHtml('75', basis.sizingDefaults.temperatureRatingC, '75C')}
            ${optionHtml('90', basis.sizingDefaults.temperatureRatingC, '90C')}
          </select>
        </div>
        <div class="modal-form-field">
          <label for="basis-installation">Install Method</label>
          <select id="basis-installation" name="installationType">
            ${optionHtml('conduit', basis.sizingDefaults.installationType, 'Conduit')}
            ${optionHtml('tray', basis.sizingDefaults.installationType, 'Cable tray')}
            ${optionHtml('direct-buried', basis.sizingDefaults.installationType, 'Direct buried')}
          </select>
        </div>
        <div class="modal-form-field">
          <label for="basis-default-pf">Default PF</label>
          <input id="basis-default-pf" name="defaultPowerFactor" type="number" min="0.1" max="1" step="0.01" value="${esc(numberInputValue(basis.sizingDefaults.defaultPowerFactor))}">
        </div>
        <div class="modal-form-field">
          <label for="basis-voltage-drop">Voltage Drop Limit</label>
          <input id="basis-voltage-drop" name="voltageDropLimitPct" type="number" min="0.1" max="20" step="0.1" value="${esc(numberInputValue(basis.sizingDefaults.voltageDropLimitPct))}">
        </div>
        <div class="modal-form-field">
          <label for="basis-continuous-policy">Load Duty</label>
          <select id="basis-continuous-policy" name="continuousLoadPolicy">
            ${optionHtml('assume-continuous', basis.sizingDefaults.continuousLoadPolicy, 'Assume continuous when blank')}
            ${optionHtml('assume-noncontinuous', basis.sizingDefaults.continuousLoadPolicy, 'Assume non-continuous when blank')}
            ${optionHtml('require-duty-field', basis.sizingDefaults.continuousLoadPolicy, 'Require duty field review')}
          </select>
        </div>
      </div>
    </section>

    <section class="design-basis-section" aria-labelledby="design-basis-routing-heading">
      <h3 id="design-basis-routing-heading">Routing Defaults</h3>
      <div class="modal-field-grid">
        <div class="modal-form-field">
          <label for="basis-default-length">Default Length</label>
          <input id="basis-default-length" name="defaultLengthFt" type="number" min="1" step="1" value="${esc(numberInputValue(basis.routingDefaults.defaultLengthFt))}">
        </div>
        <div class="modal-form-field">
          <label for="basis-tray-id">Starter Raceway</label>
          <input id="basis-tray-id" name="defaultTrayId" value="${esc(basis.routingDefaults.defaultTrayId)}" autocomplete="off">
        </div>
        <div class="modal-form-field">
          <label for="basis-tray-width">Tray Width</label>
          <input id="basis-tray-width" name="defaultTrayWidthIn" type="number" min="1" step="1" value="${esc(numberInputValue(basis.routingDefaults.defaultTrayWidthIn))}">
        </div>
        <div class="modal-form-field">
          <label for="basis-tray-depth">Tray Depth</label>
          <input id="basis-tray-depth" name="defaultTrayDepthIn" type="number" min="1" step="1" value="${esc(numberInputValue(basis.routingDefaults.defaultTrayDepthIn))}">
        </div>
        <div class="modal-form-field">
          <label for="basis-tray-elevation">Elevation</label>
          <input id="basis-tray-elevation" name="defaultTrayElevationFt" type="number" step="1" value="${esc(numberInputValue(basis.routingDefaults.defaultTrayElevationFt))}">
        </div>
        <div class="modal-form-field">
          <label for="basis-fill-limit">Fill Limit</label>
          <input id="basis-fill-limit" name="fillLimitPct" type="number" min="1" max="100" step="1" value="${esc(numberInputValue(basis.routingDefaults.fillLimitPct))}">
        </div>
        <div class="modal-form-field">
          <label for="basis-field-policy">Route Policy</label>
          <select id="basis-field-policy" name="fieldRoutePolicy">
            ${optionHtml('allow-field-legs', basis.routingDefaults.fieldRoutePolicy, 'Allow field legs')}
            ${optionHtml('require-raceway-only', basis.routingDefaults.fieldRoutePolicy, 'Require raceway-only review')}
          </select>
        </div>
      </div>
    </section>

    <section class="design-basis-section" aria-labelledby="design-basis-gates-heading">
      <h3 id="design-basis-gates-heading">Study Prerequisites and Approval Rules</h3>
      <div class="design-basis-checklist">
        <label><input type="checkbox" name="requireUtilityFault"${checkedAttr(basis.studyPrerequisites.requireUtilityFault)}> Utility/source fault duty required for studies</label>
        <label><input type="checkbox" name="requireProtectiveDeviceSettings"${checkedAttr(basis.studyPrerequisites.requireProtectiveDeviceSettings)}> Protective-device settings required for TCC/arc flash</label>
        <label><input type="checkbox" name="requireEquipmentCoordinates"${checkedAttr(basis.studyPrerequisites.requireEquipmentCoordinates)}> Equipment coordinates required for routing</label>
        <label><input type="checkbox" name="requireArcFlashInputs"${checkedAttr(basis.studyPrerequisites.requireArcFlashInputs)}> Arc-flash input review required before release</label>
        <label><input type="checkbox" name="generatedRecordsRequireReview"${checkedAttr(basis.approvalRules.generatedRecordsRequireReview)}> User review required for generated records</label>
        <label><input type="checkbox" name="routeResultsRequireReview"${checkedAttr(basis.approvalRules.routeResultsRequireReview)}> Routing review required for generated route results</label>
        <label><input type="checkbox" name="studiesRequireReview"${checkedAttr(basis.approvalRules.studiesRequireReview)}> Engineering review required for saved studies</label>
        <label><input type="checkbox" name="releaseRequiresReviewer"${checkedAttr(basis.approvalRules.releaseRequiresReviewer)}> Release packages require a reviewer</label>
      </div>
      <div class="modal-field-grid design-basis-reviewer-grid">
        <div class="modal-form-field">
          <label for="basis-reviewer">Reviewer</label>
          <input id="basis-reviewer" name="reviewer" value="${esc(basis.approvalRules.reviewer)}" placeholder="Name or role" autocomplete="off">
        </div>
      </div>
    </section>
  `;
  body.appendChild(form);
  controller.registerForm(form);
  controller.setInitialFocus(form.querySelector('#basis-edition'));
}

function readDesignBasisForm(form) {
  const field = name => form.elements[name]?.value ?? '';
  const checked = name => Boolean(form.elements[name]?.checked);
  return normalizeDesignBasis({
    codeBasis: {
      primaryCode: field('primaryCode'),
      edition: field('edition'),
      jurisdiction: field('jurisdiction'),
      ahj: field('ahj'),
      unitSystem: field('unitSystem')
    },
    sizingDefaults: {
      conductorMaterial: field('conductorMaterial'),
      insulationType: field('insulationType'),
      temperatureRatingC: field('temperatureRatingC'),
      installationType: field('installationType'),
      defaultPowerFactor: field('defaultPowerFactor'),
      voltageDropLimitPct: field('voltageDropLimitPct'),
      continuousLoadPolicy: field('continuousLoadPolicy')
    },
    routingDefaults: {
      defaultLengthFt: field('defaultLengthFt'),
      defaultTrayId: field('defaultTrayId'),
      defaultTrayWidthIn: field('defaultTrayWidthIn'),
      defaultTrayDepthIn: field('defaultTrayDepthIn'),
      defaultTrayElevationFt: field('defaultTrayElevationFt'),
      fillLimitPct: field('fillLimitPct'),
      fieldRoutePolicy: field('fieldRoutePolicy')
    },
    studyPrerequisites: {
      requireUtilityFault: checked('requireUtilityFault'),
      requireProtectiveDeviceSettings: checked('requireProtectiveDeviceSettings'),
      requireEquipmentCoordinates: checked('requireEquipmentCoordinates'),
      requireArcFlashInputs: checked('requireArcFlashInputs')
    },
    approvalRules: {
      generatedRecordsRequireReview: checked('generatedRecordsRequireReview'),
      routeResultsRequireReview: checked('routeResultsRequireReview'),
      studiesRequireReview: checked('studiesRequireReview'),
      releaseRequiresReviewer: checked('releaseRequiresReviewer'),
      reviewer: field('reviewer')
    },
    updatedAt: new Date().toISOString()
  });
}

function openDesignBasisWizard() {
  const basis = normalizeDesignBasis(getDesignBasis());
  openModal({
    title: 'Design Basis Wizard',
    description: 'Set the project defaults and review rules that Auto-Build uses for generated workflow records.',
    primaryText: 'Save Design Basis',
    secondaryText: 'Cancel',
    defaultWidth: 'wide',
    render(body, controller) {
      renderDesignBasisForm(body, controller, basis);
    },
    onSubmit(controller) {
      const form = controller.body.querySelector('#design-basis-form');
      if (!form) return false;
      if (!form.reportValidity()) return false;
      const nextBasis = readDesignBasisForm(form);
      setDesignBasis(nextBasis);
      refreshDashboard();
      const statusEl = document.getElementById('dashboard-auto-build-status');
      if (statusEl) statusEl.textContent = 'Design basis saved. Auto-Build will use these defaults and review gates.';
      return nextBasis;
    }
  });
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
      helper: nextRequiredStep ? `${READINESS_VOCABULARY.missingInputs}: Recommended next action in the workflow.` : `${READINESS_VOCABULARY.ready}: All required workflow steps are complete.`,
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
      nextStepEl.textContent = `${READINESS_VOCABULARY.missingInputs}: Next recommended step: `;
      const link = document.createElement('a');
      link.href = nextRequiredStep.step.href;
      link.textContent = nextRequiredStep.step.label;
      nextStepEl.appendChild(link);
    } else {
      nextStepEl.textContent = `${READINESS_VOCABULARY.ready}: All workflow steps are complete. You are ready to generate reports.`;
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

function currentDashboardProject() {
  const latestRouteResults = getItem('latestRouteResults', null);
  return {
    equipment: getEquipment(),
    loads: getLoads(),
    oneLine: getOneLine(),
    cables: getCables(),
    trays: getTrays(),
    conduits: getConduits(),
    ductbanks: getDuctbanks(),
    studies: getStudies(),
    studyApprovals: getStudyApprovals(),
    reportSnapshots: getReportSnapshots(),
    deliverables: getLifecyclePackages(),
    routeResults: latestRouteResults,
    latestRouteResults,
    designBasis: getDesignBasis(),
    designGateApprovals: getDesignGateApprovals(),
    tccSettings: getItem('tccSettings', null),
    reconcilePending: Boolean(getItem('oneLineScheduleReconcilePending', false))
  };
}

function currentCoreDiagnostics() {
  return buildWorkflowCoreDiagnostics(currentDashboardProject());
}

function currentGuidedWorkflow() {
  return buildGuidedWorkflowRunner(currentDashboardProject());
}

function currentProjectForAutomation() {
  return {
    equipment: getEquipment(),
    loads: getLoads(),
    oneLine: getOneLine(),
    cables: getCables(),
    trays: getTrays(),
    conduits: getConduits(),
    ductbanks: getDuctbanks(),
    routeResults: getItem('latestRouteResults', null),
    designBasis: getDesignBasis()
  };
}

function automationSummaryText(summary) {
  const parts = [
    summary.createdOneLineComponents ? `${summary.createdOneLineComponents} one-line component(s)` : '',
    summary.createdOneLineConnections ? `${summary.createdOneLineConnections} one-line connection(s)` : '',
    summary.createdCables ? `${summary.createdCables} cable row(s)` : '',
    summary.updatedCables ? `${summary.updatedCables} cable row update(s)` : '',
    summary.createdRaceways ? `${summary.createdRaceways} starter raceway(s)` : '',
    summary.assignedCablesToRaceway ? `${summary.assignedCablesToRaceway} cable raceway assignment(s)` : '',
    summary.createdRouteResults ? `${summary.createdRouteResults} route result(s)` : ''
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : 'No missing workflow records found.';
}

function canRunWorkflowAutomation() {
  const equipmentCount = getEquipment().filter(row => Object.values(row || {}).some(value => String(value ?? '').trim() !== '')).length;
  const loadCount = getLoads().filter(row => Object.values(row || {}).some(value => String(value ?? '').trim() !== '')).length;
  return equipmentCount > 0 && loadCount > 0;
}

function refreshDashboard() {
  renderKpiStrip(document.getElementById('dashboard-kpi-strip'));
  renderWorkflowCoreDiagnostics();
  renderGuidedWorkflowRunner();
  renderComplianceMatrix();
  renderDesignBasisReviewPanel();
  renderWorkflowSteps(document.getElementById('workflow-step-grid'));
  renderProjectSummary(document.getElementById('project-summary'));
}

function handleAutoBuildWorkflow() {
  const automation = buildMinimalDesignAutomation(currentProjectForAutomation());
  if (!automation.changed) {
    const statusEl = document.getElementById('dashboard-auto-build-status');
    if (statusEl) statusEl.textContent = 'Workflow records are already built from the current equipment and load data.';
    const guidedStatusEl = document.getElementById('dashboard-guided-status');
    if (guidedStatusEl) guidedStatusEl.textContent = 'Workflow records are already built from the current equipment and load data.';
    return;
  }
  const summaryText = automationSummaryText(automation.summary);
  const gateText = automation.summary.reviewGates?.length
    ? ` ${automation.summary.reviewGates.length} review gate(s) remain active.`
    : '';
  setOneLine(automation.next.oneLine);
  setCables(automation.next.cables);
  setTrays(automation.next.trays);
  setConduits(automation.next.conduits);
  setDuctbanks(automation.next.ductbanks);
  setItem('latestRouteResults', automation.next.routeResults);
  setItem('oneLineScheduleReconcilePending', false);
  refreshDashboard();
  const statusEl = document.getElementById('dashboard-auto-build-status');
  if (statusEl) statusEl.textContent = `Auto-built ${summaryText}. Review assumptions before issuing.${gateText}`;
  const guidedStatusEl = document.getElementById('dashboard-guided-status');
  if (guidedStatusEl) guidedStatusEl.textContent = `Auto-built ${summaryText}.`;
}

function openReviewGateDrawer(gateId) {
  if (!gateId) return;
  const review = currentDesignBasisReview();
  const gate = review.gates.find(item => item.id === gateId);
  if (!gate) return;
  const basisSummary = currentDesignBasisSummary();
  const existing = gate.approval || getDesignGateApprovals()?.[gateId] || {};
  const reviewer = existing.reviewedBy || basisSummary.basis.approvalRules.reviewer || 'User';
  const status = existing.status || 'reviewed';
  const reviewDate = existing.approvedAt ? String(existing.approvedAt).slice(0, 10) : new Date().toISOString().slice(0, 10);
  const note = existing.note || '';

  openModal({
    title: `Review Gate: ${gate.label}`,
    description: 'Record the user approval decision and reviewer note for this project gate.',
    primaryText: 'Save Review',
    secondaryText: 'Cancel',
    defaultWidth: 'medium',
    render(body, controller) {
      body.classList.add('review-gate-modal-body');
      const form = document.createElement('form');
      form.id = 'review-gate-form';
      form.className = 'review-gate-form';
      form.noValidate = true;
      form.innerHTML = `
        <div class="review-gate-detail">
          <span class="design-review-gate__badge">${esc(gate.severity)}</span>
          <strong>${esc(gate.label)}</strong>
          <p>${esc(gate.detail)}</p>
          <small>${esc(gate.category || 'Review gate')}${gate.enforceOnDeliverables ? ' - blocks deliverables until reviewed' : ''}</small>
        </div>
        <div class="modal-field-grid">
          <div class="modal-form-field">
            <label for="review-gate-status">Decision</label>
            <select id="review-gate-status" name="status" required>
              ${optionHtml('reviewed', status, 'Reviewed / resolved')}
              ${optionHtml('flagged', status, 'Flagged - keep open')}
            </select>
          </div>
          <div class="modal-form-field">
            <label for="review-gate-reviewer">Reviewed By</label>
            <input id="review-gate-reviewer" name="reviewedBy" value="${esc(reviewer)}" required autocomplete="off">
          </div>
          <div class="modal-form-field">
            <label for="review-gate-date">Review Date</label>
            <input id="review-gate-date" name="reviewDate" type="date" value="${esc(reviewDate)}" required>
          </div>
          <div class="modal-form-field modal-form-field--full">
            <label for="review-gate-note">Reviewer Note</label>
            <textarea id="review-gate-note" name="note" rows="4" placeholder="Basis, reference document, or follow-up item.">${esc(note)}</textarea>
          </div>
        </div>
      `;
      controller.registerForm(form);
      body.appendChild(form);
      return form.querySelector('#review-gate-status');
    },
    onSubmit(controller) {
      const form = controller.body.querySelector('#review-gate-form');
      if (!form) return false;
      if (!form.reportValidity()) return false;
      const data = new FormData(form);
      const date = String(data.get('reviewDate') || '').trim();
      const approvals = { ...getDesignGateApprovals() };
      approvals[gateId] = {
        status: String(data.get('status') || 'reviewed'),
        reviewedBy: String(data.get('reviewedBy') || '').trim() || 'User',
        approvedAt: date ? `${date}T00:00:00.000Z` : new Date().toISOString(),
        note: String(data.get('note') || '').trim()
      };
      setDesignGateApprovals(approvals);
      refreshDashboard();
      const statusEl = document.getElementById('dashboard-auto-build-status');
      if (statusEl) statusEl.textContent = approvals[gateId].status === 'reviewed' ? 'Review gate marked reviewed.' : 'Review gate flagged and remains open.';
      const guidedStatusEl = document.getElementById('dashboard-guided-status');
      if (guidedStatusEl) guidedStatusEl.textContent = approvals[gateId].status === 'reviewed' ? 'Review gate marked reviewed.' : 'Review gate flagged and remains open.';
      return approvals[gateId];
    }
  });
}

function renderDesignBasisReviewPanel() {
  const el = document.getElementById('dashboard-review-gates');
  if (!el) return;
  const review = currentDesignBasisReview();
  const gates = review.gates;
  const openCount = review.openGateCount;
  const blockingCount = review.blockingGateCount;
  const statusText = blockingCount
    ? `${blockingCount} blocking gate(s), ${openCount} open total`
    : (openCount ? `${openCount} open review gate(s)` : 'All gates reviewed or not currently triggered');
  const assumptions = review.assumptions.length
    ? review.assumptions.map(item => `
      <li>
        <strong>${esc(item.label)}</strong>
        <span>${esc(item.detail)}</span>
      </li>
    `).join('')
    : '<li><span>No assumptions available yet.</span></li>';
  const gateHtml = gates.length
    ? gates.map(gate => {
        const reviewed = gate.status === 'reviewed';
        const reviewedMeta = reviewed && gate.approval
          ? `Reviewed by ${gate.approval.reviewedBy || 'User'}${gate.approval.approvedAt ? ` on ${String(gate.approval.approvedAt).slice(0, 10)}` : ''}.`
          : '';
        const action = gate.reviewable
          ? `<button type="button" class="btn btn-sm" data-review-gate="${esc(gate.id)}">${reviewed ? 'Edit Review' : 'Review'}</button>`
          : `<a class="btn btn-sm" href="${esc(gate.href || 'workflowdashboard.html')}">Open</a>`;
        return `
          <li class="design-review-gate design-review-gate--${esc(reviewed ? 'reviewed' : gate.severity)}">
            <div>
              <strong>${esc(gate.label)}</strong>
              <span>${esc(gate.detail)}</span>
              ${reviewedMeta ? `<small>${esc(reviewedMeta)}</small>` : ''}
            </div>
            <div class="design-review-gate__actions">
              <span class="design-review-gate__badge">${esc(reviewed ? 'Reviewed' : gate.severity)}</span>
              ${action}
            </div>
          </li>
        `;
      }).join('')
    : '<li class="design-review-gate design-review-gate--reviewed"><div><strong>No active review gates</strong><span>Saved design basis rules are not currently triggering a review item.</span></div></li>';

  el.innerHTML = `
    <div class="design-review-summary ${blockingCount ? 'is-warning' : 'is-ready'}">
      <div>
        <strong>${esc(statusText)}</strong>
        <span>${esc(review.summary.configured ? review.summary.codeLabel : 'Design Basis Wizard has not been saved.')}</span>
      </div>
      <a class="btn secondary-btn" href="projectreport.html">Report Builder</a>
    </div>
    <div class="design-review-grid">
      <section>
        <h3>Current Assumptions</h3>
        <ul class="design-review-assumption-list">${assumptions}</ul>
      </section>
      <section>
        <h3>Review Gates</h3>
        <ul class="design-review-gate-list">${gateHtml}</ul>
      </section>
    </div>
  `;
  el.querySelectorAll('[data-review-gate]').forEach(button => {
    button.addEventListener('click', () => openReviewGateDrawer(button.getAttribute('data-review-gate')));
  });
}

function workflowStatusLabel(status) {
  if (status === 'pass') return 'Ready';
  if (status === 'fail') return 'Needs input';
  if (status === 'pending') return 'Waiting';
  return 'Review';
}

function renderGuidedAction(step, runner) {
  if (!step) return '';
  if (step.id === 'designBasis') {
    return '<button id="dashboard-guided-design-basis-btn" type="button" class="btn primary-btn">Open Design Basis Wizard</button>';
  }
  if (step.id === 'autoBuild') {
    return `<button id="dashboard-guided-auto-build-btn" type="button" class="btn primary-btn"${runner.readyForAutoBuild ? '' : ' disabled'}>Auto-Build Workflow</button>`;
  }
  return `<a class="btn primary-btn" href="${esc(step.href)}">${esc(step.actionLabel || 'Open Step')}</a>`;
}

function renderGuidedWorkflowRunner() {
  const el = document.getElementById('dashboard-guided-workflow');
  if (!el) return;
  const runner = currentGuidedWorkflow();
  const current = runner.currentStep;
  const completeCount = runner.steps.filter(step => step.status === 'pass').length;
  const promptHtml = runner.prompts.length
    ? runner.prompts.slice(0, 6).map(prompt => `
      <li class="missing-info-item missing-info-item--${esc(prompt.severity)}">
        <div>
          <strong>${esc(prompt.label)}</strong>
          <span>${esc(prompt.detail)}</span>
        </div>
        <a class="btn btn-sm" href="${esc(prompt.href)}">${esc(prompt.actionLabel)}</a>
      </li>
    `).join('')
    : `<li class="missing-info-item missing-info-item--pass"><div><strong>${READINESS_VOCABULARY.ready}: No missing required inputs</strong><span>The core workflow has enough information to continue. Review assumptions before issuing.</span></div></li>`;

  el.innerHTML = `
    <div class="guided-workflow-current guided-workflow-current--${esc(current.status)}">
      <div>
        <span class="guided-workflow-eyebrow">${esc(completeCount)} of ${esc(runner.steps.length)} workflow checks ready</span>
        <strong>${esc(current.label)}</strong>
        <p>${esc(current.detail)}</p>
        <span id="dashboard-guided-status" class="workflow-next-action__meta" aria-live="polite"></span>
      </div>
      <div class="guided-workflow-actions">
        ${renderGuidedAction(current, runner)}
      </div>
    </div>
    <ol class="guided-workflow-steps" aria-label="Guided workflow checks">
      ${runner.steps.map(step => `
        <li class="guided-workflow-step guided-workflow-step--${esc(step.status)}">
          <span class="guided-workflow-step__status">${esc(workflowStatusLabel(step.status))}</span>
          <a href="${esc(step.href)}">${esc(step.label)}</a>
          <small>${esc(step.detail)}</small>
        </li>
      `).join('')}
    </ol>
    <div class="missing-info-panel">
      <div>
        <h3>Missing Information Prompts</h3>
        <p>${esc(runner.prompts.length ? `${runner.prompts.length} prompt(s) need user input or review.` : 'No blocking information prompts are currently open.')}</p>
      </div>
      <ul class="missing-info-list">${promptHtml}</ul>
    </div>
  `;

  el.querySelector('#dashboard-guided-design-basis-btn')?.addEventListener('click', openDesignBasisWizard);
  el.querySelector('#dashboard-guided-auto-build-btn')?.addEventListener('click', handleAutoBuildWorkflow);
}

function renderComplianceMatrix() {
  const el = document.getElementById('dashboard-compliance-matrix');
  if (!el) return;
  const runner = currentGuidedWorkflow();
  const matrix = runner.compliance;
  const summary = matrix.summary;
  el.innerHTML = `
    <div class="compliance-matrix-summary">
      <span><strong>${esc(summary.pass)}</strong> ready</span>
      <span><strong>${esc(summary.warn)}</strong> review</span>
      <span><strong>${esc(summary.fail)}</strong> blocking</span>
    </div>
    <div class="compliance-matrix-grid">
      ${matrix.groups.map(group => `
        <section class="compliance-matrix-group compliance-matrix-group--${esc(group.status)}" aria-label="${esc(group.label)}">
          <div class="compliance-matrix-group__header">
            <h3>${esc(group.label)}</h3>
            <span>${esc(workflowStatusLabel(group.status))}</span>
          </div>
          <ul class="compliance-matrix-list">
            ${group.items.map(item => `
              <li class="compliance-matrix-item compliance-matrix-item--${esc(item.status)}">
                <span class="compliance-matrix-item__status">${esc(workflowStatusLabel(item.status))}</span>
                <div>
                  <strong>${esc(item.label)}</strong>
                  <small>${esc(item.detail)}</small>
                </div>
                ${item.href ? `<a class="btn btn-sm" href="${esc(item.href)}">${item.status === 'pass' ? 'Open' : 'Resolve'}</a>` : ''}
              </li>
            `).join('')}
          </ul>
        </section>
      `).join('')}
    </div>
  `;
}

function renderWorkflowCoreDiagnostics() {
  const diagnostics = currentCoreDiagnostics();
  const nextEl = document.getElementById('dashboard-next-action-strip');
  if (nextEl) {
    const action = diagnostics.nextAction;
    const automationReady = canRunWorkflowAutomation();
    const designBasis = diagnostics.designBasis || currentDesignBasisSummary();
    const designReview = diagnostics.designReview || currentDesignBasisReview();
    const basisStatus = designBasisStatusText(designBasis);
    const basisClass = designBasis.complete && designReview.blockingGateCount === 0 ? 'is-complete' : 'is-warning';
    const actionTerm = action.severity === 'success'
      ? READINESS_VOCABULARY.downstreamHandoff
      : READINESS_VOCABULARY.missingInputs;
    nextEl.innerHTML = `
      <div>
        <strong>${esc(actionTerm)}: Next action: ${esc(action.label)}</strong>
        <p>${esc(action.detail)}</p>
        <p class="workflow-next-action__meta">${esc(DASHBOARD_READINESS_COPY?.messages?.[action.severity === 'success' ? 'downstreamHandoff' : 'missingInputs'] || action.detail)}</p>
        <div class="workflow-design-basis-status ${esc(basisClass)}">
          <span>Design basis: <strong>${esc(basisStatus)}</strong></span>
          <span>${esc(designBasis.configured ? designBasis.codeLabel : 'Save wizard defaults before relying on generated records.')}</span>
          <span>${esc(designReview.openGateCount)} review gate(s)</span>
        </div>
        <span id="dashboard-auto-build-status" class="workflow-next-action__meta" aria-live="polite"></span>
      </div>
      <div class="workflow-next-action__actions">
        <a class="btn primary-btn" href="${esc(action.href)}">Open Step</a>
        <button id="dashboard-design-basis-btn" type="button" class="btn">Design Basis</button>
        <button id="dashboard-auto-build-btn" type="button" class="btn"${automationReady ? '' : ' disabled'} title="${automationReady ? 'Create missing one-line, cable, starter raceway, and initial route-result records from current equipment and loads.' : 'Add equipment and loads before auto-building downstream workflow records.'}">Auto-Build Workflow</button>
      </div>
    `;
    nextEl.querySelector('#dashboard-design-basis-btn')?.addEventListener('click', openDesignBasisWizard);
    nextEl.querySelector('#dashboard-auto-build-btn')?.addEventListener('click', handleAutoBuildWorkflow);
  }

  const blockersEl = document.getElementById('dashboard-blockers');
  if (blockersEl) {
    const actionable = diagnostics.blockers.filter(item => item.severity !== 'info');
    if (!actionable.length) {
      blockersEl.innerHTML = `<p class="text-muted">${READINESS_VOCABULARY.ready}: No critical workflow blockers found. Review studies and deliverables next.</p>`;
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
      ['Design Basis', health.designBasis],
      ['Review Gates', health.designBasisReviewGates],
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
    const basisSummary  = currentDesignBasisSummary();
    const basisReviewer = basisSummary.basis.approvalRules.reviewer || '';
    const author        = (document.getElementById('pkg-author')?.value || '').trim() || basisReviewer;
    const status        = document.getElementById('pkg-status')?.value    || 'Draft';
    const notes         = (document.getElementById('pkg-notes')?.value    || '').trim();

    if (basisSummary.basis.approvalRules.releaseRequiresReviewer && !author) {
      if (statusEl) {
        statusEl.textContent = 'Release blocked: the design basis approval rules require an author or reviewer.';
      }
      return;
    }
    const designReview = currentDesignBasisReview();
    if (designReview.deliverableBlockers.length > 0) {
      if (statusEl) {
        statusEl.textContent = `Release blocked: ${designReview.deliverableBlockers[0].label}. Resolve ${designReview.deliverableBlockers.length} design basis gate(s).`;
      }
      renderDesignBasisReviewPanel();
      return;
    }

    const projectData = {
      cables:    getCables(),
      trays:     getTrays(),
      equipment: getEquipment(),
      studies:   getStudies(),
      approvals: getStudyApprovals(),
      designBasis: getDesignBasis(),
      designGateApprovals: getDesignGateApprovals(),
      tccSettings: getItem('tccSettings', null),
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
  renderGuidedWorkflowRunner();
  renderComplianceMatrix();
  renderDesignBasisReviewPanel();
  renderWorkflowSteps(document.getElementById('workflow-step-grid'));
  renderProjectSummary(document.getElementById('project-summary'));
  renderStudiesSummary(document.getElementById('studies-summary'));
  initReleasePackageForm();
});
