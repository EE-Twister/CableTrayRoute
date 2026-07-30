import assert from 'node:assert';

import { renderLoadFlowResultsHtml } from '../../analysis/loadFlowResultsRenderer.js';

describe('Load flow results renderer', () => {
  it('renders bus labels when available', () => {
    const result = {
      converged: true,
      buses: [
        { id: 'source', type: 'slack', baseKV: 13.8, label: 'Source Bus', Vm: 1, Va: 0 },
        { id: 'load', type: 'PQ', baseKV: 13.8, name: 'Load Feeder', Vm: 0.998, Va: -0.1 },
        { id: 'aux', type: 'PQ', baseKV: 13.8, ref: 'AuxRef', Vm: 0.997, Va: -0.2 },
        { id: 'plain', type: 'PQ', baseKV: 13.8, Vm: 0.996, Va: -0.3 }
      ],
      lines: []
    };

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
