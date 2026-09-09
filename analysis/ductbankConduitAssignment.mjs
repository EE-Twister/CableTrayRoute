function text(value) {
  return String(value ?? '').trim();
}

function key(value) {
  return text(value).toLowerCase();
}

function firstText(record, fields) {
  for (const field of fields) {
    const value = text(record?.[field]);
    if (value) return value;
  }
  return '';
}

export function ductbankRecordId(record = {}) {
  return firstText(record, ['ductbankTag', 'ductbank_tag', 'ductbank_id', 'ductbankId', 'parent_id', 'tag', 'id']);
}

export function conduitRecordId(record = {}) {
  return firstText(record, ['conduit_id', 'conduitId', 'id', 'tag', 'tray_id', 'trayId']);
}

export function canonicalConduitIdentity(ductbankId, conduitId) {
  const parent = text(ductbankId);
  const child = text(conduitId);
  if (!child) return '';
  return parent ? `${parent}:${child}` : child;
}

function scopedKey(ductbankId, conduitId) {
  const parent = key(ductbankId);
  const child = key(conduitId);
  return parent && child ? `${parent}:${child}` : '';
}

function mergeRecord(existing, next) {
  if (!existing) return next;
  const merged = { ...existing };
  Object.entries(next || {}).forEach(([field, value]) => {
    if ((merged[field] === undefined || merged[field] === null || merged[field] === '') && value !== undefined) {
      merged[field] = value;
    }
  });
  return merged;
}

function addAlias(map, alias, scopedIdentity) {
  const normalized = key(alias);
  if (!normalized || !scopedIdentity) return;
  if (!map.has(normalized)) map.set(normalized, new Set());
  map.get(normalized).add(scopedIdentity);
}

/**
 * Build a scope-aware conduit index. Conduit IDs are not assumed to be unique
 * between ductbanks; every contained conduit is keyed by parent and child ID.
 */
export function buildDuctbankConduitIndex({ conduits = [], ductbanks = [] } = {}) {
  const entries = new Map();
  const aliases = new Map();
  const byDuctbank = new Map();

  function add(record, parentFallback = '') {
    const conduitId = conduitRecordId(record);
    const ductbankId = firstText(record, ['ductbankTag', 'ductbank_tag', 'ductbank_id', 'ductbankId', 'parent_id']) || text(parentFallback);
    if (!conduitId) return;
    const identity = scopedKey(ductbankId, conduitId) || `:${key(conduitId)}`;
    const normalizedRecord = {
      ...record,
      conduit_id: conduitId,
      ...(ductbankId ? { ductbankTag: ductbankId } : {}),
    };
    const existing = entries.get(identity);
    entries.set(identity, {
      identity: canonicalConduitIdentity(ductbankId, conduitId),
      key: identity,
      ductbankId,
      conduitId,
      record: mergeRecord(existing?.record, normalizedRecord),
    });
    if (ductbankId) {
      const parentKey = key(ductbankId);
      if (!byDuctbank.has(parentKey)) byDuctbank.set(parentKey, new Set());
      byDuctbank.get(parentKey).add(identity);
    }
    [
      conduitId,
      record?.id,
      record?.tag,
      record?.tray_id,
      record?.trayId,
      canonicalConduitIdentity(ductbankId, conduitId),
      ductbankId && `${ductbankId}-${conduitId}`,
    ].filter(Boolean).forEach(alias => addAlias(aliases, alias, identity));
  }

  (Array.isArray(conduits) ? conduits : []).forEach(conduit => add(conduit));
  (Array.isArray(ductbanks) ? ductbanks : []).forEach(ductbank => {
    const parent = ductbankRecordId(ductbank);
    (Array.isArray(ductbank?.conduits) ? ductbank.conduits : []).forEach(conduit => add(conduit, parent));
  });

  return { entries, aliases, byDuctbank };
}

function entriesForAlias(index, alias) {
  const identities = index?.aliases?.get(key(alias));
  return identities ? [...identities].map(identity => index.entries.get(identity)).filter(Boolean) : [];
}

function entriesForDuctbank(index, ductbankId) {
  const identities = index?.byDuctbank?.get(key(ductbankId));
  return identities ? [...identities].map(identity => index.entries.get(identity)).filter(Boolean) : [];
}

function exactScopedEntry(index, ductbankId, conduitId) {
  return index?.entries?.get(scopedKey(ductbankId, conduitId)) || null;
}

function scopedAliasEntry(index, ductbankId, conduitReference) {
  const parentKey = key(ductbankId);
  return uniqueEntry(entriesForAlias(index, conduitReference).filter(entry => key(entry.ductbankId) === parentKey));
}

function uniqueEntry(entries) {
  const unique = [...new Map((entries || []).map(entry => [entry.key, entry])).values()];
  return unique.length === 1 ? unique[0] : null;
}

function cableAssignment(cable = {}) {
  return {
    ductbankId: firstText(cable, ['ductbankTag', 'ductbank_tag', 'ductbank_id', 'ductbankId']),
    conduitId: firstText(cable, ['conduit_id', 'conduitId']),
  };
}

function result(status, source, entry = null, candidates = []) {
  return {
    status,
    source,
    identity: entry?.identity || '',
    ductbankId: entry?.ductbankId || '',
    conduitId: entry?.conduitId || '',
    record: entry?.record || null,
    candidates: candidates.map(candidate => candidate.identity),
  };
}

/** Resolve one route segment to a specific conduit without guessing across candidates. */
export function resolveDuctbankConduitAssignment(segment = {}, cable = {}, index) {
  const segmentDuctbank = firstText(segment, ['ductbankTag', 'ductbank_tag', 'ductbank_id', 'ductbankId']);
  const segmentConduit = firstText(segment, ['conduit_id', 'conduitId']);
  const segmentReference = firstText(segment, ['raceway_id', 'racewayId', 'tray_id', 'trayId', 'id']);
  const assigned = cableAssignment(cable);

  if (segmentDuctbank && segmentConduit) {
    const exact = exactScopedEntry(index, segmentDuctbank, segmentConduit)
      || scopedAliasEntry(index, segmentDuctbank, segmentConduit);
    return exact
      ? result('resolved', 'segment-explicit', exact)
      : result('not-found', 'segment-explicit');
  }

  if (segmentConduit) {
    const candidates = entriesForAlias(index, segmentConduit);
    const selected = uniqueEntry(candidates);
    return selected
      ? result('resolved', 'segment-conduit-unique', selected)
      : result(candidates.length ? 'ambiguous' : 'not-found', 'segment-conduit', null, candidates);
  }

  if (segmentDuctbank && assigned.conduitId) {
    const exact = exactScopedEntry(index, segmentDuctbank, assigned.conduitId)
      || scopedAliasEntry(index, segmentDuctbank, assigned.conduitId);
    if (exact) return result('resolved', 'cable-explicit', exact);
    return result('not-found', 'cable-explicit');
  }

  const referenceCandidates = entriesForAlias(index, segmentReference);
  const referenced = uniqueEntry(referenceCandidates);
  if (referenced) return result('resolved', 'segment-raceway-alias', referenced);
  if (referenceCandidates.length > 1) return result('ambiguous', 'segment-raceway-alias', null, referenceCandidates);

  if (segmentDuctbank) {
    const candidates = entriesForDuctbank(index, segmentDuctbank);
    const selected = uniqueEntry(candidates);
    return selected
      ? result('resolved', 'single-conduit-ductbank', selected)
      : result(candidates.length ? 'missing' : 'not-found', 'ductbank-parent', null, candidates);
  }

  if (assigned.conduitId) {
    if (assigned.ductbankId) {
      const exact = exactScopedEntry(index, assigned.ductbankId, assigned.conduitId);
      if (exact) return result('resolved', 'cable-explicit', exact);
    }
    const candidates = entriesForAlias(index, assigned.conduitId);
    const selected = uniqueEntry(candidates);
    if (selected) return result('resolved', 'cable-conduit-unique', selected);
  }

  return result('not-applicable', 'none');
}

export function applyResolvedConduitAssignment(segment = {}, resolution = {}) {
  if (resolution.status !== 'resolved') return { ...segment };
  return {
    ...segment,
    conduit_id: resolution.conduitId,
    ...(resolution.ductbankId ? { ductbankTag: resolution.ductbankId } : {}),
    conduit_identity: resolution.identity,
    conduit_assignment_source: resolution.source,
  };
}

/**
 * Normalize route and breakdown representations for Pull Cards and exports.
 * Unresolved segments remain visible and carry an explicit assignment warning.
 */
export function resolveRouteResultConduits(routeResults = [], cables = [], { conduits = [], ductbanks = [] } = {}) {
  const index = buildDuctbankConduitIndex({ conduits, ductbanks });
  if (index.entries.size === 0) {
    return (Array.isArray(routeResults) ? routeResults : []).map(routeResult => ({ ...routeResult }));
  }
  const cableByTag = new Map((Array.isArray(cables) ? cables : []).map(cable => [
    key(firstText(cable, ['tag', 'name', 'id', 'cable_id', 'cableId', 'cable_tag', 'ref'])),
    cable,
  ]).filter(([tag]) => tag));

  return (Array.isArray(routeResults) ? routeResults : []).map(routeResult => {
    const cable = cableByTag.get(key(firstText(routeResult, ['cable', 'tag', 'name', 'id', 'cable_tag', 'cableId']))) || {};
    const resolutions = [];
    const normalizeSegments = segments => (Array.isArray(segments) ? segments : []).map((segment, segmentIndex) => {
      const resolution = resolveDuctbankConduitAssignment(segment, cable, index);
      if (resolution.status !== 'not-applicable') resolutions.push({ segment: segmentIndex + 1, ...resolution });
      const normalized = applyResolvedConduitAssignment(segment, resolution);
      if (['missing', 'ambiguous', 'not-found'].includes(resolution.status)) {
        normalized.conduit_assignment_status = resolution.status;
      }
      return normalized;
    });
    const routeSegments = normalizeSegments(routeResult?.route_segments);
    const breakdown = normalizeSegments(routeResult?.breakdown);
    const unresolved = resolutions.filter(item => item.status !== 'resolved');
    return {
      ...routeResult,
      route_segments: routeSegments,
      breakdown,
      conduit_assignments: resolutions,
      conduit_assignment_warnings: unresolved.map(item => ({
        segment: item.segment,
        status: item.status,
        source: item.source,
        candidates: item.candidates,
      })),
    };
  });
}
