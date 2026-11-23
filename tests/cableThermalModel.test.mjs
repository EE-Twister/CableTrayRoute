import assert from 'assert';
import { calculateCableThermalRating, normalizeCableThermalInputs } from '../analysis/cableThermalModel.mjs';

const cable = {
  id: 'THERM-TEST-1', name: 'test cable', sizeMm2: 95, material: 'Cu', maxTempC: 90,
  acResistanceOhmPerKm: 0.242, acResistanceTempC: 90, acResistanceFrequencyHz: 60,
  dielectricLossWPerM: 0, lambdaSheath: 0.05, outerDiameterMm: 40,
  insulationLayers: [{ name: 'XLPE', innerDiameterMm: 20, outerDiameterMm: 24, resistivityKmPerW: 3.5 }],
  jacketInnerDiameterMm: 30, jacketResistivityKmPerW: 6, metallicSheath: true,
  source: { url: 'https://example.invalid/test' }, assumptions: [], modelLimits: [],
};

function installation(formation = 'isolated', extra = {}) {
  return { formation, burialDepthMm: 800, soilResistivityKmPerW: 1, ambientTempC: 20, frequencyHz: 60, ...extra };
}

const result = calculateCableThermalRating({ cable, installation: installation() });
const expectedT1 = (3.5 / (2 * Math.PI)) * Math.log(24 / 20);
const expectedT3 = (6 / (2 * Math.PI)) * Math.log(40 / 30);
const expectedT4 = (1 / (2 * Math.PI)) * Math.log((40 + Math.sqrt(40 ** 2 - 1)));

assert.ok(Math.abs(result.thermalResistances.T1_KmPerW - expectedT1) < 1e-12);
assert.ok(Math.abs(result.thermalResistances.T3_KmPerW - expectedT3) < 1e-12);
assert.ok(Math.abs(result.thermalResistances.T4Matrix_KmPerW[0][0] - expectedT4) < 1e-12);
assert.equal(result.readiness, 'screening-only');
assert.equal(result.normalizedInputs.cable.id, 'THERM-TEST-1');
assert.equal(result.temperatures.limitingPhase, 0);

const flat = calculateCableThermalRating({ cable, installation: installation('flat-spaced', { spacingMm: 100 }) });
assert.equal(flat.thermalResistances.T4Matrix_KmPerW.length, 3);
assert.ok(flat.thermalResistances.T4EffectiveByCable_KmPerW[1] > flat.thermalResistances.T4EffectiveByCable_KmPerW[0]);
assert.equal(flat.limitingPhase, 1);
// Independent literal image-source matrix values for 40 mm cable, 100 mm
// centre spacing, 800 mm burial and rho=1 K·m/W.
const expectedMatrix = [
  [0.6973963258783805, 0.4415814442520481, 0.33218718419188625],
  [0.4415814442520481, 0.6973963258783805, 0.4415814442520481],
  [0.33218718419188625, 0.4415814442520481, 0.6973963258783805],
];
for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
  assert.ok(Math.abs(flat.thermalResistances.T4Matrix_KmPerW[i][j] - expectedMatrix[i][j]) < 1e-12);
}

const trefoil = calculateCableThermalRating({ cable, installation: installation('trefoil-touching') });
const expectedTouching = 3 / (2 * Math.PI) * (Math.log(4 * 0.8 / 0.04) - 0.63);
assert.ok(Math.abs(trefoil.thermalResistances.T4EffectiveByCable_KmPerW[0] - expectedTouching) < 1e-12);
assert.equal(trefoil.thermalResistances.T4EffectiveByCable_KmPerW.length, 3);
assert.equal(trefoil.phasePositionsMm.length, 3);
assert.ok(trefoil.temperatures.conductorCByPhase.every(temp => Math.abs(temp - 90) < 1e-12));
assert.ok(trefoil.losses.totalLossWPerM > trefoil.losses.conductorLossWPerM);

assert.throws(() => normalizeCableThermalInputs({ cable: { ...cable, acResistanceTempC: 85 }, installation: installation() }), /acResistanceTempC must equal/);
assert.throws(() => normalizeCableThermalInputs({ cable: { ...cable, insulationLayers: [{ ...cable.insulationLayers[0], outerDiameterMm: 25 }, { name: 'screen', innerDiameterMm: 26, outerDiameterMm: 28, resistivityKmPerW: 1 } ] }, installation: installation() }), /not contiguous/);
assert.throws(() => calculateCableThermalRating({ cable, installation: installation('flat-spaced', { spacingMm: 40 }) }), /spacing greater than 1.05/);
assert.throws(() => calculateCableThermalRating({ cable, installation: { ...installation(), formation: undefined } }), /formation is required/);
assert.throws(() => calculateCableThermalRating({ cable: { ...cable, maxTempC: -273.15, acResistanceTempC: -273.15 }, installation: installation() }), /absolute zero/);
assert.throws(() => calculateCableThermalRating({ cable: { ...cable, metallicSheath: false }, installation: installation('trefoil-touching') }), /metallicSheath/);
assert.throws(() => calculateCableThermalRating({ cable: { ...cable, jacketInnerDiameterMm: 35, metallicSheath: false }, installation: installation() }), /metallicSheath/);
assert.throws(() => calculateCableThermalRating({ cable: { ...cable, lambdaSheath: 1e308 }, installation: { ...installation(), soilResistivityKmPerW: 1e308 } }), /non-positive or non-finite|overflowed or produced a non-finite/);

console.log('✓ detailed cable thermal model cylindrical, matrix, touching, and validation cases');
