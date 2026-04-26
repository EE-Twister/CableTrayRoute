import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildGroundGridRecommendations,
  classifySafetyRatio,
  getGroundGridSafetyMetrics,
} from '../src/groundgridSafetyPresentation.js';

describe('ground grid safety presentation helpers', () => {
  it('classifies pending, pass, warning, and fail ratios', () => {
    assert.equal(classifySafetyRatio(Number.NaN), 'pending');
    assert.equal(classifySafetyRatio(0.7), 'pass');
    assert.equal(classifySafetyRatio(0.85), 'warning');
    assert.equal(classifySafetyRatio(1), 'warning');
    assert.equal(classifySafetyRatio(1.01), 'fail');
  });

  it('derives safety ratios and pass design status', () => {
    const metrics = getGroundGridSafetyMetrics({
      Em: 400,
      Etouch: 800,
      Es: 300,
      Estep: 1000,
      GPR: 600,
    });

    assert.equal(metrics.hasAnalysis, true);
    assert.equal(metrics.touchRatio, 0.5);
    assert.equal(metrics.stepRatio, 0.3);
    assert.equal(metrics.gprRatio, 0.75);
    assert.equal(metrics.designStatus, 'pass');
  });

  it('requires action when touch or step voltage exceeds the limit', () => {
    const metrics = getGroundGridSafetyMetrics({
      Em: 900,
      Etouch: 800,
      Es: 300,
      Estep: 1000,
      GPR: 600,
    });

    assert.equal(metrics.touchStatus, 'fail');
    assert.equal(metrics.designStatus, 'fail');
  });

  it('marks GPR-only exceedance as engineering review', () => {
    const metrics = getGroundGridSafetyMetrics({
      Em: 400,
      Etouch: 800,
      Es: 300,
      Estep: 1000,
      GPR: 1200,
    });

    assert.equal(metrics.gprStatus, 'fail');
    assert.equal(metrics.designStatus, 'review');
  });

  it('returns pending recommendation before analysis', () => {
    const recommendations = buildGroundGridRecommendations();
    assert.equal(recommendations[0].title, 'Run the IEEE 80 analysis');
  });

  it('prioritizes grid improvements for failed voltage checks', () => {
    const result = {
      Em: 900,
      Etouch: 800,
      Es: 1300,
      Estep: 1000,
      GPR: 1500,
    };
    const recommendations = buildGroundGridRecommendations({
      result,
      metrics: getGroundGridSafetyMetrics(result),
      hasRods: false,
      hasSurfaceLayer: false,
    });

    assert.equal(recommendations[0].title, 'Reduce conductor spacing or add grid conductors');
    assert.ok(recommendations.some(item => item.title === 'Add perimeter or corner ground rods'));
    assert.ok(recommendations.some(item => item.title === 'Add a high-resistivity surface layer'));
    assert.ok(recommendations.some(item => item.title === 'Review transferred-voltage exposure'));
  });
});
