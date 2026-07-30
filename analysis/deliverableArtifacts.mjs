const ALLOWED_STATUSES = new Set(['draft', 'issued', 'superseded', 'void']);

function text(value, fallback = '') {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function uniqueStrings(values = []) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(value => text(value))
    .filter(Boolean))];
}

export function normalizeDeliverableArtifact(input = {}) {
  const now = new Date().toISOString();
  const type = text(input.type, 'document');
  const revision = text(input.revision, '0');
  const generatedAt = text(input.generatedAt, now);
  const status = ALLOWED_STATUSES.has(input.status) ? input.status : 'draft';
  const id = text(
    input.id,
    `${type}-${Date.parse(generatedAt) || Date.now()}`
  );

  return {
    id,
    type,
    title: text(input.title, 'Untitled Deliverable'),
    revision,
    status,
    transmittalNumber: text(input.transmittalNumber),
    generatedAt,
    generatedBy: text(input.generatedBy),
    sourceFingerprint: text(input.sourceFingerprint),
    sourcePage: text(input.sourcePage),
    includedSections: uniqueStrings(input.includedSections),
    sourceArtifacts: uniqueStrings(input.sourceArtifacts),
    notes: text(input.notes),
    summary: input.summary && typeof input.summary === 'object' && !Array.isArray(input.summary)
      ? { ...input.summary }
      : {},
  };
}

export function upsertArtifactList(artifacts = [], artifact = {}) {
  const normalized = normalizeDeliverableArtifact(artifact);
  const next = (Array.isArray(artifacts) ? artifacts : [])
    .map(item => normalizeDeliverableArtifact(item))
    .filter(item => item.id !== normalized.id);
  next.unshift(normalized);
  return next.sort((a, b) => String(b.generatedAt).localeCompare(String(a.generatedAt)));
}

export function buildArtifactRegisterRows(artifacts = []) {
  return (Array.isArray(artifacts) ? artifacts : [])
    .map(item => normalizeDeliverableArtifact(item))
    .sort((a, b) => String(b.generatedAt).localeCompare(String(a.generatedAt)))
    .map(item => ({
      id: item.id,
      type: item.type,
      title: item.title,
      revision: item.revision,
      status: item.status,
      transmittal: item.transmittalNumber,
      generatedAt: item.generatedAt,
      generatedBy: item.generatedBy,
      sourceFingerprint: item.sourceFingerprint,
    }));
}

export function artifactSourceStatus(artifact = {}, currentFingerprint = '') {
  const normalized = normalizeDeliverableArtifact(artifact);
  if (!normalized.sourceFingerprint || !currentFingerprint) return 'unknown';
  return normalized.sourceFingerprint === currentFingerprint ? 'current' : 'stale';
}

