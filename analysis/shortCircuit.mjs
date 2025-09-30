import { getOneLine } from '../dataStore.mjs';

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

const fallbackTypes = new Set(['motor_load', 'static_load', 'load', 'panel', 'equipment', 'bus', 'cable', 'mcc']);
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
  const fallbackKeys = portIndex === 0
    ? ['volts_primary', 'voltage_primary', 'primary_voltage', 'volts_hv', 'voltage']
    : portIndex === 1
      ? ['volts_secondary', 'voltage_secondary', 'secondary_voltage', 'volts_lv', 'voltage']
      : ['volts_tv', 'volts_tertiary', 'tertiary_voltage', 'volts_lv', 'voltage'];
  return getNumericFromKeys(xfmr, [subtypeKeys[portIndex], ...fallbackKeys]);
}

function getTransformerKvaForPort(xfmr, portIndex) {
  const subtypeKeys = transformerKvaKeyMap[xfmr?.subtype] || [];
  return getNumericFromKeys(xfmr, [subtypeKeys[portIndex], 'kva']);
}

function getTransformerPercentForPort(xfmr, portIndex) {
  const subtypeKeys = transformerPercentKeyMap[xfmr?.subtype] || [];
  const fallbacks = ['percent_z'];
  if (xfmr?.subtype === 'three_winding' && portIndex === 2) fallbacks.unshift('z_lv_tv_percent');
  return getNumericFromKeys(xfmr, [subtypeKeys[portIndex], ...fallbacks]);
}

function getTransformerImpedance(xfmr, portIndex) {
  if (!xfmr || xfmr.type !== 'transformer') return { r: 0, x: 0 };
  const percent = getTransformerPercentForPort(xfmr, portIndex);
  const kva = getTransformerKvaForPort(xfmr, portIndex);
  const voltage = getTransformerVoltageForPort(xfmr, portIndex);
  const kv = toKV(voltage || pickValue(xfmr, 'voltage'));
  if (!percent || !kva || !kv) return { r: 0, x: 0 };
  const baseMVA = kva / 1000;
  if (!baseMVA) return { r: 0, x: 0 };
  const baseZ = (kv * kv) / baseMVA;
  const zMag = baseZ * (percent / 100);
  const xr = parseNumeric(pickValue(xfmr, 'xr_ratio'));
  if (xr && Math.abs(xr) > 0.01) {
    const r = zMag / Math.sqrt(1 + xr * xr);
    return { r, x: r * xr };
  }
  const r = zMag * 0.1;
  const x = Math.sqrt(Math.max(zMag * zMag - r * r, 0)) || zMag;
  return { r, x };
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

function combineParallel(base, addition) {
  if (!addition || (Math.abs(addition.r) < 1e-9 && Math.abs(addition.x) < 1e-9)) return base;
  if (!base || (Math.abs(base.r) < 1e-9 && Math.abs(base.x) < 1e-9)) return addition;
  return parallel(base, addition);
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
    comps = modelOrOpts;
    opts = maybeOpts || {};
  } else if (modelOrOpts?.buses) {
    comps = modelOrOpts.buses;
    opts = maybeOpts || {};
  } else {
    opts = modelOrOpts || {};
    const { sheets } = getOneLine();
    comps = Array.isArray(sheets[0]?.components)
      ? sheets.flatMap(s => s.components)
      : sheets;
  }
  let buses = comps.filter(c => c.subtype === 'Bus');
  if (buses.length === 0) buses = comps;
  const compMap = new Map(comps.map(c => [c.id, c]));
  const impedanceCache = new Map();
  const voltageCache = new Map();
  const results = {};

  const ensureNonZero = z => {
    if (!z) return { r: 0.0001, x: 0.0001 };
    const r = Number(z.r) || 0;
    const x = Number(z.x) || 0;
    if (Math.abs(r) < 1e-9 && Math.abs(x) < 1e-9) {
      return { r: 0.0001, x: 0.0001 };
    }
    return { r, x };
  };

  buses.forEach(comp => {
    const baseZ = computeImpedance(comp, comps, compMap, impedanceCache);
    let z1 = comp.z1 ? toImpedance(comp.z1) : baseZ;
    z1 = ensureNonZero(z1);
    let z2 = comp.z2 ? toImpedance(comp.z2) : z1;
    let z0 = comp.z0 ? toImpedance(comp.z0) : z1;

    const sourceList = Array.isArray(comp.sources) ? comp.sources : [];
    if (sourceList.length) {
      z1 = ensureNonZero(sourceList.reduce((acc, src) => combineParallel(acc, toImpedance(src.z1 || src.impedance || src)), z1));
      z2 = ensureNonZero(sourceList.reduce((acc, src) => combineParallel(acc, toImpedance(src.z2 || src.impedance || src)), z2));
      z0 = ensureNonZero(sourceList.reduce((acc, src) => combineParallel(acc, toImpedance(src.z0 || src.impedance || src)), z0));
    } else {
      z2 = ensureNonZero(z2);
      z0 = ensureNonZero(z0);
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

    results[comp.id] = {
      method,
      prefaultKV: Number(prefaultKV.toFixed(3)),
      threePhaseKA: Number(I3.toFixed(2)),
      asymKA: Number(asym.toFixed(2)),
      lineToGroundKA: Number(ILG.toFixed(2)),
      lineToLineKA: Number(ILL.toFixed(2)),
      doubleLineGroundKA: Number(IDLG.toFixed(2))
    };
  });

  return results;
}

