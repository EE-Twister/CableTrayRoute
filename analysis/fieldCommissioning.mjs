export const FIELD_COMMISSIONING_VERSION = 'field-commissioning-v1';
export const MAX_FIELD_ATTACHMENT_BYTES = 256 * 1024;

const STATUSES = ['open', 'pendingReview', 'verified', 'rejected', 'resolved'];
const TYPES = ['verification', 'punch', 'asBuilt', 'photo', 'qrScan', 'commissioningNote'];
const PRIORITIES = ['low', 'medium', 'high', 'critical'];

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function stringValue(value = '') {
  return String(value ?? '').trim();
}

function normalizeStatus(status = 'open') {
  const value = stringValue(status);
  return STATUSES.includes(value) ? value : 'open';
}

function normalizeType(type = 'verification') {
  const value = stringValue(type);
  return TYPES.includes(value) ? value : 'verification';
}

function normalizePriority(priority = 'medium') {
  const value = stringValue(priority);
  return PRIORITIES.includes(value) ? value : 'medium';
}

function slug(value = '') {
  return stringValue(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';
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

function nowIso(value = '') {
  return value || new Date().toISOString();
}

function targetFrom(value = {}) {
  const target = asObject(value);
  const elementType = stringValue(target.elementType || target.type || target.kind || 'fieldTarget');
  const elementId = stringValue(target.elementId || target.id || target.ref || target.tag || target.tray_id || target.conduit_id || target.cable_id);
  return {
    elementType,
    elementId,
    elementTag: stringValue(target.elementTag || target.tag || target.label || target.name || elementId),
    sourcePage: stringValue(target.sourcePage || target.href || 'fieldview.html'),
  };
}

function normalizeChecklistItem(item = {}, index = 0) {
  if (typeof item === 'string') {
    return { id: `check-${index + 1}`, label: item, checked: false, note: '' };
  }
  const row = asObject(item);
  return {
    id: stringValue(row.id || `check-${index + 1}`),
    label: stringValue(row.label || row.name || `Check ${index + 1}`),
    checked: Boolean(row.checked || row.complete),
    note: stringValue(row.note || row.comment),
  };
}

function normalizeAttachment(attachment = {}, index = 0) {
  const row = asObject(attachment);
  const sizeBytes = Number(row.sizeBytes ?? row.size ?? 0) || 0;
  if (sizeBytes > MAX_FIELD_ATTACHMENT_BYTES) {
    throw new Error(`Field attachment ${row.name || index + 1} exceeds the ${MAX_FIELD_ATTACHMENT_BYTES} byte local storage guard.`);
  }
  return {
    id: stringValue(row.id || `attachment-${index + 1}-${hash(`${row.name || ''}:${sizeBytes}`)}`),
    name: stringValue(row.name || `Attachment ${index + 1}`),
    type: stringValue(row.type || row.mediaType || 'application/octet-stream'),
    sizeBytes,
    capturedAt: nowIso(row.capturedAt || row.createdAt || ''),
    thumbnailDataUrl: stringValue(row.thumbnailDataUrl || row.dataUrl || ''),
    note: stringValue(row.note || row.description),
  };
}

export function normalizeFieldObservation(row = {}) {
  const source = asObject(row);
  const target = targetFrom(source.target || source);
  const createdAt = nowIso(source.createdAt || '');
  const status = normalizeStatus(source.status);
  const observationType = normalizeType(source.observationType || source.type);
  const priority = normalizePriority(source.priority);
  const coreForId = `${target.elementType}:${target.elementId}:${observationType}:${createdAt}:${source.comments || ''}`;
  return {
    id: stringValue(source.id || `field-${slug(target.elementType)}-${slug(target.elementId)}-${hash(coreForId)}`),
    version: FIELD_COMMISSIONING_VERSION,
    elementType: target.elementType,
    elementId: target.elementId,
    elementTag: target.elementTag,
    sourcePage: target.sourcePage,
    studyPackageId: stringValue(source.studyPackageId || source.study_package_id),
    observationType,
    status,
    priority,
    checklist: asArray(source.checklist).map(normalizeChecklistItem),
    comments: stringValue(source.comments || source.comment || source.notes),
    attachments: asArray(source.attachments).map(normalizeAttachment),
    createdAt,
    createdBy: stringValue(source.createdBy || source.author || source.created_by),
    updatedAt: nowIso(source.updatedAt || source.updated_at || createdAt),
    ...(source.resolvedAt || ['verified', 'resolved'].includes(status)
      ? { resolvedAt: stringValue(source.resolvedAt || source.resolved_at || source.updatedAt || createdAt) }
      : {}),
  };
}

export function createFieldObservation({
  target = {},
  observationType = 'verification',
  status = 'open',
  priority = 'medium',
  checklist = [],
  comments = '',
  attachments = [],
  author = '',
  studyPackageId = '',
  createdAt = '',
} = {}) {
  return normalizeFieldObservation({
    ...targetFrom(target),
    studyPackageId,
    observationType,
    status,
    priority,
    checklist,
    comments,
    attachments,
    createdBy: author,
    createdAt: nowIso(createdAt),
  });
}

export function updateFieldObservationStatus(observation = {}, update = {}) {
  const previous = normalizeFieldObservation(observation);
  const nextStatus = normalizeStatus(update.status || previous.status);
  return normalizeFieldObservation({
    ...previous,
    ...asObject(update.patch),
    status: nextStatus,
    priority: update.priority || previous.priority,
    comments: update.comments ?? previous.comments,
    updatedAt: update.updatedAt || new Date().toISOString(),
    resolvedAt: ['verified', 'resolved'].includes(nextStatus)
      ? (update.resolvedAt || update.updatedAt || new Date().toISOString())
      : update.resolvedAt || previous.resolvedAt || '',
  });
}

function matchesFilters(row, filters = {}) {
  if (filters.status && row.status !== filters.status) return false;
  if (filters.elementType && row.elementType !== filters.elementType) return false;
  if (filters.elementId && row.elementId !== String(filters.elementId)) return false;
  if (filters.priority && row.priority !== filters.priority) return false;
  if (filters.openOnly && !['open', 'pendingReview', 'rejected'].includes(row.status)) return false;
  return true;
}

export function summarizeFieldObservations(observations = [], filters = {}) {
  const rows = asArray(observations).map(normalizeFieldObservation).filter(row => matchesFilters(row, filters));
  const byStatus = {};
  const byType = {};
  const byPriority = {};
  rows.forEach(row => {
    byStatus[row.status] = (byStatus[row.status] || 0) + 1;
    byType[row.observationType] = (byType[row.observationType] || 0) + 1;
    byPriority[row.priority] = (byPriority[row.priority] || 0) + 1;
  });
  const attachmentRows = rows.flatMap(row => row.attachments.map(attachment => ({ observationId: row.id, ...attachment })));
  return {
    total: rows.length,
    open: rows.filter(row => row.status === 'open').length,
    pendingReview: rows.filter(row => row.status === 'pendingReview').length,
    verified: rows.filter(row => row.status === 'verified').length,
    rejected: rows.filter(row => row.status === 'rejected').length,
    resolved: rows.filter(row => row.status === 'resolved').length,
    highPriority: rows.filter(row => row.priority === 'high' || row.priority === 'critical').length,
    openItems: rows.filter(row => ['open', 'pendingReview', 'rejected'].includes(row.status)).length,
    attachmentCount: attachmentRows.length,
    attachmentBytes: attachmentRows.reduce((sum, row) => sum + (Number(row.sizeBytes) || 0), 0),
    byStatus,
    byType,
    byPriority,
  };
}

export function buildFieldCommissioningPackage(context = {}) {
  const observations = asArray(context.observations || context.fieldObservations).map(normalizeFieldObservation);
  const openItems = observations.filter(row => ['open', 'pendingReview', 'rejected'].includes(row.status));
  const verifiedItems = observations.filter(row => row.status === 'verified' || row.status === 'resolved');
  const attachmentRows = observations.flatMap(row => row.attachments.map(attachment => ({
    observationId: row.id,
    elementTag: row.elementTag,
    ...attachment,
  })));
  const warnings = [
    ...openItems
      .filter(row => row.priority === 'critical' || row.priority === 'high')
      .map(row => `${row.priority} field item remains ${row.status}: ${row.elementTag || row.elementId}`),
    ...observations
      .filter(row => row.status === 'rejected')
      .map(row => `Rejected field verification requires review: ${row.elementTag || row.elementId}`),
  ];
  return {
    version: FIELD_COMMISSIONING_VERSION,
    generatedAt: context.generatedAt || new Date().toISOString(),
    projectName: context.projectName || 'Untitled Project',
    summary: summarizeFieldObservations(observations),
    observations,
    openItems,
    verifiedItems,
    attachmentSummary: {
      count: attachmentRows.length,
      totalBytes: attachmentRows.reduce((sum, row) => sum + (Number(row.sizeBytes) || 0), 0),
      rows: attachmentRows,
    },
    warnings,
    assumptions: [
      'Field observations are browser-local engineering records for verification and commissioning coordination.',
      'Attachment data is constrained for local storage; large photo archives should remain in the project document system.',
      'Field verification status does not replace formal commissioning signoff or document-control approval.',
    ],
  };
}

function escapeHtml(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderFieldCommissioningHTML(pkg = {}) {
  const rows = asArray(pkg.observations);
  const openItems = asArray(pkg.openItems);
  return `<section class="report-section" id="rpt-field-verification">
  <h2>Field Verification</h2>
  <p class="report-note">Local field observations, punch items, as-built notes, and attachment metadata for engineering review. Formal commissioning signoff remains outside this package.</p>
  <dl class="report-dl">
    <dt>Total Observations</dt><dd>${escapeHtml(pkg.summary?.total || 0)}</dd>
    <dt>Open</dt><dd>${escapeHtml(pkg.summary?.open || 0)}</dd>
    <dt>Pending Review</dt><dd>${escapeHtml(pkg.summary?.pendingReview || 0)}</dd>
    <dt>Verified</dt><dd>${escapeHtml(pkg.summary?.verified || 0)}</dd>
    <dt>Rejected</dt><dd>${escapeHtml(pkg.summary?.rejected || 0)}</dd>
    <dt>Attachments</dt><dd>${escapeHtml(pkg.attachmentSummary?.count || 0)}</dd>
  </dl>
  <div class="report-scroll">
    <table class="report-table">
      <thead><tr><th>Target</th><th>Type</th><th>Status</th><th>Priority</th><th>Observation</th><th>Attachments</th><th>Updated</th></tr></thead>
      <tbody>${rows.length ? rows.map(row => `<tr>
        <td>${escapeHtml(row.elementTag || row.elementId)}</td>
        <td>${escapeHtml(row.observationType)}</td>
        <td>${escapeHtml(row.status)}</td>
        <td>${escapeHtml(row.priority)}</td>
        <td>${escapeHtml(row.comments || row.checklist.map(item => `${item.label}: ${item.checked ? 'yes' : 'no'}`).join(' | '))}</td>
        <td>${escapeHtml(row.attachments.map(item => item.name).join(', ') || 'none')}</td>
        <td>${escapeHtml(row.updatedAt)}</td>
      </tr>`).join('') : '<tr><td colspan="7">No field observations captured.</td></tr>'}</tbody>
    </table>
  </div>
  ${openItems.length ? `<h3>Open Field Items</h3>
  <ul>${openItems.slice(0, 20).map(row => `<li>${escapeHtml(row.priority)} ${escapeHtml(row.status)} - ${escapeHtml(row.elementTag || row.elementId)}: ${escapeHtml(row.comments)}</li>`).join('')}</ul>` : '<p class="report-empty">No open field items.</p>'}
</section>`;
}
