/**
 * Tests for src/collaborationConflict.js
 *
 * Uses minimal DOM / timer stubs so tests run in Node without a browser.
 * Verifies:
 *  - initConflictNotifications wires the onConflict callback
 *  - showConflictToast creates and shows a toast element
 *  - Toast message reflects the username and gap count
 *  - Toast auto-dismisses after TOAST_DURATION_MS
 *  - Repeated conflicts re-use the same toast element (no duplicates)
 *  - Dismiss button hides the toast
 */
import assert from 'assert';

// ---------------------------------------------------------------------------
// Minimal DOM stubs — must be set BEFORE module import
// ---------------------------------------------------------------------------

let _timers   = [];
let _timerSeq = 0;

global.setTimeout = (fn, delay) => {
  const id = ++_timerSeq;
  _timers.push({ id, fn, delay });
  return id;
};
global.clearTimeout = (id) => {
  _timers = _timers.filter(t => t.id !== id);
};

// Flush all pending timers (simulates elapsed time)
function flushTimers() {
  const pending = _timers.slice();
  _timers = [];
  pending.forEach(t => t.fn());
}

// Minimal Element
class MockElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.className = '';
    this.textContent = '';
    this.type = '';
    this.style = {};
    this._attrs  = {};
    this._children = [];
    this._listeners = {};
    this.hidden = false;
  }

  setAttribute(name, value) { this._attrs[name] = value; }
  getAttribute(name)        { return this._attrs[name] ?? null; }
  removeAttribute(name)     { delete this._attrs[name]; }
  hasAttribute(name)        { return name in this._attrs; }

  appendChild(child) { this._children.push(child); return child; }
  querySelector(sel) {
    // Simple: find first child whose className includes the bare class name
    const cls = sel.replace(/^\./, '');
    return this._children.find(c => String(c.className).split(' ').includes(cls)) || null;
  }

  addEventListener(ev, fn) {
    (this._listeners[ev] = this._listeners[ev] || []).push(fn);
  }
  _emit(ev) {
    (this._listeners[ev] || []).forEach(fn => fn());
  }

  // Simulate 'hidden' attribute behaviour used by the module
  get isHidden() { return 'hidden' in this._attrs; }
}

const _bodyChildren = [];
global.document = {
  createElement: tag => new MockElement(tag),
  body: {
    appendChild: el => { _bodyChildren.push(el); return el; },
    get children() { return _bodyChildren; }
  },
};

// ---------------------------------------------------------------------------
// Import module under test AFTER stubs
// ---------------------------------------------------------------------------
import { initConflictNotifications } from '../src/collaborationConflict.js';

// ---------------------------------------------------------------------------
// Minimal CollabClient stub
// ---------------------------------------------------------------------------
function makeClient() {
  let _conflictCb = null;
  return {
    onConflict(cb) { _conflictCb = cb; },
    /** Trigger a conflict event from the "server side". */
    triggerConflict(payload) { if (_conflictCb) _conflictCb(payload); }
  };
}

function describe(name, fn) {
  console.log(name);
  fn();
}

function it(name, fn) {
  try {
    fn();
    console.log('  \u2713', name);
  } catch (err) {
    console.error('  \u2717', name, err.message || err);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
describe('initConflictNotifications — guard', () => {
  it('null client does not throw', () => {
    assert.doesNotThrow(() => initConflictNotifications(null));
  });

  it('undefined client does not throw', () => {
    assert.doesNotThrow(() => initConflictNotifications(undefined));
  });
});

// ---------------------------------------------------------------------------
describe('initConflictNotifications — toast creation', () => {
  it('conflict event causes a toast element to be added to document.body', () => {
    const initialCount = _bodyChildren.length;
    const client = makeClient();
    initConflictNotifications(client);
    client.triggerConflict({ username: 'alice', gap: 1 });
    assert.ok(_bodyChildren.length > initialCount, 'expected a toast to be appended');
  });

  it('toast element has role=alert', () => {
    const client = makeClient();
    initConflictNotifications(client);
    client.triggerConflict({ username: 'bob', gap: 1 });
    const toast = _bodyChildren[_bodyChildren.length - 1];
    assert.strictEqual(toast.getAttribute('role'), 'alert');
  });

  it('toast is initially visible (hidden attr removed) after conflict', () => {
    const client = makeClient();
    initConflictNotifications(client);
    client.triggerConflict({ username: 'carol', gap: 1 });
    const toast = _bodyChildren[_bodyChildren.length - 1];
    assert.ok(!toast.isHidden, 'toast should not have hidden attribute');
  });
});

// ---------------------------------------------------------------------------
describe('initConflictNotifications — message content', () => {
  it('message includes the username', () => {
    const client = makeClient();
    initConflictNotifications(client);
    client.triggerConflict({ username: 'dave', gap: 1 });
    const toast = _bodyChildren[_bodyChildren.length - 1];
    const msgEl = toast.querySelector('.collab-conflict-msg');
    assert.ok(msgEl, 'expected .collab-conflict-msg element');
    assert.ok(msgEl.textContent.includes('dave'), `message: "${msgEl.textContent}"`);
  });

  it('gap > 1 uses plural wording', () => {
    const client = makeClient();
    initConflictNotifications(client);
    client.triggerConflict({ username: 'eve', gap: 3 });
    const toast = _bodyChildren[_bodyChildren.length - 1];
    const msgEl = toast.querySelector('.collab-conflict-msg');
    assert.ok(msgEl.textContent.includes('changes'),
      `expected "changes" for gap=3, got: "${msgEl.textContent}"`);
  });

  it('gap = 1 uses singular wording', () => {
    const client = makeClient();
    initConflictNotifications(client);
    client.triggerConflict({ username: 'frank', gap: 1 });
    const toast = _bodyChildren[_bodyChildren.length - 1];
    const msgEl = toast.querySelector('.collab-conflict-msg');
    assert.ok(
      msgEl.textContent.includes('a change') || !msgEl.textContent.includes('changes'),
      `expected singular for gap=1, got: "${msgEl.textContent}"`
    );
  });

  it('missing username falls back to "Another user"', () => {
    const client = makeClient();
    initConflictNotifications(client);
    client.triggerConflict({ gap: 2 });
    const toast = _bodyChildren[_bodyChildren.length - 1];
    const msgEl = toast.querySelector('.collab-conflict-msg');
    assert.ok(msgEl.textContent.includes('Another user'),
      `expected fallback, got: "${msgEl.textContent}"`);
  });
});

// ---------------------------------------------------------------------------
describe('initConflictNotifications — auto-dismiss', () => {
  it('toast is hidden after timer fires', () => {
    const client = makeClient();
    initConflictNotifications(client);
    client.triggerConflict({ username: 'grace', gap: 1 });
    const toast = _bodyChildren[_bodyChildren.length - 1];
    assert.ok(!toast.isHidden, 'toast should be visible before timer fires');
    flushTimers();
    assert.ok(toast.isHidden, 'toast should be hidden after timer fires');
  });

  it('second conflict resets the timer without duplicating the toast', () => {
    const beforeCount = _bodyChildren.length;
    const client = makeClient();
    initConflictNotifications(client);
    client.triggerConflict({ username: 'henry', gap: 1 });
    client.triggerConflict({ username: 'henry', gap: 1 });
    // Only one additional toast element should have been appended
    assert.ok(_bodyChildren.length <= beforeCount + 1,
      'should not append a second toast element');
  });
});

// ---------------------------------------------------------------------------
describe('initConflictNotifications — dismiss button', () => {
  it('toast contains a dismiss button', () => {
    const client = makeClient();
    initConflictNotifications(client);
    client.triggerConflict({ username: 'iris', gap: 1 });
    const toast = _bodyChildren[_bodyChildren.length - 1];
    const btn = toast.querySelector('.collab-conflict-dismiss');
    assert.ok(btn, 'expected .collab-conflict-dismiss button');
  });

  it('dismiss button has aria-label', () => {
    const client = makeClient();
    initConflictNotifications(client);
    client.triggerConflict({ username: 'jake', gap: 1 });
    const toast = _bodyChildren[_bodyChildren.length - 1];
    const btn = toast.querySelector('.collab-conflict-dismiss');
    const label = btn?.getAttribute('aria-label');
    assert.ok(label && label.length > 0, 'dismiss button should have aria-label');
  });

  it('clicking dismiss button hides the toast', () => {
    const client = makeClient();
    initConflictNotifications(client);
    client.triggerConflict({ username: 'kate', gap: 1 });
    const toast = _bodyChildren[_bodyChildren.length - 1];
    const btn   = toast.querySelector('.collab-conflict-dismiss');
    assert.ok(!toast.isHidden, 'toast should be visible before dismiss');
    btn._emit('click');
    assert.ok(toast.isHidden, 'toast should be hidden after dismiss click');
  });
});
