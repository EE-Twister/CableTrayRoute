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

describe('Zero-impedance branch handling', () => {
  it('ignores missing impedance cables while reporting a warning', () => {
    const model = {
      buses: [
        { id: 'source', type: 'slack', baseKV: 0.48 },
        { id: 'load', type: 'PQ', baseKV: 0.48, load: { kw: 50, kvar: 5 } },
        { id: 'tap', type: 'PQ', baseKV: 0.48 }
      ],
      branches: [
        {
          id: 'cab4',
          type: 'cable',
          label: 'CAB-4',
          name: 'Cable CAB-4',
          from: 'source',
          to: 'tap',
          impedance: { r: 0.01, x: 0.02 }
        },
        {
          id: 'cab4-tie',
          type: 'cable',
          label: 'CAB-4 TIE',
          name: 'Cable CAB-4 Tie',
          from: 'tap',
          to: 'load',
          impedance: { r: 0, x: 0 }
        }
      ]
    };

    const result = runLoadFlow(model, { baseMVA: 1, balanced: true, maxIterations: 20 });
    assert(result.converged, 'Load flow should converge even when a cable impedance is missing');
    assert(Array.isArray(result.warnings), 'Warnings should be collected');
    const warning = result.warnings.find(msg => msg.toLowerCase().includes('cab-4 tie'));
    assert(warning, 'Zero-impedance cable should produce a warning mentioning the cable label');
    assert(result.maxMismatch < 1e-4, 'Ignoring the cable should prevent large mismatches');
  });
});
