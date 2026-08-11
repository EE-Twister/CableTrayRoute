import assert from 'node:assert/strict';
import { normalizeMccLineup } from '../src/mccLineupModel.mjs';
import {
  loadsForMccLineup,
  mccLoadListTarget,
  reconcileMccLineupFromLoads
} from '../src/mcc-lineup/loadListSync.mjs';

const baseLineup = normalizeMccLineup({
  id: 'mcc-101-lineup',
  tag: 'MCC-101',
  equipmentTag: 'MCC-101',
  voltage: '480V',
  unitHeightIn: 6,
  usableBucketHeightIn: 12,
  sections: [{
    id: 'manual-section',
    name: 'Main',
    widthIn: 20,
    buckets: [
      { id: 'main-bucket', label: 'MAIN', type: 'main', equipmentTag: 'MAIN', sizeUnits: 2 },
      { id: 'manual-bucket', label: 'LOCAL', type: 'feeder', equipmentTag: 'LOCAL', sizeUnits: 1 }
    ]
  }]
});

const loads = [
  {
    id: 'load-p101',
    source: 'mcc-101',
    tag: 'P-101',
    description: 'Process Pump',
    loadType: 'Motor',
    kw: '18.6',
    voltage: '480',
    phases: '3',
    circuit: 'MCC-101-01'
  },
  {
    id: 'load-fan',
    source: 'MCC-101',
    tag: 'FAN-102',
    description: 'VFD Supply Fan',
    loadType: 'VFD',
    kw: '22',
    voltage: '480',
    quantity: '2',
    mccBucketUnits: '2'
  },
  {
    id: 'load-heater',
    source: 'MCC-101',
    tag: 'HTR-103',
    description: 'Unit Heater',
    loadType: 'Heater',
    kw: '5',
    voltage: '208'
  },
  { id: 'load-other', source: 'SWBD-1', tag: 'OTHER', loadType: 'Motor', kw: '10' }
];

assert.equal(mccLoadListTarget(baseLineup), 'MCC-101');
assert.equal(loadsForMccLineup(loads, baseLineup).length, 3, 'source matching should be trimmed and case-insensitive');

const first = reconcileMccLineupFromLoads(baseLineup, loads);
assert.equal(first.summary.matched, 3);
assert.equal(first.summary.created, 3);
assert.equal(first.summary.manualBucketsPreserved, 2);
assert.equal(first.summary.generatedSections, 3, 'buckets should pack into sections using the usable stack height');
assert.ok(!first.summary.warnings.some(message => message.includes('quantity')), 'legacy quantity must not affect one-row-per-load MCC generation');
assert.ok(first.summary.warnings.some(message => message.includes('do not match the lineup voltage')));
assert.ok(first.summary.warnings.some(message => message.includes('lack explicit horsepower')));

const firstBuckets = first.lineup.sections.flatMap(section => section.buckets);
assert.ok(firstBuckets.some(bucket => bucket.id === 'manual-bucket'), 'manual buckets must remain in the lineup');
const motorBucket = firstBuckets.find(bucket => bucket.sourceLoadId === 'load-p101');
assert.equal(motorBucket.type, 'starter');
assert.equal(motorBucket.equipmentTag, 'P-101');
assert.equal(motorBucket.equipmentDescription, 'Process Pump');
assert.equal(motorBucket.sourceCircuit, 'MCC-101-01');
assert.equal(motorBucket.hp, '', 'kW must not be silently converted to motor nameplate horsepower');
assert.equal(motorBucket.breakerA, '', 'calculated load current must not be used as a protective-device rating');
const vfdBucket = firstBuckets.find(bucket => bucket.sourceLoadId === 'load-fan');
assert.equal(vfdBucket.type, 'vfd');
assert.equal(vfdBucket.sizeUnits, 2);
assert.equal(Object.hasOwn(vfdBucket, 'sourceQuantity'), false);
const heaterBucket = firstBuckets.find(bucket => bucket.sourceLoadId === 'load-heater');
assert.equal(heaterBucket.type, 'feeder');

const explicitUnitTypes = reconcileMccLineupFromLoads(baseLineup, [
  { ...loads[0], id: 'load-explicit-vfd', tag: 'P-201', mccUnitType: 'vfd', controlScheme: 'hoa-speed-pot' },
  { ...loads[2], id: 'load-explicit-starter', tag: 'HTR-201', mccUnitType: 'starter', starterType: 'fvr', controlScheme: 'forward-off-reverse' },
  { ...loads[0], id: 'load-explicit-feeder', tag: 'P-202', mccUnitType: 'feeder', controlScheme: 'forward-off-reverse' },
  { ...loads[0], id: 'load-explicit-main-mlo', tag: 'MAIN-MLO', mccUnitType: 'main-mlo' },
  { ...loads[0], id: 'load-explicit-main-breaker', tag: 'MAIN-BKR', mccUnitType: 'main-breaker' },
  { ...loads[0], id: 'load-explicit-space', tag: 'SPACE', mccUnitType: 'space' },
  { ...loads[0], id: 'load-explicit-spare', tag: 'SPARE', mccUnitType: 'spare' }
]);
const explicitBuckets = explicitUnitTypes.lineup.sections.flatMap(section => section.buckets);
assert.equal(explicitBuckets.find(bucket => bucket.sourceLoadId === 'load-explicit-vfd').type, 'vfd');
assert.equal(explicitBuckets.find(bucket => bucket.sourceLoadId === 'load-explicit-starter').type, 'starter');
assert.equal(explicitBuckets.find(bucket => bucket.sourceLoadId === 'load-explicit-starter').starterType, 'fvr');
assert.equal(explicitBuckets.find(bucket => bucket.sourceLoadId === 'load-explicit-starter').controlScheme, 'forward-off-reverse');
assert.equal(explicitBuckets.find(bucket => bucket.sourceLoadId === 'load-explicit-vfd').controlScheme, 'hoa-speed-pot');
assert.equal(explicitBuckets.find(bucket => bucket.sourceLoadId === 'load-explicit-feeder').controlScheme, '', 'non-controller buckets must discard control schemes');
assert.equal(explicitBuckets.find(bucket => bucket.sourceLoadId === 'load-explicit-feeder').type, 'feeder');
assert.deepEqual(
  {
    type: explicitBuckets.find(bucket => bucket.sourceLoadId === 'load-explicit-main-mlo').type,
    mainDevice: explicitBuckets.find(bucket => bucket.sourceLoadId === 'load-explicit-main-mlo').mainDevice
  },
  { type: 'main', mainDevice: 'mlo' }
);
assert.deepEqual(
  {
    type: explicitBuckets.find(bucket => bucket.sourceLoadId === 'load-explicit-main-breaker').type,
    mainDevice: explicitBuckets.find(bucket => bucket.sourceLoadId === 'load-explicit-main-breaker').mainDevice
  },
  { type: 'main', mainDevice: 'breaker' }
);
assert.equal(explicitBuckets.find(bucket => bucket.sourceLoadId === 'load-explicit-space').status, 'space');
assert.equal(explicitBuckets.find(bucket => bucket.sourceLoadId === 'load-explicit-spare').status, 'spare');

motorBucket.starterType = 'soft-starter';
motorBucket.heightIn = 12;
motorBucket.sizeUnits = 2;
const refreshedLoads = loads
  .filter(load => load.id !== 'load-heater')
  .map(load => load.id === 'load-p101'
    ? { ...load, description: 'Process Pump Revised', hp: '25', starterType: 'fvnr' }
    : load);
const second = reconcileMccLineupFromLoads(first.lineup, refreshedLoads);
assert.equal(second.summary.created, 0);
assert.equal(second.summary.updated, 1);
assert.equal(second.summary.removed, 1);
assert.ok(second.summary.manualOverrides >= 1);
const refreshedMotor = second.lineup.sections
  .flatMap(section => section.buckets)
  .find(bucket => bucket.sourceLoadId === 'load-p101');
assert.equal(refreshedMotor.equipmentDescription, 'Process Pump Revised');
assert.equal(refreshedMotor.hp, '25');
assert.equal(refreshedMotor.starterSize, '', 'a manual non-NEMA starter-method override should block dependent starter sizing');
assert.equal(refreshedMotor.starterSizeEstimated, false, 'a manual starter-method override should invalidate automatic sizing provenance');
assert.equal(refreshedMotor.starterType, 'soft-starter', 'manual field edits must survive a refresh');
assert.equal(refreshedMotor.sizeUnits, 2, 'manual physical bucket sizing must survive a refresh');
assert.ok(!second.lineup.sections.flatMap(section => section.buckets).some(bucket => bucket.sourceLoadId === 'load-heater'));

const estimated = reconcileMccLineupFromLoads(baseLineup, [{
  ...loads[0],
  hp: '25',
  starterType: 'fvnr'
}]);
const estimatedMotor = estimated.lineup.sections.flatMap(section => section.buckets).find(bucket => bucket.sourceLoadId === 'load-p101');
assert.equal(estimatedMotor.starterSize, 'NEMA 2');
assert.equal(estimatedMotor.starterSizeEstimated, true);
assert.match(estimatedMotor.starterSizeBasis, /25 HP/);
assert.equal(estimatedMotor.sizeUnits, 2);
assert.equal(estimatedMotor.heightIn, 12);
assert.equal(estimatedMotor.bucketSizeEstimated, true);
assert.match(estimatedMotor.bucketSizeBasis, /conservative FVNR planning allowance/);
assert.ok(estimated.summary.warnings.some(message => message.includes('preliminary NEMA horsepower-table estimate')));
assert.ok(estimated.summary.warnings.some(message => message.includes('conservative generic FVNR planning estimate')));

estimatedMotor.sizeUnits = 3;
estimatedMotor.heightIn = 18;
const manualPhysicalSizing = reconcileMccLineupFromLoads(estimated.lineup, [{
  ...loads[0],
  hp: '50',
  starterType: 'fvnr'
}]);
const manuallySizedMotor = manualPhysicalSizing.lineup.sections
  .flatMap(section => section.buckets)
  .find(bucket => bucket.sourceLoadId === 'load-p101');
assert.equal(manuallySizedMotor.starterSize, 'NEMA 3');
assert.equal(manuallySizedMotor.sizeUnits, 3, 'manual physical sizing must survive a source-driven estimate change');
assert.equal(manuallySizedMotor.heightIn, 18);
assert.equal(manuallySizedMotor.bucketSizeEstimated, false);
assert.match(manuallySizedMotor.bucketSizeBasis, /Manual MCC bucket sizing override/);

const explicitPhysicalSizing = reconcileMccLineupFromLoads(baseLineup, [{
  ...loads[0],
  hp: '50',
  starterType: 'fvnr',
  mccBucketUnits: '5'
}]);
const explicitlySizedMotor = explicitPhysicalSizing.lineup.sections
  .flatMap(section => section.buckets)
  .find(bucket => bucket.sourceLoadId === 'load-p101');
assert.equal(explicitlySizedMotor.starterSize, 'NEMA 3');
assert.equal(explicitlySizedMotor.sizeUnits, 5, 'an explicit Load List bucket size must take precedence');
assert.equal(explicitlySizedMotor.bucketSizeEstimated, false);

const standardHeightLineup = normalizeMccLineup({
  ...baseLineup,
  usableBucketHeightIn: 72,
  sections: []
});
const estimatedBreaker = reconcileMccLineupFromLoads(standardHeightLineup, [{
  id: 'load-feeder-250',
  source: 'MCC-101',
  tag: 'FDR-250',
  description: 'Distribution Feeder',
  loadType: 'Breaker',
  breakerTripA: '100',
  breakerFrameA: '250',
  voltage: '480'
}]);
const estimatedBreakerBucket = estimatedBreaker.lineup.sections
  .flatMap(section => section.buckets)
  .find(bucket => bucket.sourceLoadId === 'load-feeder-250');
assert.equal(estimatedBreakerBucket.type, 'breaker');
assert.equal(estimatedBreakerBucket.breakerA, '100');
assert.equal(estimatedBreakerBucket.breakerFrameA, '250');
assert.equal(estimatedBreakerBucket.sizeUnits, 3);
assert.equal(estimatedBreakerBucket.heightIn, 18);
assert.equal(estimatedBreakerBucket.bucketSizeEstimated, true);
assert.equal(estimatedBreakerBucket.bucketSizeEstimateKind, 'breaker-frame');
assert.match(estimatedBreakerBucket.bucketSizeBasis, /250 AF/);
assert.ok(estimatedBreaker.summary.warnings.some(message => message.includes('amp-frame planning estimate')));

estimatedBreakerBucket.breakerA = '300AT/400AF';
const manualBreakerSelection = reconcileMccLineupFromLoads(estimatedBreaker.lineup, [{
  id: 'load-feeder-250',
  source: 'MCC-101',
  tag: 'FDR-250',
  description: 'Distribution Feeder',
  loadType: 'Breaker',
  breakerTripA: '100',
  breakerFrameA: '250',
  voltage: '480'
}]);
const manualBreakerBucket = manualBreakerSelection.lineup.sections
  .flatMap(section => section.buckets)
  .find(bucket => bucket.sourceLoadId === 'load-feeder-250');
assert.equal(manualBreakerBucket.breakerA, '300AT/400AF');
assert.equal(manualBreakerBucket.breakerFrameA, '400');
assert.equal(manualBreakerBucket.sizeUnits, 5, 'a manual explicit frame selection should recompute its dependent estimate');
assert.equal(manualBreakerBucket.bucketSizeEstimated, true);
assert.match(manualBreakerBucket.bucketSizeBasis, /400 AF/);

const legacyCombinedBreaker = reconcileMccLineupFromLoads(standardHeightLineup, [{
  id: 'load-feeder-legacy',
  source: 'MCC-101',
  tag: 'FDR-LEGACY',
  loadType: 'Breaker',
  breakerA: '100AT/250AF',
  voltage: '480'
}]);
const legacyCombinedBreakerBucket = legacyCombinedBreaker.lineup.sections
  .flatMap(section => section.buckets)
  .find(bucket => bucket.sourceLoadId === 'load-feeder-legacy');
assert.equal(legacyCombinedBreakerBucket.sizeUnits, 3, 'legacy combined AT/AF ratings must remain compatible');

const invalidBreakerPair = reconcileMccLineupFromLoads(standardHeightLineup, [{
  id: 'load-feeder-invalid',
  source: 'MCC-101',
  tag: 'FDR-INVALID',
  loadType: 'Breaker',
  breakerTripA: '400',
  breakerFrameA: '250',
  voltage: '480'
}]);
assert.ok(invalidBreakerPair.summary.warnings.some(message => message.includes('trip rating above its frame rating')));

const automaticBeforeManualStarter = reconcileMccLineupFromLoads(baseLineup, [{
  ...loads[0],
  hp: '25',
  starterType: 'fvnr'
}]);
const manualStarterMethod = structuredClone(automaticBeforeManualStarter.lineup);
const manualStarterBucket = manualStarterMethod.sections
  .flatMap(section => section.buckets)
  .find(bucket => bucket.sourceLoadId === 'load-p101');
manualStarterBucket.starterType = 'soft-starter';
manualStarterBucket.starterSizeEstimated = false;
manualStarterBucket.bucketSizeEstimated = false;
const changedHpAfterManualStarter = reconcileMccLineupFromLoads(manualStarterMethod, [{
  ...loads[0],
  hp: '50',
  starterType: 'fvnr'
}]);
const preservedManualStarter = changedHpAfterManualStarter.lineup.sections
  .flatMap(section => section.buckets)
  .find(bucket => bucket.sourceLoadId === 'load-p101');
assert.equal(preservedManualStarter.starterType, 'soft-starter');
assert.equal(preservedManualStarter.starterSize, 'NEMA 2', 'dependent starter sizing must remain frozen after a manual method override');
assert.equal(preservedManualStarter.sizeUnits, 2, 'dependent bucket sizing must remain frozen after a manual method override');
assert.equal(preservedManualStarter.bucketSizeEstimated, false);

const unsupported = reconcileMccLineupFromLoads(baseLineup, [{
  ...loads[0],
  hp: '25',
  voltage: '415',
  starterType: 'fvnr'
}]);
const unsupportedMotor = unsupported.lineup.sections.flatMap(section => section.buckets).find(bucket => bucket.sourceLoadId === 'load-p101');
assert.equal(unsupportedMotor.starterSize, '');
assert.ok(unsupported.summary.warnings.some(message => message.includes('outside the supported table scope')));

const empty = reconcileMccLineupFromLoads(baseLineup, []);
assert.equal(empty.summary.matched, 0);
assert.ok(empty.summary.warnings.some(message => message.includes('No Load List records')));
assert.equal(empty.lineup.sections.flatMap(section => section.buckets).length, 2, 'empty sync preview must retain manual buckets');
const removeAllLinked = reconcileMccLineupFromLoads(first.lineup, []);
assert.equal(removeAllLinked.summary.removed, 3, 'refresh should allow all stale linked buckets to be removed');
assert.equal(removeAllLinked.lineup.sections.flatMap(section => section.buckets).length, 2);

const withManualBucketInGeneratedSection = structuredClone(first.lineup);
const generatedSection = withManualBucketInGeneratedSection.sections.find(section => section.loadListManaged);
generatedSection.buckets.push({
  id: 'manual-in-generated',
  label: 'LOCAL-ADDITION',
  type: 'feeder',
  equipmentTag: 'LOCAL-ADDITION',
  sizeUnits: 1,
  heightIn: 6
});
const repacked = reconcileMccLineupFromLoads(withManualBucketInGeneratedSection, loads);
const sectionIds = repacked.lineup.sections.map(section => section.id);
assert.equal(new Set(sectionIds).size, sectionIds.length, 'preserving manual additions must not duplicate generated section IDs');
assert.ok(repacked.lineup.sections.flatMap(section => section.buckets).some(bucket => bucket.id === 'manual-in-generated'));

console.log('MCC Load List reconciliation tests passed');
