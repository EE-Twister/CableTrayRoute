import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDesignSynthesisOneLine } from '../analysis/designSynthesisOneLine.mjs';
import { normalizeOneLineReferences } from '../analysis/projectIntegration.mjs';

test('emits canonical schedule links and object graph connections', () => {
  const oneLine = buildDesignSynthesisOneLine({
    supply: { id: 'SWGR-01', x: 0, y: 0, z: 0 },
    panels: [{ id: 'DP-01', tag: 'DP-01', x: 10, y: 0, z: 0 }],
    loads: [{ id: 'M-01', tag: 'P-101A', panelRef: 'DP-01', x: 20, y: 0, z: 0 }],
    cables: [{ id: 'C-M-01', tag: 'C-M-01', from: 'DP-01', to: 'M-01' }],
  });
  const sheet = oneLine.sheets[0];
  const load = sheet.components.find(item => item.id === 'M-01');
  const panel = sheet.components.find(item => item.id === 'DP-01');
  assert.equal(load.label, 'P-101A');
  assert.equal(load.ref, 'M-01');
  assert.equal(load.equipmentRef, 'M-01');
  assert.equal(load.loadRef, 'M-01');
  assert.equal(load.scheduleLinks.equipment, 'P-101A');
  assert.equal(load.scheduleLinks.equipmentRef, 'M-01');
  assert.equal(load.scheduleLinks.load, 'P-101A');
  assert.equal(load.scheduleLinks.loadRef, 'M-01');
  assert.equal(load.scheduleLinks.panel, 'DP-01');
  assert.equal(load.scheduleLinks.ref, 'M-01');
  assert.equal(panel.connections[0].target, 'M-01');
  assert.equal(panel.connections[0].cable.tag, 'C-M-01');
  assert.equal(panel.connections[0].cable.id, 'C-M-01');
  assert.equal(panel.connections[0].cableRef, 'C-M-01');
  assert.equal(panel.connections[0].cable.protectiveDevice, undefined);
  assert.equal(sheet.connections[0].from, 'DP-01');
  const normalized = normalizeOneLineReferences(oneLine, {
    equipment: [{ id: 'M-01', tag: 'P-101A' }],
    panels: [{ id: 'DP-01', tag: 'DP-01' }],
    loads: [{ id: 'M-01', tag: 'P-101A' }],
    cables: [{ id: 'C-M-01', tag: 'C-M-01', from_tag: 'DP-01', to_tag: 'P-101A' }],
  });
  const normalizedLoad = normalized.sheets[0].components.find(item => item.id === 'M-01');
  assert.equal(normalizedLoad.entityId.toLowerCase(), 'm-01');
  assert.equal(normalized.sheets[0].connections[0].circuitId.toLowerCase(), 'c-m-01');
});

test('emits a recognized utility source with explicit supply basis', () => {
  const source = buildDesignSynthesisOneLine({
    supply: { id: 'source-id', tag: 'SWGR-01', voltage: 480, phases: 3, frequencyHz: 60, capacityKva: 1200, availableFaultCurrentKA: 20 },
    panels: [{ id: 'DP-01', tag: 'DP-01' }],
    cables: [{ id: 'C-01', tag: 'C-01', from_tag: 'SWGR-01', to_tag: 'DP-01' }],
  }).sheets[0].components[0];
  assert.equal(source.type, 'utility_source');
  assert.equal(source.tag, 'SWGR-01');
  assert.equal(source.sourceId, 'source-id');
  assert.equal(source.voltage, 480);
  assert.equal(source.phases, 3);
  assert.equal(source.frequencyHz, 60);
  assert.equal(source.capacityKva, 1200);
  assert.equal(source.availableFaultCurrentKA, 20);
  assert.equal(source.physical.availableFaultCurrentKA, 20);
  assert.equal(source.connections[0].target, 'DP-01');
});
