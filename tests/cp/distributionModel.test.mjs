import assert from 'node:assert/strict';
import { computeDistributionBySegment, parseZoneResistivityValues } from '../../src/studies/cp/distributionModel.js';

(function testParseZoneResistivityValues() {
  assert.deepEqual(parseZoneResistivityValues('120, 240, bad, -1, 360'), [120, 240, 360]);
  assert.deepEqual(parseZoneResistivityValues(''), []);
})();

(function testComputeDistributionBySegmentGeometryAttenuation() {
  const result = computeDistributionBySegment({
    anodeTypeSystem: 'galvanic',
    numberOfAnodes: 5,
    anodeSpacingM: 140,
    anodeDistanceToStructureM: 70,
    anodeBurialDepthM: 1,
    soilResistivityOhmM: 120,
    zoneResistivityOhmM: [120, 360, 80]
  });

  assert.equal(result.segmentCount, 5);
  assert.equal(result.globalAttenuationFactor, 2.14);
  assert.equal(result.averageEffectivenessFactor, 0.467);
  assert.equal(result.segments[0].effectivenessFactor, 0.45);
  assert.equal(result.segments[3].effectivenessFactor, 0.45);
})();

console.log('✓ cp distribution model tests passed');
