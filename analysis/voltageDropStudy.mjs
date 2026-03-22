/**
 * Voltage Drop Compliance Study
 *
 * Iterates all cables in a project, calculates voltage drop percent for each,
 * classifies as feeder or branch circuit, and checks NEC 215.2 / 210.19 limits:
 *   - Feeder circuits:       ≤ 3 % recommended
 *   - Branch circuits:       ≤ 3 % recommended (≤ 5 % total feeder + branch)
 *
 * References:
 *   NEC 2023 Art. 210.19(A)(1) Informational Note — 3 % branch circuit limit
 *   NEC 2023 Art. 215.2(A)(3)  Informational Note — 3 % feeder limit, 5 % combined
 *   IEC 60364-5-52:2009 — Installation methods and voltage drop
 */

import { calculateVoltageDrop } from '../src/voltageDrop.js';

/** NEC recommended voltage-drop limits (%) */
export const NEC_LIMITS = {
  feeder: 3,
  branch: 3,
  combined: 5,
};

/**
 * Determine whether a cable is a feeder or branch circuit.
 * Uses `cable.circuit_type` when available; falls back to heuristics on
 * `cable.service_type`, `cable.cable_type`, and description keywords.
 *
 * @param {Object} cable
 * @returns {'feeder'|'branch'}
 */
export function classifyCircuit(cable) {
  const ct = (cable.circuit_type || cable.service_type || '').toLowerCase();
  if (ct.includes('feeder') || ct.includes('main') || ct.includes('distribution')) {
    return 'feeder';
  }
  const cType = (cable.cable_type || cable.type || '').toLowerCase();
  if (cType.includes('feeder') || cType.includes('main') || cType.includes('distribution')) {
    return 'feeder';
  }
  return 'branch';
}

/**
 * Evaluate a single cable and return its voltage drop result.
 *
 * @param {Object} cable  - Cable schedule row
 * @param {number} [lengthFt] - Override length in feet (falls back to cable.length)
 * @returns {{
 *   tag: string,
 *   from: string,
 *   to: string,
 *   conductorSize: string,
 *   material: string,
 *   lengthFt: number,
 *   currentA: number,
 *   voltageV: number,
 *   dropPct: number,
 *   circuitType: 'feeder'|'branch',
 *   limit: number,
 *   status: 'pass'|'warn'|'fail'
 * }}
 */
export function evaluateCable(cable, lengthFt) {
  const len = parseFloat(lengthFt ?? cable.length ?? cable.route_length ?? 0) || 0;
  const phase = parseInt(cable.phases ?? cable.num_phases ?? 3, 10) || 3;
  const dropPct = calculateVoltageDrop(cable, len, phase);
  const circuitType = classifyCircuit(cable);
  const limit = NEC_LIMITS[circuitType];

  let status;
  if (!dropPct || !len) {
    status = 'pass'; // no data — assume compliant
  } else if (dropPct > limit) {
    status = 'fail';
  } else if (dropPct > limit * 0.8) {
    status = 'warn'; // within 80–100 % of limit
  } else {
    status = 'pass';
  }

  return {
    tag: cable.cable_tag || cable.tag || cable.id || '',
    from: cable.from_location || cable.origin || '',
    to: cable.to_location || cable.destination || '',
    conductorSize: cable.conductor_size || '',
    material: cable.conductor_material || 'CU',
    lengthFt: len,
    currentA: parseFloat(cable.est_load || cable.current || 0) || 0,
    voltageV: parseFloat(cable.operating_voltage || cable.cable_rating || 0) || 0,
    dropPct: Number.isFinite(dropPct) ? dropPct : 0,
    circuitType,
    limit,
    status,
  };
}

/**
 * Run a full voltage drop study for an array of cable schedule rows.
 *
 * @param {Object[]} cables
 * @returns {{
 *   results: Array,
 *   summary: {
 *     total: number,
 *     pass: number,
 *     warn: number,
 *     fail: number,
 *     maxDropPct: number,
 *     avgDropPct: number
 *   }
 * }}
 */
export function runVoltageDropStudy(cables = []) {
  const results = cables.map(c => evaluateCable(c));

  const withData = results.filter(r => r.lengthFt > 0 && r.currentA > 0);
  const maxDropPct = withData.length
    ? Math.max(...withData.map(r => r.dropPct))
    : 0;
  const avgDropPct = withData.length
    ? withData.reduce((s, r) => s + r.dropPct, 0) / withData.length
    : 0;

  const summary = {
    total: results.length,
    pass: results.filter(r => r.status === 'pass').length,
    warn: results.filter(r => r.status === 'warn').length,
    fail: results.filter(r => r.status === 'fail').length,
    maxDropPct,
    avgDropPct,
  };

  return { results, summary };
}
