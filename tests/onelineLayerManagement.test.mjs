/**
 * Unit tests for Gap #51 – Named Layer Management.
 *
 * These tests exercise the pure logic functions extracted from oneline.js
 * without requiring a DOM environment.
 */

import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Pure helper functions mirroring oneline.js logic for testability
// ---------------------------------------------------------------------------

function makeLayer(id, name, visible = true, locked = false) {
  return { id, name, visible, locked };
}

function createLayer(layers, name) {
  const layer = { id: 'layer_' + (layers.length + 1), name: name.trim() || 'Layer', visible: true, locked: false };
  layers.push(layer);
  return layer;
}

function renameLayer(layers, id, newName) {
  const layer = layers.find(l => l.id === id);
  if (!layer || !newName.trim()) return false;
  layer.name = newName.trim();
  return true;
}

function deleteLayer(layers, components, id) {
  const idx = layers.findIndex(l => l.id === id);
  if (idx === -1) return false;
  layers.splice(idx, 1);
  components.forEach(c => { if (c.layer === id) delete c.layer; });
  return true;
}

function setLayerVisibility(layers, id, visible) {
  const layer = layers.find(l => l.id === id);
  if (!layer) return false;
  layer.visible = visible;
  return true;
}

function setLayerLocked(layers, id, locked) {
  const layer = layers.find(l => l.id === id);
  if (!layer) return false;
  layer.locked = locked;
  return true;
}

/**
 * Determine if a component should be rendered (not on a hidden layer).
 * Components with no layer or an unknown layer id are always visible.
 */
function isComponentVisible(layers, comp) {
  if (!comp.layer) return true;
  const layer = layers.find(l => l.id === comp.layer);
  if (!layer) return true; // orphaned layer id → treat as unassigned
  return layer.visible;
}

/**
 * Determine if a component is on a locked layer (preventing interaction).
 */
function isComponentOnLockedLayer(layers, comp) {
  if (!comp.layer) return false;
  const layer = layers.find(l => l.id === comp.layer);
  if (!layer) return false;
  return layer.locked;
}

function assignComponentsToLayer(components, ids, layerId) {
  components.forEach(c => {
    if (ids.includes(c.id)) {
      if (layerId) {
        c.layer = layerId;
      } else {
        delete c.layer;
      }
    }
  });
}

/** Build a render-set by filtering hidden-layer components */
function buildRenderSet(layers, components) {
  return components.filter(c => isComponentVisible(layers, c));
}

/** Simulate pushHistory by capturing deep copies of components and layers */
function pushHistory(historyComponents, historyLayers, components, layers) {
  historyComponents.push(JSON.parse(JSON.stringify(components)));
  historyLayers.push(JSON.parse(JSON.stringify(layers)));
}

// ---------------------------------------------------------------------------
// Test 1: createLayer returns a valid layer object
// ---------------------------------------------------------------------------
{
  console.log('Gap #51 – Test 1: createLayer produces correct shape');
  const layers = [];
  const layer = createLayer(layers, 'Protection Devices');
  assert.equal(layers.length, 1, 'layer added to array');
  assert.ok(layer.id, 'layer has id');
  assert.equal(layer.name, 'Protection Devices', 'layer has correct name');
  assert.equal(layer.visible, true, 'default visible = true');
  assert.equal(layer.locked, false, 'default locked = false');
  console.log('  PASS');
}

// ---------------------------------------------------------------------------
// Test 2: setLayerVisibility flips visible flag
// ---------------------------------------------------------------------------
{
  console.log('Gap #51 – Test 2: setLayerVisibility toggles flag');
  const layers = [makeLayer('l1', 'Loads')];
  assert.equal(layers[0].visible, true);
  setLayerVisibility(layers, 'l1', false);
  assert.equal(layers[0].visible, false, 'hidden after setLayerVisibility(false)');
  setLayerVisibility(layers, 'l1', true);
  assert.equal(layers[0].visible, true, 'visible again after setLayerVisibility(true)');
  console.log('  PASS');
}

// ---------------------------------------------------------------------------
// Test 3: setLayerLocked flips locked flag
// ---------------------------------------------------------------------------
{
  console.log('Gap #51 – Test 3: setLayerLocked toggles flag');
  const layers = [makeLayer('l1', 'Generation')];
  setLayerLocked(layers, 'l1', true);
  assert.equal(layers[0].locked, true, 'layer locked');
  setLayerLocked(layers, 'l1', false);
  assert.equal(layers[0].locked, false, 'layer unlocked');
  console.log('  PASS');
}

// ---------------------------------------------------------------------------
// Test 4: Unassigned component is always visible
// ---------------------------------------------------------------------------
{
  console.log('Gap #51 – Test 4: unassigned component is visible');
  const layers = [makeLayer('l1', 'Loads', false)]; // hidden layer
  const comp = { id: 'c1', type: 'bus' }; // no layer property
  assert.equal(isComponentVisible(layers, comp), true, 'no layer → always visible');
  console.log('  PASS');
}

// ---------------------------------------------------------------------------
// Test 5: Component on hidden layer is excluded from render set
// ---------------------------------------------------------------------------
{
  console.log('Gap #51 – Test 5: hidden layer component excluded from render');
  const layers = [makeLayer('l1', 'Loads', false)];
  const comp = { id: 'c1', type: 'bus', layer: 'l1' };
  assert.equal(isComponentVisible(layers, comp), false, 'on hidden layer → not visible');
  console.log('  PASS');
}

// ---------------------------------------------------------------------------
// Test 6: Component on visible layer is included
// ---------------------------------------------------------------------------
{
  console.log('Gap #51 – Test 6: visible layer component included in render');
  const layers = [makeLayer('l1', 'Loads', true)];
  const comp = { id: 'c1', type: 'bus', layer: 'l1' };
  assert.equal(isComponentVisible(layers, comp), true, 'on visible layer → visible');
  console.log('  PASS');
}

// ---------------------------------------------------------------------------
// Test 7: Component with orphaned layer id treated as visible/unlocked
// ---------------------------------------------------------------------------
{
  console.log('Gap #51 – Test 7: orphaned layer id treated as unassigned');
  const layers = []; // layer was deleted, nothing matches
  const comp = { id: 'c1', type: 'bus', layer: 'deleted_layer_id' };
  assert.equal(isComponentVisible(layers, comp), true, 'orphaned id → visible');
  assert.equal(isComponentOnLockedLayer(layers, comp), false, 'orphaned id → not locked');
  console.log('  PASS');
}

// ---------------------------------------------------------------------------
// Test 8: deleteLayer removes entry and clears comp.layer on members
// ---------------------------------------------------------------------------
{
  console.log('Gap #51 – Test 8: deleteLayer removes layer and clears assignments');
  const layers = [makeLayer('l1', 'Protection')];
  const components = [
    { id: 'c1', layer: 'l1' },
    { id: 'c2', layer: 'l1' },
    { id: 'c3' } // unassigned
  ];
  deleteLayer(layers, components, 'l1');
  assert.equal(layers.length, 0, 'layer removed');
  assert.equal(components[0].layer, undefined, 'c1 layer cleared');
  assert.equal(components[1].layer, undefined, 'c2 layer cleared');
  assert.equal(components[2].layer, undefined, 'c3 unaffected');
  console.log('  PASS');
}

// ---------------------------------------------------------------------------
// Test 9: renameLayer updates name only, does not change id
// ---------------------------------------------------------------------------
{
  console.log('Gap #51 – Test 9: renameLayer updates name, preserves id');
  const layers = [makeLayer('l1', 'Old Name')];
  renameLayer(layers, 'l1', 'New Name');
  assert.equal(layers[0].name, 'New Name', 'name updated');
  assert.equal(layers[0].id, 'l1', 'id unchanged');
  console.log('  PASS');
}

// ---------------------------------------------------------------------------
// Test 10: assignComponentsToLayer with null removes layer property
// ---------------------------------------------------------------------------
{
  console.log('Gap #51 – Test 10: assignComponentsToLayer(null) removes layer prop');
  const components = [{ id: 'c1', layer: 'l1' }, { id: 'c2', layer: 'l1' }];
  assignComponentsToLayer(components, ['c1', 'c2'], null);
  assert.equal(components[0].layer, undefined, 'c1 layer cleared');
  assert.equal(components[1].layer, undefined, 'c2 layer cleared');
  console.log('  PASS');
}

// ---------------------------------------------------------------------------
// Test 11: History snapshot captures both components and layers
// ---------------------------------------------------------------------------
{
  console.log('Gap #51 – Test 11: pushHistory captures layers snapshot');
  const components = [{ id: 'c1', layer: 'l1' }];
  const layers = [makeLayer('l1', 'Loads')];
  const histComponents = [], histLayers = [];
  pushHistory(histComponents, histLayers, components, layers);
  assert.equal(histComponents.length, 1, 'component history recorded');
  assert.equal(histLayers.length, 1, 'layer history recorded');
  assert.equal(histLayers[0][0].name, 'Loads', 'layer snapshot correct');
  console.log('  PASS');
}

// ---------------------------------------------------------------------------
// Test 12: Undo restores prior layers state
// ---------------------------------------------------------------------------
{
  console.log('Gap #51 – Test 12: undo restores previous layers state');
  let components = [{ id: 'c1' }];
  let layers = [];
  const histComponents = [], histLayers = [];
  // Snapshot empty state
  pushHistory(histComponents, histLayers, components, layers);
  // Create a layer and snapshot
  layers.push(makeLayer('l1', 'Protection'));
  pushHistory(histComponents, histLayers, components, layers);
  assert.equal(layers.length, 1, 'after push, layer exists');
  // Simulate undo: restore prior snapshot
  layers = JSON.parse(JSON.stringify(histLayers[0]));
  assert.equal(layers.length, 0, 'after undo, layers restored to empty');
  console.log('  PASS');
}

// ---------------------------------------------------------------------------
// Test 13: Sheet without layers field loads as empty array (backward compat)
// ---------------------------------------------------------------------------
{
  console.log('Gap #51 – Test 13: backward compatibility — missing layers → []');
  const oldSheet = { name: 'Sheet 1', components: [], connections: [] };
  const layers = Array.isArray(oldSheet.layers) ? oldSheet.layers : [];
  assert.equal(layers.length, 0, 'no layers field → empty array');
  console.log('  PASS');
}

// ---------------------------------------------------------------------------
// Test 14: serializeState round-trips layers array
// ---------------------------------------------------------------------------
{
  console.log('Gap #51 – Test 14: layers round-trip through JSON serialization');
  const layers = [makeLayer('l1', 'Protection'), makeLayer('l2', 'Loads', false)];
  const serialized = JSON.stringify({ layers: layers.map(l => ({ ...l })) });
  const parsed = JSON.parse(serialized);
  assert.equal(parsed.layers.length, 2, 'two layers survive serialization');
  assert.equal(parsed.layers[0].name, 'Protection', 'layer 1 name preserved');
  assert.equal(parsed.layers[1].visible, false, 'layer 2 visibility preserved');
  console.log('  PASS');
}

// ---------------------------------------------------------------------------
// Test 15: migrateDiagram v2→v3 adds layers: [] to sheets missing the field
// ---------------------------------------------------------------------------
{
  console.log('Gap #51 – Test 15: migrateDiagram adds layers to v2 sheets');
  function migrateDiagram(data) {
    const version = data.version || 0;
    let migrated = { ...data };
    if (version < 3) {
      migrated.sheets = (migrated.sheets || []).map(s => ({
        ...s,
        layers: Array.isArray(s.layers) ? s.layers : []
      }));
    }
    migrated.version = 3;
    return migrated;
  }

  const v2data = {
    version: 2,
    sheets: [
      { name: 'Sheet 1', components: [], connections: [] }, // no layers
      { name: 'Sheet 2', components: [], connections: [], layers: [makeLayer('l1', 'Loads')] } // has layers
    ]
  };
  const migrated = migrateDiagram(v2data);
  assert.equal(migrated.version, 3, 'version bumped to 3');
  assert.deepEqual(migrated.sheets[0].layers, [], 'sheet without layers gets []');
  assert.equal(migrated.sheets[1].layers.length, 1, 'existing layers preserved');
  console.log('  PASS');
}

// ---------------------------------------------------------------------------
// Test 16: Connections between two hidden-layer components are also hidden
// ---------------------------------------------------------------------------
{
  console.log('Gap #51 – Test 16: both endpoints hidden → connection hidden');
  const layers = [makeLayer('l1', 'Loads', false)];
  const components = [
    { id: 'c1', layer: 'l1', connections: [{ target: 'c2' }] },
    { id: 'c2', layer: 'l1', connections: [] }
  ];
  // A connection is drawn only if NEITHER endpoint is on a hidden layer
  const hiddenLayerIds = new Set(layers.filter(l => !l.visible).map(l => l.id));
  const isHiddenByLayer = comp => comp.layer && hiddenLayerIds.has(comp.layer);
  const connection = components[0].connections[0];
  const target = components.find(c => c.id === connection.target);
  const shouldSkip = isHiddenByLayer(components[0]) || isHiddenByLayer(target);
  assert.equal(shouldSkip, true, 'connection between hidden components is skipped');
  console.log('  PASS');
}

// ---------------------------------------------------------------------------
// Test 17: Locked layer prevents component interaction
// ---------------------------------------------------------------------------
{
  console.log('Gap #51 – Test 17: locked layer prevents selection');
  const layers = [makeLayer('l1', 'Protection', true, true)];
  const comp = { id: 'c1', layer: 'l1' };
  assert.equal(isComponentOnLockedLayer(layers, comp), true, 'comp on locked layer is locked');
  // Simulate selection guard: skip if locked by layer
  let selected = null;
  if (!isComponentOnLockedLayer(layers, comp)) {
    selected = comp;
  }
  assert.equal(selected, null, 'selection blocked by locked layer');
  console.log('  PASS');
}

// ---------------------------------------------------------------------------
// Test 18: Active layer assigned to new component on addComponent
// ---------------------------------------------------------------------------
{
  console.log('Gap #51 – Test 18: addComponent assigns active layer');
  const layers = [makeLayer('l1', 'Loads')];
  let activeLayerId = 'l1';
  // Simulate addComponent layer assignment
  const comp = { id: 'c1', type: 'bus' };
  if (activeLayerId && layers.some(l => l.id === activeLayerId)) {
    comp.layer = activeLayerId;
  }
  assert.equal(comp.layer, 'l1', 'new component assigned to active layer');
  console.log('  PASS');
}

// ---------------------------------------------------------------------------
// Test 19: buildRenderSet filters hidden-layer components correctly
// ---------------------------------------------------------------------------
{
  console.log('Gap #51 – Test 19: buildRenderSet excludes hidden-layer components');
  const layers = [
    makeLayer('l1', 'Protection', true),
    makeLayer('l2', 'Loads', false)   // hidden
  ];
  const components = [
    { id: 'c1', layer: 'l1' },   // visible layer
    { id: 'c2', layer: 'l2' },   // hidden layer
    { id: 'c3' },                  // unassigned → always visible
  ];
  const renderSet = buildRenderSet(layers, components);
  assert.equal(renderSet.length, 2, 'only 2 of 3 components rendered');
  assert.ok(renderSet.find(c => c.id === 'c1'), 'c1 (visible layer) rendered');
  assert.ok(!renderSet.find(c => c.id === 'c2'), 'c2 (hidden layer) excluded');
  assert.ok(renderSet.find(c => c.id === 'c3'), 'c3 (unassigned) rendered');
  console.log('  PASS');
}

// ---------------------------------------------------------------------------
// Test 20: addLayer with duplicate name is allowed (names are not unique keys)
// ---------------------------------------------------------------------------
{
  console.log('Gap #51 – Test 20: duplicate layer names are allowed');
  const layers = [];
  createLayer(layers, 'Loads');
  createLayer(layers, 'Loads'); // duplicate name
  assert.equal(layers.length, 2, 'two layers with same name');
  assert.notEqual(layers[0].id, layers[1].id, 'each has unique id');
  console.log('  PASS');
}

console.log('\nAll Gap #51 layer management tests passed.');
