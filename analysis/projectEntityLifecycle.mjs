const ENTITY_COLLECTIONS = new Set(['equipment', 'panels', 'loads']);
const LOAD_REFERENCE_FIELDS = ['source', 'panelId', 'equipmentRef'];
const CABLE_REFERENCE_FIELDS = [
  'from', 'from_tag', 'fromTag', 'source', 'source_tag', 'sourceTag',
  'to', 'to_tag', 'toTag', 'target', 'destination', 'load', 'load_tag', 'loadTag'
];
const COMPONENT_LINK_KEYS = {
  equipment: { scheduleKey: 'equipment', directKey: 'equipmentRef' },
  panels: { scheduleKey: 'panel', directKey: 'panelRef' },
  loads: { scheduleKey: 'load', directKey: 'loadRef' }
};

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function text(value) {
  return String(value ?? '').trim();
}

function token(value) {
  return text(value).toLowerCase();
}

function recordTokens(record, { includeId = true } = {}) {
  const values = [record?.tag, record?.ref, record?.name];
  if (includeId) values.push(record?.id);
  return new Set(values.map(token).filter(Boolean));
}

function displayIdentity(record) {
  return text(record?.tag || record?.ref || record?.name || record?.id);
}

function stableId(record) {
  return text(record?.id);
}

function sameToken(value, tokens) {
  const normalized = token(value);
  return Boolean(normalized && tokens.has(normalized));
}

function replaceMatchingFields(record, fields, oldTokens, replacement) {
  let changed = false;
  fields.forEach(field => {
    if (!sameToken(record?.[field], oldTokens)) return;
    record[field] = replacement;
    changed = true;
  });
  return changed;
}

function collectionChanges(previousRecords = [], nextRecords = []) {
  const previousById = new Map((Array.isArray(previousRecords) ? previousRecords : [])
    .filter(record => stableId(record))
    .map(record => [token(record.id), record]));
  const nextById = new Map((Array.isArray(nextRecords) ? nextRecords : [])
    .filter(record => stableId(record))
    .map(record => [token(record.id), record]));
  const renames = [];
  const deletions = [];
  previousById.forEach((previous, id) => {
    const next = nextById.get(id);
    if (!next) {
      deletions.push({ id: stableId(previous), previous, oldTokens: recordTokens(previous) });
      return;
    }
    const before = displayIdentity(previous);
    const after = displayIdentity(next);
    if (before && after && token(before) !== token(after)) {
      renames.push({
        id: stableId(previous),
        previous,
        next,
        replacement: after,
        oldTokens: recordTokens(previous),
        oldDisplayTokens: recordTokens(previous, { includeId: false })
      });
    }
  });
  return { renames, deletions };
}

function updateComponentForRename(component, collection, rename) {
  const link = COMPONENT_LINK_KEYS[collection];
  if (!link) return false;
  const linkedById = token(component?.entityId) === token(rename.id);
  const linkedByValue = sameToken(component?.scheduleLinks?.[link.scheduleKey], rename.oldTokens)
    || sameToken(component?.[link.directKey], rename.oldTokens);
  if (!linkedById && !linkedByValue) return false;
  let changed = false;
  if (component.scheduleLinks?.[link.scheduleKey]
    && token(component.scheduleLinks[link.scheduleKey]) !== token(rename.id)
    && sameToken(component.scheduleLinks[link.scheduleKey], rename.oldDisplayTokens)) {
    component.scheduleLinks[link.scheduleKey] = rename.replacement;
    changed = true;
  }
  if (component[link.directKey]
    && token(component[link.directKey]) !== token(rename.id)
    && sameToken(component[link.directKey], rename.oldDisplayTokens)) {
    component[link.directKey] = rename.replacement;
    changed = true;
  }
  ['tag', 'label', 'ref'].forEach(field => {
    if (sameToken(component[field], rename.oldDisplayTokens)) {
      component[field] = rename.replacement;
      changed = true;
    }
  });
  return changed;
}

function detachDeletedComponent(component, collection, deletion) {
  const link = COMPONENT_LINK_KEYS[collection];
  if (!link) return false;
  const linked = token(component?.entityId) === token(deletion.id)
    || sameToken(component?.scheduleLinks?.[link.scheduleKey], deletion.oldTokens)
    || sameToken(component?.[link.directKey], deletion.oldTokens)
    || ['tag', 'label', 'ref'].some(field => sameToken(component?.[field], deletion.oldTokens));
  if (!linked) return false;
  delete component.entityId;
  component.referenceStatus = 'orphaned';
  component.orphanedEntityId = deletion.id;
  return true;
}

function updateOneLine(oneLine, collection, changes) {
  const next = clone(oneLine && typeof oneLine === 'object' ? oneLine : { activeSheet: 0, sheets: [] });
  let changed = false;
  (Array.isArray(next.sheets) ? next.sheets : []).forEach(sheet => {
    (Array.isArray(sheet.components) ? sheet.components : []).forEach(component => {
      changes.renames.forEach(rename => {
        if (updateComponentForRename(component, collection, rename)) changed = true;
      });
      changes.deletions.forEach(deletion => {
        if (detachDeletedComponent(component, collection, deletion)) changed = true;
      });
    });
    if (collection !== 'cables') return;
    (Array.isArray(sheet.connections) ? sheet.connections : []).forEach(connection => {
      changes.renames.forEach(rename => {
        const linked = token(connection.circuitId) === token(rename.id)
          || sameToken(connection.cable?.tag, rename.oldTokens)
          || sameToken(connection.cable_tag, rename.oldTokens);
        if (!linked) return;
        if (connection.cable?.tag && sameToken(connection.cable.tag, rename.oldDisplayTokens)) {
          connection.cable.tag = rename.replacement;
          changed = true;
        }
        if (sameToken(connection.cable_tag, rename.oldDisplayTokens)) {
          connection.cable_tag = rename.replacement;
          changed = true;
        }
      });
      changes.deletions.forEach(deletion => {
        const linked = token(connection.circuitId) === token(deletion.id)
          || sameToken(connection.cable?.tag, deletion.oldTokens)
          || sameToken(connection.cable_tag, deletion.oldTokens);
        if (!linked) return;
        delete connection.circuitId;
        connection.referenceStatus = 'orphaned';
        connection.orphanedCircuitId = deletion.id;
        changed = true;
      });
    });
  });
  return { changed, value: next };
}

export function propagateProjectEntityLifecycle({
  collection,
  previousRecords = [],
  nextRecords = [],
  loads = [],
  cables = [],
  oneLine = { activeSheet: 0, sheets: [] }
} = {}) {
  const changes = collectionChanges(previousRecords, nextRecords);
  const nextLoads = clone(Array.isArray(loads) ? loads : []);
  const nextCables = clone(Array.isArray(cables) ? cables : []);
  let loadsChanged = false;
  let cablesChanged = false;

  if (collection === 'equipment' || collection === 'panels') {
    changes.renames.forEach(rename => {
      nextLoads.forEach(load => {
        if (replaceMatchingFields(load, LOAD_REFERENCE_FIELDS, rename.oldTokens, rename.replacement)) loadsChanged = true;
      });
    });
  }
  if (ENTITY_COLLECTIONS.has(collection)) {
    changes.renames.forEach(rename => {
      nextCables.forEach(cable => {
        if (replaceMatchingFields(cable, CABLE_REFERENCE_FIELDS, rename.oldTokens, rename.replacement)) cablesChanged = true;
      });
    });
  }
  const diagram = updateOneLine(oneLine, collection, changes);
  return {
    changes,
    loads: { changed: loadsChanged, value: nextLoads },
    cables: { changed: cablesChanged, value: nextCables },
    oneLine: diagram
  };
}

function identitySet(records = []) {
  const values = new Set();
  (Array.isArray(records) ? records : []).forEach(record => {
    recordTokens(record).forEach(value => values.add(value));
  });
  return values;
}

function pushIssue(issues, issue) {
  const key = `${issue.code}:${issue.collection}:${issue.recordId}:${issue.field}:${token(issue.value)}`;
  if (issues.some(existing => existing.key === key)) return;
  issues.push({ key, severity: 'warning', ...issue });
}

function dependencyRoute(collection, recordId = '') {
  if (collection === 'loads') return 'loadlist.html';
  if (collection === 'cables') return 'cableschedule.html';
  if (collection === 'oneLine') {
    const query = new URLSearchParams({ probe: recordId });
    return `oneline.html?${query.toString()}`;
  }
  return 'workflowdashboard.html';
}

function pushDependency(dependencies, dependency) {
  const key = `${dependency.collection}:${dependency.recordId}:${dependency.field}:${token(dependency.deletedRecordId)}`;
  if (dependencies.some(existing => existing.key === key)) return;
  dependencies.push({
    key,
    href: dependencyRoute(dependency.collection, dependency.recordId),
    ...dependency
  });
}

export function getProjectEntityDeletionImpact({
  collection,
  records = [],
  loads = [],
  cables = [],
  oneLine = { activeSheet: 0, sheets: [] }
} = {}) {
  const selected = (Array.isArray(records) ? records : [])
    .filter(record => record && typeof record === 'object')
    .map(record => ({
      id: stableId(record),
      label: displayIdentity(record) || stableId(record) || 'Unnamed record',
      tokens: recordTokens(record)
    }));
  const dependencies = [];

  selected.forEach(deletion => {
    if (collection === 'equipment' || collection === 'panels') {
      (Array.isArray(loads) ? loads : []).forEach((load, index) => {
        const linkedById = collection === 'equipment'
          ? token(load?.equipmentId) === token(deletion.id)
          : token(load?.panelId) === token(deletion.id);
        const linkedByValue = LOAD_REFERENCE_FIELDS.some(field => sameToken(load?.[field], deletion.tokens));
        if (!linkedById && !linkedByValue) return;
        const recordId = displayIdentity(load) || `load-${index + 1}`;
        pushDependency(dependencies, {
          collection: 'loads',
          recordId,
          field: linkedById ? (collection === 'equipment' ? 'equipmentId' : 'panelId') : 'source',
          deletedRecordId: deletion.id,
          deletedLabel: deletion.label,
          message: `Load ${recordId} will retain a reference to ${deletion.label} for explicit relinking.`
        });
      });
    }

    if (ENTITY_COLLECTIONS.has(collection)) {
      (Array.isArray(cables) ? cables : []).forEach((cable, index) => {
        const linkedById = ['sourceEquipmentId', 'targetEquipmentId']
          .some(field => token(cable?.[field]) === token(deletion.id));
        const linkedByValue = CABLE_REFERENCE_FIELDS.some(field => sameToken(cable?.[field], deletion.tokens));
        if (!linkedById && !linkedByValue) return;
        const recordId = displayIdentity(cable) || `cable-${index + 1}`;
        pushDependency(dependencies, {
          collection: 'cables',
          recordId,
          field: linkedById ? 'endpointId' : 'endpoint',
          deletedRecordId: deletion.id,
          deletedLabel: deletion.label,
          message: `Cable ${recordId} will retain an endpoint reference to ${deletion.label} for explicit relinking.`
        });
      });
    }

    (Array.isArray(oneLine?.sheets) ? oneLine.sheets : []).forEach((sheet, sheetIndex) => {
      if (collection === 'cables') {
        (Array.isArray(sheet.connections) ? sheet.connections : []).forEach((connection, connectionIndex) => {
          const linked = token(connection?.circuitId) === token(deletion.id)
            || sameToken(connection?.cable?.tag, deletion.tokens)
            || sameToken(connection?.cable_tag, deletion.tokens);
          if (!linked) return;
          const recordId = text(connection?.id || connection?.tag) || `sheet-${sheetIndex + 1}-connection-${connectionIndex + 1}`;
          pushDependency(dependencies, {
            collection: 'oneLine',
            recordId,
            field: 'circuitId',
            deletedRecordId: deletion.id,
            deletedLabel: deletion.label,
            message: `One-Line connection ${recordId} will be detached from cable ${deletion.label}.`
          });
        });
        return;
      }
      const link = COMPONENT_LINK_KEYS[collection];
      if (!link) return;
      (Array.isArray(sheet.components) ? sheet.components : []).forEach((component, componentIndex) => {
        const linked = token(component?.entityId) === token(deletion.id)
          || sameToken(component?.scheduleLinks?.[link.scheduleKey], deletion.tokens)
          || sameToken(component?.[link.directKey], deletion.tokens)
          || ['tag', 'label', 'ref'].some(field => sameToken(component?.[field], deletion.tokens));
        if (!linked) return;
        const recordId = text(component?.id || component?.label) || `sheet-${sheetIndex + 1}-component-${componentIndex + 1}`;
        pushDependency(dependencies, {
          collection: 'oneLine',
          recordId,
          field: 'entityId',
          deletedRecordId: deletion.id,
          deletedLabel: deletion.label,
          message: `One-Line component ${recordId} will be detached from ${deletion.label}.`
        });
      });
    });
  });

  const counts = dependencies.reduce((summary, dependency) => {
    summary[dependency.collection] = (summary[dependency.collection] || 0) + 1;
    summary.total += 1;
    return summary;
  }, { total: 0, loads: 0, cables: 0, oneLine: 0 });
  return { collection, records: selected, dependencies, counts };
}

export function getProjectReferenceDiagnostics({ equipment = [], panels = [], loads = [], cables = [], oneLine = {} } = {}) {
  const issues = [];
  const equipmentIds = identitySet(equipment);
  const panelIds = identitySet(panels);
  const entityIds = new Set([...equipmentIds, ...panelIds, ...identitySet(loads)]);
  const cableIds = identitySet(cables);

  (Array.isArray(loads) ? loads : []).forEach((load, index) => {
    const recordId = displayIdentity(load) || `load-${index + 1}`;
    if (text(load.equipmentId) && !equipmentIds.has(token(load.equipmentId))) {
      pushIssue(issues, { code: 'orphan-load-equipment', collection: 'loads', recordId, field: 'equipmentId', value: load.equipmentId, href: dependencyRoute('loads', recordId), actionLabel: 'Review Load List', message: `Load ${recordId} references missing equipment ${load.equipmentId}.` });
    }
    if (text(load.panelId) && !panelIds.has(token(load.panelId))) {
      pushIssue(issues, { code: 'orphan-load-panel', collection: 'loads', recordId, field: 'panelId', value: load.panelId, href: dependencyRoute('loads', recordId), actionLabel: 'Review Load List', message: `Load ${recordId} references missing panel ${load.panelId}.` });
    }
  });
  (Array.isArray(cables) ? cables : []).forEach((cable, index) => {
    const recordId = displayIdentity(cable) || `cable-${index + 1}`;
    ['sourceEquipmentId', 'targetEquipmentId'].forEach(field => {
      if (!text(cable[field]) || entityIds.has(token(cable[field]))) return;
      pushIssue(issues, { code: 'orphan-cable-endpoint', collection: 'cables', recordId, field, value: cable[field], href: dependencyRoute('cables', recordId), actionLabel: 'Review Cable Schedule', message: `Cable ${recordId} references missing endpoint ${cable[field]}.` });
    });
  });
  (Array.isArray(oneLine?.sheets) ? oneLine.sheets : []).forEach((sheet, sheetIndex) => {
    (Array.isArray(sheet.components) ? sheet.components : []).forEach((component, componentIndex) => {
      const recordId = text(component.id || component.label) || `sheet-${sheetIndex + 1}-component-${componentIndex + 1}`;
      const missing = text(component.orphanedEntityId)
        || (text(component.entityId) && !entityIds.has(token(component.entityId)) ? component.entityId : '');
      if (missing) pushIssue(issues, { code: 'orphan-oneline-entity', collection: 'oneLine', recordId, field: 'entityId', value: missing, href: dependencyRoute('oneLine', recordId), actionLabel: 'Review One-Line', message: `One-Line component ${recordId} references missing project entity ${missing}.` });
    });
    (Array.isArray(sheet.connections) ? sheet.connections : []).forEach((connection, connectionIndex) => {
      const recordId = text(connection.id || connection.tag) || `sheet-${sheetIndex + 1}-connection-${connectionIndex + 1}`;
      const missing = text(connection.orphanedCircuitId)
        || (text(connection.circuitId) && !cableIds.has(token(connection.circuitId)) ? connection.circuitId : '');
      if (missing) pushIssue(issues, { code: 'orphan-oneline-circuit', collection: 'oneLine', recordId, field: 'circuitId', value: missing, href: dependencyRoute('oneLine', recordId), actionLabel: 'Review One-Line', message: `One-Line connection ${recordId} references missing cable ${missing}.` });
    });
  });
  return issues;
}
