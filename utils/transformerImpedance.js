import { toBaseKV, normalizeVoltageToVolts } from './voltage.js';

function parseNumeric(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null;
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const match = trimmed.match(/[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/);
    if (!match) return null;
    const num = Number.parseFloat(match[0]);
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

function resolveVoltageKV(inputs) {
  if (!inputs) return null;
  if (inputs.voltageKV !== undefined && inputs.voltageKV !== null) {
    const kv = parseNumeric(inputs.voltageKV);
    if (Number.isFinite(kv) && kv > 0) return kv;
  }
  const directKV = parseNumeric(inputs.kv ?? inputs.KV);
  if (Number.isFinite(directKV) && directKV > 0) return directKV;
  const volts = normalizeVoltageToVolts(inputs.voltage ?? inputs.volts);
  if (Number.isFinite(volts) && volts > 0) {
    const kv = volts / 1000;
    if (kv > 0) return kv;
  }
  if (inputs.baseKV !== undefined || inputs.prefault_voltage !== undefined) {
    const kv = toBaseKV(inputs.baseKV ?? inputs.prefault_voltage);
    if (Number.isFinite(kv) && kv > 0) return kv;
  }
  return null;
}

export function calculateTransformerImpedance(inputs = {}) {
  const kva = parseNumeric(inputs.kva ?? inputs.KVA ?? inputs.kvaPrimary ?? inputs.kvaSecondary);
  const percentZ = parseNumeric(inputs.percentZ ?? inputs.percent_z ?? inputs.zPercent);
  const xrRatio = parseNumeric(inputs.xrRatio ?? inputs.xr_ratio ?? inputs.xr);
  const voltageKV = resolveVoltageKV(inputs);

  if (!Number.isFinite(kva) || kva === 0) return null;
  if (!Number.isFinite(percentZ) || percentZ === 0) return null;
  if (!Number.isFinite(voltageKV) || voltageKV === 0) return null;

  const baseMVA = kva / 1000;
  if (!baseMVA) return null;
  const baseZ = (voltageKV * voltageKV) / baseMVA;
  const zMag = baseZ * (percentZ / 100);

  if (!Number.isFinite(zMag) || zMag === 0) return null;

  const xr = Number.isFinite(xrRatio) ? xrRatio : null;
  if (xr && Math.abs(xr) > 0.01) {
    const r = zMag / Math.sqrt(1 + xr * xr);
    const x = r * xr;
    return { r, x };
  }
  const r = zMag * 0.1;
  const xSquared = Math.max(zMag * zMag - r * r, 0);
  const x = xSquared > 0 ? Math.sqrt(xSquared) : zMag;
  return { r, x };
}

export default calculateTransformerImpedance;
