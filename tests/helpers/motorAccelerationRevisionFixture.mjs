import fs from 'node:fs';

export function motorRevisionFixture(count = 25) {
  const input = JSON.parse(fs.readFileSync(new URL('../../samples/design-synthesis-voltage-revision.json', import.meta.url), 'utf8'));
  const originals = input.equipment;
  input.equipment = Array.from({ length: count }, (_, index) => ({ ...originals[index % originals.length], id: `LOAD-${index + 1}`, tag: `LOAD-${index + 1}`, kw: index ? 2 : 9 }));
  input.overrides.panelLocations = Object.fromEntries(input.equipment.map((row, index) => [`DP-${String(index + 1).padStart(2, '0')}`, { x: 100, y: 0, z: 0 }]));
  input.supply.frequencyHz = 60;
  input.supply.motorStartingImpedance = { rOhm: 0.006, xOhm: 0.015, reference: 'Synthetic phase-ohm source at 480 V within the declared 20 kA source bound.' };
  input.criteria.loadFlow = { minimumVoltagePu: 0.97, maxRevisions: 0 };
  input.criteria.motorStarting = { minimumVoltagePu: 0.8 };
  input.criteria.motorAcceleration = { maximumTimeS: 10 };
  input.equipment[0] = { ...input.equipment[0], powerFactor: 0.86, duty: 'continuous', ratingsBasis: 'electrical-input-kW', motor: {
    ratedVoltageV: 460, fullLoadCurrentA: 14, fullLoadCurrentBasis: { reference: 'Synthetic design-current basis; not an installed motor.' },
    nameplateCurrentA: 12.8, nameplateFrequencyHz: 60, lockedRotorCurrentA: 90, lockedRotorPowerFactor: 0.3, starterType: 'dol', rotorType: 'squirrel-cage',
    acceleration: { reference: 'Synthetic constant-electrical/constant-torque mechanics fixture.',
      motorInertiaKgM2: 0.4, motorInertiaReference: 'Synthetic rotor inertia.', loadInertiaKgM2: 0.6, loadInertiaReference: 'Synthetic load inertia referred to motor shaft.', targetSpeedRpm: 1000,
      performanceCurve: { reference: 'Synthetic speed points, not manufacturer data.', points: [
        { speedRpm: 0, currentA: 90, powerFactor: 0.3, torqueNm: 60 }, { speedRpm: 1000, currentA: 90, powerFactor: 0.3, torqueNm: 60 },
      ] }, loadTorqueCurve: { reference: 'Synthetic constant resisting torque.', points: [{ speedRpm: 0, torqueNm: 10 }, { speedRpm: 1000, torqueNm: 10 }] } },
  } };
  return input;
}
