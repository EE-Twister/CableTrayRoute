const DEFAULT_IDENTITY_FIELDS = ['ref', 'id', 'tag'];

const CANVAS_ONLY_FIELDS = new Set([
  'x', 'y', 'z', 'width', 'height', 'rotation', 'ports', 'position',
  'selected', 'dragging', 'layerId', 'projectEntity', 'projectCircuit',
  'entityId', 'circuitId'
]);

const STABLE_IDENTITY_FIELDS = new Set(['id', 'ref', 'cable_id', 'cableId']);

const COLLECTION_IDENTITY_FIELDS = {
  equipment: ['ref', 'id', 'tag'],
  panels: ['ref', 'id', 'tag'],
  loads: ['ref', 'id', 'tag'],
  cables: ['tag', 'id', 'cable_id', 'cableId', 'ref']
};

function cloneRecord(record) {
  return record && typeof record === 'object'
    ? JSON.parse(JSON.stringify(record))
    : {};
}

function isEmptyValue(value) {
  if (Array.isArray(value)) return value.length === 0;
  if (value && typeof value === 'object') return Object.keys(value).length === 0;
  return value === null || value === undefined || String(value).trim() === '';
}

function sameValue(a, b, field = '') {
  if (isEmptyValue(a) && isEmptyValue(b)) return true;
  if (DEFAULT_IDENTITY_FIELDS.includes(field) && typeof a === 'string' && typeof b === 'string') {
    return normalizedIdentity(a) === normalizedIdentity(b);
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

function normalizedIdentity(value) {
  return String(value ?? '').trim().toLowerCase();
}

function identityValues(record, fields = DEFAULT_IDENTITY_FIELDS) {
  const identities = [];
  fields.forEach(field => {
    const value = record?.[field];
    if (!isEmptyValue(value)) identities.push(normalizedIdentity(value));
  });
  return [...new Set(identities)];
}

function isMeaningfulRecord(record) {
  if (!record || typeof record !== 'object') return false;
  return Object.entries(record).some(([key, value]) => {
    if (key.startsWith('_')) return false;
    return !isEmptyValue(value);
  });
}

export function recordIdentity(record, fields = DEFAULT_IDENTITY_FIELDS) {
  return identityValues(record, fields)[0] || '';
}

export function previewReconcileRecords(currentRecords = [], incomingRecords = [], options = {}) {
  const identityFields = options.identityFields || DEFAULT_IDENTITY_FIELDS;
  const fieldFilter = typeof options.fieldFilter === 'function' ? options.fieldFilter : () => true;
  const result = Array.isArray(currentRecords) ? currentRecords.map(cloneRecord) : [];
  const creates = [];
  const updates = [];
  const conflicts = [];
  const unchanged = [];

  const findMatch = incoming => {
    const incomingIds = new Set(identityValues(incoming, identityFields));
    if (!incomingIds.size) return -1;
    return result.findIndex(record => identityValues(record, identityFields).some(id => incomingIds.has(id)));
  };

  (Array.isArray(incomingRecords) ? incomingRecords : [])
    .filter(isMeaningfulRecord)
    .forEach(incoming => {
      const matchIndex = findMatch(incoming);
      const incomingClone = cloneRecord(incoming);
      const identity = recordIdentity(incomingClone, identityFields);

      if (matchIndex < 0) {
        result.push(incomingClone);
        creates.push({ identity, record: incomingClone });
        return;
      }

      const existing = result[matchIndex];
      const changedFields = [];
      const conflictFields = [];

      Object.entries(incomingClone).forEach(([field, value]) => {
        if (!fieldFilter(field, value, incomingClone)) return;
        if (isEmptyValue(value)) return;

        const existingValue = existing[field];
        if (isEmptyValue(existingValue)) {
          existing[field] = cloneRecord({ value }).value;
          changedFields.push(field);
          return;
        }
        if (!sameValue(existingValue, value, field)) {
          conflictFields.push({
            field,
            currentValue: existingValue,
            incomingValue: value
          });
        }
      });

      if (changedFields.length) {
        updates.push({ identity, index: matchIndex, fields: changedFields });
      }
      if (conflictFields.length) {
        conflicts.push({ identity, index: matchIndex, fields: conflictFields });
      }
      if (!changedFields.length && !conflictFields.length) {
        unchanged.push({ identity, index: matchIndex });
      }
    });

  return {
    creates,
    updates,
    conflicts,
    unchanged,
    result,
    counts: {
      creates: creates.length,
      updates: updates.length,
      conflicts: conflicts.reduce((sum, item) => sum + item.fields.length, 0),
      conflictRecords: conflicts.length,
      unchanged: unchanged.length
    }
  };
}

export function previewScheduleReconcile(current = {}, incoming = {}) {
  const collections = ['equipment', 'panels', 'loads', 'cables'];
  const preview = {};
  collections.forEach(collection => {
    preview[collection] = previewReconcileRecords(
      current[collection] || [],
      incoming[collection] || [],
      {
        identityFields: COLLECTION_IDENTITY_FIELDS[collection] || DEFAULT_IDENTITY_FIELDS,
        fieldFilter: field => !CANVAS_ONLY_FIELDS.has(field)
      }
    );
  });
  preview.totals = collections.reduce((totals, collection) => {
    const counts = preview[collection].counts;
    totals.creates += counts.creates;
    totals.updates += counts.updates;
    totals.conflicts += counts.conflicts;
    totals.conflictRecords += counts.conflictRecords;
    totals.unchanged += counts.unchanged;
    return totals;
  }, { creates: 0, updates: 0, conflicts: 0, conflictRecords: 0, unchanged: 0 });
  return preview;
}

export function applyScheduleReconcilePreview(preview = {}) {
  return {
    equipment: preview.equipment?.result || [],
    panels: preview.panels?.result || [],
    loads: preview.loads?.result || [],
    cables: preview.cables?.result || []
  };
}

/**
 * Merge records edited through a project view back into the canonical
 * schedule. The incoming page is authoritative for populated shared fields,
 * while stable record identifiers and canvas-only fields are never replaced.
 */
export function synchronizeCanonicalRecords(currentRecords = [], incomingRecords = [], options = {}) {
  const identityFields = options.identityFields || DEFAULT_IDENTITY_FIELDS;
  const linkField = options.linkField || '';
  const fieldFilter = typeof options.fieldFilter === 'function' ? options.fieldFilter : () => true;
  const result = Array.isArray(currentRecords) ? currentRecords.map(cloneRecord) : [];
  const creates = [];
  const updates = [];
  const unchanged = [];

  const findMatch = incoming => {
    const linkedIdentity = normalizedIdentity(incoming?.[linkField]);
    if (linkedIdentity) {
      const linkedIndex = result.findIndex(record => identityValues(record, identityFields).includes(linkedIdentity));
      if (linkedIndex >= 0) return linkedIndex;
    }
    const incomingIds = new Set(identityValues(incoming, identityFields));
    if (!incomingIds.size) return -1;
    return result.findIndex(record => identityValues(record, identityFields).some(id => incomingIds.has(id)));
  };

  (Array.isArray(incomingRecords) ? incomingRecords : [])
    .filter(isMeaningfulRecord)
    .forEach(incoming => {
      const matchIndex = findMatch(incoming);
      const incomingClone = cloneRecord(incoming);
      if (linkField) delete incomingClone[linkField];
      Object.keys(incomingClone).forEach(field => {
        if (CANVAS_ONLY_FIELDS.has(field) || !fieldFilter(field, incomingClone[field], incomingClone)) {
          delete incomingClone[field];
        }
      });

      if (matchIndex < 0) {
        if (!isMeaningfulRecord(incomingClone)) return;
        result.push(incomingClone);
        creates.push({ identity: recordIdentity(incomingClone, identityFields), record: incomingClone });
        return;
      }

      const existing = result[matchIndex];
      const changedFields = [];
      Object.entries(incomingClone).forEach(([field, value]) => {
        if (isEmptyValue(value)) return;
        if (STABLE_IDENTITY_FIELDS.has(field) && !isEmptyValue(existing[field])) return;
        if (sameValue(existing[field], value, field)) return;
        existing[field] = cloneRecord({ value }).value;
        changedFields.push(field);
      });
      if (changedFields.length) {
        updates.push({
          identity: recordIdentity(existing, identityFields),
          index: matchIndex,
          fields: changedFields
        });
      } else {
        unchanged.push({ identity: recordIdentity(existing, identityFields), index: matchIndex });
      }
    });

  return {
    creates,
    updates,
    unchanged,
    result,
    counts: {
      creates: creates.length,
      updates: updates.length,
      unchanged: unchanged.length
    }
  };
}

/**
 * Synchronize the entity projections produced by One-Line with the canonical
 * project schedules. Existing rows that are not represented on the diagram
 * are preserved.
 */
export function synchronizeCanonicalSchedules(current = {}, incoming = {}) {
  const collectionOptions = {
    equipment: { linkField: 'entityId' },
    panels: { linkField: 'entityId' },
    loads: { linkField: 'entityId' },
    cables: { linkField: 'circuitId' }
  };
  const collections = {};
  const details = {};
  ['equipment', 'panels', 'loads', 'cables'].forEach(collection => {
    const detail = synchronizeCanonicalRecords(
      current[collection] || [],
      incoming[collection] || [],
      {
        identityFields: COLLECTION_IDENTITY_FIELDS[collection] || DEFAULT_IDENTITY_FIELDS,
        ...collectionOptions[collection]
      }
    );
    details[collection] = detail;
    collections[collection] = detail.result;
  });
  const totals = Object.values(details).reduce((summary, detail) => {
    summary.creates += detail.counts.creates;
    summary.updates += detail.counts.updates;
    summary.unchanged += detail.counts.unchanged;
    return summary;
  }, { creates: 0, updates: 0, unchanged: 0 });
  return { collections, details, totals };
}
