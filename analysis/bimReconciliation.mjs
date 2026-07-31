/**
 * Read-only BIM coordination helpers.
 *
 * The helpers intentionally keep imported IFC/Revit geometry separate from
 * the live schedule. A coordinator can therefore identify differences and
 * exchange issues without overwriting design records during a model review.
 */

const ISSUE_SCHEMA = 'cabletrayroute.bcf-like/v1';

function text(value) {
  return String(value ?? '').trim();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function firstText(...values) {
  return values.map(text).find(Boolean) || '';
}

function routeId(record, kind) {
  if (kind === 'tray') return firstText(record?.tray_id, record?.id, record?.tag);
  if (kind === 'conduit') return firstText(record?.conduit_id, record?.id, record?.tag);
  return firstText(record?.id, record?.tag, record?.equipment_id, record?.support_id, record?.name);
}

function sourceGuid(record) {
  return firstText(record?.bim_guid, record?.bimGuid, record?.globalId, record?.GlobalId, record?.guid, record?.Guid, record?._ctr?.bim_guid);
}

export function geometryLength(record = {}) {
  const start = ['start_x', 'start_y', 'start_z'].map(key => number(record[key]));
  const end = ['end_x', 'end_y', 'end_z'].map(key => number(record[key]));
  if ([...start, ...end].some(value => value === null)) return null;
  return Math.hypot(end[0] - start[0], end[1] - start[1], end[2] - start[2]);
}

/** Normalize parser output into a stable, read-only coordination snapshot. */
export function createBimSnapshot(parsed = {}, { sourceName = '', importedAt = new Date().toISOString() } = {}) {
  const elements = [];
  for (const [kind, records] of [['tray', parsed.trays], ['conduit', parsed.conduits], ['equipment', parsed.equipment], ['support', parsed.supports]]) {
    (Array.isArray(records) ? records : []).forEach((record, index) => {
      const id = routeId(record, kind);
      const guid = sourceGuid(record);
      elements.push({
        kind,
        id,
        sourceGuid: guid,
        stableId: `${kind}:${guid || id || index + 1}`,
        start_x: number(record?.start_x),
        start_y: number(record?.start_y),
        start_z: number(record?.start_z),
        end_x: number(record?.end_x),
        end_y: number(record?.end_y),
        end_z: number(record?.end_z),
        width: number(record?.width),
        height: number(record?.height ?? record?.depth),
        material: text(record?.material),
        system: firstText(record?.system, record?.system_name, record?.System),
        voltage: firstText(record?.voltage, record?.Voltage),
        level: firstText(record?.level, record?.Level),
        area: firstText(record?.area, record?.Area),
        category: firstText(record?.category, record?.Category),
        family: firstText(record?.family, record?.Family),
        type: firstText(record?.type, record?.Type, record?.supportType, record?.support_type),
        manufacturer: firstText(record?.manufacturer, record?.Manufacturer),
        model: firstText(record?.model, record?.Model),
        hostId: firstText(record?.hostId, record?.host_id, record?.HostId),
        location: {
          x: number(record?.x),
          y: number(record?.y),
          z: number(record?.z),
        },
        length: geometryLength(record),
      });
    });
  }
  return { schema: 'cabletrayroute.bim-snapshot/v1', sourceName: text(sourceName), importedAt, elements };
}

function identityKey(kind, record) {
  const guid = sourceGuid(record);
  if (guid) return `${kind}:guid:${guid.toLowerCase()}`;
  const id = routeId(record, kind);
  return id ? `${kind}:id:${id.toLowerCase()}` : '';
}

function snapshotIdentityKey(element) {
  if (element.sourceGuid) return `${element.kind}:guid:${element.sourceGuid.toLowerCase()}`;
  return element.id ? `${element.kind}:id:${element.id.toLowerCase()}` : '';
}

function comparableGeometry(projectRecord, bimElement, tolerance) {
  const projectLength = geometryLength(projectRecord);
  const bimLength = number(bimElement?.length);
  if (projectLength === null || bimLength === null) return { changed: false, lengthDelta: null };
  const lengthDelta = bimLength - projectLength;
  return { changed: Math.abs(lengthDelta) > tolerance, lengthDelta };
}

function quantityKey(kind, record) {
  return [
    kind,
    firstText(record?.system, record?.system_name, record?.System, 'Unassigned system'),
    firstText(record?.voltage, record?.Voltage, 'Unspecified voltage'),
    firstText(record?.level, record?.Level, 'Unspecified level'),
    firstText(record?.area, record?.Area, 'Unspecified area'),
  ].join('|');
}

function addQuantity(groups, kind, record, source) {
  const key = quantityKey(kind, record);
  const current = groups.get(key) || {
    key,
    kind,
    system: firstText(record?.system, record?.system_name, record?.System, 'Unassigned system'),
    voltage: firstText(record?.voltage, record?.Voltage, 'Unspecified voltage'),
    level: firstText(record?.level, record?.Level, 'Unspecified level'),
    area: firstText(record?.area, record?.Area, 'Unspecified area'),
    projectCount: 0,
    bimCount: 0,
    projectLength: 0,
    bimLength: 0,
  };
  const length = source === 'project' ? geometryLength(record) : number(record?.length);
  if (source === 'project') {
    current.projectCount += 1;
    current.projectLength += length ?? 0;
  } else {
    current.bimCount += 1;
    current.bimLength += length ?? 0;
  }
  groups.set(key, current);
}

/** Compare schedule routes to an imported snapshot without mutating either. */
export function reconcileBimSnapshot({ trays = [], conduits = [] } = {}, snapshot = {}, { lengthTolerance = 0.01 } = {}) {
  const remaining = new Map();
  const elements = Array.isArray(snapshot?.elements) ? snapshot.elements : [];
  elements.forEach(element => {
    const key = snapshotIdentityKey(element);
    if (key) remaining.set(key, element);
  });

  const differences = [];
  for (const [kind, records] of [['tray', trays], ['conduit', conduits]]) {
    (Array.isArray(records) ? records : []).forEach(record => {
      const key = identityKey(kind, record);
      const bim = key ? remaining.get(key) : null;
      if (!bim) {
        differences.push({ kind, status: 'schedule_only', id: routeId(record, kind), sourceGuid: sourceGuid(record), project: record, bim: null, lengthDelta: null });
        return;
      }
      remaining.delete(key);
      const geometry = comparableGeometry(record, bim, lengthTolerance);
      differences.push({
        kind,
        status: geometry.changed ? 'geometry_changed' : 'matched',
        id: routeId(record, kind),
        sourceGuid: bim.sourceGuid,
        project: record,
        bim,
        lengthDelta: geometry.lengthDelta,
      });
    });
  }
  remaining.forEach(bim => differences.push({ kind: bim.kind, status: 'bim_only', id: bim.id, sourceGuid: bim.sourceGuid, project: null, bim, lengthDelta: null }));

  const quantityGroups = new Map();
  [['tray', trays], ['conduit', conduits]].forEach(([kind, records]) => (Array.isArray(records) ? records : []).forEach(record => addQuantity(quantityGroups, kind, record, 'project')));
  elements.forEach(element => addQuantity(quantityGroups, element.kind, element, 'bim'));
  const quantities = Array.from(quantityGroups.values()).map(group => ({
    ...group,
    countDelta: group.bimCount - group.projectCount,
    lengthDelta: group.bimLength - group.projectLength,
  }));

  const summary = differences.reduce((result, difference) => {
    result[difference.status] += 1;
    return result;
  }, { matched: 0, geometry_changed: 0, schedule_only: 0, bim_only: 0 });
  return { differences, quantities, summary, comparedAt: new Date().toISOString(), lengthTolerance };
}

export function createBimIssue({ title = '', elementIds = [], assignee = '', comment = '', author = '', screenshot = '', status = 'open', createdAt = new Date().toISOString(), id } = {}) {
  const issueId = text(id) || `CTR-BCF-${createdAt.replace(/[^0-9]/g, '').slice(0, 14)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const initialComment = text(comment)
    ? [{ author: text(author), text: text(comment), at: createdAt }]
    : [];
  return {
    id: issueId,
    title: text(title) || 'BIM coordination issue',
    status: ['open', 'in_review', 'closed'].includes(status) ? status : 'open',
    assignee: text(assignee),
    elementIds: Array.from(new Set((Array.isArray(elementIds) ? elementIds : []).map(text).filter(Boolean))),
    screenshot: text(screenshot),
    comments: initialComment,
    createdAt,
    updatedAt: createdAt,
  };
}

export function normalizeBimIssues(issues = []) {
  return (Array.isArray(issues) ? issues : []).map(issue => ({
    ...createBimIssue({ ...issue, comment: '', createdAt: issue?.createdAt || new Date().toISOString() }),
    comments: Array.isArray(issue?.comments) ? issue.comments.map(comment => ({ author: text(comment?.author), text: text(comment?.text), at: text(comment?.at) })) : [],
    updatedAt: text(issue?.updatedAt) || text(issue?.createdAt) || new Date().toISOString(),
  }));
}

export function exportBimIssueExchange(issues = [], { sourceName = '', exportedAt = new Date().toISOString() } = {}) {
  return {
    schema: ISSUE_SCHEMA,
    sourceName: text(sourceName),
    exportedAt,
    issues: normalizeBimIssues(issues),
  };
}

export function importBimIssueExchange(input) {
  const parsed = typeof input === 'string' ? JSON.parse(input) : input;
  if (!parsed || parsed.schema !== ISSUE_SCHEMA) throw new Error('This is not a CableTrayRoute BIM issue exchange file.');
  return normalizeBimIssues(parsed.issues);
}
