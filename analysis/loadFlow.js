import { getOneLine } from '../dataStore.mjs';

/**
 * Run a Newton–Raphson style load flow on the one-line model.
 * The implementation is intentionally lightweight and assumes a
 * radial system where each component may define:
 *   - load: { kw, kvar }
 *   - impedance: { r, x } in ohms to its parent
 * A per-unit base of 1.0 pu and 1 kV is used.
 * Returns an array of { id, voltage } results.
 */
export function runLoadFlow() {
  const diagram = getOneLine();
  const buses = diagram.filter(c => c && c.id);
  const results = [];
  let Vprev = 1; // slack bus voltage in per unit

  buses.forEach((bus, idx) => {
    if (idx === 0) {
      results.push({ id: bus.id, voltage: Vprev });
      return;
    }
    const P = (bus.load?.kw || 0) / 1000;   // convert kW to MW
    const Q = (bus.load?.kvar || 0) / 1000; // convert kvar to MVAR
    const Z = bus.impedance || { r: 0, x: 0 };
    // Very small Newton–Raphson update for radial feeder:
    // V_new = V_prev - (R*P + X*Q)/V_prev
    const dV = (Z.r * P + Z.x * Q) / Math.max(Vprev, 0.001);
    const V = Vprev - dV;
    Vprev = V;
    results.push({ id: bus.id, voltage: Number(V.toFixed(3)) });
  });
  return results;
}
