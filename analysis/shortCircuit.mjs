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
  const results = {};

  buses.forEach(comp => {
    const base = comp.impedance || { r: 0, x: 0 };
    let z1 = comp.z1 || base;
    let z2 = comp.z2 || z1;
    let z0 = comp.z0 || z1;
    (comp.sources || []).forEach(src => {
      const s1 = src.z1 || src.impedance || { r: 0, x: 0 };
      const s2 = src.z2 || s1;
      const s0 = src.z0 || s1;
      z1 = parallel(z1, s1);
      z2 = parallel(z2, s2);
      z0 = parallel(z0, s0);
    });

    const Vll = comp.prefault_voltage || comp.baseKV || comp.kV || 1;
    const method = (comp.method || opts.method || (Vll > 1 ? 'IEC' : 'ANSI')).toUpperCase();
    const vFactor = method === 'IEC' ? (comp.v_factor || 1.1) : (comp.v_factor || 1.05);
    const V = (Vll * vFactor) / Math.sqrt(3); // phase voltage in kV

    const I3 = V / mag(z1);
    const ILG = (3 * V) / mag(add(add(z1, z2), z0));
    const ILL = (Math.sqrt(3) * V) / mag(add(z1, z2));
    const Z2Z0 = parallel(z2, z0);
    const IDLG = (3 * V) / mag(add(z1, Z2Z0));

    const xr = Math.abs(comp.xr_ratio || 0);
    const asym = I3 * (1 + Math.exp(-Math.PI / Math.max(xr, 0.01)));

    results[comp.id] = {
      method,
      prefaultKV: Number(Vll),
      threePhaseKA: Number(I3.toFixed(2)),
      asymKA: Number(asym.toFixed(2)),
      lineToGroundKA: Number(ILG.toFixed(2)),
      lineToLineKA: Number(ILL.toFixed(2)),
      doubleLineGroundKA: Number(IDLG.toFixed(2))
    };
  });

  return results;
}

