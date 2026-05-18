import assert from 'node:assert';

const { buildLoadFlowModel } = await import('../../analysis/loadFlowModel.js');
const { runLoadFlow } = await import('../../analysis/loadFlow.js');

function nestedLoad(depth) {
  const root = {};
  let cursor = root;
  for (let i = 0; i < depth; i++) {
    cursor.next = {};
    cursor = cursor.next;
  }
  cursor.kw = 50;
  return root;
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
    console.log('  \u2717', name);
    console.error(err);
    process.exitCode = 1;
  }
}

describe('Load flow nested PQ parsing safety', () => {
  it('rejects deeply nested bus load objects with a bounded error', () => {
    const model = {
      buses: [
        { id: 'source', type: 'slack', baseKV: 13.8 },
        { id: 'load', type: 'PQ', baseKV: 13.8, load: nestedLoad(30000) }
      ],
      branches: [
        { id: 'line1', from: 'source', to: 'load', impedance: { r: 0.1, x: 0.2 } }
      ]
    };

    assert.throws(
      () => runLoadFlow(model, { baseMVA: 10, balanced: true }),
      /maximum supported nesting depth/i
    );
  });

  it('rejects deeply nested component load objects when building model', () => {
    const oneLine = {
      sheets: [
        {
          components: [
            { id: 'bus1', type: 'bus', subtype: 'Bus', position: { x: 0, y: 0 } },
            { id: 'load1', type: 'load', subtype: 'generic_load', position: { x: 5, y: 0 }, load: nestedLoad(30000) }
          ],
          connections: [
            { from: { component: 'bus1', port: 0 }, to: { component: 'load1', port: 0 } }
          ]
        }
      ]
    };

    assert.throws(
      () => buildLoadFlowModel(oneLine),
      /maximum supported nesting depth/i
    );
  });
});
