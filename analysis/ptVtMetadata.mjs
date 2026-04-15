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

function parseIdList(value) {
  if (Array.isArray(value)) return value.map(v => `${v || ''}`.trim()).filter(Boolean);
  if (typeof value !== 'string') return [];
  return value.split(',').map(v => v.trim()).filter(Boolean);
}

function toVolts(value, keyHint = '') {
  const num = coerceNumber(value);
  if (!Number.isFinite(num)) return null;
  const key = `${keyHint || ''}`.toLowerCase();
  if (key.includes('_kv') || key === 'kv' || key.includes('basekv')) return num * 1000;
  if (key.includes('nominal_voltage_vdc')) return num;
  return num <= 100 ? num * 1000 : num;
}

function resolveComponentVoltageVolts(comp) {
  if (!comp || typeof comp !== 'object') return null;
  const candidates = [
    ['voltage_v', readField(comp, 'voltage_v')],
    ['rated_voltage_kv', readField(comp, 'rated_voltage_kv')],
    ['baseKV', readField(comp, 'baseKV')],
    ['kV', readField(comp, 'kV')],
    ['prefault_voltage', readField(comp, 'prefault_voltage')],
    ['voltage', readField(comp, 'voltage')],
    ['volts', readField(comp, 'volts')],
    ['nominal_voltage_vdc', readField(comp, 'nominal_voltage_vdc')]
  ];
  for (const [key, raw] of candidates) {
    const volts = toVolts(raw, key);
    if (Number.isFinite(volts) && volts > 0) return volts;
  }
  return null;
}

export function isPtVtComponent(comp) {
  if (!comp || typeof comp !== 'object') return false;
  const subtype = `${comp.subtype || ''}`.trim().toLowerCase();
  const type = `${comp.type || ''}`.trim().toLowerCase();
  return subtype === 'pt_vt' || subtype === 'vt' || type === 'vt' || type === 'pt_vt';
}

export function parsePtVtRatio(ptVtLike) {
  const primary = coerceNumber(readField(ptVtLike, 'primary_voltage'));
  const secondary = coerceNumber(readField(ptVtLike, 'secondary_voltage'));
  if (!Number.isFinite(primary) || !Number.isFinite(secondary) || secondary <= 0) return null;
  return {
    primary,
    secondary,
    ratio: primary / secondary
  };
}

export function normalizePtVtMetadata(ptVtLike) {
  if (!isPtVtComponent(ptVtLike)) return null;
  const ratio = parsePtVtRatio(ptVtLike);
  return {
    id: `${ptVtLike.id || ''}`.trim() || null,
    tag: `${readField(ptVtLike, 'tag') || ''}`.trim(),
    primary_voltage: coerceNumber(readField(ptVtLike, 'primary_voltage')),
    secondary_voltage: coerceNumber(readField(ptVtLike, 'secondary_voltage')),
    accuracy_class: `${readField(ptVtLike, 'accuracy_class') || ''}`.trim(),
    burden_va: coerceNumber(readField(ptVtLike, 'burden_va')),
    connection_type: `${readField(ptVtLike, 'connection_type') || ''}`.trim(),
    fuse_protection: `${readField(ptVtLike, 'fuse_protection') || ''}`.trim(),
    location_context: `${readField(ptVtLike, 'location_context') || ''}`.trim().toLowerCase() || 'protection',
    protected_device_id: `${readField(ptVtLike, 'protected_device_id') || ''}`.trim(),
    meter_id: `${readField(ptVtLike, 'meter_id') || ''}`.trim(),
    relay_id: `${readField(ptVtLike, 'relay_id') || ''}`.trim(),
    consumer_ids: parseIdList(readField(ptVtLike, 'consumer_ids')),
    ratio
  };
}

function findPtVtByExplicitLink(component, allComponents, compMap) {
  const lookup = compMap || new Map((allComponents || []).map(c => [c.id, c]));
  const explicitId = `${readField(component, 'pt_vt_id')
    || readField(component, 'vt_id')
    || readField(component, 'pt_id')
    || readField(component, 'potential_transformer_id')
    || readField(component, 'voltage_transformer_id')
    || ''}`.trim();
  if (!explicitId) return null;
  const linked = lookup.get(explicitId);
  return isPtVtComponent(linked) ? linked : null;
}

function findPtVtByReverseLink(component, allComponents) {
  const targetId = `${component?.id || ''}`.trim();
  if (!targetId) return null;
  return (allComponents || []).find(candidate => {
    if (!isPtVtComponent(candidate)) return false;
    const metadata = normalizePtVtMetadata(candidate);
    if (!metadata) return false;
    return metadata.protected_device_id === targetId
      || metadata.meter_id === targetId
      || metadata.relay_id === targetId
      || metadata.consumer_ids.includes(targetId);
  }) || null;
}

function findPtVtByConnection(component, allComponents) {
  const targetId = `${component?.id || ''}`.trim();
  if (!targetId) return null;
  return (allComponents || []).find(candidate => {
    if (!isPtVtComponent(candidate) || !Array.isArray(candidate.connections)) return false;
    return candidate.connections.some(conn => `${conn?.target || ''}`.trim() === targetId);
  }) || null;
}

export function resolvePtVtForComponent(component, allComponents = [], compMap = null) {
  const map = compMap || new Map((allComponents || []).map(c => [c.id, c]));
  const linked = findPtVtByExplicitLink(component, allComponents, map)
    || findPtVtByReverseLink(component, allComponents)
    || findPtVtByConnection(component, allComponents);
  if (!linked) return null;
  const metadata = normalizePtVtMetadata(linked);
  if (!metadata) return null;
  const consumerVoltage = resolveComponentVoltageVolts(component);
  const primaryVoltage = metadata.primary_voltage;
  if (Number.isFinite(primaryVoltage) && primaryVoltage > 0 && Number.isFinite(consumerVoltage) && consumerVoltage > 0) {
    const mismatchRatio = Math.abs(primaryVoltage - consumerVoltage) / Math.max(primaryVoltage, consumerVoltage);
    metadata.voltage_base = {
      primary_v: primaryVoltage,
      consumer_v: Number(consumerVoltage.toFixed(3)),
      compatible: mismatchRatio <= 0.35
    };
  }
  return metadata;
}
