import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { buildLoadFlowModel } from '../../analysis/loadFlowModel.js';
import { runLoadFlow } from '../../analysis/loadFlow.js';
import {
  LOSS_ROUNDOFF_FLOOR_KW,
  formatRealPowerLoss,
  realPowerLossToleranceKW,
  renderLoadFlowResultsHtml
} from '../../analysis/loadFlowResultsRenderer.js';

const sample = JSON.parse(await readFile(
  new URL('../../samples/project-workflow-core.json', import.meta.url),
  'utf8'
));

describe('real-power loss tolerance', () => {
  it('uses the round-off floor when no solver mismatch is available', () => {
    assert.equal(realPowerLossToleranceKW(), LOSS_ROUNDOFF_FLOOR_KW);
    assert.equal(realPowerLossToleranceKW({ maxMismatchKW: undefined, busCount: 3 }), LOSS_ROUNDOFF_FLOOR_KW);
  });

  it('grows with the power-balance residual bound N x maxMismatchKW', () => {
    assert.ok(Math.abs(realPowerLossToleranceKW({ maxMismatchKW: 0.1, busCount: 3 }) - 0.3) < 1e-12);
    assert.equal(realPowerLossToleranceKW({ maxMismatchKW: 0.001, busCount: 3 }), LOSS_ROUNDOFF_FLOOR_KW);
  });
});

describe('formatRealPowerLoss', () => {
  it('prints a round-off negative loss as 0.00', () => {
    const loss = formatRealPowerLoss(-0.0072, { maxMismatchKW: 0.0028, busCount: 3 });
    assert.equal(loss.text, '0.00');
    assert.equal(loss.status, 'roundoff');
    assert.equal(loss.valueKW, 0);
  });

  it('never prints -0.00', () => {
    assert.equal(formatRealPowerLoss(-0.004).text, '0.00');
    assert.equal(formatRealPowerLoss(-0).text, '0.00');
  });

  it('keeps a materially negative loss visible and flags it', () => {
    const loss = formatRealPowerLoss(-0.42, { maxMismatchKW: 0.0028, busCount: 3 });
    assert.equal(loss.text, '-0.42');
    assert.equal(loss.status, 'negative');
  });

  it('scales the tolerance with the reported solver mismatch', () => {
    assert.equal(formatRealPowerLoss(-0.3, { maxMismatchKW: 0.128, busCount: 3 }).status, 'roundoff');
    assert.equal(formatRealPowerLoss(-0.3).status, 'negative');
  });

  it('leaves positive losses unchanged', () => {
    const loss = formatRealPowerLoss(1.234, { maxMismatchKW: 0.0028, busCount: 3 });
    assert.equal(loss.text, '1.23');
    assert.equal(loss.status, 'ok');
    assert.equal(formatRealPowerLoss(0.03).text, '0.03');
  });
});

describe('Load Flow summary rendering', () => {
  it('shows a zero system loss for the bundled sample instead of -0.01 kW', () => {
    const result = runLoadFlow(buildLoadFlowModel(sample.oneLine), { baseMVA: 100, balanced: true, maxIterations: 60 });
    assert.equal(result.converged, true);
    assert.ok(result.summary.totalLossKW < 0, 'the sample still exhibits solver round-off below zero');
    const html = renderLoadFlowResultsHtml(result);
    assert.match(html, /Loss 0\.00 kW \/ 0\.00 kvar/);
    assert.match(html, /Total Losses: 0\.00 kW \/ 0\.00 kvar/);
    assert.doesNotMatch(html, /-0\.0[01] kW/);
    assert.doesNotMatch(html, /real-power loss is/);
  });

  it('applies the same tolerance to each phase of an A/B/C study', () => {
    const result = runLoadFlow(buildLoadFlowModel(sample.oneLine), { baseMVA: 100, balanced: false, maxIterations: 60 });
    assert.equal(result.converged, true);
    assert.ok(Object.values(result.summary).some(phase => phase.totalLossKW < 0), 'a phase still exhibits round-off below zero');
    const html = renderLoadFlowResultsHtml(result);
    for (const phase of ['A', 'B', 'C']) {
      assert.match(html, new RegExp(`<strong>${phase}</strong>: [^<]*Loss 0\\.00 kW / 0\\.00 kvar`));
      assert.match(html, new RegExp(`${phase}: 0\\.00 kW / 0\\.00 kvar`));
    }
    assert.doesNotMatch(html, /-0\.0\d kW/);
    assert.doesNotMatch(html, /real-power loss is/);
  });

  it('surfaces a materially negative loss as a warning', () => {
    const html = renderLoadFlowResultsHtml({
      converged: true,
      maxMismatchKW: 0.001,
      buses: [{ id: 'S', Vm: 1, Va: 0 }, { id: 'L', Vm: 0.99, Va: -1 }],
      lines: [],
      summary: { totalLoadKW: 100, totalLoadKVAR: 20, totalGenKW: 99.5, totalGenKVAR: 18.5, totalLossKW: -0.5, totalLossKVAR: -1.5 }
    });
    assert.match(html, /Loss -0\.50 kW \/ -1\.50 kvar/);
    assert.match(html, /study-warning-list"><li>System: computed real-power loss is -0\.50 kW, beyond the 0\.05 kW numerical tolerance/);
  });

  it('normalizes a near-zero reactive loss without hiding a negative one', () => {
    const html = renderLoadFlowResultsHtml({
      converged: true,
      buses: [{ id: 'S', Vm: 1, Va: 0 }],
      lines: [],
      summary: { totalLoadKW: 10, totalLoadKVAR: 2, totalGenKW: 10.1, totalGenKVAR: 2, totalLossKW: 0.1, totalLossKVAR: -0.001 }
    });
    assert.match(html, /Loss 0\.10 kW \/ 0\.00 kvar/);
  });
});
