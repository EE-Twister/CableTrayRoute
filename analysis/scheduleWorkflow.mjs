function hasValue(value) {
  if (Array.isArray(value)) return value.some(hasValue);
  if (value && typeof value === 'object') return Object.values(value).some(hasValue);
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function meaningfulRecords(records) {
  return Array.isArray(records)
    ? records.filter(row => row && typeof row === 'object' && Object.values(row).some(hasValue))
    : [];
}

function fieldValue(record, names) {
  for (const name of names) {
    if (hasValue(record?.[name])) return record[name];
  }
  return '';
}

function normalized(value) {
  return String(value || '').trim();
}

function normalizedKey(value) {
  return normalized(value).toLowerCase();
}

function numericValue(value) {
  if (!hasValue(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function valuesEqual(a, b) {
  if (Array.isArray(a) || Array.isArray(b)) {
    const left = Array.isArray(a) ? a.map(normalized).filter(Boolean).sort() : normalized(a).split(/[,;|>]+/).map(part => part.trim()).filter(Boolean).sort();
    const right = Array.isArray(b) ? b.map(normalized).filter(Boolean).sort() : normalized(b).split(/[,;|>]+/).map(part => part.trim()).filter(Boolean).sort();
    return left.length === right.length && left.every((value, index) => value === right[index]);
  }
  return normalized(a) === normalized(b);
}

function addOptions(set, record, fields) {
  fields.forEach(field => {
    const value = normalized(record?.[field]);
    if (value) set.add(value);
  });
}

function cableTag(cable) {
  return fieldValue(cable, ['tag', 'name', 'id', 'cable_id', 'cableId', 'ref']);
}

function cableFrom(cable) {
  return fieldValue(cable, ['from_tag', 'fromTag', 'start_tag', 'startTag', 'from', 'source', 'source_tag']);
}

function cableTo(cable) {
  return fieldValue(cable, ['to_tag', 'toTag', 'end_tag', 'endTag', 'to', 'destination', 'load', 'load_tag']);
}

function cableSize(cable) {
  return fieldValue(cable, ['conductor_size', 'conductorSize', 'cable_size', 'wire_size', 'size']);
}

function cableLength(cable) {
  return fieldValue(cable, ['length', 'length_ft', 'lengthFt', 'estimated_length', 'calculated_length']);
}

function cableRaceway(cable) {
  return fieldValue(cable, [
    'raceway_ids',
    'racewayIds',
    'raceway_id',
    'racewayId',
    'raceway',
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
  ]);
}

function cableIsScheduleReady(cable) {
  const length = numericValue(cableLength(cable));
  return hasValue(cableTag(cable))
    && hasValue(cableFrom(cable))
    && hasValue(cableTo(cable))
    && hasValue(cableSize(cable))
    && length !== null
    && length > 0;
}

function cableHasRaceway(cable) {
  return hasValue(cableRaceway(cable));
}

function splitRacewayRefs(value) {
  if (Array.isArray(value)) {
    return value.flatMap(item => splitRacewayRefs(item));
  }
  if (value && typeof value === 'object') {
    return splitRacewayRefs(fieldValue(value, ['tray_id', 'trayId', 'raceway_id', 'racewayId', 'conduit_id', 'conduitId', 'id', 'tag', 'ref']));
  }
  const text = normalized(value);
  if (!text) return [];
  const coordinatePath = /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?(\s*;\s*-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?)+$/;
  if (coordinatePath.test(text)) return [];
  return text
    .split(/[,;|>\n]+/)
    .map(part => part.trim())
    .filter(Boolean);
}

export function getCableAssignedRacewayIds(cable) {
  return splitRacewayRefs(cableRaceway(cable));
}

export function cableHasRoutingCoordinates(cable) {
  const start = Array.isArray(cable?.start)
    ? cable.start
    : [cable?.start_x, cable?.start_y, cable?.start_z];
  const end = Array.isArray(cable?.end)
    ? cable.end
    : [cable?.end_x, cable?.end_y, cable?.end_z];
  return start.length >= 3
    && end.length >= 3
    && start.slice(0, 3).every(value => numericValue(value) !== null)
    && end.slice(0, 3).every(value => numericValue(value) !== null);
}

function recordIdentity(record, fields) {
  for (const field of fields) {
    const value = normalized(record?.[field]);
    if (value) return normalizedKey(value);
  }
  return '';
}

function indexByIdentity(rows, fields) {
  const index = new Map();
  rows.forEach((row, rowIndex) => {
    const identity = recordIdentity(row, fields);
    if (identity && !index.has(identity)) {
      index.set(identity, { row, rowIndex });
    }
  });
  return index;
}

function duplicateCount(rows, fields) {
  const counts = new Map();
  rows.forEach(row => {
    const identity = recordIdentity(row, fields);
    if (!identity) return;
    counts.set(identity, (counts.get(identity) || 0) + 1);
  });
  return Array.from(counts.values()).reduce((sum, count) => sum + (count > 1 ? count : 0), 0);
}

function mergeRecord(existing, incoming, options = {}) {
  const { overwriteConflicts = false, ignoreFields = ['last_modified'] } = options;
  const merged = { ...existing };
  const conflicts = [];
  let changed = false;
  Object.entries(incoming || {}).forEach(([field, value]) => {
    if (ignoreFields.includes(field)) return;
    if (!hasValue(value)) return;
    const current = merged[field];
    if (!hasValue(current)) {
      merged[field] = value;
      changed = true;
      return;
    }
    if (valuesEqual(current, value)) return;
    conflicts.push({ field, current, incoming: value });
    if (overwriteConflicts) {
      merged[field] = value;
      changed = true;
    }
  });
  if (changed || conflicts.length) {
    merged.last_modified = incoming?.last_modified || new Date().toISOString();
  }
  return { merged, changed, conflicts };
}

export function getCableEndpointOptions({ equipment = [], loads = [], panels = [] } = {}) {
  const values = new Set();
  meaningfulRecords(equipment).forEach(record => {
    addOptions(values, record, ['tag', 'ref', 'id', 'equipment_id', 'equipmentId', 'name', 'description']);
  });
  meaningfulRecords(loads).forEach(record => {
    addOptions(values, record, ['tag', 'ref', 'id', 'load_id', 'loadId', 'equipment_tag', 'equipmentTag']);
  });
  meaningfulRecords(panels).forEach(record => {
    addOptions(values, record, ['panel_id', 'panelId', 'tag', 'ref', 'id', 'name']);
  });
  return Array.from(values).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
}

export function summarizeCableWorkflow(cables = []) {
  const rows = meaningfulRecords(cables);
  const summary = {
    total: rows.length,
    scheduleReady: 0,
    routingReady: 0,
    missingSchedule: 0,
    missingTag: 0,
    missingFromTo: 0,
    missingSize: 0,
    missingLength: 0,
    missingRaceway: 0,
    duplicateTags: duplicateCount(rows, ['tag', 'cable_id', 'cableId', 'id', 'ref'])
  };

  rows.forEach(row => {
    const hasTag = hasValue(cableTag(row));
    const hasFromTo = hasValue(cableFrom(row)) && hasValue(cableTo(row));
    const hasSize = hasValue(cableSize(row));
    const length = numericValue(cableLength(row));
    const hasLength = length !== null && length > 0;
    const scheduleReady = hasTag && hasFromTo && hasSize && hasLength;
    const routingReady = scheduleReady && cableHasRaceway(row);
    if (!hasTag) summary.missingTag += 1;
    if (!hasFromTo) summary.missingFromTo += 1;
    if (!hasSize) summary.missingSize += 1;
    if (!hasLength) summary.missingLength += 1;
    if (scheduleReady) summary.scheduleReady += 1;
    if (routingReady) summary.routingReady += 1;
    if (scheduleReady && !routingReady) summary.missingRaceway += 1;
  });
  summary.missingSchedule = summary.total - summary.scheduleReady;
  return summary;
}

export function previewRecordImport(currentRows = [], incomingRows = [], options = {}) {
  const identityFields = options.identityFields || ['tag', 'id', 'ref'];
  const mode = options.mode || 'merge';
  const current = meaningfulRecords(currentRows);
  const incoming = meaningfulRecords(incomingRows);
  const currentIndex = indexByIdentity(current, identityFields);
  const seenCurrent = new Set();
  const details = [];
  const preview = {
    mode,
    incoming: incoming.length,
    existing: current.length,
    creates: 0,
    updates: 0,
    conflicts: 0,
    unchanged: 0,
    preserved: 0,
    removed: 0,
    details
  };

  incoming.forEach((row, incomingIndex) => {
    const identity = recordIdentity(row, identityFields);
    const match = identity ? currentIndex.get(identity) : null;
    if (!match) {
      preview.creates += 1;
      details.push({ action: 'create', identity, incomingIndex, row });
      return;
    }
    seenCurrent.add(match.rowIndex);
    const merge = mergeRecord(match.row, row, options);
    if (mode === 'replace') {
      preview.updates += 1;
      details.push({ action: 'replace', identity, incomingIndex, existingIndex: match.rowIndex, row });
      return;
    }
    if (merge.conflicts.length) {
      preview.conflicts += 1;
      details.push({ action: 'conflict', identity, incomingIndex, existingIndex: match.rowIndex, conflicts: merge.conflicts });
    } else if (merge.changed) {
      preview.updates += 1;
      details.push({ action: 'update', identity, incomingIndex, existingIndex: match.rowIndex });
    } else {
      preview.unchanged += 1;
      details.push({ action: 'unchanged', identity, incomingIndex, existingIndex: match.rowIndex });
    }
  });

  current.forEach((row, rowIndex) => {
    if (seenCurrent.has(rowIndex)) return;
    if (mode === 'replace') {
      preview.removed += 1;
      details.push({ action: 'remove', identity: recordIdentity(row, identityFields), existingIndex: rowIndex });
    } else {
      preview.preserved += 1;
    }
  });

  return preview;
}

export function applyRecordImport(currentRows = [], incomingRows = [], options = {}) {
  const mode = options.mode || 'merge';
  if (mode === 'append') return [...currentRows, ...incomingRows];
  if (mode === 'replace') return [...incomingRows];

  const identityFields = options.identityFields || ['tag', 'id', 'ref'];
  const nextRows = [...currentRows];
  const currentIndex = indexByIdentity(nextRows, identityFields);
  incomingRows.forEach(row => {
    const identity = recordIdentity(row, identityFields);
    const match = identity ? currentIndex.get(identity) : null;
    if (!match) {
      nextRows.push(row);
      return;
    }
    const { merged } = mergeRecord(match.row, row, options);
    nextRows[match.rowIndex] = merged;
  });
  return nextRows;
}

export function previewCableImport(currentRows = [], incomingRows = [], options = {}) {
  return previewRecordImport(currentRows, incomingRows, {
    identityFields: ['tag', 'cable_id', 'cableId', 'id', 'ref'],
    ...options
  });
}

export function applyCableImport(currentRows = [], incomingRows = [], options = {}) {
  return applyRecordImport(currentRows, incomingRows, {
    identityFields: ['tag', 'cable_id', 'cableId', 'id', 'ref'],
    ...options
  });
}

function hasCompleteGeometry(row) {
  if (Array.isArray(row?.outline) && row.outline.length >= 2) {
    const start = row.outline[0] || [];
    const end = row.outline[row.outline.length - 1] || [];
    return start.slice(0, 3).every(value => numericValue(value) !== null)
      && end.slice(0, 3).every(value => numericValue(value) !== null);
  }
  if (Array.isArray(row?.path) && row.path.length >= 2) {
    const start = row.path[0] || [];
    const end = row.path[row.path.length - 1] || [];
    return start.slice(0, 3).every(value => numericValue(value) !== null)
      && end.slice(0, 3).every(value => numericValue(value) !== null);
  }
  return ['start_x', 'start_y', 'start_z', 'end_x', 'end_y', 'end_z'].every(key => numericValue(row?.[key]) !== null);
}

function racewayId(row, type) {
  if (type === 'ductbank') return fieldValue(row, ['tag', 'ductbank_id', 'ductbankId', 'id', 'ref']);
  if (type === 'tray') return fieldValue(row, ['tray_id', 'trayId', 'id', 'tag', 'ref']);
  return fieldValue(row, ['conduit_id', 'conduitId', 'tray_id', 'trayId', 'id', 'tag', 'ref']);
}

function racewayHasDimensions(row, type) {
  const hasWidthHeight = numericValue(row.width) > 0 && numericValue(row.height) > 0;
  if (type === 'tray') return hasWidthHeight || (numericValue(row.inside_width) > 0 && numericValue(row.tray_depth) > 0);
  if (type === 'conduit') return hasWidthHeight || (hasValue(row.trade_size) && hasValue(row.type));
  return true;
}

export function summarizeRacewayWorkflow({ ductbanks = [], trays = [], conduits = [], assignedIds = [] } = {}) {
  const normalizedAssigned = new Set(Array.from(assignedIds || []).map(normalized).filter(Boolean));
  const groups = [
    ['ductbank', meaningfulRecords(ductbanks)],
    ['tray', meaningfulRecords(trays)],
    ['conduit', meaningfulRecords(conduits)]
  ];
  const all = groups.flatMap(([type, rows]) => rows.map(row => ({ type, row, id: normalized(racewayId(row, type)) })));
  const idCounts = new Map();
  all.forEach(item => {
    if (item.id) idCounts.set(normalizedKey(item.id), (idCounts.get(normalizedKey(item.id)) || 0) + 1);
  });
  const duplicateIds = Array.from(idCounts.values()).reduce((sum, count) => sum + (count > 1 ? count : 0), 0);
  const missingIds = all.filter(item => !item.id).length;
  const missingGeometry = all.filter(item => !hasCompleteGeometry(item.row)).length;
  const missingDimensions = all.filter(item => !racewayHasDimensions(item.row, item.type)).length;
  const assignedRaceways = all.filter(item => item.id && normalizedAssigned.has(item.id)).length;
  const unusedRaceways = all.filter(item => item.id && !normalizedAssigned.has(item.id)).length;

  return {
    total: all.length,
    ductbanks: groups[0][1].length,
    trays: groups[1][1].length,
    conduits: groups[2][1].length,
    assignedRaceways,
    unusedRaceways,
    missingIds,
    duplicateIds,
    missingGeometry,
    missingDimensions,
    issues: missingIds + duplicateIds + missingGeometry + missingDimensions
  };
}

function addRacewayAliases(map, values) {
  values.map(normalized).filter(Boolean).forEach(value => {
    const key = normalizedKey(value);
    if (key && !map.has(key)) map.set(key, value);
  });
}

function collectRacewayAliases({ ductbanks = [], trays = [], conduits = [] } = {}) {
  const aliases = new Map();
  meaningfulRecords(trays).forEach(tray => {
    addRacewayAliases(aliases, ['tray_id', 'trayId', 'id', 'tag', 'ref'].map(field => tray[field]));
  });
  meaningfulRecords(conduits).forEach(conduit => {
    const conduitIds = ['tray_id', 'trayId', 'conduit_id', 'conduitId', 'id', 'tag', 'ref'].map(field => conduit[field]);
    const parentIds = ['ductbankTag', 'ductbank_id', 'ductbankId'].map(field => conduit[field]).filter(hasValue);
    addRacewayAliases(aliases, conduitIds);
    parentIds.forEach(parent => {
      ['conduit_id', 'conduitId', 'id', 'tag', 'ref'].forEach(field => {
        if (hasValue(conduit[field])) addRacewayAliases(aliases, [`${parent}-${conduit[field]}`]);
      });
    });
  });
  meaningfulRecords(ductbanks).forEach(ductbank => {
    const parentIds = ['tag', 'ductbank_id', 'ductbankId', 'id', 'ref'].map(field => ductbank[field]).filter(hasValue);
    addRacewayAliases(aliases, parentIds);
    meaningfulRecords(ductbank.conduits).forEach(conduit => {
      addRacewayAliases(aliases, ['tray_id', 'trayId', 'conduit_id', 'conduitId', 'id', 'tag', 'ref'].map(field => conduit[field]));
      parentIds.forEach(parent => {
        ['conduit_id', 'conduitId', 'id', 'tag', 'ref'].forEach(field => {
          if (hasValue(conduit[field])) addRacewayAliases(aliases, [`${parent}-${conduit[field]}`]);
        });
      });
    });
  });
  return aliases;
}

export function buildRoutingReadinessDiagnostics({ cables = [], trays = [], conduits = [], ductbanks = [] } = {}) {
  const cableRows = meaningfulRecords(cables);
  const cableSummary = summarizeCableWorkflow(cableRows);
  const assignedIds = new Set(cableRows.flatMap(getCableAssignedRacewayIds));
  const racewaySummary = summarizeRacewayWorkflow({ ductbanks, trays, conduits, assignedIds });
  const racewayAliases = collectRacewayAliases({ ductbanks, trays, conduits });
  const coordinateReady = cableRows.filter(cableHasRoutingCoordinates).length;
  const invalidAssignedRefs = [];

  cableRows.forEach(cable => {
    const cableId = normalized(cableTag(cable)) || normalized(cable.name) || '(untagged cable)';
    getCableAssignedRacewayIds(cable).forEach(racewayRef => {
      if (!racewayAliases.has(normalizedKey(racewayRef))) {
        invalidAssignedRefs.push({ cable: cableId, raceway: racewayRef });
      }
    });
  });

  const blockers = [];
  const warnings = [];
  if (!cableSummary.total) blockers.push({ label: 'Add or import cables', detail: 'Routing needs at least one cable row.', href: 'cableschedule.html', severity: 'blocker' });
  if (!racewaySummary.total) blockers.push({ label: 'Add or import raceways', detail: 'Routing needs at least one tray, conduit, or ductbank conduit.', href: 'racewayschedule.html', severity: 'blocker' });
  if (cableSummary.total && coordinateReady === 0) blockers.push({ label: 'Add cable endpoint coordinates', detail: 'Optimal Route needs start and end XYZ coordinates for at least one cable.', href: 'cableschedule.html', severity: 'blocker' });
  if (racewaySummary.missingGeometry) blockers.push({ label: 'Complete raceway geometry', detail: `${racewaySummary.missingGeometry} raceway record(s) need start and end coordinates.`, href: 'racewayschedule.html', severity: 'blocker' });
  if (racewaySummary.missingIds) blockers.push({ label: 'Add raceway IDs', detail: `${racewaySummary.missingIds} raceway record(s) need an ID or tag.`, href: 'racewayschedule.html', severity: 'blocker' });
  if (racewaySummary.duplicateIds) blockers.push({ label: 'Resolve duplicate raceway IDs', detail: `${racewaySummary.duplicateIds} raceway ID occurrence(s) are duplicated.`, href: 'racewayschedule.html', severity: 'blocker' });
  if (racewaySummary.missingDimensions) blockers.push({ label: 'Complete raceway dimensions', detail: `${racewaySummary.missingDimensions} raceway record(s) need tray width/depth or conduit type/size.`, href: 'racewayschedule.html', severity: 'blocker' });
  if (invalidAssignedRefs.length) blockers.push({ label: 'Resolve missing raceway references', detail: `${invalidAssignedRefs.length} cable raceway assignment(s) do not match the Raceway Schedule.`, href: 'cableschedule.html', severity: 'blocker' });

  if (cableSummary.missingSchedule) warnings.push({ label: 'Finish schedule-ready cable fields', detail: `${cableSummary.missingSchedule} cable row(s) are missing tag, from/to, conductor size, or length.`, href: 'cableschedule.html', severity: 'warning' });
  if (cableSummary.missingRaceway) warnings.push({ label: 'Assign raceways to schedule-ready cables', detail: `${cableSummary.missingRaceway} schedule-ready cable row(s) are not routing-ready.`, href: 'cableschedule.html', severity: 'warning' });
  if (coordinateReady < cableSummary.total && coordinateReady > 0) warnings.push({ label: 'Review cable endpoint coordinates', detail: `${cableSummary.total - coordinateReady} cable row(s) are missing start/end XYZ coordinates for automatic routing.`, href: 'cableschedule.html', severity: 'warning' });

  const nextAction = blockers[0] || warnings[0] || {
    label: 'Run routing',
    detail: 'Routing inputs are ready for a route calculation.',
    href: 'optimalRoute.html',
    severity: 'ready'
  };

  return {
    cableSummary,
    racewaySummary,
    assignedIds: Array.from(assignedIds),
    coordinateReady,
    invalidAssignedRefs,
    blockers,
    warnings,
    nextAction,
    readyToRoute: blockers.length === 0
  };
}
