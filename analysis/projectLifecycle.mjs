export const PROJECT_LIFECYCLE_VERSION = 'project-lifecycle-v1';
export const MAX_LIFECYCLE_REVISION_COUNT = 12;
export const MAX_LIFECYCLE_ENTRY_BYTES = 2 * 1024 * 1024;

const SCHEDULE_KEYS = ['cables', 'trays', 'conduits', 'ductbanks', 'equipment'];
const STUDY_DELTA_LIMIT = 20;

function deepClone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function slug(value = '') {
  return String(value || 'item')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';
}

function makeId(prefix, parts = []) {
  const core = parts.filter(Boolean).map(slug).join('-') || Date.now().toString(36);
  return `${prefix}-${core}`;
}

function normalizeStatus(status = 'released') {
  const value = String(status || '').trim().toLowerCase();
  return ['draft', 'released', 'superseded'].includes(value) ? value : 'released';
}

function recordKey(record, index, kind = 'record') {
  if (!record || typeof record !== 'object') return `${kind}-${index + 1}`;
  return String(
    record.id
    || record.tag
    || record.ref
    || record.cable_id
    || record.tray_id
    || record.conduit_id
    || record.ductbank_id
    || record.equipment_id
    || record._key
    || record.name
    || `${kind}-${index + 1}`
  );
}

function summarizeApprovals(approvals = {}) {
  const rows = Object.entries(asObject(approvals));
  return {
    total: rows.length,
    approved: rows.filter(([, approval]) => approval?.status === 'approved').length,
    flagged: rows.filter(([, approval]) => approval?.status === 'flagged').length,
    pending: rows.filter(([, approval]) => !approval?.status || approval.status === 'pending').length,
  };
}

function changedRecord(previous, next) {
  return stableStringify(previous) !== stableStringify(next);
}

function diffRecordCollection(previousRows = [], nextRows = [], kind = 'record') {
  const previousMap = new Map(asArray(previousRows).map((row, index) => [recordKey(row, index, kind), row]));
  const nextMap = new Map(asArray(nextRows).map((row, index) => [recordKey(row, index, kind), row]));
  const added = [];
  const removed = [];
  const changed = [];

  nextMap.forEach((row, key) => {
    if (!previousMap.has(key)) {
      added.push(key);
    } else if (changedRecord(previousMap.get(key), row)) {
      changed.push(key);
    }
  });
  previousMap.forEach((row, key) => {
    if (!nextMap.has(key)) removed.push(key);
  });

  return {
    added,
    removed,
    changed,
    addedCount: added.length,
    removedCount: removed.length,
    changedCount: changed.length,
  };
}

function flattenOneLine(snapshot = {}) {
  const oneLine = snapshot.oneLine || {};
  const sheets = asArray(oneLine.sheets);
  const components = [];
  const connections = [];
  sheets.forEach((sheet, sheetIndex) => {
    asArray(sheet.components).forEach((component, index) => {
      components.push({
        ...component,
        sheet: sheet.name || `Sheet ${sheetIndex + 1}`,
        _key: component.id || `${sheetIndex + 1}:component-${index + 1}`,
      });
      asArray(component.connections).forEach((connection, connectionIndex) => {
        connections.push({
          from: component.id || `${sheetIndex + 1}:component-${index + 1}`,
          to: connection.target || connection.to || '',
          cable: connection.cable?.id || connection.cable?.tag || '',
          sheet: sheet.name || `Sheet ${sheetIndex + 1}`,
          _key: `${component.id || index}->${connection.target || connection.to || connectionIndex}`,
        });
      });
    });
    asArray(sheet.connections).forEach((connection, index) => {
      connections.push({
        ...connection,
        sheet: sheet.name || `Sheet ${sheetIndex + 1}`,
        _key: connection.id || `${connection.from || connection.source || ''}->${connection.to || connection.target || ''}:${index}`,
      });
    });
  });
  return { components, connections };
}

function collectNumericLeaves(value, prefix = '', out = {}) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    out[prefix || 'value'] = value;
    return out;
  }
  if (!value || typeof value !== 'object') return out;
  Object.entries(value).forEach(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof child === 'number' && Number.isFinite(child)) {
      out[path] = child;
    } else if (child && typeof child === 'object' && !Array.isArray(child)) {
      collectNumericLeaves(child, path, out);
    }
  });
  return out;
}

function diffStudies(previousStudies = {}, nextStudies = {}) {
  const previous = asObject(previousStudies);
  const next = asObject(nextStudies);
  const previousKeys = new Set(Object.keys(previous));
  const nextKeys = new Set(Object.keys(next));
  const added = [...nextKeys].filter(key => !previousKeys.has(key));
  const removed = [...previousKeys].filter(key => !nextKeys.has(key));
  const changed = [...nextKeys].filter(key => previousKeys.has(key) && changedRecord(previous[key], next[key]));
  const numericDeltas = [];

  changed.forEach(studyKey => {
    const beforeLeaves = collectNumericLeaves(previous[studyKey]);
    const afterLeaves = collectNumericLeaves(next[studyKey]);
    Object.keys(afterLeaves).forEach(path => {
      if (typeof beforeLeaves[path] === 'number' && beforeLeaves[path] !== afterLeaves[path] && numericDeltas.length < STUDY_DELTA_LIMIT) {
        numericDeltas.push({
          studyKey,
          path,
          previous: beforeLeaves[path],
          next: afterLeaves[path],
          delta: +(afterLeaves[path] - beforeLeaves[path]).toFixed(6),
        });
      }
    });
  });

  return {
    added,
    removed,
    changed,
    addedCount: added.length,
    removedCount: removed.length,
    changedCount: changed.length,
    numericDeltas,
  };
}

function diffApprovals(previousApprovals = {}, nextApprovals = {}) {
  const diff = diffRecordCollection(
    Object.entries(asObject(previousApprovals)).map(([id, value]) => ({ id, ...asObject(value) })),
    Object.entries(asObject(nextApprovals)).map(([id, value]) => ({ id, ...asObject(value) })),
    'approval'
  );
  return diff;
}

export function hashLifecycleSnapshot(snapshot = {}) {
  const input = stableStringify(snapshot);
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function estimateLifecycleBytes(value = {}) {
  return stableStringify(value).length;
}

export function captureLifecycleSnapshot(projectState = {}) {
  const source = asObject(projectState);
  return deepClone({
    projectName: source.projectName || source.name || 'Untitled Project',
    scenario: source.scenario || 'Default',
    generatedAt: source.generatedAt || new Date().toISOString(),
    schedules: {
      cables: asArray(source.cables),
      trays: asArray(source.trays),
      conduits: asArray(source.conduits),
      ductbanks: asArray(source.ductbanks),
      equipment: asArray(source.equipment),
      panels: asArray(source.panels),
      loads: asArray(source.loads),
    },
    oneLine: source.oneLine || { activeSheet: 0, sheets: [] },
    studies: asObject(source.studies),
    approvals: asObject(source.approvals),
    drcAcceptedFindings: asArray(source.drcAcceptedFindings),
    designCoachDecisions: asArray(source.designCoachDecisions),
    fieldObservations: asArray(source.fieldObservations),
    bimElements: asArray(source.bimElements),
    bimIssues: asArray(source.bimIssues),
    bimConnectorPackages: asArray(source.bimConnectorPackages),
    activeBimConnectorPackageId: source.activeBimConnectorPackageId || '',
    componentLibrarySubscription: source.componentLibrarySubscription || {},
    assumptions: source.assumptions || {},
    reportContext: source.reportContext || {},
  });
}

export function createProjectRevision({
  id = '',
  name = '',
  revision = '',
  author = '',
  status = 'released',
  scenario = 'Default',
  snapshot = {},
  notes = '',
  createdAt = '',
} = {}) {
  const created = createdAt || new Date().toISOString();
  const frozenSnapshot = deepClone(snapshot || {});
  const modelHash = hashLifecycleSnapshot(frozenSnapshot);
  return {
    id: id || makeId('project-revision', [revision || 'rev', created]),
    version: PROJECT_LIFECYCLE_VERSION,
    name: name || `Project Revision ${revision || ''}`.trim(),
    revision: revision || 'A',
    status: normalizeStatus(status),
    author: author || '',
    scenario: scenario || frozenSnapshot.scenario || 'Default',
    createdAt: created,
    notes: notes || '',
    modelHash,
    snapshot: frozenSnapshot,
    approvalSummary: summarizeApprovals(frozenSnapshot.approvals),
  };
}

export function createStudyPackage({
  id = '',
  projectRevision,
  selectedStudies = null,
  reportMetadata = {},
  lineage = {},
  diffFromPrevious = null,
  createdAt = '',
} = {}) {
  const revision = asObject(projectRevision);
  const snapshot = asObject(revision.snapshot);
  const studies = asObject(snapshot.studies);
  const selectedStudyKeys = Array.isArray(selectedStudies) && selectedStudies.length
    ? selectedStudies
    : Object.keys(studies);
  const created = createdAt || revision.createdAt || new Date().toISOString();
  return {
    id: id || makeId('study-package', [revision.revision || 'rev', created]),
    version: PROJECT_LIFECYCLE_VERSION,
    name: revision.name || 'Study Package',
    revision: revision.revision || 'A',
    status: normalizeStatus(revision.status),
    author: revision.author || '',
    scenario: revision.scenario || snapshot.scenario || 'Default',
    createdAt: created,
    notes: revision.notes || '',
    projectRevisionId: revision.id || '',
    modelHash: revision.modelHash || hashLifecycleSnapshot(snapshot),
    selectedStudies: selectedStudyKeys,
    studyCount: selectedStudyKeys.length,
    snapshot,
    lineage: deepClone(lineage || {}),
    diffFromPrevious: deepClone(diffFromPrevious || {}),
    approvalSummary: revision.approvalSummary || summarizeApprovals(snapshot.approvals),
    reportMetadata: deepClone(reportMetadata || {}),
  };
}

export function diffProjectRevisions(previousRevision = null, nextRevision = null) {
  const previousSnapshot = asObject(previousRevision?.snapshot || previousRevision);
  const nextSnapshot = asObject(nextRevision?.snapshot || nextRevision);
  const previousSchedules = asObject(previousSnapshot.schedules);
  const nextSchedules = asObject(nextSnapshot.schedules);
  const schedules = {};

  SCHEDULE_KEYS.forEach(key => {
    schedules[key] = diffRecordCollection(previousSchedules[key], nextSchedules[key], key);
  });

  const previousOneLine = flattenOneLine(previousSnapshot);
  const nextOneLine = flattenOneLine(nextSnapshot);
  const oneLine = {
    components: diffRecordCollection(previousOneLine.components, nextOneLine.components, 'component'),
    connections: diffRecordCollection(previousOneLine.connections, nextOneLine.connections, 'connection'),
  };

  const studies = diffStudies(previousSnapshot.studies, nextSnapshot.studies);
  const approvals = diffApprovals(previousSnapshot.approvals, nextSnapshot.approvals);
  const summary = {
    schedulesAdded: Object.values(schedules).reduce((sum, item) => sum + item.addedCount, 0),
    schedulesRemoved: Object.values(schedules).reduce((sum, item) => sum + item.removedCount, 0),
    schedulesChanged: Object.values(schedules).reduce((sum, item) => sum + item.changedCount, 0),
    oneLineAdded: oneLine.components.addedCount + oneLine.connections.addedCount,
    oneLineRemoved: oneLine.components.removedCount + oneLine.connections.removedCount,
    oneLineChanged: oneLine.components.changedCount + oneLine.connections.changedCount,
    studiesChanged: studies.addedCount + studies.removedCount + studies.changedCount,
    approvalsChanged: approvals.addedCount + approvals.removedCount + approvals.changedCount,
  };

  return {
    previousRevisionId: previousRevision?.id || '',
    nextRevisionId: nextRevision?.id || '',
    schedules,
    oneLine,
    studies,
    approvals,
    summary,
  };
}

export function summarizeLifecycleLineage({ projectRevisions = [], studyPackages = [], activeStudyPackageId = '' } = {}) {
  const revisions = asArray(projectRevisions);
  const packages = asArray(studyPackages);
  const latestReleased = [...packages]
    .filter(pkg => pkg.status === 'released')
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0] || null;
  const activePackage = packages.find(pkg => pkg.id === activeStudyPackageId) || latestReleased || packages[packages.length - 1] || null;
  return {
    revisionCount: revisions.length,
    packageCount: packages.length,
    releasedCount: packages.filter(pkg => pkg.status === 'released').length,
    draftCount: packages.filter(pkg => pkg.status === 'draft').length,
    activeStudyPackageId: activeStudyPackageId || '',
    latestRevision: revisions[revisions.length - 1] || null,
    latestReleased,
    activePackage,
  };
}

export function pruneLifecycleRevisions(revisions = [], {
  maxCount = MAX_LIFECYCLE_REVISION_COUNT,
  maxEntryBytes = MAX_LIFECYCLE_ENTRY_BYTES,
} = {}) {
  const rows = asArray(revisions).filter(revision => estimateLifecycleBytes(revision) <= maxEntryBytes);
  if (rows.length <= maxCount) return rows;

  const sorted = [...rows].sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  while (sorted.length > maxCount) {
    const draftIndex = sorted.findIndex(revision => revision.status === 'draft');
    sorted.splice(draftIndex >= 0 ? draftIndex : 0, 1);
  }
  const keptIds = new Set(sorted.map(revision => revision.id));
  return rows.filter(revision => keptIds.has(revision.id));
}
