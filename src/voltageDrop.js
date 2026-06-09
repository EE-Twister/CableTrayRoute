import ampacity from "../ampacity.mjs";
import { table9Impedance } from "./necTable9.mjs";

/**
 * Conductor voltage drop (percent of supply voltage), including conductor
 * reactance and load power factor:
 *
 *   Vd = factor · I · L · (R·cosθ + X·sinθ)
 *
 * where factor = 2 for single-phase (both conductors) or √3 for three-phase
 * (line-to-line %VD), and R, X are the per-conductor resistance and reactance
 * per unit length.
 *
 * Data sources / assumptions:
 *   - R and X are taken from NEC Chapter 9, Table 9 (AC resistance and reactance
 *     at 75 °C, 60 Hz, three single conductors in conduit) when the conductor
 *     size is listed. Conduit material selects the reactance/resistance column:
 *     steel/IMC/RMC/EMT are treated as magnetic; PVC/aluminum as non-magnetic
 *     (default when `cable.conduit_material` is not given).
 *   - When the size is not in Table 9, R falls back to the DC resistance
 *     temperature-corrected to `cable.insulation_rating` (or 75 °C), and X = 0.
 *   - Load power factor comes from `cable.power_factor`; when absent it defaults
 *     to 0.9 lagging — document the actual PF for accurate results.
 *
 * @param {Object} cable   Cable schedule row
 * @param {number} length  Run length (feet)
 * @param {number} phase   1 or 3
 * @returns {number} Voltage drop as a percent of supply voltage
 */
export function calculateVoltageDrop(cable = {}, length = 0, phase = 3) {
  const { dcResistance } = ampacity;
  const current = parseFloat(cable.est_load) || 0;
  const voltage =
    parseFloat(cable.operating_voltage) || parseFloat(cable.cable_rating) || 0;
  const material = cable.conductor_material;
  const conduit = cable.conduit_material || cable.raceway_material || cable.conduit_type;

  // Prefer NEC Table 9 AC resistance + reactance; fall back to temperature-
  // corrected DC resistance (and X = 0) when the size is not tabulated.
  const z = table9Impedance(cable.conductor_size, material, conduit);
  let RperMeter;
  let XperMeter;
  if (z) {
    RperMeter = z.R;
    XperMeter = z.X;
  } else {
    const temp = parseFloat(cable.insulation_rating) || 75;
    RperMeter = dcResistance(cable.conductor_size, material, temp);
    XperMeter = 0;
  }

  // Load power factor (lagging). Defaults to 0.9 when not provided.
  const pfRaw = parseFloat(cable.power_factor);
  const pf = Number.isFinite(pfRaw) && pfRaw > 0 && pfRaw <= 1 ? pfRaw : 0.9;
  const sinTheta = Math.sqrt(Math.max(0, 1 - pf * pf));

  const lengthMeters = (parseFloat(length) || 0) * 0.3048;
  const factor = phase === 1 ? 2 : Math.sqrt(3);
  const dropVolts = factor * current * lengthMeters * (RperMeter * pf + XperMeter * sinTheta);
  const percent = voltage ? (dropVolts / voltage) * 100 : 0;
  return percent;
}

export default calculateVoltageDrop;
