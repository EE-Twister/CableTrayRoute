import { normalizeVoltageToVolts, toBaseKV } from '../../utils/voltage.js';

// Pure voltage helpers for one-line components: transformer port roles and
// winding voltages, nominal/operating voltage resolution, and display formatting.
// Functions that fall back to component library defaults take the current
// componentMeta map as an explicit argument instead of reading page state.

export const transformerVoltageKeyMap = {
  two_winding: ['volts_primary', 'volts_secondary'],
  auto_transformer: ['volts_primary', 'volts_secondary'],
  grounding_transformer: ['volts_primary', 'volts_secondary'],
  three_winding: ['volts_hv', 'volts_lv', 'volts_tv']
};

export function getTransformerConnectionSetting(transformer, role, componentMeta = {}) {
  if (!transformer || !role) return null;
  const key = `${role}_connection`;
  const direct = transformer[key];
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  if (transformer.props && typeof transformer.props[key] === 'string') {
    const value = transformer.props[key].trim();
    if (value) return value;
  }
  const metaProps = componentMeta[transformer.subtype]?.props || {};
  const metaValue = metaProps[key];
  if (typeof metaValue === 'string' && metaValue.trim()) return metaValue.trim();
  return null;
}

export function getTransformerPortRole(transformer, portIndex) {
  if (!transformer || transformer.type !== 'transformer') return null;
  const idx = Number(portIndex);
  if (!Number.isFinite(idx)) return null;
  if (transformer.subtype === 'three_winding') {
    if (idx === 0) return 'primary';
    if (idx === 1) return 'secondary';
    if (idx === 2) return 'tertiary';
  }
  if (idx === 0) return 'primary';
  if (idx === 1) return 'secondary';
  if (idx === 2) return 'tertiary';
  return null;
}

export function buildTransformerPortLabel(transformer, portIndex, componentMeta = {}) {
  const role = getTransformerPortRole(transformer, portIndex);
  if (!role) return null;
  let roleLabel;
  switch (role) {
    case 'primary':
      roleLabel = 'Primary';
      break;
    case 'secondary':
      roleLabel = 'Secondary';
      break;
    case 'tertiary':
      roleLabel = 'Tertiary';
      break;
    default:
      roleLabel = role;
      break;
  }
  const config = getTransformerConnectionSetting(transformer, role, componentMeta);
  return config ? `${roleLabel} (${config})` : roleLabel;
}

export function parseVoltageNumber(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  const str = String(value);
  const match = str.replace(/[,\s]+/g, ' ').match(/[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/);
  if (!match) return null;
  const num = Number.parseFloat(match[0]);
  return Number.isFinite(num) ? num : null;
}

export function resolveTransformerVoltageValue(transformer, portIndex, componentMeta = {}) {
  if (!transformer) return null;
  const metaProps = componentMeta[transformer.subtype]?.props || {};
  const subtypeKeys = transformerVoltageKeyMap[transformer.subtype] || [];
  const fallbacks = portIndex === 0
    ? ['volts_primary', 'voltage_primary', 'primary_voltage', 'volts_hv', 'voltage']
    : portIndex === 1
      ? ['volts_secondary', 'voltage_secondary', 'secondary_voltage', 'volts_lv', 'voltage']
      : ['volts_tv', 'volts_tertiary', 'tertiary_voltage', 'volts_lv', 'voltage'];
  const keys = [subtypeKeys[portIndex], ...fallbacks];
  const seen = new Set();
  for (const key of keys) {
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const value = transformer[key] ?? transformer.props?.[key] ?? metaProps[key];
    if (parseVoltageNumber(value) !== null) return value;
  }
  return null;
}

export function formatVoltageString(num) {
  if (!Number.isFinite(num)) return null;
  const rounded = Number(num.toFixed(4));
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

export function formatVoltage(volts) {
  if (!Number.isFinite(volts)) return '';
  const abs = Math.abs(volts);
  if (abs >= 1000) {
    const kv = Number((volts / 1000).toFixed(3));
    return `${kv} kV`;
  }
  const value = Number(volts.toFixed(1));
  return `${value} V`;
}

export function resolveNominalVoltage(component) {
  if (!component || typeof component !== 'object') return null;
  const resolved = resolveComponentVoltageVolts(component, { includeOperatingVoltage: false });
  if (Number.isFinite(resolved) && resolved > 0) return resolved;
  return null;
}

export function resolveVoltageMagnitude(component) {
  if (!component || typeof component !== 'object') return null;
  const raw = component.voltage_mag;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw;
  }
  if (raw && typeof raw === 'object') {
    const values = Object.values(raw)
      .map(val => Number(val))
      .filter(val => Number.isFinite(val) && val > 0);
    if (values.length) {
      const total = values.reduce((sum, val) => sum + val, 0);
      return total / values.length;
    }
  }
  return null;
}


export function getFiniteVoltageMagnitudes(voltageMag) {
  if (typeof voltageMag === 'number') {
    return Number.isFinite(voltageMag) ? [voltageMag] : [];
  }
  if (!voltageMag || typeof voltageMag !== 'object') return [];
  const mags = [];
  for (const value of Object.values(voltageMag)) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) mags.push(numeric);
  }
  return mags;
}

export function getVoltageMagnitudeEntries(voltageMag) {
  if (!voltageMag || typeof voltageMag !== 'object') return [];
  const entries = [];
  for (const [phase, value] of Object.entries(voltageMag)) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) entries.push([phase, numeric]);
  }
  return entries;
}

export function sanitizeOverlayStudyFields(component) {
  if (!component || typeof component !== 'object') return component;
  const cleanedMags = getFiniteVoltageMagnitudes(component.voltage_mag);
  if (component.voltage_mag !== undefined && cleanedMags.length === 0) {
    delete component.voltage_mag;
  }
  return component;
}
export function computeComponentOperatingVoltage(component) {
  if (!component) return null;
  const nominal = resolveNominalVoltage(component);
  if (nominal === null) return null;
  const magnitude = resolveVoltageMagnitude(component);
  if (magnitude !== null) {
    return nominal * magnitude;
  }
  return nominal;
}

export function formatOperatingVoltage(value) {
  if (value === null || value === undefined || value === '') return '';
  const num = Number(value);
  if (Number.isFinite(num)) return Number(num.toFixed(2));
  return value;
}

export function resolveComponentVoltageVolts(comp, options = {}) {
  if (!comp || typeof comp !== 'object') return null;
  const { includeOperatingVoltage = true } = options;
  const containers = [comp];
  if (comp.props && typeof comp.props === 'object') containers.push(comp.props);
  if (comp.parameters && typeof comp.parameters === 'object') containers.push(comp.parameters);
  if (comp.cable && typeof comp.cable === 'object') containers.push(comp.cable);
  const primaryKeys = [
    'voltage',
    'volts',
    'voltage_v',
    'voltage_kv',
    'operating_voltage',
    'rated_voltage',
    'rated_volts',
    'voltage_rating'
  ];
  const directKeys = includeOperatingVoltage ? primaryKeys : primaryKeys.filter(key => key !== 'operating_voltage');
  for (const container of containers) {
    if (!container || typeof container !== 'object') continue;
    for (const key of directKeys) {
      if (!(key in container)) continue;
      const resolved = normalizeVoltageToVolts({ [key]: container[key] });
      if (resolved !== null && Number.isFinite(resolved) && resolved > 0) {
        return resolved;
      }
    }
  }
  const baseKeys = ['baseKV', 'kV', 'kv', 'nominalVoltage', 'nominal_voltage', 'prefault_voltage'];
  for (const container of containers) {
    if (!container || typeof container !== 'object') continue;
    for (const key of baseKeys) {
      if (!(key in container)) continue;
      const base = toBaseKV({ kV: container[key] });
      if (Number.isFinite(base) && base > 0) {
        return base * 1000;
      }
    }
  }
  return null;
}
