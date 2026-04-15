/**
 * Tests for analysis/heatTraceSizing.mjs
 */

import assert from 'assert';
import {
  runHeatTraceSizingAnalysis,
  selectStandardHeatTraceRating,
} from '../analysis/heatTraceSizing.mjs';

function describe(name, fn) {
  console.log(name);
  fn();
}

function it(name, fn) {
  try {
    fn();
    console.log('  \u2713', name);
  } catch (err) {
    console.error('  \u2717', name, err.message || err);
    process.exitCode = 1;
  }
}

function approx(actual, expected, tol = 0.02) {
  const diff = Math.abs(actual - expected);
  const rel = diff / (Math.abs(expected) || 1);
  assert.ok(
    rel <= tol || diff < 0.1,
    `Expected ~${expected}, got ${actual} (rel error ${(rel * 100).toFixed(2)}%)`
  );
}

describe('heat trace sizing representative W/ft cases', () => {
  it('carbon steel indoor case returns expected required W/ft', () => {
    const result = runHeatTraceSizingAnalysis({
      pipeNps: '2',
      insulationThicknessIn: 1,
      lineLengthFt: 150,
      maintainTempC: 60,
      ambientTempC: 20,
      pipeMaterial: 'carbonSteel',
      environment: 'indoor-still',
      safetyMarginPct: 10,
    });

    approx(result.requiredWPerFt, 5.07, 0.01);
    assert.strictEqual(result.recommendedCableRatingWPerFt, 8);
  });

  it('stainless outdoor windy case returns expected required W/ft', () => {
    const result = runHeatTraceSizingAnalysis({
      pipeNps: '2',
      insulationThicknessIn: 1,
      lineLengthFt: 150,
      maintainTempC: 60,
      ambientTempC: -10,
      pipeMaterial: 'stainlessSteel',
      environment: 'outdoor-windy',
      windSpeedMph: 15,
      safetyMarginPct: 10,
    });

    approx(result.requiredWPerFt, 9.52, 0.01);
    assert.strictEqual(result.recommendedCableRatingWPerFt, 10);
  });

  it('plastic piping in freezer-like ambient returns expected required W/ft', () => {
    const result = runHeatTraceSizingAnalysis({
      pipeNps: '1',
      insulationThicknessIn: 1.5,
      lineLengthFt: 200,
      maintainTempC: 5,
      ambientTempC: -30,
      pipeMaterial: 'pvc',
      environment: 'freezer',
      safetyMarginPct: 15,
    });

    approx(result.requiredWPerFt, 2.19, 0.01);
    assert.strictEqual(result.recommendedCableRatingWPerFt, 3);
  });
});

describe('material/environment multipliers influence output directionally', () => {
  const baseInputs = {
    pipeNps: '2',
    insulationThicknessIn: 1,
    lineLengthFt: 100,
    maintainTempC: 60,
    ambientTempC: 0,
    safetyMarginPct: 10,
  };

  it('harsher outdoor windy environment increases required W/ft vs indoor still', () => {
    const indoor = runHeatTraceSizingAnalysis({
      ...baseInputs,
      pipeMaterial: 'copper',
      environment: 'indoor-still',
      windSpeedMph: 0,
    });
    const windy = runHeatTraceSizingAnalysis({
      ...baseInputs,
      pipeMaterial: 'copper',
      environment: 'outdoor-windy',
      windSpeedMph: 15,
    });

    assert.ok(windy.requiredWPerFt > indoor.requiredWPerFt,
      `Expected windy (${windy.requiredWPerFt}) > indoor (${indoor.requiredWPerFt})`);
  });

  it('higher material factor (carbon steel) increases required W/ft vs pvc', () => {
    const carbon = runHeatTraceSizingAnalysis({
      ...baseInputs,
      pipeMaterial: 'carbonSteel',
      environment: 'outdoor-sheltered',
    });
    const pvc = runHeatTraceSizingAnalysis({
      ...baseInputs,
      pipeMaterial: 'pvc',
      environment: 'outdoor-sheltered',
    });

    assert.ok(carbon.requiredWPerFt > pvc.requiredWPerFt,
      `Expected carbon (${carbon.requiredWPerFt}) > pvc (${pvc.requiredWPerFt})`);
  });
});

describe('standard cable rating selection', () => {
  it('rounds up to next standard when between ratings', () => {
    const rating = selectStandardHeatTraceRating(8.01);
    assert.strictEqual(rating.selectedWPerFt, 10);
  });

  it('keeps exact standard value when already on rating', () => {
    const rating = selectStandardHeatTraceRating(8);
    assert.strictEqual(rating.selectedWPerFt, 8);
  });
});

describe('input validation', () => {
  it('throws when maintainTempC is not above ambientTempC', () => {
    assert.throws(
      () => runHeatTraceSizingAnalysis({
        pipeNps: '2',
        insulationThicknessIn: 1,
        lineLengthFt: 100,
        maintainTempC: 10,
        ambientTempC: 10,
      }),
      /maintainTempC must be greater than ambientTempC/
    );
  });

  it('throws on invalid geometry (non-positive insulation thickness)', () => {
    assert.throws(
      () => runHeatTraceSizingAnalysis({
        pipeNps: '2',
        insulationThicknessIn: 0,
        lineLengthFt: 100,
        maintainTempC: 60,
        ambientTempC: 0,
      }),
      /insulationThicknessIn must be a finite number greater than zero/
    );
  });

  it('throws on invalid geometry (unsupported pipeNps)', () => {
    assert.throws(
      () => runHeatTraceSizingAnalysis({
        pipeNps: '14',
        insulationThicknessIn: 1,
        lineLengthFt: 100,
        maintainTempC: 60,
        ambientTempC: 0,
      }),
      /Unsupported pipeNps/
    );
  });
});
