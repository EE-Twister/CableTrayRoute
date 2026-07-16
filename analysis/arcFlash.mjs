import { runShortCircuit } from './shortCircuit.mjs';
import { scaleCurve } from './tccUtils.js';
import { getOneLine, getItem } from '../dataStore.mjs';
import { showAlertModal } from '../src/components/modal.js';
import {
  arcingCurrents,
  incidentEnergy,
  withinModelRange,
  ELECTRODE_CONFIGS,
} from './ieee1584.mjs';

let deviceCache = null;

const PROTECTIVE_TYPES = new Set(['breaker', 'fuse', 'relay', 'recloser', 'contactor', 'switch']);
function isProtectiveComponent(component) {
  if (!component || typeof component !== 'object') return false;
  const category = typeof component.category === 'string' ? component.category.toLowerCase() : '';
  if (category === 'protection') return true;
  const subtype = typeof component.subtype === 'string' ? component.subtype.toLowerCase() : '';
  if (PROTECTIVE_TYPES.has(subtype)) return true;
  if (!component.type) return true;
  const type = typeof component.type === 'string' ? component.type.toLowerCase() : '';
  if (PROTECTIVE_TYPES.has(type)) return true;
  return false;
}
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

function firstParsedNumeric(...values) {
  for (const value of values) {
    const parsed = parseNumeric(value);
    if (parsed !== null) return parsed;
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

  function visit(component) {
    if (!component?.id) return null;
    if (cache.has(component.id)) return cache.get(component.id);

    const stack = [];
    const active = new Set();
    stack.push({ component, entered: false, parents: [], index: 0, result: null });

    while (stack.length) {
      const frame = stack[stack.length - 1];
      const current = frame.component;
      const currentId = current?.id;

      if (!currentId) {
        stack.pop();
        continue;
      }

      if (!frame.entered) {
        if (cache.has(currentId)) {
          const cached = cache.get(currentId);
          stack.pop();
          if (cached && stack.length && !stack[stack.length - 1].result) {
            stack[stack.length - 1].result = cached;
          }
          continue;
        }

        if (active.has(currentId)) {
          cache.set(currentId, null);
          stack.pop();
          continue;
        }

        frame.entered = true;
        active.add(currentId);

        if (current?.tccId && isProtectiveComponent(current)) {
          frame.result = current;
        } else {
          frame.parents = getParents(current);
        }
      }

      if (frame.result || frame.index >= frame.parents.length) {
        active.delete(currentId);
        cache.set(currentId, frame.result || null);
        stack.pop();

        if (frame.result && stack.length && !stack[stack.length - 1].result) {
          stack[stack.length - 1].result = frame.result;
        }
        continue;
      }

      const nextParent = frame.parents[frame.index++]?.component;
      const nextId = nextParent?.id;
      if (!nextId) continue;

      if (cache.has(nextId)) {
        const cached = cache.get(nextId);
        if (cached) frame.result = cached;
        continue;
      }

      if (active.has(nextId)) {
        cache.set(nextId, null);
        continue;
      }

      stack.push({ component: nextParent, entered: false, parents: [], index: 0, result: null });
    }

    return cache.get(component.id) || null;
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
      } else {
        showAlertModal('Library Error', 'Protective device library failed to load. Arc flash analysis may be unavailable.');
      }
    }
    const loadErr = new Error('Protective device library failed to load');
    loadErr.cause = err;
    throw loadErr;
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

// Determine the protective device clearing time. Per IEEE 1584-2018 the device
// is evaluated at the ARCING current (evalKA), not the bolted fault current —
// the arc current is lower, so it generally clears more slowly.
function clearingTime(comp, evalKA, devices, protectiveComp, scResults, protectiveDevice) {
  const compClearing = parseNumeric(pickValue(comp, 'clearing_time'));
  if (compClearing !== null) return compClearing;
  if (protectiveComp && protectiveComp !== comp) {
    const protectiveClearing = parseNumeric(pickValue(protectiveComp, 'clearing_time'));
    if (protectiveClearing !== null) return protectiveClearing;
  }
  const deviceComp = protectiveComp || comp;
  if (!deviceComp?.tccId || !isProtectiveComponent(deviceComp)) return 0.2;
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
  const downstreamKA = Number.isFinite(evalKA) && evalKA > 0
    ? evalKA
    : Number.isFinite(scResults?.[comp.id]?.threePhaseKA) && scResults[comp.id].threePhaseKA > 0
      ? scResults[comp.id].threePhaseKA
      : 0;
  const deviceKA = Number.isFinite(scResults?.[deviceComp.id]?.threePhaseKA) && scResults[deviceComp.id].threePhaseKA > 0
    ? scResults[deviceComp.id].threePhaseKA
    : 0;
  const effectiveKA = deviceComp !== comp && downstreamKA > 0
    ? downstreamKA
    : deviceKA > 0
      ? deviceKA
      : downstreamKA > 0
        ? downstreamKA
        : 0.001;
  if (settings.instantaneous && effectiveKA * 1000 >= settings.instantaneous) {
    return Math.max(settings.instantaneousDelay || 0.01, 0.005);
  }
  const clearingCurve = Array.isArray(scaled.maxCurve) && scaled.maxCurve.length
    ? scaled.maxCurve
    : scaled.curve || [];
  return interpolateTime(clearingCurve, effectiveKA * 1000);
}

/**
 * Compute incident energy and the arc-flash boundary using the full
 * IEEE 1584-2018 model (analysis/ieee1584.mjs — validated against the
 * standard's Annex D.1 and D.2 worked examples).
 *
 * For each equipment location the maximum (full) and minimum (reduced)
 * arcing-current scenarios are both evaluated — each with its own
 * protective-device clearing time, determined at the ARCING current — and the
 * worst-case incident energy is reported, per the standard.
 *
 * Inputs and their defaults (each surfaced in the per-result
 * `notes`/`requiredInputs` when missing):
 *   - electrode configuration: VCB (box) / VOA (open air) when not provided
 *   - electrode gap:           25 mm when not provided
 *   - working distance:        455 mm (18 in) when not provided
 *   - enclosure size:          508 mm cube when dimensions are not provided
 *   - system voltage:          0.48 kV when not provided
 *   - clearing time:           0.2 s when no protective-device curve is linked
 *
 * Returns a map id -> { incidentEnergy, boundary, minimumArcRatingCalCm2, clearingTime }
 * where energy is in cal/cm^2 and boundary in millimeters.
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
    const shortCircuitAvailable = Number.isFinite(fault?.threePhaseKA) && fault.threePhaseKA > 0;
    const Ibf = shortCircuitAvailable ? fault.threePhaseKA : 0;
    const protectiveComp = protection.findNearest(comp);
    const protectiveDevice = protectiveComp && isProtectiveComponent(protectiveComp)
      ? devices.find(d => d.id === protectiveComp.tccId)
      : null;
    const compClearing = parseNumeric(pickValue(comp, 'clearing_time'));
    const upstreamClearing = protectiveComp && protectiveComp !== comp
      ? parseNumeric(pickValue(protectiveComp, 'clearing_time'))
      : null;
    const enclosure = (pickValue(comp, 'enclosure') || 'box').toLowerCase();
    const gapRaw = parseNumeric(pickValue(comp, 'gap'));
    const gap = Number.isFinite(gapRaw) && gapRaw > 0 ? gapRaw : 25;
    const workingDistanceRaw = parseNumeric(pickValue(comp, 'working_distance'));
    const dist = Number.isFinite(workingDistanceRaw) && workingDistanceRaw > 0 ? workingDistanceRaw : 455;
    const heightRaw = firstParsedNumeric(pickValue(comp, 'enclosure_height'), pickValue(comp, 'box_height'));
    const widthRaw = firstParsedNumeric(pickValue(comp, 'enclosure_width'), pickValue(comp, 'box_width'));
    const depthRaw = firstParsedNumeric(pickValue(comp, 'enclosure_depth'), pickValue(comp, 'box_depth'));
    const h = Number.isFinite(heightRaw) && heightRaw > 0 ? heightRaw : 508;
    const w = Number.isFinite(widthRaw) && widthRaw > 0 ? widthRaw : 508;
    const de = Number.isFinite(depthRaw) && depthRaw > 0 ? depthRaw : 508;
    const cfgCandidate = pickValue(comp, 'electrode_config') ?? pickValue(comp, 'electrode_configuration') ?? null;
    const cfgRaw = typeof cfgCandidate === 'string' ? cfgCandidate.toUpperCase() : null;
    const cfg = ELECTRODE_CONFIGS.includes(cfgRaw) ? cfgRaw : (enclosure === 'open' ? 'VOA' : 'VCB');
    const voltageSettingRaw = firstParsedNumeric(pickValue(comp, 'kV'), pickValue(comp, 'baseKV'), pickValue(comp, 'prefault_voltage'));
    const V = Number.isFinite(voltageSettingRaw) && voltageSettingRaw > 0 ? voltageSettingRaw : 0.48;

    // IEEE 1584-2018 incident-energy model. Evaluate BOTH the maximum (full)
    // and minimum (reduced) arcing-current scenarios — each with its own
    // clearing time evaluated at the arcing current — and report the worst-case
    // energy, as the standard requires (a lower arcing current can clear more
    // slowly and yield higher energy).
    const afParams = { EC: cfg, Voc_kV: V, Ibf_kA: Ibf, G_mm: gap, D_mm: dist };
    const modelRange = withinModelRange(afParams);
    let energy = 0;        // worst-case incident energy, cal/cm²
    let boundary = 0;      // worst-case arc-flash boundary, mm
    let time = 0;          // clearing time of the governing case, s
    let Ia = 0;            // arcing current of the governing case, kA
    let modelCF = 1;       // enclosure size correction factor
    let modelEES = null;   // equivalent enclosure size, inches
    let governingCase = null;
    let afError = null;
    if (Ibf > 0) {
      try {
        const ac = arcingCurrents({ ...afParams, height_mm: h, width_mm: w, depth_mm: de });
        modelCF = ac.CF;
        modelEES = ac.EES;
        const tFull = clearingTime(comp, ac.full.iArc, devices, protectiveComp, sc, protectiveDevice);
        const tReduced = clearingTime(comp, ac.reduced.iArc, devices, protectiveComp, sc, protectiveDevice);
        const eFull = incidentEnergy(afParams, ac, 'full', tFull);
        const eReduced = incidentEnergy(afParams, ac, 'reduced', tReduced);
        const reducedGoverns = Number.isFinite(eReduced.E_cal) && eReduced.E_cal > eFull.E_cal;
        const worst = reducedGoverns ? eReduced : eFull;
        governingCase = reducedGoverns ? 'reduced (minimum arcing current)' : 'full (maximum arcing current)';
        time = reducedGoverns ? tReduced : tFull;
        Ia = Number.isFinite(worst.iArc_kA) ? worst.iArc_kA : 0;
        energy = Number.isFinite(worst.E_cal) && worst.E_cal > 0 ? worst.E_cal : 0;
        boundary = Number.isFinite(worst.AFB_mm) && worst.AFB_mm > 0 ? worst.AFB_mm : 0;
      } catch (e) {
        afError = e;
      }
    }
    // This calculation uses the incident-energy analysis method. NFPA 70E's
    // PPE-category tables are a separate selection method and must not be
    // assigned by mapping calculated energy to category thresholds.
    const minimumArcRating = energy > 1.2 ? Math.ceil(energy * 100) / 100 : 0;
    const voltage = resolveVoltage(comp);
    const approaches = computeApproachDistances(voltage);
    const notes = [];
    const requiredInputs = [];
    const addNote = message => {
      if (message && !notes.includes(message)) notes.push(message);
    };
    const addRequired = message => {
      if (message && !requiredInputs.includes(message)) requiredInputs.push(message);
    };
    if (!shortCircuitAvailable) {
      addNote('No short-circuit study current was available; bolted fault current was assumed.');
      addRequired('Provide a short-circuit result for this location to validate the incident energy.');
    }
    if (Array.isArray(fault?.warnings) && fault.warnings.length) {
      fault.warnings.forEach(addNote);
      addRequired('Provide impedance data for the upstream path to compute realistic fault current.');
    }
    if (Ibf > 100) {
      addNote(`Bolted fault current ${Ibf.toFixed(2)} kA is very high; confirm conductor and source data.`);
    } else if (Ibf <= 0) {
      addNote('Bolted fault current resolved to 0 kA; check connectivity and source definitions.');
      addRequired('Confirm the upstream source and conductors provide a non-zero fault current.');
    }
    if (!protectiveComp || (!protectiveComp.tccId && compClearing === null && upstreamClearing === null)) {
      addNote('Clearing time defaulted to 0.2 s because no protective device data was linked.');
      addRequired('Associate a protective device time-current curve or specify a clearing time.');
    } else if (protectiveComp?.tccId && !protectiveDevice && compClearing === null && upstreamClearing === null) {
      addNote('Protective device curve reference was not found; clearing time used default assumptions.');
      addRequired('Ensure the protective device library includes the referenced curve.');
    }
    if (workingDistanceRaw === null) {
      addNote('Working distance not provided; defaulted to 455 mm (18 in).');
      addRequired('Document the working distance used for arc flash analysis.');
    }
    if (gapRaw === null) {
      addNote('Electrode gap not provided; defaulted to 25 mm.');
      addRequired('Provide the electrode gap to refine the arc flash calculation.');
    }
    if (heightRaw === null || widthRaw === null || depthRaw === null) {
      addNote('Enclosure dimensions missing; assumed a 508 mm cube for the enclosure size correction.');
      addRequired('Specify enclosure height, width, and depth for this equipment.');
    }
    if (!Number.isFinite(voltage)) {
      addNote('Nominal voltage unavailable; approach boundaries could not be derived.');
      addRequired('Provide the equipment nominal voltage to compute approach boundaries.');
    }
    if (Number.isFinite(voltageSettingRaw) && voltageSettingRaw <= 0) {
      addNote('Nominal voltage value was non-positive; defaulted to 0.48 kV for calculations.');
    } else if (!Number.isFinite(voltageSettingRaw)) {
      addNote('No nominal voltage provided; defaulted to 0.48 kV for the energy model.');
    }
    if (energy > 40) {
      addNote('Incident energy exceeds 40 cal/cm². Use the incident-energy method for PPE selection, verify protective coordination, and prioritize engineering mitigation.');
    }
    if (boundary > 20000) {
      addNote('Arc flash boundary exceeds 20 m; confirm the clearing time and working distance inputs.');
    }
    if (Ibf > 0 && !modelRange.ok) {
      addNote(`Inputs fall outside the IEEE 1584-2018 model validity range (${modelRange.reasons.join('; ')}); the incident energy is an extrapolation and may be inaccurate.`);
      addRequired('Bring voltage, bolted fault current, gap, and working distance within the IEEE 1584-2018 range, or use an alternative method.');
    }
    if (afError) {
      addNote('Incident energy could not be evaluated with the IEEE 1584-2018 model for this equipment; check the input parameters.');
    }
    if (governingCase) {
      addNote(`Worst-case incident energy governed by the ${governingCase} scenario per IEEE 1584-2018.`);
    }
    const upstreamDeviceName = formatProtectiveDeviceName(protectiveComp, protectiveDevice);
    const entry = {
      incidentEnergy: Number(energy.toFixed(2)),
      boundary: Number(boundary.toFixed(1)),
      ppeCategory: null,
      ppeSelectionMethod: 'incident-energy',
      minimumArcRatingCalCm2: minimumArcRating,
      clearingTime: Number(time.toFixed(3)),
      nominalVoltage: voltage,
      workingDistance: Number(dist.toFixed(1)),
      limitedApproach: approaches.limited,
      restrictedApproach: approaches.restricted,
      equipmentTag: resolveEquipmentTag(comp),
      upstreamDevice: upstreamDeviceName,
      studyDate,
      calculationInputs: {
        model: 'IEEE 1584-2018',
        boltedFaultCurrentKA: Number(Math.max(Ibf, 0).toFixed(2)),
        arcingCurrentKA: Number(Ia.toFixed(2)),
        clearingTimeSeconds: Number(time.toFixed(3)),
        governingScenario: governingCase || 'n/a',
        electrodeConfiguration: cfg,
        enclosureType: enclosure,
        enclosureCorrectionFactor: Number(modelCF.toFixed(3)),
        equivalentEnclosureSizeIn: modelEES === null ? null : Number(modelEES.toFixed(2)),
        gapMM: Number(gap.toFixed(1)),
        workingDistanceMM: Number(dist.toFixed(1)),
        boxHeightMM: Number(h.toFixed(1)),
        boxWidthMM: Number(w.toFixed(1)),
        boxDepthMM: Number(de.toFixed(1)),
        voltageKVUsed: Number(V.toFixed(3)),
        withinModelRange: modelRange.ok,
        faultCurrentSource: shortCircuitAvailable ? 'shortCircuitStudy' : 'assumed'
      }
    };
    if (notes.length) entry.notes = notes;
    if (requiredInputs.length) entry.requiredInputs = requiredInputs;
    results[comp.id] = entry;
  });
  return results;
}

/**
 * Generate a "constant incident energy" limit curve for overlay on a TCC chart,
 * using the full IEEE 1584-2018 model (analysis/ieee1584.mjs).
 *
 * For each bolted fault current in currentRangeKA, computes the maximum clearing
 * time that keeps incident energy at or below thresholdCalCm2. Because incident
 * energy is linear in clearing time, the time is solved directly:
 *   E(T) = E(1 s) · T  ⟹  T = E_threshold / E(1 s)
 * evaluated for the maximum (full) arcing-current scenario.
 *
 * @param {object} params
 * @param {string} params.cfg|EC        - electrode configuration (VCB, VCBB, HCB, VOA, HOA)
 * @param {number} params.V|Voc_kV      - system voltage in kV
 * @param {number} params.gap|G_mm      - conductor gap in mm
 * @param {number} params.dist|D_mm     - working distance in mm
 * @param {string} params.enclosure     - 'open' or 'box' (selects default config)
 * @param {number} [params.height_mm|width_mm|depth_mm] - enclosure dimensions (default 508 mm cube)
 * @param {number} thresholdCalCm2      - incident energy limit in cal/cm²
 * @param {number[]} currentRangeKA     - bolted fault currents (kA) to sweep
 * @returns {{ current: number, time: number }[]} sorted by ascending current
 */
export function incidentEnergyLimitCurve(params, thresholdCalCm2, currentRangeKA) {
  const p = params || {};
  const enclosure = (p.enclosure || 'box').toLowerCase();
  const cfgRaw = typeof (p.EC ?? p.cfg) === 'string' ? (p.EC ?? p.cfg).toUpperCase() : null;
  const EC = ELECTRODE_CONFIGS.includes(cfgRaw) ? cfgRaw : (enclosure === 'open' ? 'VOA' : 'VCB');
  const Voc_kV = p.Voc_kV ?? p.V ?? 0.48;
  const G_mm = p.G_mm ?? p.gap ?? 25;
  const D_mm = p.D_mm ?? p.dist ?? 455;
  const height_mm = p.height_mm ?? 508;
  const width_mm = p.width_mm ?? 508;
  const depth_mm = p.depth_mm ?? 508;

  const E = thresholdCalCm2;
  if (!(E > 0) || !Array.isArray(currentRangeKA) || currentRangeKA.length === 0) return [];
  const E_threshold_J = E * 4.184;

  const points = [];
  for (const Ibf of currentRangeKA) {
    if (!(Ibf > 0)) continue;
    const afParams = { EC, Voc_kV, Ibf_kA: Ibf, G_mm, D_mm };
    if (!withinModelRange(afParams).ok) continue;
    try {
      const ac = arcingCurrents({ ...afParams, height_mm, width_mm, depth_mm });
      const eAt1s = incidentEnergy(afParams, ac, 'full', 1).E_J; // J/cm² at T = 1 s
      if (!(eAt1s > 0)) continue;
      const t = E_threshold_J / eAt1s; // seconds (energy is linear in time)
      if (t > 0 && t <= 100) points.push({ current: Ibf * 1000, time: t });
    } catch {
      // Skip currents that fall outside the model's numeric domain.
    }
  }
  points.sort((a, b) => a.current - b.current);
  return points;
}
