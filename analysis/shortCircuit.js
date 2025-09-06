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
 * Compute symmetrical component short-circuit currents.
 * Each component may define sequence impedances z1, z2, z0
 * (objects with r and x in ohms). If not supplied, the
 * generic `impedance` is used for all sequences. Results
 * include 3‑phase, line‑to‑ground, line‑to‑line and
 * double‑line‑to‑ground faults in kA for a 1 kV source.
 * Returns a map id -> { threePhaseKA, lineToGroundKA, lineToLineKA, doubleLineGroundKA }.
 */
export function runShortCircuit() {
  const sheets = getOneLine();
  const comps = Array.isArray(sheets[0]?.components)
    ? sheets.flatMap(s => s.components)
    : sheets;
  const results = {};
  let z1 = { r: 0, x: 0 };
  let z2 = { r: 0, x: 0 };
  let z0 = { r: 0, x: 0 };
  comps.forEach(comp => {
    const base = comp.impedance || { r: 0, x: 0 };
    const a1 = comp.z1 || base;
    const a2 = comp.z2 || a1;
    const a0 = comp.z0 || a1;
    z1 = add(z1, a1);
    z2 = add(z2, a2);
    z0 = add(z0, a0);
    const Z1 = z1;
    const Z2 = z2;
    const Z0 = z0;
    const V = 1; // kV base
    const I3 = V / mag(Z1);
    const ILG = (3 * V) / mag(add(add(Z1, Z2), Z0));
    const ILL = (Math.sqrt(3) * V) / mag(add(Z1, Z2));
    const Z2Z0 = parallel(Z2, Z0);
    const IDLG = (3 * V) / mag(add(Z1, Z2Z0));
    results[comp.id] = {
      threePhaseKA: Number(I3.toFixed(2)),
      lineToGroundKA: Number(ILG.toFixed(2)),
      lineToLineKA: Number(ILL.toFixed(2)),
      doubleLineGroundKA: Number(IDLG.toFixed(2))
    };
  });
  return results;
}
