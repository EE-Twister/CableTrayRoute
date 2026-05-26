/**
 * Tests for src/workers/createWorkerClient.js
 *
 * Validates the id-correlated promise wrapper and the worker-side dispatcher
 * helper. A minimal Worker mock simulates round-trip postMessage so we can
 * exercise concurrent calls, error propagation, and the main-thread fallback
 * without spinning up a real Worker runtime.
 */
import assert from 'assert';
import {
  createWorkerClient,
  handleWorkerMessage,
} from '../src/workers/createWorkerClient.js';

function describe(name, fn) { console.log(name); fn(); }
function it(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result.then(
        () => console.log('  ✓', name),
        err => { console.error('  ✗', name, err && err.stack || err); process.exitCode = 1; },
      );
    }
    console.log('  ✓', name);
  } catch (err) {
    console.error('  ✗', name, err && err.stack || err);
    process.exitCode = 1;
  }
}

// Minimal Worker stub: a postMessage on the client side is routed to a
// handler scope; postMessage on the scope side is routed back as an
// 'message' event on the client. This is the contract the real Worker
// API exposes — sufficient to test id correlation end-to-end.
function makeMockWorker(handlers) {
  const fakeWorker = {
    onmessage: null,
    onerror: null,
    postMessage(message) {
      // Asynchronously invoke handler, mirroring real Worker semantics
      queueMicrotask(() => scope.onmessage({ data: message }));
    },
    terminate() { fakeWorker.terminated = true; },
    terminated: false,
  };
  const scope = {
    onmessage: null,
    postMessage(message) {
      queueMicrotask(() => {
        if (fakeWorker.onmessage) fakeWorker.onmessage({ data: message });
      });
    },
  };
  handleWorkerMessage(scope, handlers);
  return { fakeWorker, scope };
}

describe('createWorkerClient — id-correlated promises', () => {
  it('resolves a single call with the worker reply', async () => {
    const { fakeWorker } = makeMockWorker({ add: (a, b) => a + b });
    const client = createWorkerClient({
      workerUrl: 'mock.js',
      WorkerCtor: function MockWorker() { return fakeWorker; },
      operations: ['add'],
    });
    const result = await client.call('add', [2, 3]);
    assert.strictEqual(result, 5);
  });

  it('correlates concurrent calls by id', async () => {
    const { fakeWorker } = makeMockWorker({
      slow: () => new Promise(resolve => setTimeout(() => resolve('slow'), 20)),
      fast: () => 'fast',
    });
    const client = createWorkerClient({
      workerUrl: 'mock.js',
      WorkerCtor: function MockWorker() { return fakeWorker; },
      operations: ['slow', 'fast'],
    });
    const [slow, fast] = await Promise.all([
      client.call('slow', []),
      client.call('fast', []),
    ]);
    assert.strictEqual(slow, 'slow');
    assert.strictEqual(fast, 'fast');
  });

  it('propagates errors thrown inside the worker handler', async () => {
    const { fakeWorker } = makeMockWorker({
      boom: () => { throw new Error('explode'); },
    });
    const client = createWorkerClient({
      workerUrl: 'mock.js',
      WorkerCtor: function MockWorker() { return fakeWorker; },
      operations: ['boom'],
    });
    await assert.rejects(() => client.call('boom', []), /explode/);
  });

  it('rejects unknown operations from the client side', async () => {
    const { fakeWorker } = makeMockWorker({ add: a => a });
    const client = createWorkerClient({
      workerUrl: 'mock.js',
      WorkerCtor: function MockWorker() { return fakeWorker; },
      operations: ['add'],
    });
    await assert.rejects(() => client.call('missing', []), /Unknown worker operation/);
  });

  it('rejects unknown operations from the worker side', async () => {
    const { fakeWorker } = makeMockWorker({ add: a => a });
    const client = createWorkerClient({
      workerUrl: 'mock.js',
      WorkerCtor: function MockWorker() { return fakeWorker; },
      operations: [],
    });
    await assert.rejects(() => client.call('missing', []), /Unknown op/);
  });

  it('falls back to the main thread when WorkerCtor is missing', async () => {
    const client = createWorkerClient({
      workerUrl: 'mock.js',
      WorkerCtor: null,
      operations: ['add'],
      fallback: { add: (a, b) => a + b },
    });
    const result = await client.call('add', [4, 5]);
    assert.strictEqual(result, 9);
    assert.strictEqual(client.isUsingFallback(), true);
  });

  it('falls back when WorkerCtor throws on construction', async () => {
    const client = createWorkerClient({
      workerUrl: 'mock.js',
      WorkerCtor: function ThrowingWorker() { throw new Error('blocked'); },
      operations: ['add'],
      fallback: { add: (a, b) => a + b },
    });
    const result = await client.call('add', [10, 11]);
    assert.strictEqual(result, 21);
    assert.strictEqual(client.isUsingFallback(), true);
  });

  it('terminate() rejects all pending calls', async () => {
    let scope;
    const fakeWorker = {
      onmessage: null,
      onerror: null,
      postMessage() { /* never reply */ },
      terminate() {},
    };
    const client = createWorkerClient({
      workerUrl: 'mock.js',
      WorkerCtor: function MockWorker() { return fakeWorker; },
      operations: ['hang'],
    });
    const pending = client.call('hang', []);
    client.terminate();
    await assert.rejects(() => pending, /Worker terminated/);
  });
});

describe('handleWorkerMessage — worker-side dispatcher', () => {
  it('echoes the request id on success replies', async () => {
    const scope = {
      onmessage: null,
      posted: [],
      postMessage(msg) { this.posted.push(msg); },
    };
    handleWorkerMessage(scope, { square: x => x * x });
    scope.onmessage({ data: { id: 42, op: 'square', args: [9] } });
    await new Promise(r => queueMicrotask(r));
    await new Promise(r => queueMicrotask(r));
    assert.strictEqual(scope.posted.length, 1);
    assert.strictEqual(scope.posted[0].id, 42);
    assert.strictEqual(scope.posted[0].type, 'result');
    assert.strictEqual(scope.posted[0].result, 81);
  });

  it('echoes the request id on async handler errors', async () => {
    const scope = {
      onmessage: null,
      posted: [],
      postMessage(msg) { this.posted.push(msg); },
    };
    handleWorkerMessage(scope, {
      fail: async () => { throw new Error('async-boom'); },
    });
    scope.onmessage({ data: { id: 7, op: 'fail', args: [] } });
    // wait two ticks for the async handler to settle
    await new Promise(r => setTimeout(r, 0));
    await new Promise(r => setTimeout(r, 0));
    assert.strictEqual(scope.posted.length, 1);
    assert.strictEqual(scope.posted[0].id, 7);
    assert.strictEqual(scope.posted[0].type, 'error');
    assert.match(scope.posted[0].error, /async-boom/);
  });

  it('ignores malformed messages without an id', () => {
    const scope = {
      onmessage: null,
      posted: [],
      postMessage(msg) { this.posted.push(msg); },
    };
    handleWorkerMessage(scope, { noop: () => 'ok' });
    scope.onmessage({ data: { op: 'noop' } }); // missing id
    scope.onmessage({ data: null });
    assert.strictEqual(scope.posted.length, 0);
  });
});
