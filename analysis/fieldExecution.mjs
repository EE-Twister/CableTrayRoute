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
  // Accept 'Installed', 'Not Started', 'not started' as well as the canonical slugs.
  const statusSlug = text(input.status).toLowerCase().replace(/[\s_]+/g, '-');
  const status = STATUS_SET.has(statusSlug) ? statusSlug : 'not-started';
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
  // One record per item: a repeated key (imports, merges) must not be counted twice.
  // The list is newest-first (upsert prepends), so the first occurrence wins.
  const seen = new Set();
  const normalized = (Array.isArray(records) ? records : [])
    .map(item => normalizeFieldExecutionRecord(item))
    .filter(item => item.sourceId)
    .filter(item => (seen.has(item.key) ? false : (seen.add(item.key), true)));
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

