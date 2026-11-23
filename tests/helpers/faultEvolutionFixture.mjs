import fs from 'node:fs';

/** Synthetic mathematical network, not motor or protective-device performance data. */
export function faultEvolutionFixture(count = 25, withMotor = true) {
  const input = JSON.parse(fs.readFileSync(new URL('../../samples/design-synthesis-tray-congestion.json', import.meta.url), 'utf8'));
  input.equipment = Array.from({ length: count }, (_, index) => ({ ...input.equipment[0], id: `L-${String(index + 1).padStart(2, '0')}`, tag: `L-${String(index + 1).padStart(2, '0')}` }));
  input.overrides.panelLocations['DP-01'] = { x: 10, y: 0, z: 0, note: 'Synthetic network with separate upstream and downstream impedances.' };
  input.corridors = {
    nodes: [{ id: 'N0', x: 0, y: 0, z: 0 }, { id: 'NP', x: 10, y: 0, z: 0 }, { id: 'NL', x: 20, y: 0, z: 0 }],
    edges: [{ id: 'UP', from: 'N0', to: 'NP', widthIn: 24, depthIn: 6, permitted: true }, { id: 'DOWN', from: 'NP', to: 'NL', widthIn: 24, depthIn: 6, permitted: true }],
  };
  if (withMotor) {
    Object.assign(input.equipment.at(-1), { kw: 9, powerFactor: 0.86, duty: 'continuous', ratingsBasis: 'electrical-input-kW', motor: {
      ratedVoltageV: 460, fullLoadCurrentA: 14, fullLoadCurrentBasis: { reference: 'Synthetic current; not manufacturer data.' },
      nameplateCurrentA: 12.8, nameplateHorsepower: 10, nameplateFrequencyHz: 60,
      lockedRotorCurrentA: 90, lockedRotorPowerFactor: 0.3, starterType: 'dol', rotorType: 'squirrel-cage',
    } });
    input.supply.motorStartingImpedance = { rOhm: 0.006, xOhm: 0.015, reference: 'Synthetic independent starting source.' };
    input.criteria.motorStarting = { minimumVoltagePu: 0.8 };
    input.criteria.motorStarter = { controlVoltageV: 24, controlCurrentType: 'DC', branchProtectionMethod: 'inverse-time-breaker', instantaneousPickupA: 150 };
  }
  input.faultStudy = {
    networkBaseMVA: 1,
    sourceInventory: { status: 'complete', reference: 'Synthetic test inventory, not field verified.' },
    sources: [{ equipmentId: 'S', emfPhaseV: { re: 480 / Math.sqrt(3), im: 0 }, impedance: { rOhm: 0.006, xOhm: 0.015 }, inService: true, reference: 'Synthetic fixed utility equivalent.' }],
  };
  if (withMotor) input.faultStudy.sources.push({ equipmentId: input.equipment.at(-1).id, emfPhaseV: { re: 460 / Math.sqrt(3), im: 0 }, impedance: { rOhm: 1, xOhm: 3 }, inService: true, reference: 'Synthetic fixed motor equivalent, not measured transient parameters.' });
  input.faultEvolution = {
    schemaVersion: '1.0.0', horizonS: 0.1, reference: 'Synthetic piecewise-linear EMF histories for mathematical acceptance only.',
    profiles: input.faultStudy.sources.map(row => ({
      equipmentId: row.equipmentId,
      source: { reference: 'Synthetic illustrative history, not a physical motor decrement curve.', evidenceClass: 'synthetic' },
      conditions: { ambientTemperatureC: 40, frequencyHz: 60, phases: 3, voltageRangeV: [400, 500], reference: 'Synthetic condition applicability.' },
      points: [{ timeS: 0, emfMultiplier: 1 }, { timeS: 0.1, emfMultiplier: row.equipmentId === 'S' ? 1 : 0 }],
    })),
  };
  return input;
}

export const add = (a, b) => ({ re: a.re + b.re, im: a.im + b.im });
export const scale = (a, factor) => ({ re: a.re * factor, im: a.im * factor });
export const divide = (a, b) => ({ re: (a.re * b.re + a.im * b.im) / (b.re ** 2 + b.im ** 2), im: (a.im * b.re - a.re * b.im) / (b.re ** 2 + b.im ** 2) });
export const squaredMagnitude = a => a.re ** 2 + a.im ** 2;
export const cableOhms = cable => ({ re: cable.r_ohm_per_kft * cable.lengthFt / 1000, im: cable.x_ohm_per_kft * cable.lengthFt / 1000 });

/** Separate one-node circuit equation; ordinary nonfaulted loads are open here. */
export function remoteLoadFaultOracle(proposal, input, utilityMultiplier, motorMultiplier, faultId = 'L-01') {
  const feeder = proposal.cables.find(row => row.to === 'DP-01');
  const motorId = input.equipment.at(-1).id;
  const motorCable = proposal.cables.find(row => row.to === motorId);
  const faultCable = proposal.cables.find(row => row.to === faultId);
  const utility = input.faultStudy.sources[0];
  const motor = input.faultStudy.sources[1];
  const zUtility = add({ re: utility.impedance.rOhm, im: utility.impedance.xOhm }, cableOhms(feeder));
  const zMotor = add({ re: motor.impedance.rOhm, im: motor.impedance.xOhm }, cableOhms(motorCable));
  const zFault = cableOhms(faultCable);
  const inverse = value => divide({ re: 1, im: 0 }, value);
  const numerator = add(divide(scale(utility.emfPhaseV, utilityMultiplier), zUtility), divide(scale(motor.emfPhaseV, motorMultiplier), zMotor));
  const denominator = add(add(inverse(zUtility), inverse(zMotor)), inverse(zFault));
  const panelVoltage = divide(numerator, denominator);
  return { faultCurrentA: divide(panelVoltage, zFault), motorFromCurrentA: divide(add(panelVoltage, scale(motor.emfPhaseV, -motorMultiplier)), zMotor) };
}
