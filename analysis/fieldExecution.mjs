export const FIELD_EXECUTION_STATUSES = Object.freeze([
  'not-started',
  'staged',
  'installed',
  'terminated',
  'tested',
  'accepted',
  'blocked',
]);

const STATUS_SET = new Set(FIELD_EXECUTION_STATUSES);

function text(value) {
  return String(value ?? '').trim();
}

export function fieldExecutionKey(recordType, sourceId) {
  return `${text(recordType).toLowerCase()}:${text(sourceId).toLowerCase()}`;
}

export function normalizeFieldExecutionRecord(input = {}) {
  const recordType = text(input.recordType || input.type || 'cable').toLowerCase();
  const sourceId = text(input.sourceId || input.tag || input.id);
  const status = STATUS_SET.has(input.status) ? input.status : 'not-started';
  const updatedAt = text(input.updatedAt) || new Date().toISOString();
  const notes = text(input.notes);

  return {
    key: fieldExecutionKey(recordType, sourceId),
    recordType,
    sourceId,
    status,
    quantityComplete: Math.max(0, Number(input.quantityComplete) || 0),
    crew: text(input.crew),
    updatedAt,
    updatedBy: text(input.updatedBy),
    notes,
    punchOpen: Boolean(input.punchOpen),
    punchDescription: text(input.punchDescription),
    asBuiltDeviation: text(input.asBuiltDeviation),
    evidenceReferences: Array.isArray(input.evidenceReferences)
      ? input.evidenceReferences.map(text).filter(Boolean)
      : [],
  };
}

export function upsertFieldExecutionRecord(records = [], record = {}) {
  const normalized = normalizeFieldExecutionRecord(record);
  if (!normalized.sourceId) return Array.isArray(records) ? [...records] : [];
  const next = (Array.isArray(records) ? records : [])
    .map(item => normalizeFieldExecutionRecord(item))
    .filter(item => item.key !== normalized.key);
  next.unshift(normalized);
  return next;
}

export function findFieldExecutionRecord(records = [], recordType, sourceId) {
  const key = fieldExecutionKey(recordType, sourceId);
  const found = (Array.isArray(records) ? records : [])
    .find(item => fieldExecutionKey(item.recordType || item.type, item.sourceId || item.tag || item.id) === key);
  return found ? normalizeFieldExecutionRecord(found) : null;
}

export function summarizeFieldExecution(records = []) {
  const normalized = (Array.isArray(records) ? records : [])
    .map(item => normalizeFieldExecutionRecord(item))
    .filter(item => item.sourceId);
  const byStatus = Object.fromEntries(FIELD_EXECUTION_STATUSES.map(status => [status, 0]));
  for (const item of normalized) byStatus[item.status] += 1;
  return {
    total: normalized.length,
    complete: byStatus.accepted,
    blocked: byStatus.blocked,
    punchOpen: normalized.filter(item => item.punchOpen).length,
    byStatus,
  };
}

