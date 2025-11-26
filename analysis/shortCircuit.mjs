import { getOneLine, getItem } from '../dataStore.mjs';
import { scaleCurve } from './tccUtils.js';
import protectiveDevices from '../data/protectiveDevices.mjs';
import { calculateTransformerImpedance } from '../utils/transformerImpedance.js';

// Basic complex math utilities
function add(a, b) {
  return { r: (a.r || 0) + (b.r || 0), x: (a.x || 0) + (b.x || 0) };
}
function mag(z) {
  return Math.sqrt((z.r || 0) ** 2 + (z.x || 0) ** 2) || 1e-6;
}
function mult(a, b) {
  return { r: a.r * b.r - a.x * b.x, x: a.r * b.x + a.x * b.r };
}
function div(a, b) {
  const denom = (b.r || 0) ** 2 + (b.x || 0) ** 2 || 1e-6;
  return { r: (a.r * b.r + a.x * b.x) / denom, x: (a.x * b.r - a.r * b.x) / denom };
}
function parallel(a, b) {
  return div(mult(a, b), add(a, b));
}

function toImpedance(value) {
  if (!value || typeof value !== 'object') return { r: 0, x: 0 };
  const r = Number(value.r);
  const x = Number(value.x);
  return {
    r: Number.isFinite(r) ? r : 0,
    x: Number.isFinite(x) ? x : 0
  };
}

function parseNumeric(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const match = value.replace(/[,\s]+/g, ' ').match(/[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/);
    if (!match) return null;
    const num = Number.parseFloat(match[0]);
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

function toKV(value) {
  const num = parseNumeric(value);
  if (num === null) return null;
  return num > 100 ? num / 1000 : num;
}

function pickValue(comp, key) {
  if (!key) return undefined;
  if (comp && Object.prototype.hasOwnProperty.call(comp, key)) return comp[key];
  if (comp?.props && typeof comp.props === 'object' && Object.prototype.hasOwnProperty.call(comp.props, key)) {
    return comp.props[key];
  }
  return undefined;
}

const protectiveDeviceLibrary = Array.isArray(protectiveDevices) ? protectiveDevices : [];
const protectiveDeviceMap = new Map(protectiveDeviceLibrary.map(device => [device.id, device]));
const DEFAULT_TCC_SETTINGS = { devices: [], settings: {}, componentOverrides: {} };
const DEFAULT_LET_THROUGH_WINDOW = 0.008;

const fallbackTypes = new Set(['motor_load', 'static_load', 'load', 'panel', 'equipment', 'bus', 'cable', 'mcc']);
const protectionTypes = new Set(['breaker', 'fuse', 'recloser', 'relay', 'contactor', 'switch', 'protective_device']);
const upstreamCandidateTypes = new Set([
  'transformer',
  'panel',
  'equipment',
  'bus',
  'utility_source',
  'generator',
  'pv_inverter',
  'mcc',
  'feeder'
]);
const shortCircuitResultTypes = new Set([
  ...fallbackTypes,
  ...upstreamCandidateTypes,
  'breaker',
  'disconnect',
  'fuse',
  'protective_device',
  'switch',
  'switchgear'
]);

const transformerVoltageKeyMap = {
  two_winding: ['volts_primary', 'volts_secondary'],
  auto_transformer: ['volts_primary', 'volts_secondary'],
  grounding_transformer: ['volts_primary', 'volts_secondary'],
  three_winding: ['volts_hv', 'volts_lv', 'volts_tv']
};

const transformerKvaKeyMap = {
  two_winding: ['kva', 'kva'],
  auto_transformer: ['kva', 'kva'],
  grounding_transformer: ['kva', 'kva'],
  three_winding: ['kva_hv', 'kva_lv', 'kva_tv']
};

const transformerPercentKeyMap = {
  two_winding: ['percent_z', 'percent_z'],
  auto_transformer: ['percent_z', 'percent_z'],
  grounding_transformer: ['percent_z', 'percent_z'],
  three_winding: ['z_hv_lv_percent', 'z_hv_lv_percent', 'z_hv_tv_percent']
};

function normalizePortIndex(port) {
  const idx = Number(port);
  return Number.isFinite(idx) ? idx : 0;
}

function isSourceComponent(comp) {
  return ['utility_source', 'generator', 'pv_inverter'].includes(comp?.type);
}

function isProtectionComponent(comp) {
  if (!comp || typeof comp !== 'object') return false;
  if (comp.category === 'protection') return true;
  const type = typeof comp.type === 'string' ? comp.type.toLowerCase() : '';
  if (protectionTypes.has(type)) return true;
  const subtype = typeof comp.subtype === 'string' ? comp.subtype.toLowerCase() : '';
  if (protectionTypes.has(subtype)) return true;
  const matchers = ['breaker', 'fuse', 'recloser', 'relay', 'contactor', 'switch'];
  if (matchers.some(token => type.includes(token) || subtype.includes(token))) return true;
  return false;
}

function getNumericFromKeys(comp, keys) {
  if (!Array.isArray(keys)) return null;
  const seen = new Set();
  for (const key of keys) {
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const val = pickValue(comp, key);
    const num = parseNumeric(val);
    if (num !== null) return num;
  }
  return null;
}

function getTransformerVoltageForPort(xfmr, portIndex) {
  const subtypeKeys = transformerVoltageKeyMap[xfmr?.subtype] || [];
  const kvFallbacks = portIndex === 0
    ? ['kv_primary', 'kv_hv']
    : portIndex === 1
      ? ['kv_secondary', 'kv_lv']
      : ['kv_tertiary', 'kv_tv', 'kv_lv'];
  const fallbackKeys = portIndex === 0
    ? ['volts_primary', 'voltage_primary', 'primary_voltage', 'volts_hv', 'voltage_hv', 'voltage']
    : portIndex === 1
      ? ['volts_secondary', 'voltage_secondary', 'secondary_voltage', 'volts_lv', 'voltage_lv', 'voltage']
      : ['volts_tv', 'volts_tertiary', 'tertiary_voltage', 'volts_lv', 'voltage_lv', 'voltage'];
  return getNumericFromKeys(xfmr, [subtypeKeys[portIndex], ...kvFallbacks, ...fallbackKeys, 'baseKV', 'prefault_voltage']);
}

function getTransformerKvaForPort(xfmr, portIndex) {
  const subtypeKeys = transformerKvaKeyMap[xfmr?.subtype] || [];
  const kvaFallbacks = [
    subtypeKeys[portIndex],
    portIndex === 0 ? 'kva_primary' : portIndex === 1 ? 'kva_secondary' : 'kva_tertiary',
    portIndex === 0 ? 'kva_hv' : portIndex === 1 ? 'kva_lv' : 'kva_tv',
    'kva_hv_lv',
    'kva_hv_tv',
    'kva_lv_tv',
    'rated_kva',
    'kva'
  ];
  const kva = getNumericFromKeys(xfmr, kvaFallbacks);
  if (kva !== null) return kva;
  const mvaFallbacks = [
    portIndex === 0 ? 'mva_primary' : portIndex === 1 ? 'mva_secondary' : 'mva_tertiary',
    'mva_hv',
    'mva_lv',
    'mva'
  ];
  const mva = getNumericFromKeys(xfmr, mvaFallbacks);
  return mva !== null ? mva * 1000 : null;
}

function getTransformerPercentForPort(xfmr, portIndex) {
  const subtypeKeys = transformerPercentKeyMap[xfmr?.subtype] || [];
  const percentFallbacks = [
    subtypeKeys[portIndex],
    portIndex === 0 ? 'percent_primary' : portIndex === 1 ? 'percent_secondary' : 'percent_tertiary',
    portIndex === 0 ? 'z_hv_lv_percent' : portIndex === 1 ? 'z_hv_lv_percent' : 'z_lv_tv_percent',
    portIndex === 2 ? 'z_hv_tv_percent' : null,
    'impedance_percent',
    'z_percent',
    'percent_z'
  ];
  return getNumericFromKeys(xfmr, percentFallbacks);
}

function getTransformerImpedance(xfmr, portIndex) {
  if (!xfmr || xfmr.type !== 'transformer') return { r: 0, x: 0 };
  const percent = getTransformerPercentForPort(xfmr, portIndex);
  const kva = getTransformerKvaForPort(xfmr, portIndex);
  const voltage = getTransformerVoltageForPort(xfmr, portIndex);
  const kv = toKV(voltage ?? pickValue(xfmr, 'voltage') ?? pickValue(xfmr, 'baseKV'));
  const xr = parseNumeric(pickValue(xfmr, 'xr_ratio') ?? pickValue(xfmr, 'xr'));
  const impedance = calculateTransformerImpedance({ kva, percentZ: percent, voltageKV: kv, xrRatio: xr });
  if (impedance && Number.isFinite(impedance.r) && Number.isFinite(impedance.x)) return impedance;
  const direct = pickValue(xfmr, 'transformer_impedance');
  const fallback = toImpedance(direct);
  if (Math.abs(fallback.r) > 0 || Math.abs(fallback.x) > 0) return fallback;
  return { r: 0, x: 0 };
}

function getSourceImpedance(comp) {
  const mva = parseNumeric(pickValue(comp, 'thevenin_mva') ?? pickValue(comp, 'mva'));
  const kv = toKV(pickValue(comp, 'voltage') ?? pickValue(comp, 'volts') ?? pickValue(comp, 'baseKV'));
  if (!mva || !kv) return { r: 0, x: 0 };
  const zMag = (kv * kv) / mva;
  const xr = parseNumeric(pickValue(comp, 'xr_ratio'));
  if (xr && Math.abs(xr) > 0.01) {
    const r = zMag / Math.sqrt(1 + xr * xr);
    return { r, x: r * xr };
  }
  const r = zMag * 0.1;
  const x = Math.sqrt(Math.max(zMag * zMag - r * r, 0)) || zMag;
  return { r, x };
}

function findParentInfo(comp, comps, compMap, visited) {
  if (!comp?.id) return null;
  const direct = comps.find(candidate =>
    candidate?.id !== comp.id && (candidate.connections || []).some(conn => conn?.target === comp.id)
  );
  if (direct) {
    const connection = (direct.connections || []).find(conn => conn?.target === comp.id) || null;
    return { component: direct, connection, reversed: false };
  }
  if (!fallbackTypes.has(comp.type)) return null;
  for (const conn of comp.connections || []) {
    const target = compMap.get(conn?.target);
    if (!target || visited.has(target.id)) continue;
    if (!upstreamCandidateTypes.has(target.type) && target.type !== 'transformer') continue;
    return { component: target, connection: conn, reversed: true };
  }
  return null;
}

function loadTccSettings() {
  try {
    const stored = getItem('tccSettings', DEFAULT_TCC_SETTINGS);
    if (stored && typeof stored === 'object') {
      return {
        devices: Array.isArray(stored.devices) ? stored.devices : [],
        settings: stored.settings && typeof stored.settings === 'object' ? stored.settings : {},
        componentOverrides: stored.componentOverrides && typeof stored.componentOverrides === 'object'
          ? stored.componentOverrides
          : {}
      };
    }
  } catch (err) {
    console.warn('Failed to load TCC settings; using defaults.', err);
  }
  return { devices: [], settings: {}, componentOverrides: {} };
}

function resolveTccOverrides(component, saved = {}, baseDevice) {
  if (!component?.tccId || !baseDevice?.id) return {};
  const deviceOverride = saved.settings?.[baseDevice.id]
    || saved.settings?.[component.tccId]
    || {};
  const componentOverride = saved.componentOverrides?.[component.id] || {};
  const inlineOverride = component.tccOverrides && typeof component.tccOverrides === 'object'
    ? component.tccOverrides
    : {};
  return { ...deviceOverride, ...componentOverride, ...inlineOverride };
}

function getScaledDeviceForComponent(component, saved, cache) {
  if (!component?.id || !component.tccId) return null;
  if (cache.has(component.id)) return cache.get(component.id);
  const base = protectiveDeviceMap.get(component.tccId);
  if (!base) {
    cache.set(component.id, null);
    return null;
  }
  try {
    const overrides = resolveTccOverrides(component, saved, base);
    const scaled = scaleCurve(base, overrides);
    const resolved = { base, scaled };
    cache.set(component.id, resolved);
    return resolved;
  } catch (err) {
    console.error('Failed to scale TCC curve for component', component.id, err);
    cache.set(component.id, null);
    return null;
  }
}

function findNearestProtectiveComponent(comp, comps, compMap, cache) {
  if (!comp?.id) return null;
  if (cache.has(comp.id)) return cache.get(comp.id);
  const visited = new Set([comp.id]);
  let current = comp;
  let result = null;
  while (current) {
    if (current !== comp && isProtectionComponent(current) && current.tccId) {
      result = current;
      break;
    }
    const parent = findParentInfo(current, comps, compMap, visited);
    if (!parent?.component?.id || visited.has(parent.component.id)) break;
    visited.add(parent.component.id);
    current = parent.component;
  }
  cache.set(comp.id, result);
  return result;
}

function computeLetThroughLimitKA(baseDevice, scaledDevice, faultKA) {
  if (!baseDevice || !scaledDevice || !Number.isFinite(faultKA) || faultKA <= 0) return null;
  const letThrough = baseDevice.letThrough && typeof baseDevice.letThrough === 'object'
    ? baseDevice.letThrough
    : null;
  if (letThrough && Number.isFinite(letThrough.i2t) && letThrough.i2t > 0) {
    const window = Number.isFinite(letThrough.window) && letThrough.window > 0
      ? letThrough.window
      : DEFAULT_LET_THROUGH_WINDOW;
    const amps = Math.sqrt(letThrough.i2t / window);
    if (Number.isFinite(amps) && amps > 0) return amps / 1000;
  }
  if (Array.isArray(scaledDevice.peakCurve) && scaledDevice.peakCurve.length) {
    const maxPeak = scaledDevice.peakCurve.reduce((max, point) => {
      const current = Number(point?.current) || 0;
      return current > max ? current : max;
    }, 0);
    if (maxPeak > 0) return maxPeak / 1000;
  }
  if (Number.isFinite(baseDevice.interruptRating) && baseDevice.interruptRating > 0 && faultKA > baseDevice.interruptRating) {
    return baseDevice.interruptRating;
  }
  return null;
}

function limitFaultByProtection(entry, comp, comps, compMap, protectiveCache, scaledCache, tccSettings) {
  if (!comp?.id || !entry || !Number.isFinite(entry.threePhaseKA) || entry.threePhaseKA <= 0) return;
  const protectiveComp = findNearestProtectiveComponent(comp, comps, compMap, protectiveCache);
  if (!protectiveComp) return;
  const resolved = getScaledDeviceForComponent(protectiveComp, tccSettings, scaledCache);
  if (!resolved?.base || !resolved?.scaled) return;
  const limitKA = computeLetThroughLimitKA(resolved.base, resolved.scaled, entry.threePhaseKA);
  if (!Number.isFinite(limitKA) || limitKA <= 0 || limitKA >= entry.threePhaseKA - 1e-6) return;
  const original = {
    threePhaseKA: entry.threePhaseKA,
    lineToGroundKA: entry.lineToGroundKA,
    lineToLineKA: entry.lineToLineKA,
    doubleLineGroundKA: entry.doubleLineGroundKA,
    asymKA: entry.asymKA
  };
  const ratio = original.threePhaseKA > 0 ? limitKA / original.threePhaseKA : 0;
  entry.threePhaseKA = Number(limitKA.toFixed(2));
  const scaleField = key => {
    if (!Number.isFinite(original[key]) || !Number.isFinite(ratio)) return;
    entry[key] = Number((original[key] * ratio).toFixed(2));
  };
  scaleField('lineToGroundKA');
  scaleField('lineToLineKA');
  scaleField('doubleLineGroundKA');
  scaleField('asymKA');
  entry.protectionLimit = {
    deviceId: resolved.base.id,
    componentId: protectiveComp.id,
    name: resolved.base.name || protectiveComp.tccId || resolved.base.id,
    limitKA: Number(limitKA.toFixed(2)),
    basis: resolved.base.letThrough?.i2t
      ? 'i2t'
      : Array.isArray(resolved.scaled.peakCurve) && resolved.scaled.peakCurve.length
        ? 'peak_curve'
        : Number.isFinite(resolved.base.interruptRating)
          ? 'interrupt_rating'
          : 'tcc'
  };
}

function combineParallel(base, addition) {
  if (!addition || (Math.abs(addition.r) < 1e-9 && Math.abs(addition.x) < 1e-9)) return base;
  if (!base || (Math.abs(base.r) < 1e-9 && Math.abs(base.x) < 1e-9)) return addition;
  return parallel(base, addition);
}

function resolveUpstreamImpedance(comp, comps, compMap, cache) {
  if (!comp?.id) return null;
  const visited = new Set([comp.id]);
  let current = comp;
  while (current) {
    const parent = findParentInfo(current, comps, compMap, visited);
    if (!parent?.component?.id || visited.has(parent.component.id)) break;
    const candidate = computeImpedance(parent.component, comps, compMap, cache);
    if (candidate && (Math.abs(candidate.r) >= 1e-9 || Math.abs(candidate.x) >= 1e-9)) {
      return { r: candidate.r, x: candidate.x };
    }
    visited.add(parent.component.id);
    current = parent.component;
  }
  return null;
}

function computeImpedance(comp, comps, compMap, cache, visited = new Set()) {
  if (!comp?.id) return { r: 0, x: 0 };
  if (cache.has(comp.id)) return cache.get(comp.id);
  if (visited.has(comp.id)) return { r: 0, x: 0 };
  visited.add(comp.id);
  let total = toImpedance(comp.impedance);
  if (isSourceComponent(comp)) {
    total = add(total, getSourceImpedance(comp));
  }
  const parent = findParentInfo(comp, comps, compMap, visited);
  if (parent?.component) {
    const { component: upstream, connection, reversed } = parent;
    if (connection) {
      total = add(total, toImpedance(connection.impedance));
      if (upstream.type === 'transformer') {
        const portIndex = normalizePortIndex(reversed ? connection?.targetPort : connection?.sourcePort);
        total = add(total, getTransformerImpedance(upstream, portIndex));
      }
    }
    total = add(total, computeImpedance(upstream, comps, compMap, cache, visited));
  }
  visited.delete(comp.id);
  cache.set(comp.id, total);
  return total;
}

function computePrefaultKV(comp, comps, compMap, cache, visited = new Set()) {
  if (!comp?.id) return 1;
  if (cache.has(comp.id)) return cache.get(comp.id);
  if (visited.has(comp.id)) return 1;
  visited.add(comp.id);
  const direct = toKV(pickValue(comp, 'prefault_voltage'));
  if (direct) {
    cache.set(comp.id, direct);
    visited.delete(comp.id);
    return direct;
  }
  const baseKV = parseNumeric(pickValue(comp, 'baseKV'));
  if (baseKV && baseKV > 0) {
    cache.set(comp.id, baseKV);
    visited.delete(comp.id);
    return baseKV;
  }
  const voltageCandidates = [
    pickValue(comp, 'voltage'),
    pickValue(comp, 'volts'),
    pickValue(comp, 'voltage_class'),
    pickValue(comp, 'kV'),
    pickValue(comp, 'kv'),
    pickValue(comp, 'kv_ll')
  ];
  for (const candidate of voltageCandidates) {
    const kv = toKV(candidate);
    if (kv) {
      cache.set(comp.id, kv);
      visited.delete(comp.id);
      return kv;
    }
  }
  if (comp.type === 'transformer') {
    const kv = toKV(getTransformerVoltageForPort(comp, 0) ?? getTransformerVoltageForPort(comp, 1));
    if (kv) {
      cache.set(comp.id, kv);
      visited.delete(comp.id);
      return kv;
    }
  }
  const parent = findParentInfo(comp, comps, compMap, visited);
  if (parent?.component) {
    const upstreamKV = computePrefaultKV(parent.component, comps, compMap, cache, visited);
    cache.set(comp.id, upstreamKV);
    visited.delete(comp.id);
    return upstreamKV;
  }
  visited.delete(comp.id);
  cache.set(comp.id, 1);
  return 1;
}

/**
 * Symmetrical component short‑circuit engine with basic ANSI C37 and
 * IEC 60909 support. Each component is treated as a bus with sequence
 * impedances back to the source. Optional `sources` allows multiple
 * upstream contributions. Components may specify:
 *   - `prefault_voltage` (line‑to‑line kV)
 *   - sequence impedances `z1`,`z2`,`z0`
 *   - `xr_ratio` for momentary asymmetrical current
 *   - `method` ('ANSI' or 'IEC')
 */
export function runShortCircuit(modelOrOpts = {}, maybeOpts = {}) {
  let comps, opts;
  if (Array.isArray(modelOrOpts)) {
    comps = modelOrOpts.filter(c => c && c.type !== 'annotation' && c.type !== 'dimension');
    opts = maybeOpts || {};
  } else if (modelOrOpts?.buses) {
    comps = modelOrOpts.buses.filter(c => c && c.type !== 'annotation' && c.type !== 'dimension');
    opts = maybeOpts || {};
  } else {
    opts = modelOrOpts || {};
    const { sheets } = getOneLine();
    comps = Array.isArray(sheets[0]?.components)
      ? sheets.flatMap(s => s.components)
      : sheets;
    comps = comps.filter(c => c && c.type !== 'annotation' && c.type !== 'dimension');
  }
  const nodeCandidates = comps.filter(comp => {
    if (!comp) return false;
    if (comp.subtype === 'Bus') return true;
    if (!comp.type) return false;
    return shortCircuitResultTypes.has(comp.type);
  });
  const buses = nodeCandidates.length ? nodeCandidates : comps;
  const compMap = new Map(comps.map(c => [c.id, c]));
  const impedanceCache = new Map();
  const voltageCache = new Map();
  const protectiveLookupCache = new Map();
  const scaledDeviceCache = new Map();
  const tccSettings = loadTccSettings();
  const results = {};

  const missingImpedanceComponents = new Set();
  const defaultedLowImpedanceComponents = new Map();
  const cablesMissingImpedance = new Set();
  const cableDefaultTargets = new Set();

  const reverseConnectionMap = new Map();
  comps.forEach(component => {
    if (!component?.id || !component?.connections || !component.connections.length) return;
    component.connections.forEach(conn => {
      const targetId = conn?.target;
      if (!targetId) return;
      if (!reverseConnectionMap.has(targetId)) reverseConnectionMap.set(targetId, new Set());
      reverseConnectionMap.get(targetId).add(component.id);
    });
  });

  comps.forEach(component => {
    if (component?.type !== 'cable' || !component.id) return;
    const base = toImpedance(component.impedance);
    if (Math.abs(base.r) >= 1e-9 || Math.abs(base.x) >= 1e-9) return;
    cablesMissingImpedance.add(component.id);
    (component.connections || []).forEach(conn => {
      if (typeof conn?.target === 'string') cableDefaultTargets.add(conn.target);
      if (typeof conn?.source === 'string') cableDefaultTargets.add(conn.source);
    });
    const upstream = reverseConnectionMap.get(component.id);
    if (upstream) {
      upstream.forEach(id => {
        if (typeof id === 'string') cableDefaultTargets.add(id);
      });
    }
  });

  const ensureNonZero = (z, comp, fallbackZ) => {
    const r = Number(z?.r) || 0;
    const x = Number(z?.x) || 0;
    if (Math.abs(r) < 1e-9 && Math.abs(x) < 1e-9) {
      if (fallbackZ && (Math.abs(fallbackZ.r) >= 1e-9 || Math.abs(fallbackZ.x) >= 1e-9)) {
        return { r: fallbackZ.r, x: fallbackZ.x };
      }
      const isCableMissing = comp?.type === 'cable' && comp?.id && cablesMissingImpedance.has(comp.id);
      const isTargetOfMissingCable = comp?.id && cableDefaultTargets.has(comp.id);
      if ((isCableMissing || isTargetOfMissingCable) && comp?.id) {
        defaultedLowImpedanceComponents.set(
          comp.id,
          'Cable impedance incomplete; defaulted to very low resistance for fault monitoring.'
        );
        return { r: 1e-6, x: 1e-6 };
      }
      if (isProtectionComponent(comp) && comp?.id) {
        defaultedLowImpedanceComponents.set(
          comp.id,
          'Protective device properties incomplete; defaulted to very low resistance for fault monitoring.'
        );
        return { r: 1e-6, x: 1e-6 };
      }
      if (comp?.id) missingImpedanceComponents.add(comp.id);
      return { r: 1e6, x: 1e6 };
    }
    return { r, x };
  };

  buses.forEach(comp => {
    const baseZ = computeImpedance(comp, comps, compMap, impedanceCache);
    const fallbackZ = (comp?.subtype === 'Bus' || comp?.type === 'bus')
      ? resolveUpstreamImpedance(comp, comps, compMap, impedanceCache)
      : null;
    let z1 = comp.z1 ? toImpedance(comp.z1) : baseZ;
    let z2 = comp.z2 ? toImpedance(comp.z2) : z1;
    let z0 = comp.z0 ? toImpedance(comp.z0) : z1;

    const sourceList = Array.isArray(comp.sources) ? comp.sources : [];
    if (sourceList.length) {
      z1 = ensureNonZero(sourceList.reduce((acc, src) => combineParallel(acc, toImpedance(src.z1 || src.impedance || src)), z1), comp, fallbackZ);
      z2 = ensureNonZero(sourceList.reduce((acc, src) => combineParallel(acc, toImpedance(src.z2 || src.impedance || src)), z2), comp, fallbackZ);
      z0 = ensureNonZero(sourceList.reduce((acc, src) => combineParallel(acc, toImpedance(src.z0 || src.impedance || src)), z0), comp, fallbackZ);
    } else {
      z1 = ensureNonZero(z1, comp, fallbackZ);
      z2 = ensureNonZero(z2, comp, fallbackZ);
      z0 = ensureNonZero(z0, comp, fallbackZ);
    }

    const prefaultKV = computePrefaultKV(comp, comps, compMap, voltageCache) || 1;
    const method = (comp.method || opts.method || (prefaultKV > 1 ? 'IEC' : 'ANSI')).toUpperCase();
    const vFactor = method === 'IEC' ? (comp.v_factor || 1.1) : (comp.v_factor || 1.05);
    const V = (prefaultKV * vFactor) / Math.sqrt(3); // phase voltage in kV

    const I3 = V / mag(z1);
    const ILG = (3 * V) / mag(add(add(z1, z2), z0));
    const ILL = (Math.sqrt(3) * V) / mag(add(z1, z2));
    const Z2Z0 = parallel(z2, z0);
    const IDLG = (3 * V) / mag(add(z1, Z2Z0));

    const xr = Math.abs(comp.xr_ratio || 0);
    const asym = I3 * (1 + Math.exp(-Math.PI / Math.max(xr, 0.01)));

    const entry = {
      method,
      prefaultKV: Number(prefaultKV.toFixed(3)),
      threePhaseKA: Number(I3.toFixed(2)),
      asymKA: Number(asym.toFixed(2)),
      lineToGroundKA: Number(ILG.toFixed(2)),
      lineToLineKA: Number(ILL.toFixed(2)),
      doubleLineGroundKA: Number(IDLG.toFixed(2))
    };

    const lowImpedanceWarning = defaultedLowImpedanceComponents.get(comp.id);
    if (lowImpedanceWarning) {
      entry.warnings = [lowImpedanceWarning];
    } else if (missingImpedanceComponents.has(comp.id)) {
      entry.warnings = ['Impedance data missing; results limited by default high resistance.'];
    }

    limitFaultByProtection(entry, comp, comps, compMap, protectiveLookupCache, scaledDeviceCache, tccSettings);
    results[comp.id] = entry;
  });

  return results;
}

