import assert from 'node:assert/strict';
import test from 'node:test';
import { renderLoadFlowResultsHtml } from '../../analysis/loadFlowResultsRenderer.js';

test('transformer line results present terminal currents and rated-voltage drop basis', () => {
  const html = renderLoadFlowResultsHtml({
    converged: true,
    buses: [],
    lines: [{
      from: 'P', to: 'S', componentType: 'transformer', fromKV: 0.48, toKV: 0.208,
      fromCurrentA: 120.4, toCurrentA: 277.9, dropPct: 1.25, dropKV: 0.006,
      dropBasis: { type: 'per-unit-terminal', fromPu: 0.98, toPu: 0.9675, deltaPu: 0.0125 },
      P: 50, Q: 10,
    }],
  });
  assert.match(html, /From 120\.4 \/ To 277\.9/);
  assert.match(html, /1\.25%/);
  assert.match(html, /0\.006 kV/);
  assert.match(html, /rated-voltage terminal bases/);
});

test('ordinary cable line keeps single-current legacy presentation', () => {
  const html = renderLoadFlowResultsHtml({
    converged: true,
    buses: [],
    lines: [{ from: 'A', to: 'B', fromKV: 0.48, toKV: 0.479, amps: 42.5, dropPct: 0.8, P: 10, Q: 2 }],
  });
  assert.match(html, />42\.5<\/td>/);
  assert.doesNotMatch(html, /From 42\.5/);
});
