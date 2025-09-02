import ampacity from "../ampacity.js";

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
