import ampacity from './ampacity.mjs';
import { calculateVoltageDrop } from './src/voltageDrop.js';
import nec from './codes/necTables.js';
import iec from './codes/iecTables.js';
import { normalizeCablePhases } from './utils/cablePhases.js';

let conductorProps = {};
try {
  const url = new URL('./data/conductor_properties.json', import.meta.url);
  conductorProps = await fetch(url).then(r => r.json());
} catch (err) {
  console.warn('Failed to load conductor properties', err);
  conductorProps = {};
}

const { sizeToArea } = ampacity;
const codeLibs = { NEC: nec, IEC: iec };

function normalizeSize(size) {
  return size
    ? size.toString().toLowerCase()
        .replace(/#/,'')
        .replace(/\s*awg/,'')
        .replace(/\s*kcmil/,'')
        .trim()
    : '';
}

function lookupAmpacity(code, material, size, rating) {
  const lib = codeLibs[code] || codeLibs.NEC;
  const mat = (material || 'cu').toLowerCase().includes('al') ? 'al' : 'cu';
  const key = normalizeSize(size);
  return lib.ampacity[mat]?.[key]?.[rating] ?? null;
}

function temperatureFactor(code, ambient, rating) {
  const lib = codeLibs[code] || codeLibs.NEC;
  const temps = Object.keys(lib.temperatureCorrection)
    .map(t => parseFloat(t))
    .sort((a, b) => a - b);
  let sel = temps[temps.length - 1];
  for (const t of temps) {
    if (ambient <= t) { sel = t; break; }
  }
  return lib.temperatureCorrection[sel]?.[rating] ?? 1;
}

function adjustmentFactor(code, conductors) {
  const lib = codeLibs[code] || codeLibs.NEC;
  const n = parseInt(conductors, 10) || 1;
  const entry = lib.adjustmentFactors.find(a => n <= a.max)
    || lib.adjustmentFactors[lib.adjustmentFactors.length - 1];
  return entry.factor;
}

export function sizeConductor(load = {}, params = {}) {
  const sizes = Object.keys(conductorProps).sort((a, b) => sizeToArea(a) - sizeToArea(b));
  const current = parseFloat(load.current) || 0;
  const voltage = parseFloat(load.voltage) || 0;
  const phases = parseInt(load.phases, 10) || 3;
  const required = current * 1.25;
  const code = (params.code || 'NEC').toUpperCase();
  const ambient = params.ambient ?? 30;
  const conductors = params.conductors ?? load.conductors ?? 1;
  let report = null;
  for (const sz of sizes) {
    const base = lookupAmpacity(code, params.material || 'cu', sz, params.insulation_rating || 90);
    if (!base) continue;
    const tf = temperatureFactor(code, ambient, params.insulation_rating || 90);
    const af = adjustmentFactor(code, conductors);
    const available = base * tf * af;
    report = { baseAmpacity: base, tempFactor: tf, adjustFactor: af, available, codeRef: code };
    if (available < required) continue;
    const cable = {
      conductor_size: sz,
      conductor_material: params.material || 'cu',
      insulation_rating: params.insulation_rating || 90,
      voltage_rating: voltage
    };
    const vd = calculateVoltageDrop(cable, params.length || 0, phases);
    if (params.maxVoltageDrop && vd > params.maxVoltageDrop) {
      report.voltageDrop = vd;
      continue;
    }
    return { size: sz, ampacity: available, voltageDrop: vd, codeRef: code, report, violation: null };
  }
  return {
    size: null,
    ampacity: null,
    voltageDrop: null,
    codeRef: code,
    report,
    violation: `${code} violation: required ${required.toFixed(1)}A exceeds available conductor sizes`
  };
}

export function calculateAmpacity(cable, params = {}) {
  const code = (params.code || 'NEC').toUpperCase();
  const base = lookupAmpacity(code, cable.conductor_material || 'cu', cable.conductor_size, cable.insulation_rating || 90);
  if (!base) return 0;
  const tf = temperatureFactor(code, params.ambient ?? 30, cable.insulation_rating || 90);
  const af = adjustmentFactor(code, params.conductors ?? 1);
  return base * tf * af;
}

export { calculateVoltageDrop };

export function summarizeCable(cable, params = {}) {
  const normalizedPhases = normalizeCablePhases(cable);
  const load = {
    current: cable.est_load,
    voltage: cable.operating_voltage,
    phases: normalizedPhases.length || parseInt(cable.phases, 10) || 3,
    conductors: cable.conductors
  };
  const res = sizeConductor(load, {
    ...params,
    material: cable.conductor_material,
    insulation_rating: cable.insulation_rating,
    length: cable.length,
    conductors: cable.conductors
  });
  return {
    tag: cable.tag,
    selectedSize: cable.conductor_size,
    requiredSize: res.size,
    code: res.codeRef,
    baseAmpacity: res.report?.baseAmpacity,
    tempFactor: res.report?.tempFactor,
    adjustFactor: res.report?.adjustFactor,
    availableAmpacity: res.report?.available,
    voltageDrop: res.voltageDrop,
    violation: res.violation
  };
}

export default { sizeConductor, calculateAmpacity, calculateVoltageDrop, summarizeCable };
