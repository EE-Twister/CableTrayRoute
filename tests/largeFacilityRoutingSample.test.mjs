import assert from 'node:assert/strict';
import { buildLargeFacilityRoutingSample } from '../analysis/largeFacilityRoutingSample.mjs';

const sample = buildLargeFacilityRoutingSample();
const allDuctbankConduits = sample.ductbankData.ductbanks.flatMap(ductbank => ductbank.conduits);

assert.equal(sample.cableList.length, 200);
assert.equal(sample.manualTrays.length, 47);
assert.equal(allDuctbankConduits.length, 20);
assert.equal(sample.conduitData.length, 4);
assert.equal(sample.summary.routableRacewayCount, 71);
assert.equal(sample.summary.modeledRacewayCount, 75);
assert.equal(sample.ductbankData.ductbanks.length, 4);

const expectedGroups = ['HV', 'LV', 'INSTRUMENT', 'COMMUNICATION'];
expectedGroups.forEach(group => {
    assert.equal(sample.cableList.filter(cable => cable.allowed_cable_group === group).length, 50);
    assert.ok(sample.manualTrays.some(tray => tray.allowed_cable_group === group));
    assert.ok(allDuctbankConduits.some(conduit => conduit.allowed_cable_group === group));
    assert.ok(sample.conduitData.some(conduit => conduit.allowed_cable_group === group));
});

sample.cableList.forEach(cable => {
    assert.equal(cable.start.length, 3);
    assert.equal(cable.end.length, 3);
    assert.ok(cable.start.every(Number.isFinite));
    assert.ok(cable.end.every(Number.isFinite));
});

assert.deepEqual(buildLargeFacilityRoutingSample(), sample, 'sample generation must be deterministic');

console.log('large facility routing sample verified');
