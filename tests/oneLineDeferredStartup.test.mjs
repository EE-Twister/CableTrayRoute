import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { scheduleNoncriticalWork } from '../src/one-line/deferredStartup.js';

function createInteractionTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
    dispatch(type) { listeners.get(type)?.(); },
  };
}

describe('deferred One-Line startup work', () => {
  it('waits for a rendered frame and idle time', () => {
    const target = createInteractionTarget();
    let frameCallback;
    let idleCallback;
    let runs = 0;
    globalThis.requestAnimationFrame = callback => { frameCallback = callback; };
    globalThis.requestIdleCallback = callback => { idleCallback = callback; return 1; };
    globalThis.cancelIdleCallback = () => {};
    scheduleNoncriticalWork(() => { runs += 1; }, { interactionTarget: target });
    assert.equal(runs, 0);
    frameCallback();
    assert.equal(runs, 0);
    idleCallback();
    assert.equal(runs, 1);
  });

  it('runs immediately when the user reaches the palette', () => {
    const target = createInteractionTarget();
    let runs = 0;
    globalThis.requestAnimationFrame = () => 1;
    scheduleNoncriticalWork(() => { runs += 1; }, { interactionTarget: target });
    target.dispatch('pointerenter');
    target.dispatch('focusin');
    assert.equal(runs, 1);
  });
});
