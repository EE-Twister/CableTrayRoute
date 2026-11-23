import { motorRevisionFixture } from './motorAccelerationRevisionFixture.mjs';

export function syntheticProtectionTiming() {
  const conditions = initialState => ({ initialState, ambientTemperatureC: 40, frequencyHz: 60, phases: 3,
    voltageRangeV: [400, 500], reference: `Synthetic ${initialState} condition envelope; not motor or relay manufacturer data.` });
  const source = id => ({ id, reference: 'Synthetic mathematical bounds for acceptance testing only; no equipment performance or approval is asserted.', evidenceClass: 'synthetic' });
  return {
    schemaVersion: '1.0.0', initialState: 'cold', ambientTemperatureC: 40, frequencyHz: 60, phases: 3,
    referenceStartCurrentA: 100, referenceStartCurrentReference: 'Synthetic constant upper-current reference for this mathematical comparison.',
    currentEnvelopeA: { minimumA: 1, maximumA: 100, reference: 'Synthetic bound on every supplied and final-network current.' }, startMarginS: 0.2,
    motorWithstand: { referenceCurrentA: 100, hotMinimumSafeStallTimeS: 25, coldMinimumSafeStallTimeS: 40,
      hotConditions: conditions('hot'), coldConditions: conditions('cold'), source: source('synthetic-motor-withstand') },
    devices: [
      { role: 'branch-breaker', catalogNumber: '3VA5125-6EC31-0AA0', setting: { fixedIrA: 25, instantaneousPickupA: 150 },
        source: source('synthetic-breaker-bounds'), conditions: conditions('cold'), includesContactorOpening: false,
        minimumTrip: [{ currentA: 80, timeS: 15.625 }, { currentA: 125, timeS: 6.4 }],
        maximumTotalCircuitClearing: [{ currentA: 80, timeS: 31.25 }, { currentA: 125, timeS: 12.8 }] },
      { role: 'overload-relay', catalogNumber: '3RU2126-4AB0', setting: { dialSettingA: 12.8 },
        source: source('synthetic-overload-and-contactor-bounds'), conditions: conditions('cold'), includesContactorOpening: true,
        minimumTrip: [{ currentA: 80, timeS: 14.0625 }, { currentA: 125, timeS: 5.76 }],
        maximumTotalCircuitClearing: [{ currentA: 80, timeS: 25 }, { currentA: 125, timeS: 10.24 }] },
    ],
  };
}

export function protectionTimingFixture(count = 25) {
  const input = motorRevisionFixture(count);
  input.criteria.motorStarter = { branchProtectionMethod: 'inverse-time-breaker', controlVoltageV: 24, controlCurrentType: 'DC', instantaneousPickupA: 150 };
  input.equipment[0].motor.nameplateHorsepower = 10;
  input.equipment[0].motor.protectionTiming = syntheticProtectionTiming();
  return input;
}
