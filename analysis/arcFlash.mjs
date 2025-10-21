import { runShortCircuit } from './shortCircuit.mjs';
import { scaleCurve } from './tccUtils.js';
import { getOneLine, getItem } from '../dataStore.mjs';

let deviceCache = null;

const PROTECTIVE_TYPES = new Set(['breaker', 'fuse', 'relay', 'recloser', 'contactor', 'switch']);
const FALLBACK_TYPES = new Set(['motor_load', 'static_load', 'load', 'panel', 'equipment', 'bus', 'cable', 'mcc']);
const UPSTREAM_CANDIDATE_TYPES = new Set([
  'transformer',
  'panel',
  'equipment',
  'bus',
  'utility_source',
  'generator',
  'pv_inverter',
  'mcc',
  'feeder',
  'breaker',
  'fuse',
  'relay',
  'recloser',
  'contactor',
  'switch'
]);

function parseNumeric(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const match = value.replace(/[\,\s]+/g, ' ').match(/[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/);
    if (!match) return null;
    const num = Number.parseFloat(match[0]);
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

function pickValue(comp, ...keys) {
  if (!comp) return undefined;
  for (const key of keys) {
    if (!key) continue;
    if (Object.prototype.hasOwnProperty.call(comp, key)) {
      return comp[key];
    }
    if (comp.props && typeof comp.props === 'object' && Object.prototype.hasOwnProperty.call(comp.props, key)) {
      return comp.props[key];
    }
  }
  return undefined;
}

function toVolts(raw, key = '') {
  const num = parseNumeric(raw);
  if (num === null) return null;
  const lowerKey = typeof key === 'string' ? key.toLowerCase() : '';
  if (lowerKey.includes('kv')) return num * 1000;
  if (num <= 1) return num * 1000;
  if (num > 1000) return num;
  if (lowerKey.includes('volts')) return num;
  if (num > 300) return num;
  if (num > 10 && lowerKey.includes('voltage')) return num;
  return num * 1000;
}

function resolveVoltage(comp) {
  const candidates = [
    'voltage',
    'volts',
    'volts_primary',
    'volts_secondary',
    'volts_hv',
    'volts_lv',
    'volts_tv',
    'source_voltage_base',
    'kV',
    'kv',
    'baseKV',
    'prefault_voltage',
    'nominal_voltage'
  ];
  for (const key of candidates) {
    const val = pickValue(comp, key);
    if (val === undefined) continue;
    const volts = toVolts(val, key);
    if (Number.isFinite(volts) && volts > 0) return volts;
  }
  return null;
}

function computeApproachDistances(voltage) {
  if (!Number.isFinite(voltage) || voltage <= 50) {
    return { limited: null, restricted: null };
  }
  const table = [
    { min: 50, max: 150, limited: 1067, restricted: null },
    { min: 151, max: 750, limited: 1067, restricted: 305 },
    { min: 751, max: 15000, limited: 1524, restricted: 432 },
    { min: 15001, max: 36000, limited: 1829, restricted: 660 },
    { min: 36001, max: 46000, limited: 2438, restricted: 787 },
    { min: 46001, max: 72500, limited: 3048, restricted: 914 }
  ];
  const row = table.find(entry => voltage >= entry.min && voltage <= entry.max);
  if (!row) return { limited: null, restricted: null };
  return { limited: row.limited, restricted: row.restricted };
}

function resolveEquipmentTag(comp) {
  return comp?.tag || comp?.ref || comp?.label || comp?.name || comp?.id || '';
}

function buildParentIndex(comps = []) {
  const compMap = new Map();
  const directParents = new Map();
  comps.forEach(comp => {
    if (!comp?.id) return;
    compMap.set(comp.id, comp);
  });
  comps.forEach(comp => {
    (comp.connections || []).forEach(conn => {
      const targetId = conn?.target;
      if (!targetId || !compMap.has(targetId)) return;
      if (!directParents.has(targetId)) directParents.set(targetId, []);
      directParents.get(targetId).push({ component: comp, connection: conn, reversed: false });
    });
  });
  return { compMap, directParents };
}

function createProtectiveResolver(comps = []) {
  const { compMap, directParents } = buildParentIndex(comps);
  const cache = new Map();

  function getParents(component) {
    const direct = directParents.get(component.id);
    if (direct && direct.length) return direct;
    if (!FALLBACK_TYPES.has(component.type)) return [];
    const parents = [];
    (component.connections || []).forEach(conn => {
      const target = compMap.get(conn?.target);
      if (!target) return;
      if (!UPSTREAM_CANDIDATE_TYPES.has(target.type) && target.type !== 'transformer') return;
      parents.push({ component: target, connection: conn, reversed: true });
    });
    return parents;
  }

  function visit(component, stack = new Set()) {
    if (!component?.id) return null;
    if (cache.has(component.id)) return cache.get(component.id);
    if (stack.has(component.id)) {
      cache.set(component.id, null);
      return null;
    }
    stack.add(component.id);
    let result = null;
    if (component?.tccId) {
      result = component;
    } else {
      const parents = getParents(component);
      for (const parent of parents) {
        result = visit(parent.component, stack);
        if (result) break;
      }
    }
    stack.delete(component.id);
    cache.set(component.id, result || null);
    return result;
  }

  return {
    findNearest(component) {
      if (!component) return null;
      const target = typeof component === 'string' ? compMap.get(component) : component;
      if (!target) return null;
      return visit(target);
    }
  };
}

function formatProtectiveDeviceName(protectiveComp, device) {
  if (!protectiveComp) return 'Not Specified';
  if (device?.name) return device.name;
  if (device?.vendor) return `${device.vendor} ${device.id}`;
  const tag = resolveEquipmentTag(protectiveComp);
  if (tag) return tag;
  if (protectiveComp.tccId) return protectiveComp.tccId;
  return 'Not Specified';
}

async function loadDevices() {
  if (deviceCache) return deviceCache;
  try {
    const mod = await import('../data/protectiveDevices.mjs');
    deviceCache = mod.default || mod;
  } catch (err) {
    console.error('Protective device library failed to load', err);
    if (typeof window !== 'undefined') {
      const diag = {
        userAgent: navigator.userAgent,
        dynamicImport: (() => {
          try { new Function('import("")'); return true; } catch { return false; }
        })()
      };
      console.info('Diagnostics:', diag);
      console.info('Consider updating your browser or adding polyfills for missing features.');
      if (typeof window.showToast === 'function') {
        window.showToast('Protective device library failed to load', 'error', JSON.stringify(diag));
      } else if (typeof alert === 'function') {
        alert('Protective device library failed to load');
      } else if (typeof document !== 'undefined') {
        const banner = document.createElement('div');
        banner.className = 'message error';
        banner.textContent = 'Protective device library failed to load';
        document.body.prepend(banner);
      }
    }
    deviceCache = [];
  }
  return deviceCache;
}

function interpolateTime(curve = [], currentA) {
  if (!curve.length) return 0.2;
  curve.sort((a, b) => a.current - b.current);
  if (currentA <= curve[0].current) return curve[0].time;
  for (let i = 0; i < curve.length - 1; i++) {
    const p1 = curve[i];
    const p2 = curve[i + 1];
    if (currentA >= p1.current && currentA <= p2.current) {
      const frac = (currentA - p1.current) / (p2.current - p1.current);
      return p1.time + frac * (p2.time - p1.time);
    }
  }
  return curve[curve.length - 1].time;
}

function clearingTime(comp, Ibf, devices, protectiveComp, scResults, protectiveDevice) {
  const compClearing = parseNumeric(comp?.clearing_time);
  if (compClearing !== null) return compClearing;
  if (protectiveComp && protectiveComp !== comp) {
    const protectiveClearing = parseNumeric(protectiveComp.clearing_time);
    if (protectiveClearing !== null) return protectiveClearing;
  }
  const deviceComp = protectiveComp || comp;
  if (!deviceComp?.tccId) return 0.2;
  const dev = protectiveDevice || devices.find(d => d.id === deviceComp.tccId);
  if (!dev) return 0.2;
  const saved = getItem('tccSettings', { devices: [], settings: {}, componentOverrides: {} });
  const deviceOverride = saved.settings?.[dev.id] || {};
  const componentOverride = saved.componentOverrides?.[deviceComp.id] || {};
  const inlineOverride = deviceComp.tccOverrides && typeof deviceComp.tccOverrides === 'object'
    ? deviceComp.tccOverrides
    : {};
  const overrides = { ...deviceOverride, ...componentOverride, ...inlineOverride };
  const scaled = scaleCurve(dev, overrides);
  const settings = scaled.settings || {};
  const upstreamKA = Number.isFinite(scResults?.[deviceComp.id]?.threePhaseKA)
    ? scResults[deviceComp.id].threePhaseKA
    : Number.isFinite(Ibf) && Ibf > 0
      ? Ibf
      : 0.001;
  const effectiveKA = upstreamKA > 0 ? upstreamKA : 0.001;
  if (settings.instantaneous && effectiveKA * 1000 >= settings.instantaneous) {
    return Math.max(settings.instantaneousDelay || 0.01, 0.005);
  }
  return interpolateTime(scaled.curve || [], effectiveKA * 1000);
}

// IEEE 1584‑2018 arcing current model
function arcingCurrent(Ibf, V, gap, cfg, enclosure) {
  const configK = {
    VCB: -0.153,
    VCBB: -0.097,
    HCB: -0.113,
    VOA: -0.180,
    HOA: -0.290
  };
  const k = configK[cfg] || configK.VCB;
  const eAdj = enclosure === 'open' ? -0.113 : 0;
  const logIa = k + eAdj + 0.662 * Math.log10(Ibf || 0.001) +
    0.0966 * V + 0.000526 * gap + 0.5588 * V * Math.log10(Ibf || 0.001);
  return Math.pow(10, logIa);
}

/**
 * Compute incident energy using IEEE 1584-2018 style equations.
 * Considers enclosure size, gap, working distance and protective device
 * clearing time. Returns a map id ->
 * { incidentEnergy, boundary, ppeCategory, clearingTime } where energy is
 * in cal/cm^2 and boundary in millimeters.
 */
export async function runArcFlash(options = {}) {
  const devices = await loadDevices();
  const studyDate = new Date().toISOString().split('T')[0];
  let scOptions = {};
  if (options && typeof options === 'object') {
    if (options.shortCircuit && typeof options.shortCircuit === 'object') {
      scOptions = options.shortCircuit;
    } else if (Object.prototype.hasOwnProperty.call(options, 'method')) {
      scOptions = options;
    }
  }
  const sc = runShortCircuit(scOptions);
  const { sheets } = getOneLine();
  const comps = (Array.isArray(sheets[0]?.components)
    ? sheets.flatMap(s => s.components)
    : sheets).filter(c => c && c.type !== 'annotation' && c.type !== 'dimension');
  const protection = createProtectiveResolver(comps);
  const results = {};
  comps.forEach(comp => {
    const fault = sc[comp.id];
    const Ibf = Number.isFinite(fault?.threePhaseKA) ? fault.threePhaseKA : 0;
    const protectiveComp = protection.findNearest(comp);
    const protectiveDevice = protectiveComp ? devices.find(d => d.id === protectiveComp.tccId) : null;
    const enclosure = (comp.enclosure || 'box').toLowerCase();
    const Cf = enclosure === 'open' ? 1 : 1.5;
    const gap = Number(comp.gap) || 25;
    const dist = Number(comp.working_distance) || 455;
    const h = Number(comp.enclosure_height || comp.box_height) || 508;
    const w = Number(comp.enclosure_width || comp.box_width) || 508;
    const de = Number(comp.enclosure_depth || comp.box_depth) || 508;
    const sizeFactor = Math.cbrt((h * w * de) / (508 * 508 * 508)) || 1;
    const time = clearingTime(comp, Ibf, devices, protectiveComp, sc, protectiveDevice);
    const cfg = (comp.electrode_config || 'VCB').toUpperCase();
    const V = Number(comp.kV || comp.baseKV || comp.prefault_voltage || 0.48);
    const Ia = arcingCurrent(Ibf, V, gap, cfg, enclosure);
    let energy = 1.6 * Cf * sizeFactor * Math.pow(Ia, 1.2) * time * (gap / 25) * Math.pow(610 / dist, 2);
    const boundary = dist * Math.sqrt(energy / 1.2);
    let ppe = 0;
    if (energy > 1.2) ppe = 1;
    if (energy > 4) ppe = 2;
    if (energy > 8) ppe = 3;
    if (energy > 25) ppe = 4;
    if (energy > 40) ppe = 5;
    const voltage = resolveVoltage(comp);
    const approaches = computeApproachDistances(voltage);
    results[comp.id] = {
      incidentEnergy: Number(energy.toFixed(2)),
      boundary: Number(boundary.toFixed(1)),
      ppeCategory: ppe,
      clearingTime: Number(time.toFixed(3)),
      nominalVoltage: voltage,
      workingDistance: Number(dist.toFixed(1)),
      limitedApproach: approaches.limited,
      restrictedApproach: approaches.restricted,
      equipmentTag: resolveEquipmentTag(comp),
      upstreamDevice: formatProtectiveDeviceName(protectiveComp, protectiveDevice),
      studyDate
    };
  });
  return results;
}

