function coerceNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function readField(comp, key) {
  if (!comp || typeof comp !== 'object') return undefined;
  if (Object.prototype.hasOwnProperty.call(comp, key)) return comp[key];
  if (comp.props && typeof comp.props === 'object' && Object.prototype.hasOwnProperty.call(comp.props, key)) {
    return comp.props[key];
  }
  return undefined;
}

export function isCtComponent(comp) {
  if (!comp || typeof comp !== 'object') return false;
  const subtype = `${comp.subtype || ''}`.trim().toLowerCase();
  const type = `${comp.type || ''}`.trim().toLowerCase();
  return subtype === 'ct' || type === 'ct';
}

export function parseCtRatio(ctLike) {
  const primary = coerceNumber(readField(ctLike, 'ratio_primary'));
  const secondary = coerceNumber(readField(ctLike, 'ratio_secondary'));
  if (!Number.isFinite(primary) || !Number.isFinite(secondary) || secondary <= 0) {
    return null;
  }
  return {
    primary,
    secondary,
    ratio: primary / secondary
  };
}

export function normalizeCtMetadata(ctLike) {
  if (!isCtComponent(ctLike)) return null;
  const ratio = parseCtRatio(ctLike);
  const locationContextRaw = `${readField(ctLike, 'location_context') || ''}`.trim().toLowerCase();
  const location_context = locationContextRaw === 'metering' ? 'metering' : 'protection';
  const metadata = {
    id: `${ctLike.id || ''}`.trim() || null,
    tag: `${readField(ctLike, 'tag') || ''}`.trim(),
    ratio_primary: coerceNumber(readField(ctLike, 'ratio_primary')),
    ratio_secondary: coerceNumber(readField(ctLike, 'ratio_secondary')),
    accuracy_class: `${readField(ctLike, 'accuracy_class') || ''}`.trim(),
    burden_va: coerceNumber(readField(ctLike, 'burden_va')),
    knee_point_v: coerceNumber(readField(ctLike, 'knee_point_v')),
    polarity: `${readField(ctLike, 'polarity') || ''}`.trim(),
    location_context,
    protected_device_id: `${readField(ctLike, 'protected_device_id') || ''}`.trim(),
    meter_id: `${readField(ctLike, 'meter_id') || ''}`.trim(),
    relay_id: `${readField(ctLike, 'relay_id') || ''}`.trim(),
    ratio
  };
  return metadata;
}

function findCtByExplicitLink(component, allComponents, compMap) {
  const lookup = compMap || new Map((allComponents || []).map(c => [c.id, c]));
  const explicitId = `${readField(component, 'ct_id') || readField(component, 'current_transformer_id') || ''}`.trim();
  if (!explicitId) return null;
  const linked = lookup.get(explicitId);
  return isCtComponent(linked) ? linked : null;
}

function findCtByReverseLink(component, allComponents) {
  const targetId = `${component?.id || ''}`.trim();
  if (!targetId) return null;
  return (allComponents || []).find(candidate => {
    if (!isCtComponent(candidate)) return false;
    const candidateMeta = normalizeCtMetadata(candidate);
    if (!candidateMeta) return false;
    return candidateMeta.protected_device_id === targetId
      || candidateMeta.meter_id === targetId
      || candidateMeta.relay_id === targetId;
  }) || null;
}

function findCtByConnection(component, allComponents) {
  const targetId = `${component?.id || ''}`.trim();
  if (!targetId) return null;
  return (allComponents || []).find(candidate => {
    if (!isCtComponent(candidate) || !Array.isArray(candidate.connections)) return false;
    return candidate.connections.some(conn => `${conn?.target || ''}`.trim() === targetId);
  }) || null;
}

export function resolveCtForComponent(component, allComponents = [], compMap = null) {
  const map = compMap || new Map((allComponents || []).map(c => [c.id, c]));
  const byExplicit = findCtByExplicitLink(component, allComponents, map);
  if (byExplicit) return normalizeCtMetadata(byExplicit);

  const byReverse = findCtByReverseLink(component, allComponents);
  if (byReverse) return normalizeCtMetadata(byReverse);

  const byConnection = findCtByConnection(component, allComponents);
  if (byConnection) return normalizeCtMetadata(byConnection);

  return null;
}
