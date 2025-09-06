import ampacity from './ampacity.js';
import { calculateVoltageDrop } from './src/voltageDrop.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const conductorProps = require('./data/conductor_properties.json');

const { sizeToArea, ampacity: calcAmpacity } = ampacity;

export function sizeConductor(load = {}, params = {}) {
  const sizes = Object.keys(conductorProps).sort((a, b) => sizeToArea(a) - sizeToArea(b));
  const current = parseFloat(load.current) || 0;
  const voltage = parseFloat(load.voltage) || 0;
  const phases = parseInt(load.phases, 10) || 3;
  const required = current * 1.25; // 125% factor per code
  let chosen = null;
  for (const sz of sizes) {
    const cable = {
      conductor_size: sz,
      conductor_material: params.material || 'cu',
      insulation_rating: params.insulation_rating || 90,
      voltage_rating: voltage,
      est_load: current,
      operating_voltage: voltage
    };
    const amp = calcAmpacity(cable, params).ampacity;
    if (amp < required) continue;
    const vd = calculateVoltageDrop(cable, params.length || 0, phases);
    if (params.maxVoltageDrop && vd > params.maxVoltageDrop) continue;
    chosen = { size: sz, ampacity: amp, voltageDrop: vd };
    break;
  }
  if (!chosen) {
    const msg = `NEC/IEC violation: required ${required.toFixed(1)}A exceeds available conductor sizes`;
    return { size: null, ampacity: null, voltageDrop: null, violation: msg };
  }
  return { ...chosen, violation: null };
}

export function calculateAmpacity(cable, params = {}) {
  return calcAmpacity(cable, params).ampacity;
}

export { calculateVoltageDrop };

export default { sizeConductor, calculateAmpacity, calculateVoltageDrop };
