import {
  getEquipment,
  getLoads,
  getOneLine,
  getCables,
  getTrays,
  getConduits,
  getDuctbanks,
  getStudies,
  getDesignBasis,
  getLifecyclePackages,
  getReportSnapshots,
  getItem
} from '../dataStore.mjs';
import { normalizeRouteResults } from '../analysis/deliverableWorkflow.mjs';
import { cableHasRoutingCoordinates } from '../analysis/scheduleWorkflow.mjs';
import { normalizeDesignBasis } from '../analysis/designBasis.mjs';
import {
  READINESS_VOCABULARY,
  getPageContractReadiness,
  getPageContractReadinessMessages
} from './pageContracts.js';

export { READINESS_VOCABULARY };

export const workflowOrder = [
  {
    key: 'equipmentList',
    label: '1. Equipment List',
    short: '1. Equipment',
    href: 'equipmentlist.html',
    hint: 'Start with major equipment tags, ratings, and locations.',
    standaloneHint: 'Equipment register ready for direct entry, imports, and exports.'
  },
  {
    key: 'loadList',
    label: '2. Load List',
    short: '2. Loads',
    href: 'loadlist.html',
    hint: 'Capture loads and connect them to source equipment or panels.',
    standaloneHint: 'Load schedule ready for direct entry, imports, and exports.'
  },
  {
    key: 'oneLineDiagram',
    label: '3. One-Line',
    short: '3. One-Line',
    href: 'oneline.html',
    hint: 'Model the electrical relationships, then reconcile schedules explicitly.',
    standaloneHint: 'Diagram editor ready for independent drawing, import, and export.'
  },
  {
    key: 'cableSchedule',
    label: '4. Cable Schedule',
    short: '4. Cables',
    href: 'cableschedule.html',
    hint: 'Complete tags, endpoints, conductor size, and length before routing.',
    standaloneHint: 'Cable schedule ready for direct row editing, templates, imports, and exports.'
  },
  {
    key: 'racewaySchedule',
    label: '5. Raceway Schedule',
    short: '5. Raceways',
    href: 'racewayschedule.html',
    hint: 'Define trays, conduits, and ductbanks available for routing.',
    standaloneHint: 'Raceway schedule ready for direct tray, conduit, ductbank, and CAD workflows.'
  },
  {
    key: 'fillRouting',
    label: '6. Fill / Routing',
    short: '6. Fill / Routing',
    href: 'cabletrayfill.html',
    hint: 'Run tray fill, conduit fill, ductbank checks, and route assignments.',
    standaloneHint: 'Fill and routing tools ready for direct studies or imported schedules.',
    aliases: ['conduitfill.html', 'ductbankroute.html', 'optimalRoute.html']
  },
  {
    key: 'studies',
    label: '7. Studies',
    short: '7. Studies',
    href: 'demandschedule.html',
    hint: 'Run power system studies after the model is coordinated.',
    standaloneHint: 'Study pages ready for direct calculations and report exports.',
    aliases: ['shortCircuit.html', 'arcFlash.html', 'loadFlow.html', 'tcc.html', 'harmonics.html', 'motorStart.html']
  },
  {
    key: 'deliverables',
    label: '8. Deliverables',
    short: '8. Deliverables',
    href: 'projectreport.html',
    hint: 'Publish reports, pull cards, procurement, cost, and release packages.',
    standaloneHint: 'Deliverable tools ready for imported route data or direct report assembly.',
    aliases: ['spoolsheets.html', 'pullcards.html', 'procurementschedule.html', 'costestimate.html', 'submittal.html']
  }
];

const legacyKeyMap = {
  ductbankSchedule: 'fillRouting',
  traySchedule: 'fillRouting',
  conduitSchedule: 'fillRouting',
  optimalRoute: 'fillRouting'
};

function pluralize(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function hasValue(value) {
  if (Array.isArray(value)) return value.some(hasValue);
  if (value && typeof value === 'object') return Object.keys(value).length > 0;
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function isMeaningfulRecord(record) {
  if (!record || typeof record !== 'object') return false;
  return Object.entries(record).some(([key, value]) => {
    if (key.startsWith('_')) return false;
    return hasValue(value);
  });
}

function meaningfulRecords(records) {
  return Array.isArray(records) ? records.filter(isMeaningfulRecord) : [];
}

function readData(overrides, key, getter, fallback) {
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, key)) {
    return overrides[key];
  }
  try {
    return getter();
  } catch {
    return fallback;
  }
}

function fieldValue(record, names) {
  for (const name of names) {
    if (hasValue(record?.[name])) return record[name];
  }
  return '';
}

function cableTag(cable) {
  return fieldValue(cable, ['tag', 'id', 'cable_id', 'cableId', 'ref']);
}

function cableFrom(cable) {
  return fieldValue(cable, ['from', 'from_tag', 'fromTag', 'source', 'source_tag']);
}

function cableTo(cable) {
  return fieldValue(cable, ['to', 'to_tag', 'toTag', 'destination', 'load', 'load_tag']);
}

function cableSize(cable) {
  return fieldValue(cable, ['conductor_size', 'conductorSize', 'cable_size', 'wire_size', 'size']);
}

function cableLength(cable) {
  return fieldValue(cable, ['length', 'length_ft', 'lengthFt', 'estimated_length', 'calculated_length']);
}

export function hasRacewayAssignment(cable) {
  return hasValue(fieldValue(cable, [
    'raceway',
    'raceway_id',
    'racewayId',
    'raceway_ids',
    'racewayIds',
    'route_preference',
    'manual_path',
    'tray_id',
    'trayId',
    'conduit_id',
    'conduitId',
    'ductbank_id',
    'ductbankId',
    'route',
    'path'
  ]));
}

export function isCableScheduleReady(cable) {
  return hasValue(cableTag(cable))
    && hasValue(cableFrom(cable))
    && hasValue(cableTo(cable))
    && hasValue(cableSize(cable))
    && hasValue(cableLength(cable));
}

export function getCableReadiness(cables = getCables()) {
  const rows = meaningfulRecords(cables);
  const scheduleReadyRows = rows.filter(isCableScheduleReady);
  const routingReadyRows = scheduleReadyRows.filter(hasRacewayAssignment);
  const coordinateReadyRows = routingReadyRows.filter(cableHasRoutingCoordinates);
  return {
    total: rows.length,
    scheduleReady: scheduleReadyRows.length,
    routingReady: routingReadyRows.length,
    coordinateReady: coordinateReadyRows.length,
    missingSchedule: rows.length - scheduleReadyRows.length,
    missingRaceway: scheduleReadyRows.length - routingReadyRows.length,
    missingCoordinates: routingReadyRows.length - coordinateReadyRows.length
  };
}

export function countOneLineComponents(oneLine = getOneLine()) {
  const sheets = Array.isArray(oneLine?.sheets) ? oneLine.sheets : [];
  return sheets.reduce((sum, sheet) => {
    const components = Array.isArray(sheet?.components) ? sheet.components : [];
    return sum + components.length;
  }, 0);
}

function countStudies(studies = getStudies()) {
  if (!studies || typeof studies !== 'object') return 0;
  return Object.values(studies).filter(value => {
    if (Array.isArray(value)) return value.length > 0;
    if (value && typeof value === 'object') return Object.keys(value).length > 0;
    return hasValue(value);
  }).length;
}

function studyHasResults(study) {
  if (Array.isArray(study)) return study.length > 0;
  if (study && typeof study === 'object') return Object.keys(study).length > 0;
  return hasValue(study);
}

function requiredStudyKeys(designBasis) {
  const prerequisites = normalizeDesignBasis(designBasis).studyPrerequisites;
  const required = [];
  if (prerequisites.requireUtilityFault) required.push('shortCircuit');
  if (prerequisites.requireArcFlashInputs) required.push('arcFlash');
  return required;
}

function studyLabel(key) {
  return ({ shortCircuit: 'short-circuit', arcFlash: 'arc-flash' })[key] || key;
}

function countReportSnapshots(snapshots = getReportSnapshots()) {
  if (Array.isArray(snapshots)) return snapshots.length;
  if (snapshots && typeof snapshots === 'object') return Object.keys(snapshots).length;
  return 0;
}

export function getWorkflowStepForPage(pageName) {
  const normalized = String(pageName || '').split('/').pop() || 'index.html';
  return workflowOrder.find(step => step.href === normalized || (step.aliases || []).includes(normalized)) || null;
}

function normalizePageName(pageName) {
  return String(pageName || '').split('/').pop() || 'index.html';
}

function getWorkflowStepIndex(step) {
  return step ? workflowOrder.findIndex(item => item.key === step.key) : -1;
}

export function getContractReadinessCopy(pageName) {
  const readiness = getPageContractReadiness(pageName);
  const messages = getPageContractReadinessMessages(pageName);
  if (!readiness || !messages) return null;
  return { ...readiness, messages };
}

function firstContractBlocker(readiness) {
  return readiness?.blockers?.find(Boolean) || null;
}

function buildContractStatusDetail(status, readiness) {
  if (!status) return 'Open the guided workflow when project-level status is needed.';
  if (status.complete) {
    const readyWhen = readiness?.readyWhen || status.label;
    return `${READINESS_VOCABULARY.ready}: ${status.label}. ${readyWhen}`;
  }
  const blocker = status.hint || firstContractBlocker(readiness) || status.label;
  return `${READINESS_VOCABULARY.missingInputs}: ${blocker}`;
}

function buildModeStatus(status, readiness) {
  if (!status) return { tone: 'neutral', label: 'Available', detail: 'Open the guided workflow when project-level status is needed.' };
  return {
    tone: status.complete ? 'ready' : 'attention',
    label: status.complete ? status.label : READINESS_VOCABULARY.missingInputs,
    detail: buildContractStatusDetail(status, readiness),
    readiness
  };
}

export function getWorkflowPageModeContext(pageName, overrides = {}) {
  const normalized = normalizePageName(pageName);
  const isDashboard = normalized === 'workflowdashboard.html';
  const step = isDashboard ? null : getWorkflowStepForPage(normalized);
  if (!isDashboard && !step) return null;

  const statuses = workflowOrder.map(item => ({
    step: item,
    status: getStepStatus(item.key, overrides)
  }));
  const completeCount = statuses.filter(item => item.status.complete).length;
  const nextRequired = statuses.find(item => !item.status.complete) || null;
  const idx = getWorkflowStepIndex(step);
  const currentStatus = step ? getStepStatus(step.key, overrides) : null;
  const contractReadiness = getContractReadinessCopy(isDashboard ? normalized : step?.href);
  const projectStatus = buildModeStatus(currentStatus, contractReadiness);
  const prev = idx > 0 ? workflowOrder[idx - 1] : null;
  const next = idx >= 0 ? workflowOrder[idx + 1] || null : (nextRequired?.step || null);

  return {
    pageName: normalized,
    isDashboard,
    completeCount,
    totalSteps: workflowOrder.length,
    nextRequiredStep: nextRequired?.step || null,
    nextRequiredStatus: nextRequired?.status || null,
    standalone: {
      available: true,
      label: isDashboard ? 'Independent Pages' : 'Standalone',
      status: 'Ready',
      detail: isDashboard
        ? `${READINESS_VOCABULARY.ready}: Core pages remain available as independent tools.`
        : `${READINESS_VOCABULARY.ready}: ${step.standaloneHint || 'This page is ready for independent use.'}`
    },
    project: {
      available: true,
      label: 'Project Workflow',
      status: isDashboard ? `${completeCount} of ${workflowOrder.length} ready` : projectStatus.label,
      tone: isDashboard
        ? (completeCount === workflowOrder.length ? 'ready' : 'attention')
        : projectStatus.tone,
      detail: isDashboard
        ? (nextRequired
            ? `${READINESS_VOCABULARY.missingInputs}: ${nextRequired.step.label}: ${nextRequired.status.hint || firstContractBlocker(getContractReadinessCopy(nextRequired.step.href)) || nextRequired.status.label}`
            : `${READINESS_VOCABULARY.ready}: All workflow steps are complete.`)
        : projectStatus.detail,
      readiness: contractReadiness,
      step,
      stepIndex: idx,
      previousStep: prev,
      nextStep: next,
      dashboardHref: 'workflowdashboard.html',
      primaryHref: isDashboard ? (nextRequired?.step.href || 'projectreport.html') : (currentStatus?.complete && next ? next.href : step.href),
      primaryLabel: isDashboard
        ? (nextRequired ? `Open ${nextRequired.step.short.replace(/^\d+\.\s*/, '')}` : 'Open Deliverables')
        : (currentStatus?.complete && next ? `Next: ${next.short.replace(/^\d+\.\s*/, '')}` : `Open ${step.short.replace(/^\d+\.\s*/, '')}`)
    }
  };
}

export function getStepStatus(key, overrides = {}) {
  const canonicalKey = legacyKeyMap[key] || key;

  if (canonicalKey === 'equipmentList') {
    const count = meaningfulRecords(readData(overrides, 'equipment', getEquipment, [])).length;
    if (count > 0) return { complete: true, label: pluralize(count, 'equipment item', 'equipment items') };
    return { complete: false, label: 'Add equipment first', hint: 'Create the equipment list before downstream schedules.' };
  }

  if (canonicalKey === 'loadList') {
    const count = meaningfulRecords(readData(overrides, 'loads', getLoads, [])).length;
    if (count > 0) return { complete: true, label: pluralize(count, 'load', 'loads') };
    return { complete: false, label: 'Add loads', hint: 'Create or import loads before reconciling diagrams and schedules.' };
  }

  if (canonicalKey === 'oneLineDiagram') {
    const componentCount = countOneLineComponents(readData(overrides, 'oneLine', getOneLine, {}));
    if (componentCount > 0) return { complete: true, label: pluralize(componentCount, 'component', 'components') };
    return { complete: false, label: 'Not started', hint: 'Draw the one-line or keep using schedules independently.' };
  }

  if (canonicalKey === 'cableSchedule') {
    const readiness = getCableReadiness(readData(overrides, 'cables', getCables, []));
    if (readiness.total === 0) {
      return { complete: false, label: 'Add cable rows', hint: 'Cable schedule-ready rows need tag, from/to, conductor size, and length.' };
    }
    if (readiness.missingSchedule > 0) {
      return {
        complete: false,
        label: `${readiness.scheduleReady} of ${readiness.total} schedule-ready`,
        hint: 'Finish tag, endpoints, conductor size, and length before routing.'
      };
    }
    return {
      complete: true,
      label: `${readiness.scheduleReady} schedule-ready${readiness.missingRaceway > 0 ? `, ${readiness.routingReady} routing-ready` : ''}`,
      hint: readiness.missingRaceway > 0 ? 'Assign raceways to make these cables routing-ready.' : null
    };
  }

  if (canonicalKey === 'racewaySchedule') {
    const trays = meaningfulRecords(readData(overrides, 'trays', getTrays, [])).length;
    const conduits = meaningfulRecords(readData(overrides, 'conduits', getConduits, [])).length;
    const ductbanks = meaningfulRecords(readData(overrides, 'ductbanks', getDuctbanks, [])).length;
    const total = trays + conduits + ductbanks;
    if (total > 0) {
      const parts = [];
      if (trays > 0) parts.push(pluralize(trays, 'tray', 'trays'));
      if (conduits > 0) parts.push(pluralize(conduits, 'conduit', 'conduits'));
      if (ductbanks > 0) parts.push(pluralize(ductbanks, 'ductbank', 'ductbanks'));
      return { complete: true, label: parts.join(', ') };
    }
    return { complete: false, label: 'Add raceways', hint: 'Catalog trays, conduits, or ductbanks for routing and fill.' };
  }

  if (canonicalKey === 'fillRouting') {
    const readiness = getCableReadiness(readData(overrides, 'cables', getCables, []));
    const trays = meaningfulRecords(readData(overrides, 'trays', getTrays, [])).length;
    const conduits = meaningfulRecords(readData(overrides, 'conduits', getConduits, [])).length;
    const ductbanks = meaningfulRecords(readData(overrides, 'ductbanks', getDuctbanks, [])).length;
    const raceways = trays + conduits + ductbanks;
    const routeResults = normalizeRouteResults(readData(overrides, 'latestRouteResults', () => getItem('latestRouteResults', null), null));
    if (readiness.routingReady > 0 && routeResults.length >= readiness.routingReady) {
      if (readiness.missingCoordinates > 0) {
        return {
          complete: false,
          label: `${pluralize(routeResults.length, 'saved route result', 'saved route results')}; inputs incomplete`,
          hint: `${readiness.missingCoordinates} routed cable${readiness.missingCoordinates === 1 ? '' : 's'} need endpoint coordinates before the results can be reproduced.`
        };
      }
      return { complete: true, label: pluralize(routeResults.length, 'route result', 'route results'), hint: null };
    }
    if (readiness.scheduleReady === 0) {
      return { complete: false, label: 'Needs schedule-ready cables', hint: 'Complete Cable Schedule before fill and routing.' };
    }
    if (raceways === 0) {
      return { complete: false, label: 'Needs raceways', hint: 'Add raceways before fill and routing.' };
    }
    if (readiness.routingReady > 0 && readiness.missingCoordinates > 0) {
      return {
        complete: false,
        label: `${readiness.coordinateReady} of ${readiness.routingReady} coordinate-ready`,
        hint: 'Add start and end XYZ coordinates to every assigned cable before running Optimal Route.'
      };
    }
    if (readiness.routingReady > 0) {
      return {
        complete: false,
        label: 'Run routing',
        hint: 'Assigned cable rows have coordinates, but no route results have been saved yet.'
      };
    }
    return { complete: false, label: 'Assign raceways', hint: 'Cable rows are schedule-ready but need raceway assignments for routing.' };
  }

  if (canonicalKey === 'studies') {
    const studies = readData(overrides, 'studies', getStudies, {});
    const count = countStudies(studies);
    const required = requiredStudyKeys(readData(overrides, 'designBasis', getDesignBasis, null));
    const missing = required.filter(key => !studyHasResults(studies?.[key]));
    if (missing.length > 0) {
      const missingLabels = missing.map(studyLabel).join(' and ');
      return {
        complete: false,
        label: `${pluralize(count, 'study result', 'study results')} saved`,
        hint: `Run the required ${missingLabels} study${missing.length === 1 ? '' : ' studies'} from the Design Basis.`
      };
    }
    if (count > 0) return { complete: true, label: pluralize(count, 'study result', 'study results') };
    return { complete: false, label: 'No studies saved', hint: 'Run demand, load flow, short-circuit, arc flash, or other studies.' };
  }

  if (canonicalKey === 'deliverables') {
    const packages = readData(overrides, 'lifecyclePackages', getLifecyclePackages, []);
    const snapshots = readData(overrides, 'reportSnapshots', getReportSnapshots, {});
    const routeResults = readData(overrides, 'latestRouteResults', () => getItem('latestRouteResults', null), null);
    const packageCount = Array.isArray(packages) ? packages.length : 0;
    const snapshotCount = countReportSnapshots(snapshots);
    const routeCount = normalizeRouteResults(routeResults).length;
    const total = packageCount + snapshotCount;
    if (total > 0) return { complete: true, label: pluralize(total, 'deliverable', 'deliverables') };
    if (routeCount > 0) {
      return {
        complete: false,
        label: `${routeCount} routed cable${routeCount === 1 ? '' : 's'} ready`,
        hint: 'Create pull cards, spool sheets, and a project report snapshot.'
      };
    }
    return { complete: false, label: 'No deliverables yet', hint: 'Create a project report or release package after review.' };
  }

  return { complete: false, label: 'Not started', hint: null };
}

function canRenderWorkflowStatusDom() {
  return typeof document !== 'undefined'
    && typeof document.querySelectorAll === 'function'
    && typeof document.getElementById === 'function'
    && typeof document.createElement === 'function';
}

if (typeof window !== 'undefined' && canRenderWorkflowStatusDom()) {
  window.addEventListener('DOMContentLoaded', () => {
    if (!canRenderWorkflowStatusDom()) return;
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
        statusEl.setAttribute('aria-label', `Complete - ${label}`);
        completeCount += 1;
      } else {
        statusEl.classList.add('status-incomplete');
        if (hint) {
          card.setAttribute('title', hint);
          card.setAttribute('aria-description', hint);
        }
      }
    });

    if (!document.body?.classList?.contains('home-page')) {
      const progressSection = document.getElementById('workflow-summary-section');
      if (progressSection) {
        progressSection.removeAttribute('hidden');
      }

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
        progressTrack.setAttribute('aria-valuemax', workflowOrder.length);
      }
    }

    const nextStep = workflowOrder.find(step => !getStepStatus(step.key).complete);
    const nextStepEl = document.getElementById('workflow-next-step');
    if (nextStepEl) {
      if (nextStep) {
        nextStepEl.textContent = `${READINESS_VOCABULARY.missingInputs}: Next recommended step: `;
        const link = document.createElement('a');
        link.href = nextStep.href;
        link.textContent = nextStep.label;
        nextStepEl.appendChild(link);
      } else {
        nextStepEl.textContent = `${READINESS_VOCABULARY.ready}: All workflow steps are complete. You are ready to generate reports.`;
      }
    }
  });
}
