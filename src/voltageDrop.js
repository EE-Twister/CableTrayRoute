import ampacity from "../ampacity.mjs";
import { isMetricConductorSize, normalizeSizeToken, table9Impedance } from "./necTable9.mjs";
import { normalizeCablePhases } from "../utils/cablePhases.js";
import { createCalculationResult } from "../analysis/resultContract.mjs";

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
 *   - `parallel_count` is the number of equal-length, equal-sharing conductors
 *     per phase. An optional `impedance` / `impedance_per_1000ft` override is
 *     interpreted as resistive ohms per 1000 ft and takes precedence over the
 *     tabulated conductor model.
 *
 * @param {Object} cable   Cable schedule row
 * @param {number} length  Run length (feet)
 * @param {number|string[]|string} phase   phase count or phase labels
 * @returns {number} Voltage drop as a percent of supply voltage
 */
export function calculateVoltageDrop(cable = {}, length = 0, phase = 3) {
  const { dcResistance } = ampacity;
  const currentRaw = cable.est_load;
  const voltageRaw = cable.operating_voltage ?? cable.cable_rating;
  const current = currentRaw === '' || currentRaw == null ? 0 : Number(currentRaw);
  const voltage = voltageRaw === '' || voltageRaw == null ? 0 : Number(voltageRaw);
  const parallelRaw = cable.parallel_count ?? cable.parallel_runs ?? cable.parallel;
  const parallelCount = parallelRaw == null || parallelRaw === '' ? 1 : Number(parallelRaw);
  if (!Number.isInteger(parallelCount) || parallelCount < 1) return null;
  if (!(Number.isFinite(current) && current > 0 && Number.isFinite(voltage) && voltage > 0)) return null;
  const phaseCount = normalizeCablePhases(phase).length ||
    (Number.isFinite(Number(phase)) ? Number(phase) : normalizeCablePhases(cable).length);
  if (![1, 2, 3].includes(phaseCount)) return null;
  const material = cable.conductor_material;
  const conduit = cable.conduit_material || cable.raceway_material || cable.conduit_type;

  // Prefer NEC Table 9 AC resistance + reactance; fall back to temperature-
  // corrected DC resistance (and X = 0) when the size is not tabulated.
  const impedanceOverride = Number(cable.impedance_per_1000ft ?? cable.impedance);
  const z = Number.isFinite(impedanceOverride) && impedanceOverride > 0
    ? { R: impedanceOverride / 304.8, X: 0 }
    : table9Impedance(cable.conductor_size, material, conduit);
  let RperMeter;
  let XperMeter;
  if (z) {
    RperMeter = z.R;
    XperMeter = z.X;
  } else if (isMetricConductorSize(cable.conductor_size) || !normalizeSizeToken(cable.conductor_size)) {
    // Table 9 and the DC fallback are AWG/kcmil models. Never interpret the
    // numeric part of a metric description as an unrelated AWG size.
    return null;
  } else {
    const temp = parseFloat(cable.insulation_rating) || 75;
    RperMeter = dcResistance(cable.conductor_size, material, temp);
    XperMeter = 0;
  }
  if (!(Number.isFinite(RperMeter) && RperMeter > 0 && Number.isFinite(XperMeter) && XperMeter >= 0)) return null;

  // Load power factor (lagging). Defaults to 0.9 when not provided.
  const pfRaw = parseFloat(cable.power_factor);
  const pf = Number.isFinite(pfRaw) && pfRaw > 0 && pfRaw <= 1 ? pfRaw : 0.9;
  const sinTheta = Math.sqrt(Math.max(0, 1 - pf * pf));

  const lengthFt = Number(length);
  if (!(Number.isFinite(lengthFt) && lengthFt > 0)) return null;
  const lengthMeters = lengthFt * 0.3048;
  const factor = phaseCount === 3 ? Math.sqrt(3) : 2;
  // Parallel conductors share the circuit current and therefore reduce the
  // equivalent per-phase impedance by the same factor under the equal-length,
  // equal-sharing model.
  const dropVolts = factor * current * lengthMeters
    * ((RperMeter * pf + XperMeter * sinTheta) / parallelCount);
  const percent = voltage ? (dropVolts / voltage) * 100 : 0;
  return percent;
}

export function calculateVoltageDropResult(cable = {}, length = 0, phase = 3) {
  const value = calculateVoltageDrop(cable, length, phase);
  const phaseCount = normalizeCablePhases(phase).length || (Number.isFinite(Number(phase)) ? Number(phase) : 0);
  const warnings = [];
  if (!(Number(length) > 0)) warnings.push('A positive cable length is required.');
  const currentValue = Number(cable?.est_load);
  const voltageValue = Number(cable?.operating_voltage ?? cable?.cable_rating);
  if (!(Number.isFinite(currentValue) && currentValue > 0)) warnings.push('A positive operating current is required.');
  if (!(Number.isFinite(voltageValue) && voltageValue > 0)) warnings.push('A positive operating voltage is required.');
  if (![1, 2, 3].includes(phaseCount)) warnings.push('Phase count must be 1, 2, or 3.');
  if (!cable?.conductor_size) warnings.push('A conductor size is required.');
  if (!Number.isFinite(value)) warnings.push('Voltage drop was not evaluated because required inputs or conductor impedance are unsupported.');
  const parallelCount = cable.parallel_count ?? cable.parallel_runs ?? cable.parallel ?? 1;
  return {
    value: Number.isFinite(value) ? value : null,
    units: '%',
    resultContract: createCalculationResult({
      value,
      units: '%',
      validity: Number.isFinite(value) ? 'evaluated' : 'unevaluated',
      inputSources: { cable: 'Cable Schedule', impedance: describeVoltageDropBasis(cable) },
      assumptions: { phaseCount, parallelCount, powerFactor: cable.power_factor ?? 0.9, conduitMaterial: cable.conduit_material ?? cable.raceway_material ?? cable.conduit_type ?? null, impedanceOverride: cable.impedance_per_1000ft ?? cable.impedance ?? null, temperatureRating: cable.insulation_rating ?? 75 },
      modelLimits: { model: 'screening voltage drop' },
      warnings,
      inputs: { cable: { ...cable, power_factor: cable.power_factor ?? 0.9, parallel_count: parallelCount, conduit_material: cable.conduit_material ?? cable.raceway_material ?? cable.conduit_type ?? null, impedance_per_1000ft: cable.impedance_per_1000ft ?? cable.impedance ?? null }, length, phase: phaseCount },
    }),
  };
}

/**
 * Describe the impedance source used by the screening calculation. This is
 * kept beside the solver so reports do not claim Table 9 when an override or
 * a DC fallback supplied the result.
 */
export function describeVoltageDropBasis(cable = {}) {
  const impedanceOverride = Number(cable.impedance_per_1000ft ?? cable.impedance);
  if (Number.isFinite(impedanceOverride) && impedanceOverride > 0) {
    return 'Resistance override per 1000 ft (reactance assumed zero)';
  }
  if (isMetricConductorSize(cable.conductor_size) || !normalizeSizeToken(cable.conductor_size)) {
    return 'Unsupported conductor size (voltage drop not evaluated)';
  }
  if (table9Impedance(cable.conductor_size, cable.conductor_material, cable.conduit_material || cable.raceway_material || cable.conduit_type)) {
    return 'NEC Ch. 9 Table 9 AC resistance and reactance (load power factor applied)';
  }
  const temperature = parseFloat(cable.insulation_rating) || 75;
  const dc = ampacity.dcResistance(cable.conductor_size, cable.conductor_material, temperature);
  return Number.isFinite(dc) && dc > 0
    ? 'Temperature-corrected DC resistance fallback (reactance assumed zero)'
    : 'Unsupported conductor size (voltage drop not evaluated)';
}

export default calculateVoltageDrop;
