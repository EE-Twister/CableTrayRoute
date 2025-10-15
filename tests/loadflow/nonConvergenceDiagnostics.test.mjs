import assert from 'node:assert';

import { renderLoadFlowResultsHtml } from '../../analysis/loadFlowResultsRenderer.js';

describe('Load flow diagnostics rendering', () => {
  it('describes collapsed buses, zero-impedance ties, and outsized generation', () => {
    const result = {
      converged: false,
      maxMismatch: 7.3014746e6,
      maxMismatchKW: 7.301474642629299e11,
      warnings: [
        'Solution did not converge after 300 iterations. Last mismatch 7301474.6426 pu (730147464262.9 kW).',
        'Ignored zero-impedance data for CAB-5 between BUS-17 and BUS-19; treating it as an ideal tie.',
        'Ignored zero-impedance data for CAB-4 between BUS-18 and BUS-20; treating it as an ideal tie.'
      ],
      buses: [
        { id: 'BUS-17', displayLabel: 'BUS-17', type: 'slack', Vm: 1, baseKV: 13.8 },
        {
          id: 'BUS-18',
          displayLabel: 'BUS-18',
          type: 'PQ',
          Vm: 0.16813376398365396,
          voltageKV: 0.08070420671215389,
          Pd: 3000
        },
        { id: 'BUS-19', displayLabel: 'BUS-19', type: 'PQ', Vm: 0.9999999999995652, baseKV: 13.8 },
        {
          id: 'BUS-20',
          displayLabel: 'BUS-20',
          type: 'PQ',
          Vm: 0.04457857595569717,
          voltageKV: 0.02139771645873464
        }
      ],
      summary: {
        totalLoadKW: 3000,
        totalGenKW: 2045633012679.2676,
        branchConnections: [
          {
            componentId: 'TRA-10',
            componentLabel: 'TRA-10',
            componentType: 'transformer',
            componentSubtype: 'transformer_two_winding',
            fromBus: 'BUS-19',
            toBus: 'BUS-20'
          }
        ]
      }
    };

    const html = renderLoadFlowResultsHtml(result);

    assert(html.includes('<h3>Diagnostics</h3>'), 'Diagnostics header should be present');
    assert(html.includes('BUS-18'), 'Collapsed bus BUS-18 should be mentioned');
    assert(html.includes('BUS-20'), 'Collapsed bus BUS-20 should be mentioned');
    assert(html.includes('TRA-10'), 'Transformer feeding the collapsed bus should be referenced');
    assert(html.includes('CAB-5 (BUS-17–BUS-19)'), 'Zero-impedance tie CAB-5 should be called out');
    assert(html.includes('orders of magnitude larger than the modeled load'), 'Generation/load imbalance guidance should appear');
  });
});

function describe(name, fn) {
  console.log(name);
  fn();
}

function it(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      result
        .then(() => console.log('  \u2713', name))
        .catch(err => {
          console.log('  \u2717', name);
          console.error(err);
          process.exitCode = 1;
        });
    } else {
      console.log('  \u2713', name);
    }
  } catch (err) {
    console.log('  \u2717', name);
    console.error(err);
    process.exitCode = 1;
  }
}
