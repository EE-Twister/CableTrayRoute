import assert from 'node:assert/strict';
import {
  computeDoubleLineGroundCurrents,
  computeIEC60909Bus,
  kappaIEC,
  thermalMFactor
} from '../analysis/iec60909.mjs';
import { runShortCircuit } from '../analysis/shortCircuit.mjs';

function close(actual, expected, tolerance = 0.01) {
  assert.ok(Math.abs(actual - expected) <= tolerance,
    `expected ${expected} ± ${tolerance}, got ${actual}`);
}

const equalZ = { r: 0.02, x: 0.2 };

// C1: IEC 60909-0:2016 Eq. 102 stays finite across the X/R range and honors
// duration. m tends to 2 as kappa -> 2 (a DC component that never decays).
for (const xr of [0.1, 0.2, 0.5, 1, 10]) {
  const kappa = kappaIEC(xr);
  const m = thermalMFactor(kappa, 1, 50);
  assert.ok(Number.isFinite(m) && m >= 0 && m <= 2, `invalid m at X/R=${xr}`);
}
assert.ok(thermalMFactor(1.02, 1, 50) < 0.01);
assert.equal(thermalMFactor(2, 1, 50), 2);
assert.ok(thermalMFactor(1.8, 0.1, 50) > thermalMFactor(1.8, 1, 50), 'm falls as fault duration grows');
assert.equal(thermalMFactor(2.5, 1, 50), null);
assert.equal(thermalMFactor(Number.NaN, 1, 50), null);
assert.equal(kappaIEC(0), null);
assert.equal(kappaIEC(-1), null);
assert.equal(kappaIEC(Number.NaN), null);
assert.equal(thermalMFactor(1.5, 0, 50), null);

// C2/C3: unequal sequence impedances must be used in LL and 2LG calculations.
const unequal = { z1: equalZ, z2: { r: 0.05, x: 0.1 }, z0: { r: 0.1, x: 0.3 } };
const direct = computeIEC60909Bus({ ...unequal, prefaultKV: 11 });
close(direct.lineToLineKA, 39.28);
close(direct.doubleLineGroundPhaseBKA, 37.61);
close(direct.doubleLineGroundPhaseCKA, 39.88);
close(direct.doubleLineGroundEarthKA, 19.54);
close(direct.doubleLineGroundKA, Math.max(direct.doubleLineGroundPhaseBKA, direct.doubleLineGroundPhaseCKA));
assert.equal(direct.validity, 'evaluated');
assert.equal(direct.calculationStatus, 'screening-only');
assert.equal(direct.provenance.standard, 'IEC 60909-0:2016');

const equalCurrents = computeDoubleLineGroundCurrents({ phaseVoltage: 11 * 1.1 / Math.sqrt(3), ...{
  z1: equalZ, z2: equalZ, z0: equalZ
} });
close(equalCurrents.phaseBKA, 34.76);
close(equalCurrents.phaseCKA, 34.76);
close(equalCurrents.earthKA, 34.76);

// C4: missing source/sequence data cannot become a low-impedance numeric result.
const invalidDirect = computeIEC60909Bus({ z1: null, z2: equalZ, z0: equalZ, prefaultKV: 11 });
assert.equal(invalidDirect.threePhaseKA, null);
assert.equal(invalidDirect.doubleLineGroundKA, null);
assert.equal(invalidDirect.validity, 'unevaluated');
assert.equal(invalidDirect.calculationStatus, 'incomplete');
assert.ok(invalidDirect.requiredInputs.length > 0);

for (const invalid of [
  { z1: { r: Number.NaN, x: 0.2 }, z2: equalZ, z0: equalZ, prefaultKV: 11 },
  { z1: equalZ, z2: { r: 1, x: 0 }, z0: { r: -1, x: 0 }, prefaultKV: 11 },
  { z1: equalZ, z2: equalZ, z0: equalZ, prefaultKV: Number.NaN }
]) {
  const result = computeIEC60909Bus(invalid);
  assert.equal(result.validity, 'unevaluated');
  assert.equal(result.calculationStatus, 'incomplete');
  assert.equal(result.threePhaseKA, null);
  assert.ok(result.requiredInputs.length > 0);
}

const invalidRun = runShortCircuit([{
  id: 'BUS-MISSING', type: 'bus', subtype: 'Bus', kV: 11, method: 'IEC'
}]);
assert.equal(invalidRun['BUS-MISSING'].threePhaseKA, null);
assert.equal(invalidRun['BUS-MISSING'].validity, 'unevaluated');
assert.equal(invalidRun['BUS-MISSING'].calculationStatus, 'incomplete');
assert.ok(invalidRun['BUS-MISSING'].warnings.length > 0);
assert.equal(invalidRun['BUS-MISSING'].impedanceProvenance.totalR, null);
assert.equal(invalidRun['BUS-MISSING'].impedanceProvenance.totalX, null);

const invalidRawRun = runShortCircuit([{
  id: 'BUS-NAN', type: 'bus', subtype: 'Bus', kV: 11, method: 'IEC',
  z1: { r: Number.NaN, x: 0.2 }, z2: equalZ, z0: equalZ
}]);
assert.equal(invalidRawRun['BUS-NAN'].threePhaseKA, null);
assert.equal(invalidRawRun['BUS-NAN'].validity, 'unevaluated');
assert.equal(invalidRawRun['BUS-NAN'].calculationStatus, 'incomplete');
assert.equal(invalidRawRun['BUS-NAN'].impedanceProvenance.totalR, null);

const singularAnsiRun = runShortCircuit([{
  id: 'BUS-SINGULAR', type: 'bus', subtype: 'Bus', kV: 0.48, method: 'ANSI',
  z1: { r: 1, x: 0 }, z2: { r: 1, x: 0 }, z0: { r: -2, x: 0 }
}]);
assert.equal(singularAnsiRun['BUS-SINGULAR'].threePhaseKA, null);
assert.equal(singularAnsiRun['BUS-SINGULAR'].lineToGroundKA, null);
assert.equal(singularAnsiRun['BUS-SINGULAR'].validity, 'unevaluated');
assert.equal(singularAnsiRun['BUS-SINGULAR'].calculationStatus, 'incomplete');

console.log('IEC 60909 C1-C4 correction checks passed');
