import assert from 'node:assert';

import { runLoadFlow } from '../../analysis/loadFlow.js';
import { renderLoadFlowResultsHtml } from '../../analysis/loadFlowResultsRenderer.js';

describe('Load flow results renderer', () => {
  it('renders bus labels when available', () => {
    const model = {
      buses: [
        { id: 'source', type: 'slack', baseKV: 13.8, label: 'Source Bus' },
        { id: 'load', type: 'PQ', baseKV: 13.8, name: 'Load Feeder', load: { kw: 50, kvar: 5 } },
        { id: 'aux', type: 'PQ', baseKV: 13.8, ref: 'AuxRef', load: { kw: 10, kvar: 1 } },
        { id: 'plain', type: 'PQ', baseKV: 13.8, load: { kw: 5, kvar: 1 } }
      ],
      branches: [
        { id: 'line1', from: 'source', to: 'load', impedance: { r: 0.02, x: 0.04 } },
        { id: 'line2', from: 'load', to: 'aux', impedance: { r: 0.01, x: 0.03 } },
        { id: 'line3', from: 'aux', to: 'plain', impedance: { r: 0.01, x: 0.02 } }
      ]
    };

    const result = runLoadFlow(model, { baseMVA: 10, balanced: true });
    const html = renderLoadFlowResultsHtml(result);

    assert(html.includes('Source Bus'), 'Slack bus label should be rendered');
    assert(html.includes('Load Feeder'), 'Bus name should be rendered when label missing');
    assert(html.includes('AuxRef'), 'Bus ref should be rendered when label and name missing');
    assert(html.includes('plain</td>'), 'Bus ID should be used when no label, name, or ref provided');
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
      result.then(() => console.log('  \u2713', name)).catch(err => {
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
