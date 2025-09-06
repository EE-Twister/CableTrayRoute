import { getOneLine } from '../dataStore.mjs';

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
 * Symmetrical-component short-circuit engine.
 * Each component represents a bus with total sequence impedances to the
 * upstream source. Optional `sources` array allows parallel generator or
 * motor contributions. Fault currents are returned in kA for 3‑phase,
 * line‑to‑ground, line‑to‑line and double‑line‑to‑ground faults per
 * ANSI/IEC methods.
 *
 * Components may specify `kV` (line‑to‑line), sequence impedances `z1`,
 * `z2`, `z0` (objects with r & x in ohms) and `sources` [{z1,z2,z0}].
 */
export function runShortCircuit() {
  const sheets = getOneLine();
  const comps = Array.isArray(sheets[0]?.components)
    ? sheets.flatMap(s => s.components)
    : sheets;
  const results = {};
  comps.forEach(comp => {
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
    const V = (comp.kV || 1) / Math.sqrt(3); // phase voltage in kV
    const I3 = V / mag(z1);
    const ILG = (3 * V) / mag(add(add(z1, z2), z0));
    const ILL = (Math.sqrt(3) * V) / mag(add(z1, z2));
    const Z2Z0 = parallel(z2, z0);
    const IDLG = (3 * V) / mag(add(z1, Z2Z0));
    results[comp.id] = {
      threePhaseKA: Number(I3.toFixed(2)),
      lineToGroundKA: Number(ILG.toFixed(2)),
      lineToLineKA: Number(ILL.toFixed(2)),
      doubleLineGroundKA: Number(IDLG.toFixed(2))
    };
  });
  return results;
}

