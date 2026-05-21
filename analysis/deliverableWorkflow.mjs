import { buildPullTable } from './pullCards.mjs';
import { buildSpoolSheetVisualModel } from './spoolSheetVisualModel.mjs';
import { getAvailableSections } from './reportPackage.mjs';
import { summarizeCableWorkflow } from './scheduleWorkflow.mjs';
import { buildDesignBasisReview } from './designBasis.mjs';

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

function normalized(value) {
  return String(value || '').trim();
}

function normalizedKey(value) {
  return normalized(value).toLowerCase();
}

function countObjectRecords(value) {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === 'object') return Object.keys(value).length;
  return 0;
}

function fieldValue(record, names) {
  for (const name of names) {
    if (hasValue(record?.[name])) return record[name];
  }
  return '';
}

function cableTag(cable) {
  return fieldValue(cable, ['tag', 'name', 'id', 'cable_id', 'cableId', 'cable_tag', 'ref']);
}

function cableLength(cable) {
  return fieldValue(cable, ['length', 'length_ft', 'lengthFt', 'estimated_length', 'calculated_length', 'total_length']);
}

function routeResultTag(result) {
  return fieldValue(result, ['cable', 'tag', 'name', 'id', 'cable_tag', 'cableId']);
}

function routeResultSucceeded(result) {
  if (!result || typeof result !== 'object') return false;
  const status = normalized(result.status);
  if (/fail|error|not routed|x failed/i.test(status)) return false;
  const totalLength = Number(result.total_length ?? result.totalLength ?? result.length);
  return Number.isFinite(totalLength) && totalLength > 0
    || Array.isArray(result.breakdown) && result.breakdown.length > 0
    || Array.isArray(result.route_segments) && result.route_segments.length > 0
    || status.toLowerCase().includes('routed');
}

function segmentLength(segment) {
  const direct = Number(segment?.length ?? segment?.length_ft ?? segment?.lengthFt);
  if (Number.isFinite(direct)) return direct;
  const start = Array.isArray(segment?.start) ? segment.start : null;
  const end = Array.isArray(segment?.end) ? segment.end : null;
  if (!start || !end || start.length < 3 || end.length < 3) return 0;
  const values = [...start.slice(0, 3), ...end.slice(0, 3)].map(Number);
  if (!values.every(Number.isFinite)) return 0;
  return Math.hypot(values[3] - values[0], values[4] - values[1], values[5] - values[2]);
}

function cableHasRouteSegments(cable) {
  return Array.isArray(cable?.route_segments) && cable.route_segments.length > 0;
}

function routeResultFromCable(cable) {
  const tag = cableTag(cable);
  const routeSegments = Array.isArray(cable.route_segments) ? cable.route_segments : [];
  const breakdown = Array.isArray(cable.breakdown) && cable.breakdown.length
    ? cable.breakdown
    : routeSegments.map((segment, index) => ({
        segment: index + 1,
        tray_id: segment.tray_id || segment.raceway_id || segment.id || (segment.type === 'field' ? 'Field Route' : ''),
        conduit_id: segment.conduit_id || '',
        ductbankTag: segment.ductbankTag || '',
        length: segmentLength(segment),
        start: segment.start || null,
        end: segment.end || null,
      }));
  const total = Number(cableLength(cable)) || routeSegments.reduce((sum, segment) => sum + segmentLength(segment), 0);
  return {
    cable: tag,
    status: 'Routed',
    total_length: total,
    breakdown,
    route_segments: routeSegments,
  };
}

export function normalizeRouteResults(source) {
  if (Array.isArray(source)) return source.filter(row => row && typeof row === 'object');
  if (!source || typeof source !== 'object') return [];
  if (Array.isArray(source.batchResults)) return source.batchResults.filter(row => row && typeof row === 'object');
  if (Array.isArray(source.routeResults)) return source.routeResults.filter(row => row && typeof row === 'object');
  if (Array.isArray(source.latestRouteData)) return source.latestRouteData.filter(row => row && typeof row === 'object');
  if (Array.isArray(source.results)) return source.results.filter(row => row && typeof row === 'object');
  return [];
}


function knownCableTags(cables = []) {
  return new Set(meaningfulRecords(cables).map(cableTag).map(normalizedKey).filter(Boolean));
}

function collectRacewayIds(rows = [], fields = []) {
  const ids = new Set();
  meaningfulRecords(rows).forEach(row => {
    for (const field of fields) {
      const value = row?.[field];
      const key = normalizedKey(value);
      if (key) ids.add(key);
    }
  });
  return ids;
}

function routeResultRacewayIds(result) {
  const ids = [];
  const entries = [
    ...(Array.isArray(result?.breakdown) ? result.breakdown : []),
    ...(Array.isArray(result?.route_segments) ? result.route_segments : []),
  ];
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    ids.push(
      entry.tray_id,
      entry.trayId,
      entry.raceway_id,
      entry.racewayId,
      entry.conduit_id,
      entry.conduitId,
      entry.ductbankTag,
      entry.ductbank_tag,
      entry.ductbank_id,
      entry.ductbankId,
      entry.id,
    );
  }
  return ids.map(normalizedKey).filter(Boolean).filter(id => id !== 'field route');
}

export function filterRouteResultsForProject(routeResults = [], { cables = [], trays = [], conduits = [], ductbanks = [] } = {}) {
  const cableTags = knownCableTags(cables);
  const racewayIds = new Set([
    ...collectRacewayIds(trays, ['tray_id', 'trayId', 'id', 'tag']),
    ...collectRacewayIds(conduits, ['conduit_id', 'conduitId', 'id', 'tag']),
    ...collectRacewayIds(ductbanks, ['tag', 'id', 'ductbankTag', 'ductbank_id']),
  ]);

  return normalizeRouteResults(routeResults).filter(result => {
    const tag = normalizedKey(routeResultTag(result));
    if (!tag || !cableTags.has(tag)) return false;
    const referencedRaceways = routeResultRacewayIds(result);
    return referencedRaceways.every(id => racewayIds.has(id));
  });
}

export function routeResultsFromCableRows(cables = []) {
  return meaningfulRecords(cables)
    .filter(cableHasRouteSegments)
    .map(routeResultFromCable)
    .filter(routeResultSucceeded);
}

function mergedRouteResults(routeResults = [], { cables = [], trays = [], conduits = [], ductbanks = [] } = {}) {
  const explicit = filterRouteResultsForProject(routeResults, { cables, trays, conduits, ductbanks });
  const explicitTags = new Set(explicit.map(routeResultTag).map(normalizedKey).filter(Boolean));
  const fromCables = routeResultsFromCableRows(cables).filter(result => {
    const key = normalizedKey(routeResultTag(result));
    return key && !explicitTags.has(key);
  });
  return [...explicit, ...fromCables];
}

function uniqueRoutedCableTags(routeResults = []) {
  const tags = new Set();
  routeResults.filter(routeResultSucceeded).forEach(result => {
    const tag = normalizedKey(routeResultTag(result));
    if (tag) tags.add(tag);
  });
  return tags;
}

function buildPullSummary(routeResults, cables) {
  try {
    return buildPullTable(routeResults.filter(routeResultSucceeded), cables);
  } catch (error) {
    return {
      pulls: [],
      summary: {
        total_cables: 0,
        total_pulls: 0,
        multi_cable_pulls: 0,
        single_cable_pulls: 0,
        cables_per_pull_avg: 0,
      },
      error,
    };
  }
}

function makeAction(step, severity, label, detail, href) {
  return { step, severity, label, detail, href };
}

function findNextAction(actions) {
  return actions.find(action => action.severity === 'critical')
    || actions.find(action => action.severity === 'warning')
    || actions.find(action => action.severity === 'info')
    || {
      step: 'Deliverables',
      severity: 'complete',
      label: 'Package deliverables',
      detail: 'Route, pull-card, spool, and report inputs are ready for release-package review.',
      href: 'projectreport.html',
    };
}

export function buildDeliverableReadinessDiagnostics({
  cables = [],
  trays = [],
  conduits = [],
  ductbanks = [],
  studies = {},
  drcResults = [],
  routeResults = [],
  reportSnapshots = {},
  lifecyclePackages = [],
  designBasis = undefined,
  designGateApprovals = {},
  studyApprovals = {},
  equipment = [],
  oneLine = {},
  tccSettings = null,
  enforceDesignBasis = false,
} = {}) {
  const cableRows = meaningfulRecords(cables);
  const trayRows = meaningfulRecords(trays);
  const conduitRows = meaningfulRecords(conduits);
  const ductbankRows = meaningfulRecords(ductbanks);
  const cableSummary = summarizeCableWorkflow(cableRows);
  const allRouteResults = mergedRouteResults(routeResults, {
    cables: cableRows,
    trays: trayRows,
    conduits: conduitRows,
    ductbanks: ductbankRows,
  });
  const routedRouteResults = allRouteResults.filter(routeResultSucceeded);
  const routedTags = uniqueRoutedCableTags(routedRouteResults);
  const scheduleReadyTags = cableRows
    .filter(cable => {
      const length = Number(cableLength(cable));
      return hasValue(cableTag(cable))
        && hasValue(fieldValue(cable, ['from_tag', 'fromTag', 'start_tag', 'startTag', 'from', 'source', 'source_tag']))
        && hasValue(fieldValue(cable, ['to_tag', 'toTag', 'end_tag', 'endTag', 'to', 'destination', 'load', 'load_tag']))
        && hasValue(fieldValue(cable, ['conductor_size', 'conductorSize', 'cable_size', 'wire_size', 'size']))
        && Number.isFinite(length)
        && length > 0;
    })
    .map(cableTag)
    .filter(Boolean);
  const missingRouteResultTags = scheduleReadyTags.filter(tag => !routedTags.has(normalizedKey(tag)));
  const pullSummary = buildPullSummary(routedRouteResults, cableRows);
  const spoolModel = buildSpoolSheetVisualModel(trayRows, cableRows);
  const availableSections = getAvailableSections({
    studies,
    cables: cableRows,
    trays: trayRows,
    drcResults,
  });
  const reportSnapshotCount = countObjectRecords(reportSnapshots);
  const lifecyclePackageCount = Array.isArray(lifecyclePackages) ? lifecyclePackages.length : 0;
  const designReview = (enforceDesignBasis || designBasis !== undefined)
    ? buildDesignBasisReview({
        designBasis,
        designGateApprovals,
        equipment,
        oneLine,
        cables: cableRows,
        trays: trayRows,
        conduits: conduitRows,
        ductbanks: ductbankRows,
        studies,
        studyApprovals,
        routeResults,
        tccSettings,
      })
    : null;
  const actions = [];

  if (designReview) {
    designReview.deliverableBlockers.forEach(gate => {
      actions.push(makeAction(
        gate.category || 'Design Basis',
        gate.severity,
        gate.label,
        gate.detail,
        gate.href || 'workflowdashboard.html'
      ));
    });
    if (!designReview.deliverableBlockers.length && designReview.openGateCount > 0) {
      actions.push(makeAction(
        'Design Basis',
        'info',
        'Review open design gates',
        `${designReview.openGateCount} design basis gate(s) remain open for assumptions, generated records, or review history.`,
        'workflowdashboard.html'
      ));
    }
  }

  if (cableSummary.scheduleReady === 0) {
    actions.push(makeAction('Cable Schedule', 'warning', 'Complete schedule-ready cables', 'Pull cards, procurement, and reports need cable tags, endpoints, conductor sizes, and lengths.', 'cableschedule.html'));
  }

  if (cableSummary.routingReady === 0 && cableSummary.scheduleReady > 0) {
    actions.push(makeAction('Cable Schedule', 'warning', 'Assign raceways before deliverables', `${cableSummary.scheduleReady} schedule-ready cable(s) still need raceway assignments.`, 'cableschedule.html'));
  }

  if (cableSummary.routingReady > 0 && routedRouteResults.length === 0) {
    actions.push(makeAction('Fill / Routing', 'warning', 'Run routing for field deliverables', 'Pull cards and procurement need route results from Optimal Route.', 'optimalRoute.html'));
  } else if (missingRouteResultTags.length > 0) {
    actions.push(makeAction('Fill / Routing', 'warning', 'Refresh route results', `${missingRouteResultTags.length} schedule-ready cable(s) do not have matching route results.`, 'optimalRoute.html'));
  }

  if (trayRows.length === 0) {
    actions.push(makeAction('Spool Sheets', 'info', 'Add tray geometry for spool sheets', 'Spool sheets need tray records from the Raceway Schedule.', 'racewayschedule.html'));
  } else if (!spoolModel.hasCoordinates) {
    actions.push(makeAction('Spool Sheets', 'warning', 'Add tray coordinates for spool sheets', 'Spool sheet visuals need start and end X/Y/Z coordinates.', 'racewayschedule.html'));
  }

  if (availableSections.size <= 4) {
    actions.push(makeAction('Project Report', 'info', 'Add reportable project data', 'The report builder currently only has meta sections available.', 'projectreport.html'));
  }

  if (reportSnapshotCount === 0) {
    actions.push(makeAction('Project Report', 'info', 'Save a report snapshot', 'Generate and save a report snapshot after reviewing the selected sections.', 'projectreport.html'));
  }

  if (lifecyclePackageCount === 0) {
    actions.push(makeAction('Project Dashboard', 'info', 'Create a release package', 'Issue a lifecycle package from the dashboard once report contents are ready.', 'workflowdashboard.html'));
  }

  return {
    health: {
      cableRows: cableSummary.total,
      scheduleReady: cableSummary.scheduleReady,
      routingReady: cableSummary.routingReady,
      routeResults: routedRouteResults.length,
      routeCoverage: scheduleReadyTags.length ? Math.round(((scheduleReadyTags.length - missingRouteResultTags.length) / scheduleReadyTags.length) * 100) : 0,
      pullGroups: pullSummary.summary.total_pulls,
      pullCardCables: pullSummary.summary.total_cables,
      trayRows: trayRows.length,
      conduitRows: conduitRows.length,
      ductbankRows: ductbankRows.length,
      spoolCount: spoolModel.summary.spoolCount,
      spoolCoordinateTrays: spoolModel.coordinateCount,
      reportSections: availableSections.size,
      reportSnapshots: reportSnapshotCount,
      lifecyclePackages: lifecyclePackageCount,
      deliverables: reportSnapshotCount + lifecyclePackageCount,
      designBasisReviewGates: designReview ? designReview.openGateCount : 0,
      blockingReviewGates: designReview ? designReview.deliverableBlockers.length : 0,
    },
    designReview,
    routeResults: routedRouteResults,
    missingRouteResultTags,
    cableSummary,
    pullSummary: pullSummary.summary,
    spoolSummary: spoolModel.summary,
    spoolWarnings: spoolModel.warnings,
    availableSections: Array.from(availableSections),
    actions,
    nextAction: findNextAction(actions),
    ready: {
      routeResults: routedRouteResults.length > 0,
      pullCards: pullSummary.summary.total_pulls > 0,
      spoolSheets: spoolModel.summary.spoolCount > 0 && spoolModel.hasCoordinates,
      projectReport: availableSections.size > 4 && (!designReview || designReview.readyForDeliverables),
      reportSnapshot: reportSnapshotCount > 0,
      releasePackage: lifecyclePackageCount > 0,
    },
  };
}
