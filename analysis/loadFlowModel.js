import componentLibrary from '../componentLibrary.json' with { type: 'json' };
import { normalizeVoltageToVolts, toBaseKV } from '../utils/voltage.js';

const DEFAULT_COMPONENT_DEFINITIONS = [
  { type: 'bus', subtype: 'Bus' }
];

function compKey(type, subtype) {
  return subtype ? `${type}_${subtype}` : type;
}

function buildComponentTypeMap() {
  const map = new Map();
  const register = definition => {
    if (!definition || typeof definition !== 'object') return;
    const subtype = typeof definition.subtype === 'string' ? definition.subtype.trim() : '';
    if (!subtype) return;
    const baseType = (typeof definition.type === 'string' && definition.type.trim())
      || (typeof definition.category === 'string' && definition.category.trim())
      || subtype;
    const key = compKey(baseType, subtype);
    map.set(key, baseType);
    map.set(subtype, baseType);
    map.set(baseType, baseType);
  };

  const libraryDefs = Array.isArray(componentLibrary?.components)
    ? componentLibrary.components
    : [];
  libraryDefs.forEach(register);
  DEFAULT_COMPONENT_DEFINITIONS.forEach(register);
  return map;
}

const componentTypeBySubtype = buildComponentTypeMap();

function normalizePortIndex(port) {
  const idx = Number(port);
  return Number.isFinite(idx) ? idx : null;
}

function getTransformerPortRole(comp, portIndex) {
  if (!comp || (comp.type !== 'transformer' && !String(comp.subtype || '').includes('transformer'))) {
    return null;
  }
  const idx = normalizePortIndex(portIndex);
  if (idx === null) return null;
  if (comp.subtype === 'three_winding') {
    if (idx === 0) return 'primary';
    if (idx === 1) return 'secondary';
    if (idx === 2) return 'tertiary';
  }
  if (idx === 0) return 'primary';
  if (idx === 1) return 'secondary';
  if (idx === 2) return 'tertiary';
  return null;
}

function getTransformerConnectionSetting(comp, role) {
  if (!comp || !role) return null;
  const key = `${role}_connection`;
  const value = comp[key] ?? comp.props?.[key];
  return typeof value === 'string' ? value : null;
}

const ZERO_IMPEDANCE_TOLERANCE = 1e-9;

function isTransformerComponent(comp) {
  if (!comp) return false;
  if (comp.type === 'transformer') return true;
  const subtype = typeof comp.subtype === 'string' ? comp.subtype.toLowerCase() : '';
  return subtype.includes('transformer');
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

function toKVValue(value) {
  const num = parseNumeric(value);
  if (num === null) return null;
  return num > 100 ? num / 1000 : num;
}

function pickNestedValue(comp, key) {
  if (!comp || !key) return undefined;
  if (Object.prototype.hasOwnProperty.call(comp, key)) return comp[key];
  if (comp.props && Object.prototype.hasOwnProperty.call(comp.props, key)) return comp.props[key];
  if (comp.parameters && Object.prototype.hasOwnProperty.call(comp.parameters, key)) return comp.parameters[key];
  return undefined;
}

const transformerVoltageKeysByRole = {
  primary: ['volts_primary', 'voltage_primary', 'primary_voltage', 'volts_hv', 'voltage'],
  secondary: ['volts_secondary', 'voltage_secondary', 'secondary_voltage', 'volts_lv', 'voltage'],
  tertiary: ['volts_tv', 'volts_tertiary', 'tertiary_voltage', 'volts_lv', 'voltage']
};

const transformerKvaKeysByRole = {
  primary: ['kva_primary', 'kva_hv', 'kva'],
  secondary: ['kva_secondary', 'kva_lv', 'kva'],
  tertiary: ['kva_tertiary', 'kva_tv', 'kva']
};

const transformerMvaKeysByRole = {
  primary: ['mva_primary', 'mva_hv', 'mva'],
  secondary: ['mva_secondary', 'mva_lv', 'mva'],
  tertiary: ['mva_tertiary', 'mva_tv', 'mva']
};

const transformerPercentKeysByRole = {
  primary: ['percent_primary', 'percent_z', 'z_percent'],
  secondary: ['percent_secondary', 'percent_z', 'z_percent'],
  tertiary: ['percent_tertiary', 'percent_z', 'z_percent']
};

function getTransformerSideVoltage(comp, role) {
  const roleKeys = transformerVoltageKeysByRole[role] || [];
  const candidates = [...roleKeys, 'voltage', 'volts', 'baseKV'];
  for (const key of candidates) {
    const kv = toKVValue(pickNestedValue(comp, key));
    if (kv) return kv;
  }
  return null;
}

function getTransformerPercent(comp, role) {
  const roleKeys = transformerPercentKeysByRole[role] || [];
  const candidates = [...roleKeys, 'percent_z'];
  for (const key of candidates) {
    const percent = parseNumeric(pickNestedValue(comp, key));
    if (percent !== null) return percent;
  }
  return null;
}

function getTransformerKva(comp, role) {
  const kvaKeys = transformerKvaKeysByRole[role] || [];
  const kvaCandidates = [...kvaKeys, 'kva'];
  for (const key of kvaCandidates) {
    const kva = parseNumeric(pickNestedValue(comp, key));
    if (kva !== null) return kva;
  }
  const mvaKeys = transformerMvaKeysByRole[role] || [];
  const mvaCandidates = [...mvaKeys, 'mva'];
  for (const key of mvaCandidates) {
    const mva = parseNumeric(pickNestedValue(comp, key));
    if (mva !== null) return mva * 1000;
  }
  return null;
}

function getTransformerXr(comp) {
  const xr = parseNumeric(pickNestedValue(comp, 'xr_ratio'));
  return xr !== null ? xr : null;
}

function isZeroImpedance(impedance) {
  if (!impedance || typeof impedance !== 'object') return true;
  const r = parseNumeric(impedance.r) ?? 0;
  const x = parseNumeric(impedance.x) ?? 0;
  return Math.abs(r) < ZERO_IMPEDANCE_TOLERANCE && Math.abs(x) < ZERO_IMPEDANCE_TOLERANCE;
}

function normalizeImpedance(impedance) {
  if (!impedance || typeof impedance !== 'object') return { r: 0, x: 0 };
  const r = parseNumeric(impedance.r) ?? 0;
  const x = parseNumeric(impedance.x) ?? 0;
  return { r, x };
}

function determineSideKV(comp, role, bus) {
  const kv = role ? getTransformerSideVoltage(comp, role) : null;
  if (kv) return kv;
  if (bus && Number.isFinite(bus.baseKV) && bus.baseKV > 0) return bus.baseKV;
  const fallback = toKVValue(pickNestedValue(comp, 'voltage') ?? pickNestedValue(comp, 'volts'));
  return fallback ?? null;
}

function deriveTransformerImpedance(comp, fromRole, toRole, fromBus, toBus) {
  if (!isTransformerComponent(comp)) return null;
  const rolePriority = [];
  if (fromRole) rolePriority.push(fromRole);
  if (toRole && !rolePriority.includes(toRole)) rolePriority.push(toRole);
  rolePriority.push('primary', 'secondary', 'tertiary');
  let percent = null;
  for (const role of rolePriority) {
    percent = getTransformerPercent(comp, role);
    if (percent !== null) break;
  }
  if (percent === null) return null;
  let kva = null;
  for (const role of rolePriority) {
    kva = getTransformerKva(comp, role);
    if (kva !== null) break;
  }
  if (kva === null || kva === 0) return null;
  let kv = null;
  for (const role of rolePriority) {
    kv = getTransformerSideVoltage(comp, role);
    if (kv) break;
  }
  if (!kv) {
    const busCandidates = [fromBus, toBus];
    for (const bus of busCandidates) {
      if (bus && Number.isFinite(bus.baseKV) && bus.baseKV > 0) {
        kv = bus.baseKV;
        break;
      }
    }
  }
  if (!kv) return null;
  const baseMVA = kva / 1000;
  if (!baseMVA) return null;
  const baseZ = (kv * kv) / baseMVA;
  const zMag = baseZ * (percent / 100);
  const xr = getTransformerXr(comp);
  if (xr && Math.abs(xr) > 0.01) {
    const r = zMag / Math.sqrt(1 + xr * xr);
    return { r, x: r * xr };
  }
  const r = zMag * 0.1;
  const x = Math.sqrt(Math.max(zMag * zMag - r * r, 0)) || zMag;
  return { r, x };
}

function computeExistingTapRatio(tap) {
  if (tap === null || tap === undefined) return null;
  if (typeof tap === 'number') return Number.isFinite(tap) ? tap : null;
  if (typeof tap === 'object' && tap !== null) {
    const ratio = parseNumeric(tap.ratio);
    return ratio !== null ? ratio : null;
  }
  return null;
}

function deriveTransformerTap(comp, tap, fromRole, toRole, fromBus, toBus) {
  if (!isTransformerComponent(comp)) return tap;
  const fromKV = determineSideKV(comp, fromRole, fromBus);
  const toKV = determineSideKV(comp, toRole, toBus);
  if (!fromKV || !toKV || Math.abs(toKV) < 1e-9) return tap;
  const desiredRatio = fromKV / toKV;
  if (!Number.isFinite(desiredRatio) || desiredRatio <= 0) return tap;
  const existingRatio = computeExistingTapRatio(tap);
  if (existingRatio !== null && Math.abs(existingRatio - desiredRatio) < 1e-6) {
    return tap;
  }
  if (tap && typeof tap === 'object' && tap !== null) {
    return { ...tap, ratio: desiredRatio };
  }
  return { ratio: desiredRatio };
}

function toNumber(value, scale = 1) {
  const num = Number(value);
  return Number.isFinite(num) ? num * scale : 0;
}

function parseBooleanFlag(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return null;
    if (['true', 't', 'yes', 'y', '1', 'on'].includes(normalized)) return true;
    if (['false', 'f', 'no', 'n', '0', 'off'].includes(normalized)) return false;
  }
  return null;
}

function parsePowerFactorValue(raw) {
  if (raw === null || raw === undefined) return null;
  let value = raw;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.endsWith('%')) {
      value = trimmed.slice(0, -1);
    } else {
      value = trimmed;
    }
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric === 0) return null;
  let normalized = numeric;
  if (Math.abs(normalized) > 1) normalized /= 100;
  if (!Number.isFinite(normalized) || normalized === 0) return null;
  const magnitude = Math.abs(normalized);
  if (magnitude <= 0 || magnitude > 1) return null;
  const sign = normalized < 0 ? -1 : 1;
  return { magnitude, sign };
}

function extractPowerFactor(record) {
  if (!record || typeof record !== 'object') return null;
  const fields = [record.pf, record.power_factor, record.powerFactor];
  for (const raw of fields) {
    const parsed = parsePowerFactorValue(raw);
    if (parsed) return parsed;
  }
  return null;
}

function resolveReactiveSign(record, pfSign = 1) {
  let sign = pfSign < 0 ? -1 : 1;
  if (!record || typeof record !== 'object') return sign;
  const leadLagCandidates = [
    record.pf_lead_lag,
    record.pfLeadLag,
    record.power_factor_lead_lag,
    record.powerFactorLeadLag,
    record.leadLag,
    record.lead_lag,
    record.powerFactorMode,
    record.power_factor_mode,
    record.pf_mode,
    record.pfMode
  ];
  for (const candidate of leadLagCandidates) {
    if (typeof candidate !== 'string') continue;
    const normalized = candidate.trim().toLowerCase();
    if (!normalized) continue;
    if (normalized.includes('lead')) {
      sign = -1;
    } else if (normalized.includes('lag')) {
      sign = 1;
    }
  }
  const leadingFlags = [
    record.leading,
    record.isLeading,
    record.pf_leading,
    record.pfLeading,
    record.power_factor_leading,
    record.powerFactorLeading
  ];
  for (const flag of leadingFlags) {
    const parsed = parseBooleanFlag(flag);
    if (parsed === true) {
      sign = -1;
    }
  }
  const laggingFlags = [
    record.lagging,
    record.isLagging,
    record.pf_lagging,
    record.pfLagging,
    record.power_factor_lagging,
    record.powerFactorLagging
  ];
  for (const flag of laggingFlags) {
    const parsed = parseBooleanFlag(flag);
    if (parsed === true) {
      sign = 1;
    }
  }
  const signFields = [
    record.kvar_sign,
    record.kvarSign,
    record.q_sign,
    record.qSign,
    record.reactive_sign,
    record.reactiveSign
  ];
  for (const raw of signFields) {
    if (raw === null || raw === undefined) continue;
    if (typeof raw === 'string') {
      const normalized = raw.trim().toLowerCase();
      if (!normalized) continue;
      if (normalized === 'lead' || normalized === 'leading' || normalized === 'capacitive') {
        sign = -1;
        break;
      }
      if (normalized === 'lag' || normalized === 'lagging' || normalized === 'inductive') {
        sign = 1;
        break;
      }
    }
    const numeric = Number(raw);
    if (Number.isFinite(numeric) && numeric !== 0) {
      sign = numeric > 0 ? 1 : -1;
      break;
    }
  }
  return sign;
}

function isReactiveAuthoritative(record, directProvided) {
  if (!record || typeof record !== 'object') return directProvided;
  const authoritativeFlags = [
    record.kvar_authoritative,
    record.kvarAuthoritative,
    record.reactive_authoritative,
    record.reactiveAuthoritative,
    record.q_authoritative,
    record.qAuthoritative,
    record.kvar_locked,
    record.kvarLocked,
    record.reactive_locked,
    record.reactiveLocked,
    record.kvar_manual,
    record.kvarManual,
    record.q_manual,
    record.qManual
  ];
  for (const flag of authoritativeFlags) {
    const parsed = parseBooleanFlag(flag);
    if (parsed === true) return true;
    if (parsed === false) return false;
  }
  return directProvided;
}

function deriveReactiveFromPF(kw, record) {
  const pf = extractPowerFactor(record);
  if (!pf) return 0;
  const kwAbs = Math.abs(Number(kw) || 0);
  if (!kwAbs) return 0;
  const kva = kwAbs / pf.magnitude;
  const kvarMag = Math.sqrt(Math.max(0, kva * kva - kwAbs * kwAbs));
  if (!kvarMag) return 0;
  const sign = resolveReactiveSign(record, pf.sign);
  return kvarMag * sign;
}

function addPQ(target, addition) {
  if (!addition) return target;
  const out = target && typeof target === 'object' ? { ...target } : {};
  if (addition.kw !== undefined) out.kw = toNumber(out.kw) + addition.kw;
  if (addition.kvar !== undefined) out.kvar = toNumber(out.kvar) + addition.kvar;
  return out;
}

function extractPQ(source) {
  if (source === null || source === undefined) return null;
  if (typeof source === 'number') {
    const kw = toNumber(source);
    return kw ? { kw, kvar: 0 } : null;
  }
  if (Array.isArray(source)) {
    return source.reduce((acc, item) => addPQ(acc, extractPQ(item)), null);
  }
  if (typeof source !== 'object') return null;
  let kw = toNumber(source.kw ?? source.kW ?? source.P ?? source.p);
  kw += toNumber(source.watts, 0.001);
  kw += toNumber(source.hp, 0.746);
  const directKvar = source.kvar ?? source.kVAr ?? source.Q ?? source.q;
  const kvarProvided = directKvar !== undefined;
  const kvarAuthoritative = isReactiveAuthoritative(source, kvarProvided);
  let kvar = 0;
  if (kvarProvided && kvarAuthoritative) {
    kvar += toNumber(directKvar);
  }
  if ((!kvarAuthoritative || !kvarProvided) && kw) {
    const derived = deriveReactiveFromPF(kw, source);
    if (derived) kvar += derived;
  }
  if (!kw && !kvar) {
    let nested = null;
    Object.keys(source).forEach(key => {
      const child = source[key];
      if (!child || typeof child !== 'object') return;
      const pq = extractPQ(child);
      if (pq) nested = addPQ(nested, pq);
    });
    if (nested) return nested;
  }
  if (!kw && !kvar) return null;
  return { kw, kvar };
}

function isLoadDevice(comp) {
  const type = String(comp?.type || '').toLowerCase();
  const subtype = String(comp?.subtype || '').toLowerCase();
  return type.includes('load') || subtype.includes('load');
}

function isGeneratorDevice(comp) {
  const type = String(comp?.type || '').toLowerCase();
  const subtype = String(comp?.subtype || '').toLowerCase();
  return type.includes('generator') || subtype.includes('generator') || type.includes('source');
}

function extractLoadPQ(comp) {
  const rawSources = [comp?.load, comp?.props?.load, comp?.parameters?.load];
  const seenRefs = new Set();
  const seenValues = new Set();
  const sources = [];
  rawSources.forEach(src => {
    if (src === null || src === undefined) return;
    if (typeof src === 'object') {
      if (seenRefs.has(src)) return;
      seenRefs.add(src);
      let signature = null;
      try {
        signature = JSON.stringify(src);
      } catch (err) {
        signature = null;
      }
      if (signature && seenValues.has(signature)) return;
      if (signature) seenValues.add(signature);
      sources.push(src);
      return;
    }
    const signature = `${typeof src}:${src}`;
    if (seenValues.has(signature)) return;
    seenValues.add(signature);
    sources.push(src);
  });
  let total = null;
  sources.forEach(src => {
    const pq = extractPQ(src);
    if (pq) total = addPQ(total, pq);
  });
  if (!total && isLoadDevice(comp)) {
    let kw = 0;
    let kvar = 0;
    kw += toNumber(comp?.kw ?? comp?.kW);
    kw += toNumber(comp?.watts, 0.001);
    kw += toNumber(comp?.hp, 0.746);
    const directKvar = comp?.kvar ?? comp?.kVAr;
    const kvarProvided = directKvar !== undefined;
    const kvarAuthoritative = isReactiveAuthoritative(comp, kvarProvided);
    if (kvarProvided && kvarAuthoritative) {
      kvar += toNumber(directKvar);
    }
    if ((!kvarAuthoritative || !kvarProvided) && kw) {
      const derived = deriveReactiveFromPF(kw, comp);
      if (derived) kvar += derived;
    }
    if (kw || kvar) total = addPQ(total, { kw, kvar });
  }
  return total;
}

function extractGenerationPQ(comp) {
  const sources = [comp?.generation, comp?.props?.generation, comp?.parameters?.generation];
  let total = null;
  sources.forEach(src => {
    const pq = extractPQ(src);
    if (pq) total = addPQ(total, pq);
  });
  if (!total && isGeneratorDevice(comp)) {
    let kw = toNumber(comp?.kw ?? comp?.kW ?? comp?.power_kw ?? comp?.output_kw);
    let kvar = toNumber(comp?.kvar ?? comp?.kVAr ?? comp?.reactive_kw);
    if (!kw) {
      const kva = toNumber(comp?.kva ?? comp?.kVA) + toNumber(comp?.mva ?? comp?.MVA, 1000);
      const pf = Number(comp?.pf ?? comp?.power_factor ?? comp?.powerFactor);
      if (kva && Number.isFinite(pf) && pf !== 0) {
        kw = kva * pf;
        if (!kvar) {
          const kvarMag = Math.sqrt(Math.max(0, kva * kva - kw * kw));
          kvar = kvarMag;
        }
      }
    }
    if (kw || kvar) total = addPQ(total, { kw, kvar });
  }
  return total;
}

function findDirectBusId(comp, busMap) {
  const connections = Array.isArray(comp?.connections) ? comp.connections : [];
  for (const conn of connections) {
    const target = typeof conn === 'string' ? conn : conn?.target;
    if (target && busMap.has(target)) return target;
  }
  return null;
}

function findNearestBusId(comp, busMap, adjacency) {
  if (!comp || !comp.id) return null;
  const direct = findDirectBusId(comp, busMap);
  if (direct) return direct;
  if (!adjacency) return null;
  const visited = new Set([comp.id]);
  const queue = [{ id: comp.id, depth: 0 }];
  const maxDepth = 3;
  while (queue.length) {
    const { id, depth } = queue.shift();
    if (depth >= maxDepth) continue;
    const neighbors = adjacency.get(id);
    if (!neighbors) continue;
    for (const neighbor of neighbors) {
      if (visited.has(neighbor)) continue;
      if (busMap.has(neighbor)) return neighbor;
      visited.add(neighbor);
      queue.push({ id: neighbor, depth: depth + 1 });
    }
  }
  return null;
}

export function isBusComponent(comp) {
  if (!comp) return false;
  if (comp.type === 'bus' || comp.subtype === 'Bus') return true;
  const subtype = typeof comp.subtype === 'string' ? comp.subtype : '';
  const type = typeof comp.type === 'string' ? comp.type : '';
  const metaType = componentTypeBySubtype.get(subtype)
    || componentTypeBySubtype.get(compKey(type, subtype))
    || componentTypeBySubtype.get(type);
  return metaType === 'bus';
}

const BRANCH_KEYWORDS = [
  'cable',
  'feeder',
  'conductor',
  'transformer',
  'breaker',
  'switch',
  'recloser',
  'disconnect',
  'busway',
  'link',
  'line',
  'sectionalizer',
  'tie',
  'reactor',
  'capacitor',
  'impedance'
];

function isBranchDevice(comp) {
  if (!comp || typeof comp !== 'object') return false;
  if (isBusComponent(comp)) return false;
  const type = String(comp.type || '').toLowerCase();
  const subtype = String(comp.subtype || '').toLowerCase();
  if (type.includes('load') || subtype.includes('load')) return false;
  if (BRANCH_KEYWORDS.some(keyword => type.includes(keyword) || subtype.includes(keyword))) {
    return true;
  }
  if (comp.cable || comp.impedance || comp.seriesImpedance) return true;
  if (Array.isArray(comp.connections) && comp.connections.length > 1) {
    return true;
  }
  return false;
}

export function cloneData(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map(cloneData);
  }
  if (typeof value === 'object') {
    const out = {};
    Object.keys(value).forEach(key => {
      const val = value[key];
      if (val !== undefined) out[key] = cloneData(val);
    });
    return out;
  }
  return value;
}

function extractImpedance(comp) {
  const candidates = [
    comp?.impedance,
    comp?.seriesImpedance,
    comp?.cable?.impedance,
    comp?.cable,
    comp?.props?.impedance,
    comp?.parameters?.impedance
  ];
  for (const cand of candidates) {
    if (cand && typeof cand === 'object') return normalizeImpedance(cand);
  }
  if (typeof comp?.r === 'number' || typeof comp?.x === 'number') {
    return normalizeImpedance({ r: comp.r, x: comp.x });
  }
  return { r: 0, x: 0 };
}

function normalizeSheets(sheets = []) {
  if (!Array.isArray(sheets)) {
    return { components: [], connections: [] };
  }
  if (Array.isArray(sheets[0]?.components)) {
    const components = [];
    const connections = [];
    sheets.forEach(sheet => {
      if (Array.isArray(sheet?.components)) components.push(...sheet.components);
      if (Array.isArray(sheet?.connections)) connections.push(...sheet.connections);
    });
    return { components, connections };
  }
  return { components: sheets, connections: [] };
}

function cloneBusComponent(comp) {
  const clone = { ...comp };
  clone.connections = Array.isArray(comp.connections)
    ? comp.connections.map(conn => ({ ...conn }))
    : [];
  const base = resolveBusBaseKV(comp);
  if (Number.isFinite(base) && base > 0) {
    clone.baseKV = base;
  } else if (!Number.isFinite(clone.baseKV) || clone.baseKV <= 0) {
    clone.baseKV = 0.48;
  }
  return clone;
}

function resolveBusBaseKV(comp) {
  if (!comp || typeof comp !== 'object') return null;
  const direct = [
    comp.baseKV,
    comp.kV,
    comp.kv,
    comp.nominalVoltage,
    comp.nominal_voltage,
    comp.prefault_voltage,
    comp.voltage,
    comp.volts,
    comp.props?.baseKV,
    comp.props?.voltage,
    comp.parameters?.baseKV,
    comp.parameters?.voltage
  ];
  for (const candidate of direct) {
    const base = toBaseKV(candidate);
    if (Number.isFinite(base) && base > 0) return base;
  }
  const volts = normalizeVoltageToVolts(comp?.props?.operating_voltage ?? comp?.cable?.operating_voltage);
  if (Number.isFinite(volts) && volts > 0) return volts / 1000;
  return null;
}

function registerConnection(map, from, to) {
  if (!from || !to) return;
  if (!map.has(from)) map.set(from, new Set());
  map.get(from).add(to);
}

export function buildLoadFlowModel(oneLine = {}) {
  const { sheets } = oneLine;
  const { components, connections } = normalizeSheets(sheets);
  const adjacency = new Map();

  components.forEach(comp => {
    const connList = Array.isArray(comp?.connections) ? comp.connections : [];
    connList.forEach(conn => {
      const target = typeof conn === 'string' ? conn : conn?.target;
      if (!target) return;
      registerConnection(adjacency, comp.id, target);
      registerConnection(adjacency, target, comp.id);
    });
  });
  connections.forEach(link => {
    if (!link) return;
    registerConnection(adjacency, link.from, link.to);
    registerConnection(adjacency, link.to, link.from);
  });

  let buses = components.filter(isBusComponent).map(cloneBusComponent);
  if (buses.length === 0) {
    buses = components.map(cloneBusComponent);
  }
  const busMap = new Map(buses.map(b => [b.id, b]));

  components.forEach(comp => {
    if (!comp || isBusComponent(comp) || typeof comp.busType === 'string' && comp.busType) return;
    const busId = findDirectBusId(comp, busMap) || findNearestBusId(comp, busMap, adjacency);
    if (!busId) return;
    const bus = busMap.get(busId);
    if (!bus) return;
    const load = extractLoadPQ(comp);
    if (load) bus.load = addPQ(bus.load, load);
    const gen = extractGenerationPQ(comp);
    if (gen) bus.generation = addPQ(bus.generation, gen);
  });

  const branches = [];
  components.forEach(comp => {
    if (!isBranchDevice(comp)) return;
    const connList = Array.isArray(comp.connections) ? comp.connections : [];
    const detailMap = new Map();
    let nextDetailOrder = 0;
    const registerTargetDetail = (targetId, entry) => {
      if (!targetId || !busMap.has(targetId)) return null;
      if (!detailMap.has(targetId)) {
        detailMap.set(targetId, {
          targetId,
          entry: null,
          portIndex: null,
          role: null,
          order: nextDetailOrder++
        });
      }
      const detail = detailMap.get(targetId);
      if (entry && typeof entry === 'object') {
        if (!detail.entry) detail.entry = entry;
        const portIndex = normalizePortIndex(entry.sourcePort);
        if (portIndex !== null) {
          if (detail.portIndex === null) detail.portIndex = portIndex;
          const role = getTransformerPortRole(comp, portIndex);
          if (!detail.role && role) detail.role = role;
        }
      }
      return detail;
    };
    connList.forEach(conn => {
      const target = typeof conn === 'string' ? conn : conn?.target;
      if (!target) return;
      registerTargetDetail(target, typeof conn === 'object' ? conn : null);
    });
    if (detailMap.size < 2) {
      const neighborSet = adjacency.get(comp.id);
      if (neighborSet) {
        neighborSet.forEach(n => {
          registerTargetDetail(n, null);
        });
      }
    }
    if (detailMap.size < 2) return;
    const targetDetails = Array.from(detailMap.values());
    const getDetailBaseKV = detail => {
      if (!detail) return null;
      const bus = busMap.get(detail.targetId);
      if (bus && Number.isFinite(bus.baseKV) && bus.baseKV > 0) return bus.baseKV;
      return null;
    };
    let baseDetail = null;
    if (isTransformerComponent(comp)) {
      baseDetail = targetDetails.find(detail => detail.role === 'primary') || null;
    }
    if (!baseDetail) {
      baseDetail = targetDetails.reduce((best, detail) => {
        if (!best) return detail;
        const bestKV = getDetailBaseKV(best);
        const detailKV = getDetailBaseKV(detail);
        const bestScore = Number.isFinite(bestKV) ? bestKV : -Infinity;
        const detailScore = Number.isFinite(detailKV) ? detailKV : -Infinity;
        if (detailScore > bestScore) return detail;
        if (detailScore === bestScore && best && detail.order < best.order) {
          return detail;
        }
        return best;
      }, null);
    }
    if (!baseDetail) baseDetail = targetDetails[0];
    if (!baseDetail) return;
    const baseOrder = baseDetail ? baseDetail.order : 0;
    const otherDetails = targetDetails.filter(detail => detail !== baseDetail);
    const orientPair = (detailA, detailB) => {
      if (isTransformerComponent(comp)) {
        if (detailA?.role === 'primary' && detailB?.role !== 'primary') {
          return { fromDetail: detailA, toDetail: detailB };
        }
        if (detailB?.role === 'primary' && detailA?.role !== 'primary') {
          return { fromDetail: detailB, toDetail: detailA };
        }
      }
      const kvA = getDetailBaseKV(detailA);
      const kvB = getDetailBaseKV(detailB);
      const scoreA = Number.isFinite(kvA) ? kvA : -Infinity;
      const scoreB = Number.isFinite(kvB) ? kvB : -Infinity;
      if (scoreA > scoreB) return { fromDetail: detailA, toDetail: detailB };
      if (scoreB > scoreA) return { fromDetail: detailB, toDetail: detailA };
      const orderA = detailA ? detailA.order : baseOrder;
      const orderB = detailB ? detailB.order : baseOrder;
      if (orderA <= orderB) return { fromDetail: detailA, toDetail: detailB };
      return { fromDetail: detailB, toDetail: detailA };
    };
    otherDetails.forEach(detail => {
      const { fromDetail, toDetail } = orientPair(baseDetail, detail);
      if (!fromDetail || !toDetail) return;
      const fromId = fromDetail.targetId;
      const toId = toDetail.targetId;
      const fromBus = busMap.get(fromId);
      const toBus = busMap.get(toId);
      if (!fromBus || !toBus) return;
      const fromConnectionEntry = typeof fromDetail.entry === 'object' ? fromDetail.entry : null;
      const toConnectionEntry = typeof toDetail.entry === 'object' ? toDetail.entry : null;
      const fromPortIndex = fromDetail.portIndex;
      const toPortIndex = toDetail.portIndex;
      const fromSide = getTransformerPortRole(comp, fromPortIndex);
      const toSide = getTransformerPortRole(comp, toPortIndex);
      const baseImpedance = extractImpedance(comp);
      let impedance = cloneData(baseImpedance);
      if (isTransformerComponent(comp) && isZeroImpedance(impedance)) {
        const derived = deriveTransformerImpedance(comp, fromSide, toSide, fromBus, toBus);
        if (derived) {
          impedance = cloneData(derived);
        }
      }
      let tap = cloneData(comp.tap);
      tap = deriveTransformerTap(comp, tap, fromSide, toSide, fromBus, toBus);
      const shunt = cloneData(comp.shunt);
      const rating = comp.rating ?? comp.ampacity ?? comp.currentRating;
      const phases = comp.phases ? cloneData(comp.phases) : undefined;
      const componentName = typeof comp.name === 'string' ? comp.name : undefined;
      const componentLabel = typeof comp.label === 'string' ? comp.label : undefined;
      const componentRef = typeof comp.ref === 'string' ? comp.ref : undefined;
      const branch = {
        id: comp.id,
        type: comp.type,
        subtype: comp.subtype,
        from: fromId,
        to: toId,
        impedance,
        tap,
        shunt,
        rating,
        phases,
        name: componentName,
        label: componentLabel,
        ref: componentRef
      };
      branches.push(branch);
      if (fromBus) {
        if (!Array.isArray(fromBus.connections)) fromBus.connections = [];
        const exists = fromBus.connections.some(conn => conn.target === toId && (conn.componentId || conn.id) === comp.id);
        if (!exists) {
          const connectionEntry = toConnectionEntry;
          const portIndex = toPortIndex;
          const connectionSide = toSide;
          const connectionConfig = connectionSide ? getTransformerConnectionSetting(comp, connectionSide) : null;
          const busConn = {
            target: toId,
            impedance: cloneData(branch.impedance),
            tap: branch.tap ? cloneData(branch.tap) : undefined,
            shunt: branch.shunt ? cloneData(branch.shunt) : undefined,
            rating: branch.rating,
            phases,
            componentId: comp.id,
            componentType: comp.type,
            componentSubtype: comp.subtype,
            componentName,
            componentLabel,
            componentRef,
            componentPort: portIndex,
            connectionSide,
            connectionConfig
          };
          fromBus.connections.push(busConn);
        }
      }
    });
  });

  return { buses, branches };
}
