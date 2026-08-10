import assert from 'node:assert/strict';
import {
  getCables,
  getEquipment,
  getLoads,
  getOneLine,
  getProjectInputFingerprint,
  getScenarioSnapshot,
  getStudyProvenance,
  setCables,
  setEquipment,
  setLoads,
  setOneLine,
  setPanels,
  setStudies,
} from '../dataStore.mjs';

setEquipment([
  { tag: 'MCC-101', description: 'Motor control center' },
  { tag: 'PMP-101', description: 'Cooling water pump' },
]);
assert.deepEqual(getEquipment().map(item => item.id), ['mcc-101', 'pmp-101']);

setLoads([{ tag: 'PMP-101', source: 'MCC-101', loadType: 'Motor', kw: 18.6 }]);
assert.equal(getLoads()[0].equipmentId, 'pmp-101');

setCables([{ tag: 'CBL-MCC-PMP-101', from: 'MCC-101', to: 'PMP-101', length: 95 }]);
setPanels([{ tag: 'LP-101', description: 'Lighting panel' }]);
const cable = getCables()[0];
assert.equal(cable.id, 'cbl-mcc-pmp-101');
assert.equal(cable.circuitId, 'cbl-mcc-pmp-101');
assert.equal(cable.sourceEquipmentId, 'mcc-101');
assert.equal(cable.targetEquipmentId, 'pmp-101');

setOneLine({
  activeSheet: 0,
  sheets: [{
    name: 'Sheet 1',
    components: [
      { id: 'visual-pump', ref: 'PMP-101' },
      { id: 'visual-panel', type: 'panel', panelRef: 'LP-101', scheduleLinks: { panel: 'LP-101' } }
    ],
    connections: [{ source: 'visual-mcc', target: 'visual-pump', cable: { tag: 'CBL-MCC-PMP-101', length: 95 } }],
    layers: [],
  }],
});
const oneLine = getOneLine();
assert.equal(oneLine.sheets[0].components[0].entityId, 'pmp-101');
assert.equal(oneLine.sheets[0].components[1].entityId, 'lp-101');
assert.equal(oneLine.sheets[0].components[1].description, 'Lighting panel');
assert.equal(oneLine.sheets[0].connections[0].circuitId, 'cbl-mcc-pmp-101');
const originalComponentLabel = oneLine.sheets[0].components[0].label;
oneLine.sheets[0].components[0].label = 'caller-only mutation';
assert.equal(getOneLine().sheets[0].components[0].label, originalComponentLabel,
  'cached normalized One-Line snapshots must remain isolated from caller mutations');
setOneLine(getOneLine(), undefined, { captureRevision: false });
const rawOneLine = getScenarioSnapshot('base').oneLine;
assert.equal(rawOneLine.sheets[0].components[0].projectEntity, undefined,
  'persisted diagrams must not duplicate canonical entity records');
assert.equal(rawOneLine.sheets[0].connections[0].projectCircuit, undefined,
  'persisted diagrams must not duplicate canonical circuit records');
const secondDataStore = await import(`../dataStore.mjs?one-line-cache=${Date.now()}`);
secondDataStore.setOneLine({
  activeSheet: 0,
  sheets: [{ name: 'Shared cache update', components: [], connections: [], layers: [] }],
}, undefined, { captureRevision: false });
assert.equal(getOneLine().sheets[0].name, 'Shared cache update',
  'normalized One-Line cache invalidation must be shared across module instances');

const studyInputHash = getProjectInputFingerprint();
setStudies({ integrationTest: { value: 1 } });
assert.equal(getStudyProvenance().integrationTest.inputHash, studyInputHash);
setLoads([{ tag: 'PMP-101', source: 'MCC-101', loadType: 'Motor', kw: 25 }]);
assert.notEqual(getProjectInputFingerprint(), getStudyProvenance().integrationTest.inputHash);

console.log('✓ data store assigns stable entity IDs and one-line references');
