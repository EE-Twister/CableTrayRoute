import { normalizeVoltageToVolts, toBaseKV } from './voltage.js';
import { calculateTransformerImpedance } from './transformerImpedance.js';

const numberPattern = /[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/;

function getCandidateValue(record, key) {
  if (!record || typeof record !== 'object' || !key) return undefined;
  if (Object.prototype.hasOwnProperty.call(record, key)) return record[key];
  if (record.props && Object.prototype.hasOwnProperty.call(record.props, key)) return record.props[key];
  if (record.parameters && Object.prototype.hasOwnProperty.call(record.parameters, key)) {
    return record.parameters[key];
  }
  return undefined;
}

function parseNumeric(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const match = trimmed.match(numberPattern);
    if (!match) return null;
    const num = Number.parseFloat(match[0]);
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

function pickNumeric(record, keys, { scale = 1 } = {}) {
  for (const key of keys) {
    const raw = getCandidateValue(record, key);
    const value = parseNumeric(raw);
    if (Number.isFinite(value)) {
      const scaled = value * scale;
      if (Number.isFinite(scaled)) return scaled;
    }
  }
  return null;
}

function pickVoltageKV(record, keys) {
  for (const key of keys) {
    const raw = getCandidateValue(record, key);
    const volts = normalizeVoltageToVolts(raw);
    if (Number.isFinite(volts) && volts > 0) return volts / 1000;
  }
  return null;
}

export function resolveTransformerKva(record) {
  const kvaKeys = [
    'kva',
    'kva_lv',
    'kva_secondary',
    'kva_primary',
    'kva_hv',
    'kva_tv',
    'kva_tertiary',
    'kva_hv_lv',
    'kva_hv_tv',
    'kva_lv_tv'
  ];
  const kva = pickNumeric(record, kvaKeys);
  if (Number.isFinite(kva) && kva !== 0) return kva;
  const mvaKeys = ['mva', 'mva_primary', 'mva_secondary', 'mva_lv', 'mva_hv'];
  const mva = pickNumeric(record, mvaKeys);
  if (Number.isFinite(mva) && mva !== 0) return mva * 1000;
  return null;
}

export function resolveTransformerPercentZ(record) {
  const percentKeys = [
    'percent_z',
    'z_percent',
    'percent_primary',
    'percent_secondary',
    'percent_tertiary',
    'z_hv_lv_percent',
    'z_hv_tv_percent',
    'z_lv_tv_percent'
  ];
  return pickNumeric(record, percentKeys);
}

export function resolveTransformerXrRatio(record) {
  const xrKeys = ['xr_ratio', 'xr'];
  return pickNumeric(record, xrKeys);
}

export function readTransformerBaseKV(record) {
  const baseKeys = ['baseKV', 'kV', 'kv', 'prefault_voltage'];
  for (const key of baseKeys) {
    const raw = getCandidateValue(record, key);
    const kv = toBaseKV(raw);
    if (Number.isFinite(kv) && kv > 0) return kv;
  }
  return null;
}

export function deriveTransformerBaseKV(record) {
  const voltageKeys = [
    'volts_secondary',
    'voltage_secondary',
    'secondary_voltage',
    'volts_lv',
    'voltage_lv',
    'volts_tv',
    'volts_tertiary',
    'voltage_tertiary',
    'volts_primary',
    'voltage_primary',
    'volts_hv',
    'voltage_hv',
    'voltage',
    'volts'
  ];
  return pickVoltageKV(record, voltageKeys);
}

export function computeTransformerBaseKV(record) {
  const explicit = readTransformerBaseKV(record);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  return deriveTransformerBaseKV(record);
}

export function computeTransformerImpedance(record) {
  const kva = resolveTransformerKva(record);
  const percentZ = resolveTransformerPercentZ(record);
  const baseKV = computeTransformerBaseKV(record);
  const xr = resolveTransformerXrRatio(record);
  const result = calculateTransformerImpedance({ kva, percentZ, voltageKV: baseKV, xrRatio: xr });
  if (!result) return null;
  const { r, x } = result;
  if (!Number.isFinite(r) || !Number.isFinite(x)) return null;
  return { r, x };
}

export function applyTransformerBaseKV(record, baseKV) {
  if (!record || !Number.isFinite(baseKV) || baseKV <= 0) return;
  const kv = baseKV;
  record.baseKV = kv;
  record.kV = kv;
  record.kv = kv;
  record.prefault_voltage = kv;
  if (record.props && typeof record.props === 'object') {
    record.props.baseKV = kv;
    record.props.kV = kv;
    record.props.kv = kv;
    record.props.prefault_voltage = kv;
  }
}

export function applyTransformerImpedance(record, impedance) {
  if (!record || !impedance || typeof impedance !== 'object') return;
  const { r, x } = impedance;
  if (!Number.isFinite(r) || !Number.isFinite(x)) return;
  if (!record.impedance || typeof record.impedance !== 'object') {
    record.impedance = { r, x };
  } else {
    record.impedance.r = r;
    record.impedance.x = x;
  }
}

export function syncTransformerDefaults(record, { forceBase = false } = {}) {
  if (!record || typeof record !== 'object') return { baseKV: null, impedance: null };
  const derivedBase = deriveTransformerBaseKV(record);
  const currentBase = readTransformerBaseKV(record);
  if (Number.isFinite(derivedBase) && derivedBase > 0 && (forceBase || !Number.isFinite(currentBase) || currentBase <= 0)) {
    applyTransformerBaseKV(record, derivedBase);
  }
  const impedance = computeTransformerImpedance(record);
  if (impedance) applyTransformerImpedance(record, impedance);
  return { baseKV: derivedBase ?? currentBase ?? null, impedance: impedance ?? null };
}

export default {
  resolveTransformerKva,
  resolveTransformerPercentZ,
  resolveTransformerXrRatio,
  computeTransformerBaseKV,
  deriveTransformerBaseKV,
  readTransformerBaseKV,
  computeTransformerImpedance,
  applyTransformerBaseKV,
  applyTransformerImpedance,
  syncTransformerDefaults
};
