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

describe('Zero-impedance breaker regression', () => {
  it('treats a zero-impedance breaker as an ideal tie and converges', () => {
    const model = {
      buses: [
        { id: 'BUS-23', type: 'slack', baseKV: 13.8, label: 'Bus 23' },
        { id: 'BUS-25', type: 'PQ', baseKV: 13.8, label: 'Bus 25', load: { kw: 800, kvar: 160 } }
      ],
      branches: [
        {
          id: 'BRK-23-25',
          type: 'breaker',
          label: 'BRK-23-25',
          from: 'BUS-23',
          to: 'BUS-25',
          impedance: { r: 0, x: 0 }
        }
      ]
    };

    const result = runLoadFlow(model, { baseMVA: 10, balanced: true, maxIterations: 20 });
    assert(result.converged, 'Load flow should converge across the ideal tie breaker');
    assert(result.maxMismatch < 1e-6, 'Mismatch should be negligible for an ideal tie connection');
    assert(result.maxMismatchKW < 0.05, 'Mismatch in kW should be tiny');

    const slackBus = result.buses.find(bus => bus.id === 'BUS-23');
    assert(slackBus, 'Slack bus BUS-23 should be included in the results');
    assert(Math.abs(slackBus.Vm - 1) < 1e-8, 'Slack bus voltage magnitude should remain at 1.0 pu');

    const loadBus = result.buses.find(bus => bus.id === 'BUS-25');
    assert(loadBus, 'Load bus BUS-25 should appear in the solved bus list');
    assert(Math.abs(loadBus.Vm - 1) < 1e-5, 'Load bus voltage should track the slack through the ideal tie');

    const warning = result.warnings.find(msg => msg.includes('BRK-23-25'));
    assert(warning, 'Zero-impedance breaker should still emit a diagnostic warning');
  });
});
