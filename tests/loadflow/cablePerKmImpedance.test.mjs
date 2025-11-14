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

const { computeImpedanceFromPerKm } = await import('../../utils/cableImpedance.js');
const { buildLoadFlowModel } = await import('../../analysis/loadFlowModel.js');
const { runLoadFlow } = await import('../../analysis/loadFlow.js');

describe('Cable per-km impedance handling', () => {
  it('propagates derived impedance into load-flow branches', () => {
    const resistancePerKm = 0.32;
    const reactancePerKm = 0.18;
    const physicalLengthFt = 350;
    const derived = computeImpedanceFromPerKm({
      resistancePerKm,
      reactancePerKm,
      length: physicalLengthFt,
      unit: 'ft'
    });
    assert(derived, 'Derived impedance should be available when per-km data is provided');

    const diagram = {
      sheets: [
        {
          name: 'Cable Study',
          components: [
            {
              id: 'source_bus',
              type: 'slack',
              subtype: 'Bus',
              baseKV: 13.8,
              connections: [{ target: 'cable1' }]
            },
            {
              id: 'load_bus',
              type: 'PQ',
              subtype: 'Bus',
              baseKV: 13.8
            },
            {
              id: 'cable1',
              type: 'cable',
              cable: {
                tag: 'CBL-1',
                resistance_per_km: resistancePerKm,
                reactance_per_km: reactancePerKm,
                manual_length: true,
                length: physicalLengthFt,
                impedance: derived
              },
              connections: [
                {
                  target: 'load_bus',
                  sourcePort: 1,
                  impedance: derived
                }
              ]
            },
            {
              id: 'load1',
              type: 'static_load',
              connections: ['load_bus'],
              load: { kw: 250, kvar: 150 },
              kw: 250,
              kvar: 150
            }
          ]
        }
      ]
    };

    const model = buildLoadFlowModel(diagram);
    const branch = model.branches.find(item => item.id === 'cable1');
    assert(branch, 'Cable branch should be present in the load-flow model');
    assert(branch.impedance, 'Cable branch should include an impedance definition');
    assert(Math.abs(branch.impedance.r - derived.r) < 1e-9, 'Cable resistance should match the derived ohmic value');
    assert(Math.abs(branch.impedance.x - derived.x) < 1e-9, 'Cable reactance should match the derived ohmic value');

    const result = runLoadFlow(model, { baseMVA: 10, balanced: true, maxIterations: 30 });
    assert(result.converged, 'Load flow should converge when impedance is available');
    const zeroImpedanceWarning = (result.warnings || []).find(w => w.type === 'zero_impedance_branch');
    assert(!zeroImpedanceWarning, 'Zero-impedance branch warnings should be absent when per-km data is applied');
    const flow = result.lines.find(line => (line.id && line.id === 'cable1') || (line.from === 'source_bus' && line.to === 'load_bus'));
    assert(flow, 'Cable power flow should be reported');
    assert(Math.abs(flow.P) > 0.1, 'Cable should carry real power when connected to a load');
  });
});
