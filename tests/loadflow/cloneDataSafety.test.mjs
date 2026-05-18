import assert from 'node:assert';

function describe(name, fn) {
  console.log(name);
  fn();
}

function it(name, fn) {
  try {
    fn();
    console.log('  \u2713', name);
  } catch (err) {
    console.log('  \u2717', name);
    console.error(err);
    process.exitCode = 1;
  }
}

const { runLoadFlow } = await import('../../analysis/loadFlow.js');

function buildDeepObject(depth) {
  let node = { r: 0.01, x: 0.02 };
  for (let i = 0; i < depth; i += 1) {
    node = { nested: node };
  }
  return node;
}

describe('Load flow branch clone safety', () => {
  it('rejects excessively nested branch payloads with a bounded error', () => {
    const model = {
      buses: [
        { id: 'slack', type: 'slack', baseKV: 13.8 },
        { id: 'load', type: 'PQ', baseKV: 13.8, load: { kw: 100, kvar: 20 } }
      ],
      branches: [
        {
          id: 'deep-1',
          from: 'slack',
          to: 'load',
          impedance: buildDeepObject(600)
        }
      ]
    };

    assert.throws(
      () => runLoadFlow(model, { baseMVA: 10, balanced: true }),
      /maximum supported nesting depth/i
    );
  });
});
