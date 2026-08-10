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
assert.ok(first.summary.warnings.some(message => message.includes('quantity above 1')));
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
const heaterBucket = firstBuckets.find(bucket => bucket.sourceLoadId === 'load-heater');
assert.equal(heaterBucket.type, 'feeder');

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
assert.equal(refreshedMotor.starterType, 'soft-starter', 'manual field edits must survive a refresh');
assert.equal(refreshedMotor.sizeUnits, 2, 'manual physical bucket sizing must survive a refresh');
assert.ok(!second.lineup.sections.flatMap(section => section.buckets).some(bucket => bucket.sourceLoadId === 'load-heater'));

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
