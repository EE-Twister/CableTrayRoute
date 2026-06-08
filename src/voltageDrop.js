import ampacity from "../ampacity.mjs";

/**
 * Approximate conductor voltage drop (percent of supply voltage).
 *
 * SIMPLIFYING ASSUMPTIONS (the result is a resistive, unity-power-factor
 * estimate and is therefore NON-conservative for reactive loads):
 *   - Conductor REACTANCE is neglected: Vd = factor·I·R·L only. The full
 *     formula is Vd = factor·I·L·(R·cosθ + X·sinθ); with X omitted and an
 *     implied cosθ = 1, drop is understated for low-PF circuits and for large
 *     conductors where X is comparable to R.
 *   - Resistance is DC resistance temperature-corrected to the conductor's
 *     insulation_rating (e.g. 90 °C), or 20 °C when that field is absent.
 *   - factor = 2 for single-phase (both conductors), √3 for three-phase
 *     (line-to-line %VD), with R taken as one-conductor resistance per length.
 *
 * For a code-of-record check, use AC resistance and reactance from NEC
 * Chapter 9 Table 9 with the actual load power factor.
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
  const temp = parseFloat(cable.insulation_rating) || 20;
  const RperMeter = dcResistance(
    cable.conductor_size,
    cable.conductor_material,
    temp,
  );
  const lengthMeters = (parseFloat(length) || 0) * 0.3048;
  const factor = phase === 1 ? 2 : Math.sqrt(3);
  const dropVolts = factor * current * RperMeter * lengthMeters;
  const percent = voltage ? (dropVolts / voltage) * 100 : 0;
  return percent;
}

export default calculateVoltageDrop;
