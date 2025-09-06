import { runShortCircuit } from './shortCircuit.js';
import { getOneLine } from '../dataStore.mjs';

/**
 * Compute incident energy using simplified IEEE 1584-2018 style
 * equations. Considers equipment enclosure type, gap, working
 * distance and protective device clearing time. Returns a map
 * id -> { incidentEnergy, boundary, ppeCategory } where energy
 * is in cal/cm^2 and boundary in millimeters.
 */
export function runArcFlash() {
  const sc = runShortCircuit();
  const sheets = getOneLine();
  const comps = Array.isArray(sheets[0]?.components)
    ? sheets.flatMap(s => s.components)
    : sheets;
  const results = {};
  comps.forEach(comp => {
    const Ibf = sc[comp.id]?.threePhaseKA || 0; // kA
    const enclosure = (comp.enclosure || 'box').toLowerCase();
    const Cf = enclosure === 'open' ? 1 : 1.5;
    const gap = Number(comp.gap) || 25; // mm
    const dist = Number(comp.working_distance) || 455; // mm (~18 in)
    const time = Number(comp.clearing_time) || 0.2; // seconds
    let energy = Cf * Math.pow(Ibf, 1.2) * time * (gap / 25) * Math.pow(610 / dist, 2);
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
      ppeCategory: ppe
    };
  });
  return results;
}
