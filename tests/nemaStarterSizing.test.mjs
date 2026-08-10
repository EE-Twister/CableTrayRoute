import assert from 'node:assert/strict';
import {
  NEMA_STARTER_HP_TABLE_ROWS,
  approximateMccBucketSizeFromNema,
  approximateNemaStarterSize
} from '../src/mcc-lineup/nemaStarterSizing.mjs';

assert.equal(NEMA_STARTER_HP_TABLE_ROWS.length, 11, 'the shared table should cover NEMA sizes 00 through 9');

assert.deepEqual(
  approximateNemaStarterSize({ hp: '5', voltage: '480', phases: '3', starterType: 'fvnr' }).size,
  '0',
  '5 HP at 480 V should select NEMA size 0'
);
assert.equal(
  approximateNemaStarterSize({ hp: '25', voltage: '480V', phases: 3, starterType: 'fvnr' }).size,
  '2',
  'the exact 25 HP boundary should remain NEMA size 2'
);
assert.equal(
  approximateNemaStarterSize({ hp: '25.01', voltage: 480, phases: 3, starterType: 'fvnr' }).size,
  '3',
  'a value above the size 2 boundary should advance to NEMA size 3'
);
assert.equal(
  approximateNemaStarterSize({ hp: '10', voltage: 230, phases: 3, starterType: 'wye-delta' }).size,
  '1',
  'wye-delta selection should use its own table columns'
);

const assumedMethod = approximateNemaStarterSize({ hp: 25, voltage: 480, phases: 3 });
assert.equal(assumedMethod.size, '2');
assert.equal(assumedMethod.assumedFullVoltage, true);
assert.match(assumedMethod.basis, /assumed/i);

assert.equal(approximateNemaStarterSize({ hp: 25, voltage: 415, phases: 3, starterType: 'fvnr' }).reason, 'unsupported-voltage');
assert.equal(approximateNemaStarterSize({ hp: 25, voltage: 480, phases: 1, starterType: 'fvnr' }).reason, 'unsupported-phases');
assert.equal(approximateNemaStarterSize({ hp: 25, voltage: 480, phases: 3, starterType: 'soft-starter' }).reason, 'unsupported-method');
assert.equal(approximateNemaStarterSize({ hp: 0, voltage: 480, phases: 3, starterType: 'fvnr' }).reason, 'missing-hp');

const conservativeSizes = [
  ['00', 12, 2],
  ['1', 12, 2],
  ['2', 12, 2],
  ['3', 24, 4],
  ['4', 36, 6],
  ['5', 48, 8]
];
conservativeSizes.forEach(([starterSize, heightIn, sizeUnits]) => {
  const estimate = approximateMccBucketSizeFromNema({ starterSize, starterType: 'fvnr', unitHeightIn: 6 });
  assert.equal(estimate.heightIn, heightIn, `NEMA ${starterSize} should use the conservative bucket height`);
  assert.equal(estimate.sizeUnits, sizeUnits, `NEMA ${starterSize} should convert inches to MCC units`);
});

const fullSection = approximateMccBucketSizeFromNema({
  starterSize: 'NEMA 6',
  starterType: 'fvnr',
  unitHeightIn: 6,
  usableBucketHeightIn: 72
});
assert.equal(fullSection.heightIn, 72);
assert.equal(fullSection.sizeUnits, 12);
assert.equal(fullSection.fullSection, true);
assert.equal(approximateMccBucketSizeFromNema({ starterSize: 'NEMA 7', starterType: 'fvnr' }).reason, 'custom-size-required');
assert.equal(approximateMccBucketSizeFromNema({ starterSize: 'NEMA 3', starterType: 'fvr' }).reason, 'unsupported-method');
assert.equal(approximateMccBucketSizeFromNema({ starterSize: 'NEMA 3', starterType: 'soft-starter' }).reason, 'unsupported-method');
assert.equal(approximateMccBucketSizeFromNema({ starterSize: 'NEMA 3', starterType: 'fvnr', unitHeightIn: 0 }).reason, 'invalid-unit-height');

const assumedFvnr = approximateMccBucketSizeFromNema({ starterSize: 'NEMA 3', unitHeightIn: 6 });
assert.equal(assumedFvnr.assumedFvnr, true);
assert.match(assumedFvnr.basis, /FVNR assumed/);

console.log('NEMA starter sizing screening tests passed');
