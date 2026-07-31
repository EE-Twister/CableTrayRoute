export const FIELD_OBSERVATION_TYPES = Object.freeze([
  'installation',
  'punch',
  'as-built',
  'test',
  'safety',
  'damage',
]);

export const FIELD_OBSERVATION_STATUSES = Object.freeze(['open', 'resolved', 'deferred']);

const TYPE_SET = new Set(FIELD_OBSERVATION_TYPES);
const STATUS_SET = new Set(FIELD_OBSERVATION_STATUSES);

function text(value) {
  return String(value ?? '').trim();
}

function iso(value, fallback) {
  const candidate = text(value);
  return /^\d{4}-\d{2}-\d{2}T/.test(candidate) ? candidate : fallback;
}

function createId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeFieldAttachment(input = {}, index = 0) {
  const dataUrl = text(input.dataUrl);
  return {
    id: text(input.id) || `attachment-${index + 1}`,
    name: text(input.name) || 'field-photo',
    mediaType: text(input.mediaType || input.type) || 'application/octet-stream',
    sizeBytes: Math.max(0, Number(input.sizeBytes ?? input.size) || 0),
    dataUrl: dataUrl.startsWith('data:') ? dataUrl : '',
    capturedAt: iso(input.capturedAt, ''),
  };
}

export function normalizeFieldObservation(input = {}, options = {}) {
  const now = options.now || new Date().toISOString();
  const type = text(input.type).toLowerCase();
  const status = text(input.status).toLowerCase();
  const createdAt = iso(input.createdAt, now);
  return {
    id: text(input.id) || createId('field-observation'),
    type: TYPE_SET.has(type) ? type : 'installation',
    status: STATUS_SET.has(status) ? status : 'open',
    sourceType: text(input.sourceType || input.recordType).toLowerCase() || 'cable',
    sourceId: text(input.sourceId || input.tag || input.elementId),
    studyPackageId: text(input.studyPackageId),
    summary: text(input.summary),
    comment: text(input.comment || input.notes),
    observedBy: text(input.observedBy || input.updatedBy),
    asBuiltChange: text(input.asBuiltChange || input.asBuiltDeviation),
    attachments: (Array.isArray(input.attachments) ? input.attachments : [])
      .map(normalizeFieldAttachment)
      .filter(attachment => attachment.name || attachment.dataUrl),
    createdAt,
    updatedAt: iso(input.updatedAt, now),
    resolvedAt: iso(input.resolvedAt, ''),
    resolutionNote: text(input.resolutionNote),
  };
}

export function validateFieldObservation(input = {}, options = {}) {
  const observation = normalizeFieldObservation(input, options);
  const errors = [];
  if (!observation.sourceId) errors.push('Select a cable or tray target before saving an observation.');
  if (!observation.summary) errors.push('Provide a short observation summary.');
  if (observation.status === 'resolved' && !observation.resolutionNote) {
    errors.push('Provide a resolution note before closing an observation.');
  }
  return { observation, errors };
}

export function upsertFieldObservation(observations = [], input = {}, options = {}) {
  const { observation, errors } = validateFieldObservation(input, options);
  if (errors.length) return { observations: Array.isArray(observations) ? [...observations] : [], errors, observation: null };
  const existing = (Array.isArray(observations) ? observations : [])
    .map(item => normalizeFieldObservation(item, options))
    .find(item => item.id === observation.id);
  const next = {
    ...observation,
    createdAt: existing?.createdAt || observation.createdAt,
    updatedAt: options.now || new Date().toISOString(),
    resolvedAt: observation.status === 'resolved' ? (observation.resolvedAt || options.now || new Date().toISOString()) : '',
  };
  return {
    observations: [next, ...(Array.isArray(observations) ? observations : [])
      .map(item => normalizeFieldObservation(item, options))
      .filter(item => item.id !== next.id)],
    errors: [],
    observation: next,
  };
}

export function enqueueFieldObservation(queue = [], observationId) {
  const id = text(observationId);
  if (!id) return Array.isArray(queue) ? [...queue] : [];
  return [id, ...(Array.isArray(queue) ? queue.map(text).filter(item => item && item !== id) : [])];
}

export function acknowledgeFieldObservation(queue = [], observationId) {
  const id = text(observationId);
  return (Array.isArray(queue) ? queue : []).map(text).filter(item => item && item !== id);
}

export function summarizeFieldObservations(observations = [], queue = []) {
  const rows = (Array.isArray(observations) ? observations : [])
    .map(item => normalizeFieldObservation(item))
    .filter(item => item.sourceId);
  const queued = new Set((Array.isArray(queue) ? queue : []).map(text));
  return {
    total: rows.length,
    open: rows.filter(item => item.status === 'open').length,
    resolved: rows.filter(item => item.status === 'resolved').length,
    deferred: rows.filter(item => item.status === 'deferred').length,
    asBuiltConflicts: rows.filter(item => item.asBuiltChange && item.status !== 'resolved').length,
    withAttachments: rows.filter(item => item.attachments.length > 0).length,
    queued: rows.filter(item => queued.has(item.id)).length,
  };
}

export function buildFieldObservationReportRows(observations = [], queue = []) {
  const queued = new Set((Array.isArray(queue) ? queue : []).map(text));
  return (Array.isArray(observations) ? observations : [])
    .map(item => normalizeFieldObservation(item))
    .filter(item => item.sourceId)
    .map(item => ({
      id: item.id,
      type: item.type,
      status: item.status,
      target: `${item.sourceType}:${item.sourceId}`,
      studyPackageId: item.studyPackageId,
      summary: item.summary,
      comment: item.comment,
      observedBy: item.observedBy,
      asBuiltChange: item.asBuiltChange,
      attachmentCount: item.attachments.length,
      syncStatus: queued.has(item.id) ? 'Pending project sync' : 'Included in project',
      updatedAt: item.updatedAt,
    }));
}
