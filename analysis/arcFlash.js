import { runShortCircuit } from './shortCircuit.js';
import { getOneLine, getItem } from '../dataStore.mjs';
import devices from '../data/protectiveDevices.mjs';

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

function clearingTime(comp, Ibf) {
  if (comp.clearing_time) return Number(comp.clearing_time);
  if (!comp.tccId) return 0.2;
  const dev = devices.find(d => d.id === comp.tccId);
  if (!dev) return 0.2;
  const saved = getItem('tccSettings', { devices: [], settings: {} });
  const set = saved.settings?.[dev.id] || {};
  const base = dev.settings || {};
  const pickup = set.pickup ?? base.pickup ?? 1;
  const delay = set.delay ?? base.delay ?? 0.1;
  const inst = set.instantaneous ?? base.instantaneous;
  if (inst && Ibf * 1000 >= inst) return 0.01;
  const scaleI = pickup / (base.pickup || pickup);
  const scaleT = delay / (base.delay || delay);
  const curve = (dev.curve || []).map(p => ({
    current: p.current * scaleI,
    time: p.time * scaleT
  }));
  return interpolateTime(curve, Ibf * 1000);
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
export function runArcFlash() {
  const sc = runShortCircuit();
  const { sheets } = getOneLine();
  const comps = Array.isArray(sheets[0]?.components)
    ? sheets.flatMap(s => s.components)
    : sheets;
  const results = {};
  comps.forEach(comp => {
    const Ibf = sc[comp.id]?.threePhaseKA || 0;
    const enclosure = (comp.enclosure || 'box').toLowerCase();
    const Cf = enclosure === 'open' ? 1 : 1.5;
    const gap = Number(comp.gap) || 25;
    const dist = Number(comp.working_distance) || 455;
    const h = Number(comp.enclosure_height || comp.box_height) || 508;
    const w = Number(comp.enclosure_width || comp.box_width) || 508;
    const de = Number(comp.enclosure_depth || comp.box_depth) || 508;
    const sizeFactor = Math.cbrt((h * w * de) / (508 * 508 * 508)) || 1;
    const time = clearingTime(comp, Ibf);
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
    results[comp.id] = {
      incidentEnergy: Number(energy.toFixed(2)),
      boundary: Number(boundary.toFixed(1)),
      ppeCategory: ppe,
      clearingTime: Number(time.toFixed(3))
    };
  });
  return results;
}

