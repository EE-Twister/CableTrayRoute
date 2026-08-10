import assert from 'node:assert/strict';
import {
  STORAGE_KEYS,
  getCables,
  getEquipment,
  getLoads,
  getOneLine,
  getProjectEntityDeletionImpact,
  getProjectInputFingerprint,
  getProjectReferenceDiagnostics,
  getStudyProvenance,
  setCables,
  setEquipment,
  setItem,
  setLoads,
  setOneLine,
  setStudies
} from '../dataStore.mjs';

setEquipment([{ id: 'eq-stable', tag: 'MCC-101', description: 'Main MCC' }]);
setLoads([{ id: 'load-stable', tag: 'PMP-101', source: 'MCC-101', equipmentId: 'eq-stable', kw: 25 }]);
setCables([{
  id: 'cable-stable',
  tag: 'CBL-101',
  from_tag: 'MCC-101',
  to_tag: 'PMP-101',
  sourceEquipmentId: 'eq-stable',
  targetEquipmentId: 'load-stable'
}]);
setOneLine({
  activeSheet: 0,
  sheets: [{
    name: 'Lifecycle',
    components: [{
      id: 'visual-mcc',
      entityId: 'eq-stable',
      label: 'MCC-101',
      equipmentRef: 'eq-stable',
      scheduleLinks: { equipment: 'eq-stable' }
    }],
    connections: [{ id: 'visual-cable', circuitId: 'cable-stable', cable: { tag: 'CBL-101' } }],
    layers: []
  }]
}, undefined, { captureRevision: false });

setStudies({ lifecycle: { result: 'screening' } });
const originalFingerprint = getStudyProvenance().lifecycle.inputHash;
setItem(STORAGE_KEYS.equipment, [{ id: 'eq-stable', tag: 'MCC-201', description: 'Main MCC' }]);

assert.equal(getEquipment()[0].id, 'eq-stable');
assert.equal(getEquipment()[0].tag, 'MCC-201');
assert.equal(getLoads()[0].source, 'MCC-201');
assert.equal(getLoads()[0].equipmentId, 'eq-stable');
assert.equal(getCables()[0].from_tag, 'MCC-201');
assert.equal(getCables()[0].sourceEquipmentId, 'eq-stable');
assert.equal(getOneLine().sheets[0].components[0].label, 'MCC-201');
assert.notEqual(getProjectInputFingerprint(), originalFingerprint,
  'renaming a project entity must stale saved study provenance');

setCables([{ ...getCables()[0], tag: 'CBL-201' }]);
assert.equal(getOneLine().sheets[0].connections[0].circuitId, 'cable-stable');
assert.equal(getOneLine().sheets[0].connections[0].cable.tag, 'CBL-201');

const deletionImpact = getProjectEntityDeletionImpact('equipment', getEquipment());
assert.deepEqual(deletionImpact.counts, { total: 3, loads: 1, cables: 1, oneLine: 1 });

setItem(STORAGE_KEYS.equipment, []);
const detached = getOneLine().sheets[0].components[0];
assert.equal(detached.entityId, undefined);
assert.equal(detached.orphanedEntityId, 'eq-stable');
const issueCodes = getProjectReferenceDiagnostics().map(issue => issue.code);
assert.ok(issueCodes.includes('orphan-load-equipment'));
assert.ok(issueCodes.includes('orphan-cable-endpoint'));
assert.ok(issueCodes.includes('orphan-oneline-entity'));
assert.equal(getLoads().length, 1, 'deleting equipment must not cascade-delete loads');
assert.equal(getCables().length, 1, 'deleting equipment must not cascade-delete cables');

console.log('✓ data store propagates canonical renames and reports safe-delete orphans');
