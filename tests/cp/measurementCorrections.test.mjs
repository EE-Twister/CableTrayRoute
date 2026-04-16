import assert from 'node:assert/strict';
import { applyMeasurementCorrections } from '../../src/studies/cp/measurementCorrections.js';

(function testOnPotentialCorrectionPath() {
  const result = applyMeasurementCorrections({
    measuredInstantOffPotentialMv: -780,
    simulatedPolarizationShiftMv: 105,
    measuredIrDropMv: 90,
    couponDepolarizationMv: null,
    testMethod: 'on-potential',
    measurementContext: 'native-soil',
    referenceElectrodeLocation: 'local',
    irDropCompensationMethod: 'calculated'
  });

  assert.equal(result.correctedValues.instantOffPotentialMv, -690);
  assert.equal(result.correctedValues.polarizationShiftMv, 105);
  assert.equal(result.warnings.length, 0);
})();

(function testCouponFallbackForPolarizationShift() {
  const result = applyMeasurementCorrections({
    measuredInstantOffPotentialMv: -820,
    simulatedPolarizationShiftMv: null,
    measuredIrDropMv: null,
    couponDepolarizationMv: 120,
    testMethod: 'coupon',
    measurementContext: 'unknown',
    referenceElectrodeLocation: 'unknown',
    irDropCompensationMethod: 'none'
  });

  assert.equal(result.correctedValues.instantOffPotentialMv, -700);
  assert.equal(result.correctedValues.polarizationShiftMv, 120);
  assert.equal(result.warnings.length, 3);
})();

console.log('✓ cp measurement correction tests passed');
