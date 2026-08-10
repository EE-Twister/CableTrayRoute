import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createDiagramHistoryController } from '../src/one-line/historyController.mjs';

describe('One-Line history controller', () => {
  it('captures and restores component, layer, and zone state through injected adapters', () => {
    let state = {
      components: [{ id: 'a', x: 0 }],
      layers: [{ id: 'base', visible: true }],
      protectionZones: []
    };
    const restored = [];
    const controller = createDiagramHistoryController({
      captureSnapshot: () => state,
      applySnapshot: snapshot => { state = snapshot; },
      onRestore: event => restored.push(event)
    });
    controller.reset();
    state.components[0].x = 100;
    state.protectionZones.push({ id: 'zone-1' });
    controller.push('Moved component');
    assert.equal(controller.canUndo, true);
    assert.equal(controller.undo(), true);
    assert.equal(state.components[0].x, 0);
    assert.deepEqual(state.protectionZones, []);
    assert.equal(controller.redo(), true);
    assert.equal(state.components[0].x, 100);
    assert.deepEqual(restored.map(event => event.action), ['undo', 'redo']);
  });

  it('drops the redo branch after a new change', () => {
    let value = 1;
    const controller = createDiagramHistoryController({
      captureSnapshot: () => ({ value }),
      applySnapshot: snapshot => { value = snapshot.value; }
    });
    controller.reset();
    value = 2;
    controller.push('two');
    controller.undo();
    value = 3;
    controller.push('three');
    assert.equal(controller.canRedo, false);
    assert.equal(controller.length, 2);
    controller.undo();
    assert.equal(value, 1);
  });

  it('isolates snapshots and supports checkpoint restoration and implicit replacement', () => {
    let state = { components: [{ id: 'a', x: 0 }] };
    const pushes = [];
    const controller = createDiagramHistoryController({
      captureSnapshot: () => state,
      applySnapshot: snapshot => { state = snapshot; },
      onPush: event => pushes.push(event)
    });
    controller.reset();
    state.components[0].x = 10;
    controller.replaceCurrent();
    state.components[0].x = 20;
    controller.push('moved');
    assert.equal(controller.restore(0, { reason: 'Checkpoint restored' }), true);
    assert.equal(state.components[0].x, 10);
    assert.equal(controller.restore(99), false);
    assert.equal(pushes[0].reason, 'moved');
  });
});
