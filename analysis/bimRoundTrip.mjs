export const BIM_ROUND_TRIP_VERSION = 'bim-round-trip-v1';

const ELEMENT_TYPES = ['cableTray', 'conduit', 'equipment', 'support', 'cable', 'generic'];
const ISSUE_STATUSES = ['open', 'assigned', 'resolved', 'rejected', 'closed'];
const ISSUE_PRIORITIES = ['low', 'medium', 'high', 'critical'];

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function stringValue(value = '') {
  return String(value ?? '').trim();
}

function numberValue(value, fallback = null) {
  if (value === '' || value === null || value === undefined) return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function slug(value = '') {
  return stringValue(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hash(value = '') {
  let result = 2166136261;
  const input = String(value);
  for (let index = 0; index < input.length; index += 1) {
    result ^= input.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(16).padStart(8, '0');
}

function escapeHtml(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function normalizeElementType(value = '') {
  const raw = stringValue(value).toLowerCase().replace(/[\s_-]+/g, '');
  if (['tray', 'cabletray', 'cablecarrier', 'ifccablecarriersegment'].includes(raw)) return 'cableTray';
  if (['conduit', 'conduitsegment', 'ifcconduitsegment'].includes(raw)) return 'conduit';
  if (['equipment', 'electricalequipment', 'panel', 'switchgear', 'mcc'].includes(raw)) return 'equipment';
  if (['support', 'hanger', 'strut', 'supportobject'].includes(raw)) return 'support';
  if (['cable', 'wire', 'feeder'].includes(raw)) return 'cable';
  return ELEMENT_TYPES.includes(value) ? value : 'generic';
}

function inferElementType(row = {}, fallback = '') {
  return normalizeElementType(
    row.elementType || row.type || row.category || row.ifcType || row.className || row.objectType || fallback
  );
}

function lengthFromGeometry(row = {}) {
  const start = row.start || {};
  const end = row.end || {};
  const x1 = numberValue(row.start_x ?? row.sx ?? row.x1 ?? row.StartX ?? start.x, null);
  const y1 = numberValue(row.start_y ?? row.sy ?? row.y1 ?? row.StartY ?? start.y, null);
  const z1 = numberValue(row.start_z ?? row.sz ?? row.z1 ?? row.StartZ ?? start.z, 0);
  const x2 = numberValue(row.end_x ?? row.ex ?? row.x2 ?? row.EndX ?? end.x, null);
  const y2 = numberValue(row.end_y ?? row.ey ?? row.y2 ?? row.EndY ?? end.y, null);
  const z2 = numberValue(row.end_z ?? row.ez ?? row.z2 ?? row.EndZ ?? end.z, 0);
  if ([x1, y1, x2, y2].some(value => value === null)) return null;
  return +Math.hypot(x2 - x1, y2 - y1, z2 - z1).toFixed(3);
}

function normalizedKey(value = '') {
  return stringValue(value).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function elementTag(row = {}) {
  return stringValue(row.tag || row.Tag || row.mark || row.label || row.tray_id || row.conduit_id || row.equipment_id);
}

export function normalizeBimElement(row = {}) {
  const source = asObject(row);
  const elementType = inferElementType(source);
  const guid = stringValue(source.guid || source.GlobalId || source.ifcGuid || source.ifc_guid);
  const sourceId = stringValue(source.sourceId || source.source_id || source.id || source.elementId || source.UniqueId || source.tray_id || source.conduit_id || source.equipment_id);
  const tag = elementTag(source);
  const lengthFt = numberValue(source.lengthFt ?? source.length_ft ?? source.LengthFt ?? source.length, null) ?? lengthFromGeometry(source);
  const quantity = numberValue(source.quantity ?? source.count ?? source.qty, elementType === 'equipment' || elementType === 'support' ? 1 : (lengthFt ? null : 1));
  const idCore = guid || sourceId || tag || stableStringify({ elementType, source });
  const sourceProperties = asObject(source.sourceProperties || source.properties || source.props);
  const warnings = asArray(source.warnings).map(stringValue).filter(Boolean);
  if (!guid && !sourceId && !tag) warnings.push('Imported BIM element has no stable GUID, source ID, or tag.');
  return {
    id: stringValue(source.id && !source.sourceId ? source.id : '') || `bim-${slug(elementType)}-${hash(idCore)}`,
    guid,
    sourceId,
    sourceFile: stringValue(source.sourceFile || source.fileName || source.file || ''),
    elementType,
    tag,
    name: stringValue(source.name || source.Name || source.label || tag || sourceId || guid),
    system: stringValue(source.system || source.System || source.discipline || source.service),
    voltageClass: stringValue(source.voltageClass || source.voltage_class || source.voltage || source.Voltage),
    level: stringValue(source.level || source.Level || source.floor),
    area: stringValue(source.area || source.Area || source.zone || source.location),
    category: stringValue(source.category || source.Category || elementType),
    material: stringValue(source.material || source.Material),
    dimensions: asObject(source.dimensions || {
      width: source.width ?? source.Width ?? source.inside_width,
      height: source.height ?? source.Height ?? source.tray_depth,
      tradeSize: source.trade_size ?? source.tradeSize ?? source.size,
    }),
    quantity,
    lengthFt,
    sourceProperties,
    mappedProjectId: stringValue(source.mappedProjectId || source.mapped_project_id),
    mappingConfidence: numberValue(source.mappingConfidence ?? source.mapping_confidence, source.mappedProjectId ? 1 : 0),
    warnings,
  };
}

function rowsFromPayloadObject(payload = {}) {
  if (Array.isArray(payload)) return payload;
  const source = asObject(payload);
  const explicit = source.elements || source.bimElements || source.modelElements || source.objects || source.components;
  if (Array.isArray(explicit)) return explicit;
  return [
    ...asArray(source.trays || source.Trays || source.cableTrays || source.CableTrays).map(row => ({ ...row, elementType: 'cableTray' })),
    ...asArray(source.conduits || source.Conduits || source.cableConduits || source.ConduitSegments).map(row => ({ ...row, elementType: 'conduit' })),
    ...asArray(source.equipment || source.Equipment).map(row => ({ ...row, elementType: 'equipment' })),
    ...asArray(source.supports || source.Supports).map(row => ({ ...row, elementType: 'support' })),
    ...asArray(source.cables || source.Cables).map(row => ({ ...row, elementType: 'cable' })),
  ];
}

function parseIfcElements(text = '', options = {}) {
  const rows = [];
  const sourceFile = options.sourceFile || '';
  const inlineRegex = /#(\d+)=IFC([A-Z0-9_]*?SEGMENT)[^;]*?(?:'([^']*)')?[^;]*?IFCPOLYLINE\(\(([^)]+)\),\(([^)]+)\)\)/gi;
  let match;
  while ((match = inlineRegex.exec(text))) {
    const kind = match[2] || '';
    const guid = stringValue(match[3] || (match[0].match(/'([^']*)'/) || [])[1]);
    const start = match[4].split(',').map(value => numberValue(value, 0));
    const end = match[5].split(',').map(value => numberValue(value, 0));
    rows.push(normalizeBimElement({
      guid,
      sourceId: `#${match[1]}`,
      sourceFile,
      elementType: /CABLECARRIER/i.test(kind) ? 'cableTray' : /CONDUIT/i.test(kind) ? 'conduit' : 'generic',
      tag: guid || `IFC-${match[1]}`,
      name: guid || `IFC ${kind} #${match[1]}`,
      start: { x: start[0], y: start[1], z: start[2] },
      end: { x: end[0], y: end[1], z: end[2] },
      sourceProperties: { ifcEntity: kind },
    }));
  }
  const entityRegex = /#(\d+)=IFC([A-Z0-9_]*?(?:SEGMENT|EQUIPMENT|SUPPORT|CABLECARRIER|CONDUIT))\(([^;]*)\);/gi;
  while ((match = entityRegex.exec(text))) {
    const sourceId = `#${match[1]}`;
    if (rows.some(row => row.sourceId === sourceId)) continue;
    const kind = match[2] || '';
    const quoted = [...match[3].matchAll(/'([^']*)'/g)].map(item => item[1]);
    const guid = quoted[0] || '';
    const name = quoted[1] || quoted[0] || `IFC ${kind} ${sourceId}`;
    rows.push(normalizeBimElement({
      guid,
      sourceId,
      sourceFile,
      elementType: /CABLECARRIER/i.test(kind) ? 'cableTray' : /CONDUIT/i.test(kind) ? 'conduit' : /EQUIPMENT/i.test(kind) ? 'equipment' : /SUPPORT/i.test(kind) ? 'support' : 'generic',
      tag: name,
      name,
      sourceProperties: { ifcEntity: kind, metadataOnly: true },
      warnings: ['IFC element imported as metadata-only; geometry was not available in the lightweight parser.'],
    }));
  }
  return rows;
}

export function parseBimImportPayload(payload, options = {}) {
  let rows = [];
  if (typeof payload === 'string') {
    try {
      rows = rowsFromPayloadObject(JSON.parse(payload));
    } catch {
      rows = parseIfcElements(payload, options);
    }
  } else {
    rows = rowsFromPayloadObject(payload);
  }
  return {
    version: BIM_ROUND_TRIP_VERSION,
    sourceFile: stringValue(options.sourceFile || options.fileName),
    elements: rows.map(row => normalizeBimElement({ ...row, sourceFile: row.sourceFile || options.sourceFile || options.fileName || '' })),
    warnings: rows.length ? [] : ['No supported BIM elements were found in the imported payload.'],
  };
}

export function buildBimElementIndex(elements = []) {
  const rows = asArray(elements).map(normalizeBimElement);
  const byId = new Map();
  const byGuid = new Map();
  const bySourceId = new Map();
  const byTag = new Map();
  rows.forEach(row => {
    byId.set(row.id, row);
    if (row.guid) byGuid.set(normalizedKey(row.guid), row);
    if (row.sourceId) bySourceId.set(normalizedKey(row.sourceId), row);
    if (row.tag) byTag.set(normalizedKey(row.tag), row);
    if (row.name) byTag.set(normalizedKey(row.name), row);
  });
  return { rows, byId, byGuid, bySourceId, byTag };
}

function projectRef(row = {}, type = 'generic', index = 0) {
  return {
    id: stringValue(row.id || row.guid || row.sourceId || row.tag || row.ref || row.tray_id || row.conduit_id || row.equipment_id || row.cable_id || row.name || `${type}-${index + 1}`),
    tag: stringValue(row.tag || row.Tag || row.ref || row.name || row.label || row.tray_id || row.conduit_id || row.equipment_id || row.cable_id || row.id),
    guid: stringValue(row.guid || row.ifcGuid || row.bimGuid || row.GlobalId),
    sourceId: stringValue(row.sourceId || row.UniqueId || row.revitId || row.cadId),
    type,
    row,
  };
}

function projectRefs({ cables = [], trays = [], conduits = [], equipment = [] } = {}) {
  return [
    ...asArray(trays).map((row, index) => projectRef(row, 'cableTray', index)),
    ...asArray(conduits).map((row, index) => projectRef(row, 'conduit', index)),
    ...asArray(equipment).map((row, index) => projectRef(row, 'equipment', index)),
    ...asArray(cables).map((row, index) => projectRef(row, 'cable', index)),
  ];
}

export function mapBimElementsToProject({ bimElements = [], cables = [], trays = [], conduits = [], equipment = [] } = {}) {
  const refs = projectRefs({ cables, trays, conduits, equipment });
  const guidMap = new Map();
  const sourceIdMap = new Map();
  const tagMap = new Map();
  refs.forEach(ref => {
    if (ref.guid) guidMap.set(normalizedKey(ref.guid), ref);
    if (ref.sourceId) sourceIdMap.set(normalizedKey(ref.sourceId), ref);
    if (ref.id) tagMap.set(normalizedKey(ref.id), ref);
    if (ref.tag) tagMap.set(normalizedKey(ref.tag), ref);
  });
  return asArray(bimElements).map(normalizeBimElement).map(element => {
    let match = null;
    let method = 'none';
    let confidence = 0;
    if (element.guid && guidMap.has(normalizedKey(element.guid))) {
      match = guidMap.get(normalizedKey(element.guid));
      method = 'guid';
      confidence = 1;
    } else if (element.sourceId && sourceIdMap.has(normalizedKey(element.sourceId))) {
      match = sourceIdMap.get(normalizedKey(element.sourceId));
      method = 'sourceId';
      confidence = 0.95;
    } else if (element.tag && tagMap.has(normalizedKey(element.tag))) {
      match = tagMap.get(normalizedKey(element.tag));
      method = 'tag';
      confidence = 0.86;
    } else if (element.name && tagMap.has(normalizedKey(element.name))) {
      match = tagMap.get(normalizedKey(element.name));
      method = 'name';
      confidence = 0.72;
    }
    return {
      elementId: element.id,
      guid: element.guid,
      sourceId: element.sourceId,
      elementType: element.elementType,
      bimTag: element.tag || element.name,
      projectId: match?.id || '',
      projectTag: match?.tag || '',
      projectType: match?.type || '',
      method,
      confidence,
      status: match ? (match.type === element.elementType || element.elementType === 'generic' ? 'mapped' : 'typeMismatch') : 'unmapped',
    };
  });
}

function groupKey(row = {}) {
  return [
    row.elementType || 'generic',
    row.system || '',
    row.voltageClass || '',
    row.level || '',
    row.area || '',
  ].map(value => stringValue(value) || 'Unassigned').join('|');
}

function groupParts(key = '') {
  const [elementType, system, voltageClass, level, area] = key.split('|');
  return { elementType, system, voltageClass, level, area };
}

function addGroup(map, row, quantity, sourceId) {
  const key = groupKey(row);
  const current = map.get(key) || { ...groupParts(key), quantity: 0, lengthFt: 0, count: 0, sourceIds: [] };
  const amount = numberValue(quantity, 0) || 0;
  current.quantity += amount;
  if (row.lengthFt) current.lengthFt += Number(row.lengthFt) || 0;
  current.count += 1;
  if (sourceId) current.sourceIds.push(sourceId);
  map.set(key, current);
}

function projectQuantityRows(projectState = {}) {
  const rows = [];
  asArray(projectState.trays).forEach(row => rows.push(normalizeBimElement({
    ...row,
    elementType: 'cableTray',
    tag: row.tray_id || row.id || row.tag,
    system: row.system || row.allowed_cable_group,
    voltageClass: row.voltageClass || row.allowed_cable_group,
    level: row.level,
    area: row.area,
    lengthFt: row.lengthFt || row.length_ft || lengthFromGeometry(row),
    sourceProperties: {
      ...asObject(row.sourceProperties),
      racewayConstruction: constructionProperties(row),
    },
  })));
  asArray(projectState.conduits).forEach(row => rows.push(normalizeBimElement({
    ...row,
    elementType: 'conduit',
    tag: row.conduit_id || row.id || row.tag,
    lengthFt: row.lengthFt || row.length_ft || lengthFromGeometry(row),
    sourceProperties: {
      ...asObject(row.sourceProperties),
      racewayConstruction: constructionProperties(row),
    },
  })));
  asArray(projectState.equipment).forEach(row => rows.push(normalizeBimElement({ ...row, elementType: 'equipment', quantity: 1 })));
  asArray(projectState.cables).forEach(row => rows.push(normalizeBimElement({ ...row, elementType: 'cable', tag: row.tag || row.id || row.cable_id, lengthFt: row.length || row.length_ft })));
  return rows;
}

export function buildBimQuantityReconciliation({ bimElements = [], projectState = {}, mappings = [], tolerancePct = 5 } = {}) {
  const bimMap = new Map();
  const projectMap = new Map();
  asArray(bimElements).map(normalizeBimElement).forEach(row => {
    const quantity = row.lengthFt ?? row.quantity ?? 1;
    addGroup(bimMap, row, quantity, row.id);
  });
  projectQuantityRows(projectState).forEach(row => {
    const quantity = row.lengthFt ?? row.quantity ?? 1;
    addGroup(projectMap, row, quantity, row.id);
  });
  const keys = [...new Set([...bimMap.keys(), ...projectMap.keys()])].sort();
  const rows = keys.map(key => {
    const bim = bimMap.get(key) || { ...groupParts(key), quantity: 0, count: 0, sourceIds: [] };
    const project = projectMap.get(key) || { ...groupParts(key), quantity: 0, count: 0, sourceIds: [] };
    const delta = +(project.quantity - bim.quantity).toFixed(3);
    const basis = Math.max(Math.abs(bim.quantity), Math.abs(project.quantity), 1);
    const deltaPct = +((delta / basis) * 100).toFixed(2);
    const status = !bim.count ? 'projectOnly' : !project.count ? 'bimOnly' : Math.abs(deltaPct) > tolerancePct ? 'changed' : 'matched';
    return {
      ...groupParts(key),
      projectQuantity: +project.quantity.toFixed(3),
      bimQuantity: +bim.quantity.toFixed(3),
      delta,
      deltaPct,
      projectCount: project.count,
      bimCount: bim.count,
      status,
      recommendation: status === 'matched'
        ? 'No reconciliation action required for this group.'
        : 'Review the BIM takeoff and CableTrayRoute schedule/route quantities before handoff.',
    };
  });
  const mappedCount = asArray(mappings).filter(row => row.status === 'mapped').length;
  return {
    rows,
    summary: {
      totalGroups: rows.length,
      matched: rows.filter(row => row.status === 'matched').length,
      changed: rows.filter(row => row.status === 'changed').length,
      bimOnly: rows.filter(row => row.status === 'bimOnly').length,
      projectOnly: rows.filter(row => row.status === 'projectOnly').length,
      mappedCount,
      unmappedCount: asArray(mappings).filter(row => row.status === 'unmapped').length,
    },
  };
}

function normalizeIssueStatus(status = 'open') {
  const value = stringValue(status);
  return ISSUE_STATUSES.includes(value) ? value : 'open';
}

function normalizeIssuePriority(priority = 'medium') {
  const value = stringValue(priority);
  return ISSUE_PRIORITIES.includes(value) ? value : 'medium';
}

function normalizeComment(comment = {}, index = 0) {
  if (typeof comment === 'string') {
    return { id: `comment-${index + 1}`, author: '', body: comment, createdAt: '' };
  }
  const row = asObject(comment);
  return {
    id: stringValue(row.id || `comment-${index + 1}`),
    author: stringValue(row.author || row.createdBy),
    body: stringValue(row.body || row.comment || row.text),
    createdAt: stringValue(row.createdAt || row.date),
  };
}

function constructionProperties(row = {}) {
  const keys = [
    'supportFamily',
    'supportType',
    'supportSpacingFt',
    'accessoryKits',
    'dividerLane',
    'constructionPhase',
    'constructionStatus',
    'drawingRef',
    'detailRef',
    'labelId',
    'sectionRef',
    'installArea',
    'constructionNotes',
  ];
  return keys.reduce((props, key) => {
    if (row[key] !== undefined && row[key] !== null && row[key] !== '') props[key] = row[key];
    return props;
  }, {});
}

export function createBimIssue({
  id = '',
  elementIds = [],
  projectRefs = [],
  title = '',
  description = '',
  status = 'open',
  priority = 'medium',
  assignee = '',
  comments = [],
  snapshot = {},
  createdAt = '',
  createdBy = '',
} = {}) {
  const created = createdAt || new Date().toISOString();
  const ids = asArray(elementIds).map(stringValue).filter(Boolean);
  const issueTitle = stringValue(title || 'BIM coordination issue');
  return {
    id: stringValue(id || `bim-issue-${slug(issueTitle)}-${hash(`${issueTitle}:${ids.join(',')}:${created}`)}`),
    version: BIM_ROUND_TRIP_VERSION,
    title: issueTitle,
    description: stringValue(description),
    status: normalizeIssueStatus(status),
    priority: normalizeIssuePriority(priority),
    elementIds: ids,
    projectRefs: asArray(projectRefs).map(stringValue).filter(Boolean),
    assignee: stringValue(assignee),
    comments: asArray(comments).map(normalizeComment),
    snapshot: asObject(snapshot),
    createdAt: created,
    createdBy: stringValue(createdBy),
    updatedAt: created,
    ...(normalizeIssueStatus(status) === 'resolved' || normalizeIssueStatus(status) === 'closed' ? { resolvedAt: created } : {}),
  };
}

export function updateBimIssue(issue = {}, patch = {}) {
  const previous = createBimIssue(issue);
  const status = normalizeIssueStatus(patch.status || previous.status);
  const updatedAt = patch.updatedAt || new Date().toISOString();
  return {
    ...previous,
    ...asObject(patch),
    status,
    priority: normalizeIssuePriority(patch.priority || previous.priority),
    elementIds: asArray(patch.elementIds || previous.elementIds).map(stringValue).filter(Boolean),
    comments: asArray(patch.comments || previous.comments).map(normalizeComment),
    updatedAt,
    ...(status === 'resolved' || status === 'closed' ? { resolvedAt: patch.resolvedAt || previous.resolvedAt || updatedAt } : {}),
  };
}

function summarizeIssues(issues = []) {
  const rows = asArray(issues).map(issue => createBimIssue(issue));
  return {
    total: rows.length,
    open: rows.filter(row => row.status === 'open' || row.status === 'assigned').length,
    rejected: rows.filter(row => row.status === 'rejected').length,
    resolved: rows.filter(row => row.status === 'resolved' || row.status === 'closed').length,
    highPriority: rows.filter(row => row.priority === 'high' || row.priority === 'critical').length,
  };
}

export function buildBimRoundTripPackage(context = {}) {
  const elements = asArray(context.bimElements || context.elements).map(normalizeBimElement);
  const mappings = context.mappings || mapBimElementsToProject({
    bimElements: elements,
    cables: context.cables || context.projectState?.cables || [],
    trays: context.trays || context.projectState?.trays || [],
    conduits: context.conduits || context.projectState?.conduits || [],
    equipment: context.equipment || context.projectState?.equipment || [],
  });
  const quantityReconciliation = buildBimQuantityReconciliation({
    bimElements: elements,
    projectState: {
      cables: context.cables || context.projectState?.cables || [],
      trays: context.trays || context.projectState?.trays || [],
      conduits: context.conduits || context.projectState?.conduits || [],
      equipment: context.equipment || context.projectState?.equipment || [],
    },
    mappings,
    tolerancePct: context.tolerancePct,
  });
  const issues = asArray(context.bimIssues || context.issues).map(issue => createBimIssue(issue));
  const issueSummary = summarizeIssues(issues);
  const warnings = [
    ...elements.flatMap(row => row.warnings.map(warning => `${row.name || row.id}: ${warning}`)),
    ...quantityReconciliation.rows
      .filter(row => row.status !== 'matched')
      .map(row => `${row.elementType} ${row.system}/${row.level}/${row.area} quantity reconciliation is ${row.status}.`),
    ...issues
      .filter(row => row.status === 'open' || row.status === 'assigned' || row.status === 'rejected')
      .map(row => `BIM issue remains ${row.status}: ${row.title}`),
  ];
  return {
    version: BIM_ROUND_TRIP_VERSION,
    generatedAt: context.generatedAt || new Date().toISOString(),
    projectName: context.projectName || 'Untitled Project',
    summary: {
      elementCount: elements.length,
      mappedCount: mappings.filter(row => row.status === 'mapped').length,
      unmappedCount: mappings.filter(row => row.status === 'unmapped').length,
      reconciliationGroups: quantityReconciliation.summary.totalGroups,
      changedGroups: quantityReconciliation.summary.changed + quantityReconciliation.summary.bimOnly + quantityReconciliation.summary.projectOnly,
      openIssues: issueSummary.open,
      highPriorityIssues: issueSummary.highPriority,
    },
    elements,
    mappings,
    quantityReconciliation,
    issues,
    exports: {
      bcfJson: {
        version: BIM_ROUND_TRIP_VERSION,
        issues,
      },
    },
    warnings,
    assumptions: [
      'BIM round-trip data is a browser-local coordination aid, not a native Revit or AutoCAD plugin workflow.',
      'Imported IFC data is parsed for stable IDs, metadata, and lightweight quantities; full BIM geometry authoring remains outside V1.',
      'Quantity reconciliation is advisory and does not automatically mutate CableTrayRoute schedules or BIM authoring models.',
    ],
  };
}

export function renderBimRoundTripHTML(pkg = {}) {
  const rows = asArray(pkg.quantityReconciliation?.rows);
  const issues = asArray(pkg.issues);
  return `<section class="report-section" id="rpt-bim-coordination">
  <h2>BIM Coordination</h2>
  <p class="report-note">Browser-local BIM round-trip register with stable IDs, quantity reconciliation, and BCF-style issue markup. Native CAD/BIM write-back is excluded.</p>
  <dl class="report-dl">
    <dt>Imported Elements</dt><dd>${escapeHtml(pkg.summary?.elementCount || 0)}</dd>
    <dt>Mapped Elements</dt><dd>${escapeHtml(pkg.summary?.mappedCount || 0)}</dd>
    <dt>Unmapped Elements</dt><dd>${escapeHtml(pkg.summary?.unmappedCount || 0)}</dd>
    <dt>Changed Quantity Groups</dt><dd>${escapeHtml(pkg.summary?.changedGroups || 0)}</dd>
    <dt>Open Issues</dt><dd>${escapeHtml(pkg.summary?.openIssues || 0)}</dd>
  </dl>
  <div class="report-scroll">
    <table class="report-table">
      <thead><tr><th>Type</th><th>System</th><th>Voltage</th><th>Level</th><th>Area</th><th>Project Qty</th><th>BIM Qty</th><th>Delta</th><th>Status</th></tr></thead>
      <tbody>${rows.length ? rows.map(row => `<tr>
        <td>${escapeHtml(row.elementType)}</td>
        <td>${escapeHtml(row.system)}</td>
        <td>${escapeHtml(row.voltageClass)}</td>
        <td>${escapeHtml(row.level)}</td>
        <td>${escapeHtml(row.area)}</td>
        <td>${escapeHtml(row.projectQuantity)}</td>
        <td>${escapeHtml(row.bimQuantity)}</td>
        <td>${escapeHtml(row.delta)}</td>
        <td>${escapeHtml(row.status)}</td>
      </tr>`).join('') : '<tr><td colspan="9">No BIM quantity reconciliation rows.</td></tr>'}</tbody>
    </table>
  </div>
  <h3>BIM Issues</h3>
  <div class="report-scroll">
    <table class="report-table">
      <thead><tr><th>Title</th><th>Status</th><th>Priority</th><th>Assignee</th><th>Elements</th><th>Updated</th></tr></thead>
      <tbody>${issues.length ? issues.map(issue => `<tr>
        <td>${escapeHtml(issue.title)}</td>
        <td>${escapeHtml(issue.status)}</td>
        <td>${escapeHtml(issue.priority)}</td>
        <td>${escapeHtml(issue.assignee || 'Unassigned')}</td>
        <td>${escapeHtml(issue.elementIds.join(', '))}</td>
        <td>${escapeHtml(issue.updatedAt)}</td>
      </tr>`).join('') : '<tr><td colspan="6">No BIM coordination issues captured.</td></tr>'}</tbody>
    </table>
  </div>
</section>`;
}
