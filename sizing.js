import ampacity from './ampacity.mjs';
import { calculateVoltageDrop, calculateVoltageDropResult } from './src/voltageDrop.js';
import nec from './codes/necTables.js';
import iec from './codes/iecTables.js';
import { normalizeCablePhases } from './utils/cablePhases.js';
import { createCalculationResult } from './analysis/resultContract.mjs';

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
  if (!Number.isFinite(Number(ambient)) || !temps.length || Number(ambient) < temps[0] || Number(ambient) > temps[temps.length - 1]) return null;
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

function sizingContract(result, inputs, warnings = []) {
  const code = (result.codeRef || inputs.code || 'NEC').toUpperCase();
  const parallelCount = inputs.parallel_count ?? inputs.parallel_runs ?? 1;
  const powerFactor = inputs.power_factor ?? inputs.powerFactor ?? null;
  const impedanceOverride = inputs.impedance_per_1000ft ?? inputs.impedance ?? null;
  const conduitMaterial = inputs.conduit_material ?? inputs.raceway_material ?? inputs.conduit_type ?? null;
  return {
    ...result,
    resultContract: createCalculationResult({
      value: result.ampacity,
      units: 'A',
      validity: result.size && !result.violation && (result.voltageDrop === null || Number.isFinite(result.voltageDrop)) ? 'evaluated' : 'unevaluated',
      inputSources: { current: 'load', voltage: 'load', conductorTable: code },
      assumptions: { phases: inputs.phases, ambientC: inputs.ambient, conductors: inputs.conductors, powerFactor, conduitMaterial, impedanceOverride, parallelCount },
      modelLimits: { voltageDropConstraint: inputs.maxVoltageDrop ?? null },
      warnings: [...warnings, result.violation],
      inputs: { current: Number(inputs.current), voltage: Number(inputs.voltage), phases: Number(inputs.phases), length: Number(inputs.length), ambient: Number(inputs.ambient), maxVoltageDrop: inputs.maxVoltageDrop == null || inputs.maxVoltageDrop === '' ? null : Number(inputs.maxVoltageDrop), code, material: inputs.material || 'cu', insulation_rating: Number(inputs.insulation_rating || 90), conductors: Number(inputs.conductors || 1), parallel_count: Number(parallelCount), power_factor: powerFactor == null || powerFactor === '' ? null : Number(powerFactor), impedance_per_1000ft: impedanceOverride == null || impedanceOverride === '' ? null : Number(impedanceOverride), conduit_material: conduitMaterial },
    })
  };
}

export function sizeConductor(load = {}, params = {}) {
  const sizes = Object.keys(conductorProps).sort((a, b) => sizeToArea(a) - sizeToArea(b));
  const current = load.current === '' || load.current == null ? 0 : Number(load.current);
  const voltage = load.voltage === '' || load.voltage == null ? 0 : Number(load.voltage);
  const phases = load.phases === '' || load.phases == null ? 0 : Number(load.phases);
  const parallelRaw = params.parallel_count ?? params.parallel_runs ?? load.parallel_count;
  const parallelCount = parallelRaw == null || parallelRaw === '' ? 1 : Number(parallelRaw);
  if (!Number.isInteger(parallelCount) || parallelCount < 1) {
    return sizingContract({
      size: null,
      ampacity: null,
      voltageDrop: null,
      codeRef: (params.code || 'NEC').toUpperCase(),
      report: null,
      violation: 'Parallel conductor count must be a positive integer'
    }, { ...load, ...params, phases });
  }
  if (!(Number.isFinite(current) && current > 0) || !(Number.isFinite(voltage) && voltage > 0) || ![1, 2, 3].includes(phases)) {
    return sizingContract({ size: null, ampacity: null, voltageDrop: null, codeRef: (params.code || 'NEC').toUpperCase(), report: null, violation: 'Current, voltage, and phase count are required for sizing' }, { ...load, ...params, phases });
  }
  const required = (current * 1.25) / parallelCount;
  const code = (params.code || 'NEC').toUpperCase();
  if (!codeLibs[code]) {
    return sizingContract({ size: null, ampacity: null, voltageDrop: null, codeRef: code, report: null, violation: `Unsupported code reference: ${code}` }, { ...load, ...params, phases });
  }
  const ambient = params.ambient ?? 30;
  const conductors = params.conductors ?? load.conductors ?? 1;
  if (!(Number.isFinite(Number(conductors)) && Number(conductors) >= 1 && Number.isInteger(Number(conductors)))) {
    return sizingContract({ size: null, ampacity: null, voltageDrop: null, codeRef: code, report: null, violation: 'Conductor count must be a positive integer' }, { ...load, ...params, phases });
  }
  if (params.maxVoltageDrop !== undefined && params.maxVoltageDrop !== null
    && params.maxVoltageDrop !== '' && !Number.isFinite(Number(params.maxVoltageDrop))) {
    return sizingContract({ size: null, ampacity: null, voltageDrop: null, codeRef: code, report: null, violation: 'Maximum voltage drop must be a finite number' }, { ...load, ...params, phases });
  }
  if (params.maxVoltageDrop !== undefined && params.maxVoltageDrop !== null
    && params.maxVoltageDrop !== '' && Number(params.maxVoltageDrop) < 0) {
    return sizingContract({ size: null, ampacity: null, voltageDrop: null, codeRef: code, report: null, violation: 'Maximum voltage drop cannot be negative' }, { ...load, ...params, phases });
  }
  if (params.maxVoltageDrop !== undefined && params.maxVoltageDrop !== null && params.maxVoltageDrop !== '' && Number(params.maxVoltageDrop) > 0 && (!(Number(params.length) > 0))) {
    return sizingContract({ size: null, ampacity: null, voltageDrop: null, codeRef: code, report: null, violation: 'Positive length is required when a voltage-drop constraint is requested' }, { ...load, ...params, phases });
  }
  let report = null;
  for (const sz of sizes) {
    const base = lookupAmpacity(code, params.material || 'cu', sz, params.insulation_rating || 90);
    if (!base) continue;
    const tf = temperatureFactor(code, ambient, params.insulation_rating || 90);
    if (tf === null) {
      const message = `Ambient temperature ${ambient}°C is outside the supported correction-table range`;
      return sizingContract({ size: null, ampacity: null, voltageDrop: null, codeRef: code, report: { ambient, supportedAmbientRange: [Math.min(...Object.keys((codeLibs[code] || codeLibs.NEC).temperatureCorrection).map(Number)), Math.max(...Object.keys((codeLibs[code] || codeLibs.NEC).temperatureCorrection).map(Number))] }, violation: message }, { ...load, ...params, phases }, [message]);
    }
    const af = adjustmentFactor(code, conductors);
    const available = base * tf * af;
    report = {
      baseAmpacity: base,
      tempFactor: tf,
      adjustFactor: af,
      available,
      requiredPerRun: required,
      parallelCount,
      codeRef: code
    };
    if (available < required) continue;
    const cable = {
      conductor_size: sz,
      conductor_material: params.material || 'cu',
      insulation_rating: params.insulation_rating || 90,
      est_load: current,
      operating_voltage: voltage,
      cable_rating: voltage,
      voltage_rating: voltage,
      power_factor: params.power_factor ?? params.powerFactor ?? load.power_factor,
      parallel_count: params.parallel_count ?? params.parallel_runs ?? load.parallel_count,
      impedance_per_1000ft: params.impedance_per_1000ft ?? load.impedance_per_1000ft,
      conduit_material: params.conduit_material ?? load.conduit_material
    };
    const vd = calculateVoltageDrop(cable, params.length || 0, phases);
    if (Number.isFinite(Number(params.maxVoltageDrop)) && Number(params.maxVoltageDrop) > 0 && !Number.isFinite(vd)) {
      report.voltageDrop = null;
      continue;
    }
    if (Number.isFinite(Number(params.maxVoltageDrop)) && Number(params.maxVoltageDrop) > 0 && vd > Number(params.maxVoltageDrop)) {
      report.voltageDrop = vd;
      continue;
    }
    return sizingContract({ size: sz, ampacity: available, voltageDrop: vd, codeRef: code, report, violation: null }, { ...load, ...params, phases });
  }
  return sizingContract({
    size: null,
    ampacity: null,
    voltageDrop: null,
    codeRef: code,
    report,
    violation: `${code} violation: required ${required.toFixed(1)}A exceeds available conductor sizes`
  }, { ...load, ...params, phases });
}

export function calculateAmpacity(cable, params = {}) {
  const code = (params.code || 'NEC').toUpperCase();
  if (!codeLibs[code]) return null;
  const base = lookupAmpacity(code, cable.conductor_material || 'cu', cable.conductor_size, cable.insulation_rating || 90);
  if (!base) return null;
  const tf = temperatureFactor(code, params.ambient ?? 30, cable.insulation_rating || 90);
  if (tf === null) return null;
  const af = adjustmentFactor(code, params.conductors ?? 1);
  return base * tf * af;
}

export { calculateVoltageDrop };

export function summarizeCable(cable, params = {}) {
  const normalizedPhases = normalizeCablePhases(cable);
  const phaseCount = normalizedPhases.length || parseInt(cable.phases, 10) || 0;
  const load = {
    current: cable.est_load,
    voltage: cable.operating_voltage,
    phases: phaseCount,
    conductors: cable.conductors,
    power_factor: cable.power_factor,
    parallel_count: cable.parallel_count ?? cable.parallel_runs ?? cable.parallel,
    impedance_per_1000ft: cable.impedance_per_1000ft ?? cable.impedance,
    conduit_material: cable.conduit_material ?? cable.raceway_material ?? cable.conduit_type
  };
  const res = sizeConductor(load, {
    ...params,
    material: cable.conductor_material,
    insulation_rating: cable.insulation_rating,
    length: cable.length,
    conductors: cable.conductors,
    phases: phaseCount,
    power_factor: cable.power_factor,
    parallel_count: cable.parallel_count ?? cable.parallel_runs ?? cable.parallel,
    impedance_per_1000ft: cable.impedance_per_1000ft ?? cable.impedance,
    conduit_material: cable.conduit_material ?? cable.raceway_material ?? cable.conduit_type
  });
  const selectedVoltageDropResult = calculateVoltageDropResult({
    ...cable,
    operating_voltage: cable.operating_voltage,
    phases: phaseCount,
    parallel_count: cable.parallel_count ?? cable.parallel_runs ?? cable.parallel,
  }, cable.length || 0, phaseCount);
  const selectedVoltageDrop = selectedVoltageDropResult.value;
  const selectedVoltageDropContract = selectedVoltageDropResult.resultContract;
  const selectedAmpacityResult = calculateAmpacityResult(cable, {
    ...params,
    code: params.code,
    ambient: params.ambient ?? 30,
    conductors: cable.conductors,
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
    selectedAmpacity: selectedAmpacityResult.value,
    // Keep installed-cable performance separate from the sizing candidate.
    voltageDrop: Number.isFinite(selectedVoltageDrop) ? selectedVoltageDrop : null,
    selectedVoltageDrop: Number.isFinite(selectedVoltageDrop) ? selectedVoltageDrop : null,
    recommendedVoltageDrop: Number.isFinite(res.voltageDrop) ? res.voltageDrop : null,
    recommendation: res.size ? { size: res.size, voltageDrop: res.voltageDrop } : null,
    violation: res.violation,
    ampacityResultContract: res.resultContract || null,
    selectedAmpacityResultContract: selectedAmpacityResult.resultContract,
    selectedVoltageDropResultContract: {
      ...selectedVoltageDropContract,
      inputSources: { ...(selectedVoltageDropContract?.inputSources || {}), installedCable: 'Cable Schedule' },
      warnings: [
        ...(selectedVoltageDropContract?.warnings || []),
        ...(!Number.isFinite(selectedVoltageDrop) ? ['Installed cable voltage drop was not evaluated.'] : []),
      ],
    },
    // Backward-compatible primary contract for consumers of the summary.
    resultContract: selectedVoltageDropContract,
  };
}

export function calculateAmpacityResult(cable = {}, params = {}) {
  const value = calculateAmpacity(cable, params);
  const code = (params.code || 'NEC').toUpperCase();
  const ambient = params.ambient ?? 30;
  const warnings = [];
  if (!Number.isFinite(value)) warnings.push(`Ampacity was not evaluated for ${code}: conductor data or ambient correction is unsupported.`);
  return {
    value: Number.isFinite(value) ? value : null,
    units: 'A',
    resultContract: createCalculationResult({
      value,
      units: 'A',
      validity: Number.isFinite(value) ? 'evaluated' : 'unevaluated',
      inputSources: { conductorTable: code },
      assumptions: { ambientC: ambient, conductorSize: cable.conductor_size, material: cable.conductor_material, insulationRating: cable.insulation_rating || 90, conductors: params.conductors ?? 1 },
      modelLimits: { supportedAmbient: 'temperatureCorrection table' },
      warnings,
      inputs: { cable, params },
    }),
  };
}

export default { sizeConductor, calculateAmpacity, calculateAmpacityResult, calculateVoltageDrop, summarizeCable };
