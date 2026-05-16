import { summarizeEquipment } from './equipmentWorkflow.mjs';
import { summarizeLoadValidation } from './loadWorkflow.mjs';
import { countOneLineComponents, getCableReadiness } from '../src/workflowStatus.js';

function hasValue(value) {
  if (Array.isArray(value)) return value.some(hasValue);
  if (value && typeof value === 'object') return Object.keys(value).some(key => hasValue(value[key]));
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function meaningfulRecords(records) {
  return Array.isArray(records)
    ? records.filter(row => row && typeof row === 'object' && Object.values(row).some(hasValue))
    : [];
}

function countObjectRecords(value) {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === 'object') return Object.keys(value).length;
  return 0;
}

function makeBlocker(step, severity, label, detail, href) {
  return { step, severity, label, detail, href };
}

function findNextAction(blockers) {
  const critical = blockers.find(item => item.severity === 'critical');
  const warning = blockers.find(item => item.severity === 'warning');
  const item = critical || warning;
  if (item) {
    return {
      label: item.label,
      detail: item.detail,
      href: item.href,
      severity: item.severity
    };
  }
  return {
    label: 'Generate deliverables',
    detail: 'Core workflow data is ready for report and release-package review.',
    href: 'projectreport.html',
    severity: 'complete'
  };
}

export function buildWorkflowCoreDiagnostics(project = {}) {
  const equipmentSummary = summarizeEquipment(project.equipment || []);
  const loadSummary = summarizeLoadValidation(project.loads || []);
  const cableReadiness = getCableReadiness(project.cables || []);
  const oneLineComponents = countOneLineComponents(project.oneLine || {});
  const raceways = meaningfulRecords(project.trays).length
    + meaningfulRecords(project.conduits).length
    + meaningfulRecords(project.ductbanks).length;
  const studies = countObjectRecords(project.studies);
  const deliverables = countObjectRecords(project.reportSnapshots) + countObjectRecords(project.deliverables);
  const reconcilePending = Boolean(project.reconcilePending);
  const blockers = [];

  if (equipmentSummary.total === 0) {
    blockers.push(makeBlocker('Equipment List', 'critical', 'Add equipment records', 'Create the major equipment basis before loads and one-line work.', 'equipmentlist.html'));
  } else {
    if (equipmentSummary.missingTags > 0) {
      blockers.push(makeBlocker('Equipment List', 'critical', 'Fix missing equipment tags', `${equipmentSummary.missingTags} equipment records need tags.`, 'equipmentlist.html'));
    }
    if (equipmentSummary.duplicateTags > 0) {
      blockers.push(makeBlocker('Equipment List', 'critical', 'Resolve duplicate equipment tags', `${equipmentSummary.duplicateTags} equipment records share a tag.`, 'equipmentlist.html'));
    }
    if (equipmentSummary.missingVoltage > 0) {
      blockers.push(makeBlocker('Equipment List', 'warning', 'Add equipment voltage ratings', `${equipmentSummary.missingVoltage} equipment records are missing voltage.`, 'equipmentlist.html'));
    }
  }

  if (loadSummary.total === 0) {
    blockers.push(makeBlocker('Load List', 'critical', 'Add load records', 'Create or import loads after equipment is established.', 'loadlist.html'));
  } else if (loadSummary.incomplete > 0) {
    blockers.push(makeBlocker('Load List', 'critical', 'Complete load required fields', `${loadSummary.incomplete} loads need source, kW, voltage, power factor, or phases.`, 'loadlist.html'));
  }

  if (oneLineComponents === 0) {
    blockers.push(makeBlocker('One-Line', 'warning', 'Build or reconcile the one-line', 'No one-line components are present for diagram coordination.', 'oneline.html'));
  }
  if (reconcilePending) {
    blockers.push(makeBlocker('One-Line', 'warning', 'Reconcile one-line schedule changes', 'One-Line changes are pending explicit schedule reconciliation.', 'oneline.html'));
  }

  if (cableReadiness.total === 0) {
    blockers.push(makeBlocker('Cable Schedule', 'warning', 'Add cable schedule rows', 'Cable schedule is empty; add rows or reconcile from the one-line.', 'cableschedule.html'));
  } else if (cableReadiness.missingSchedule > 0) {
    blockers.push(makeBlocker('Cable Schedule', 'warning', 'Finish schedule-ready cable fields', `${cableReadiness.missingSchedule} cables need tag, endpoints, conductor size, or length.`, 'cableschedule.html'));
  }

  if (raceways === 0) {
    blockers.push(makeBlocker('Raceway Schedule', 'warning', 'Add raceway records', 'No trays, conduits, or ductbanks are available for routing.', 'racewayschedule.html'));
  }
  if (cableReadiness.scheduleReady > 0 && cableReadiness.routingReady === 0) {
    blockers.push(makeBlocker('Fill / Routing', 'warning', 'Assign raceways to cables', `${cableReadiness.scheduleReady} schedule-ready cables still need raceway assignments.`, 'cableschedule.html'));
  }

  if (studies === 0) {
    blockers.push(makeBlocker('Studies', 'info', 'Run workflow studies', 'No saved study results are available yet.', 'demandschedule.html'));
  }
  if (deliverables === 0) {
    blockers.push(makeBlocker('Deliverables', 'info', 'Create report snapshot', 'No report snapshots or release packages are saved yet.', 'projectreport.html'));
  }

  return {
    health: {
      equipment: equipmentSummary.total,
      loads: loadSummary.total,
      completeLoads: loadSummary.complete,
      oneLineComponents,
      cableRows: cableReadiness.total,
      scheduleReady: cableReadiness.scheduleReady,
      routingReady: cableReadiness.routingReady,
      raceways,
      studies,
      deliverables,
      reconcilePending
    },
    equipment: equipmentSummary,
    loads: loadSummary,
    cables: cableReadiness,
    blockers,
    nextAction: findNextAction(blockers)
  };
}
