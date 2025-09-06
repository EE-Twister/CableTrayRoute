import { getOneLine } from '../dataStore.mjs';

/**
 * Compute ANSI/IEC short-circuit currents using a simple
 * equivalent impedance aggregation. Each component may define
 * impedance { r, x } in ohms to its source. The source is
 * assumed to be 1 kV. Returns an object mapping id -> { faultKA }.
 */
export function runShortCircuit() {
  const diagram = getOneLine();
  const results = {};
  let r = 0;
  let x = 0;
  diagram.forEach(comp => {
    const z = comp.impedance || { r: 0, x: 0 };
    r += z.r;
    x += z.x;
    const zmag = Math.sqrt(r * r + x * x) || 1e-6;
    const ik = 1000 / zmag; // kA for 1 kV system
    results[comp.id] = { faultKA: Number(ik.toFixed(2)) };
  });
  return results;
}
