import { runShortCircuit } from './shortCircuit.js';

/**
 * Estimate incident energy per IEEE 1584 style equations.
 * Uses the short circuit current from runShortCircuit and
 * assumes a working distance of 18 in. Returns an object
 * mapping id -> { incidentEnergy } in cal/cm^2.
 */
export function runArcFlash() {
  const sc = runShortCircuit();
  const results = {};
  Object.entries(sc).forEach(([id, data]) => {
    const I = data.faultKA || 0; // kA
    // Simplified IEEE 1584 empirical formula
    const energy = 0.0001 * Math.pow(I, 1.2);
    results[id] = { incidentEnergy: Number(energy.toFixed(2)) };
  });
  return results;
}
