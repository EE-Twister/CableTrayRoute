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

  it('buried soil conductivity changes required W/ft directionally', () => {
    const drySoil = runHeatTraceSizingAnalysis({
      ...baseInputs,
      pipeMaterial: 'carbonSteel',
      environment: 'buried',
      soilThermalConductivityWPerMK: 0.35,
      burialDepthFt: 3,
    });
    const wetSoil = runHeatTraceSizingAnalysis({
      ...baseInputs,
      pipeMaterial: 'carbonSteel',
      environment: 'buried',
      soilThermalConductivityWPerMK: 1.8,
      burialDepthFt: 3,
    });

    assert.ok(wetSoil.requiredWPerFt > drySoil.requiredWPerFt,
      `Expected wet soil (${wetSoil.requiredWPerFt}) > dry soil (${drySoil.requiredWPerFt})`);
    assert.ok(wetSoil.warnings.some(warning => warning.includes('Buried pipe case')),
      'Expected buried pipe simplification warning');
  });

  it('uses configured maximum circuit length for utilization status', () => {
    const result = runHeatTraceSizingAnalysis({
      ...baseInputs,
      pipeMaterial: 'carbonSteel',
      environment: 'outdoor-sheltered',
      lineLengthFt: 200,
      maxCircuitLengthFt: 150,
    });

    assert.strictEqual(result.maxCircuitLengthFt, 150);
    assert.strictEqual(result.circuitLimitStatus, 'overLimit');
    assert.ok(result.circuitUtilizationRatio > 1);
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

describe('heat trace cable type selection basis', () => {
  it('defaults legacy inputs to self-regulating cable type', () => {
    const result = runHeatTraceSizingAnalysis({
      pipeNps: '1',
      insulationThicknessIn: 1,
      lineLengthFt: 100,
      maintainTempC: 40,
      ambientTempC: -10,
    });

    assert.strictEqual(result.heatTraceCableType, 'selfRegulating');
    assert.strictEqual(result.heatTraceCableTypeLabel, 'Self-regulating');
  });

  it('preserves constant-wattage cable type and adds review warning', () => {
    const result = runHeatTraceSizingAnalysis({
      pipeNps: '1',
      insulationThicknessIn: 1,
      lineLengthFt: 100,
      maintainTempC: 40,
      ambientTempC: -10,
      heatTraceCableType: 'constantWattage',
    });

    assert.strictEqual(result.heatTraceCableType, 'constantWattage');
    assert.ok(result.warnings.some(warning => warning.includes('Constant-wattage cable selected')));
  });
});

describe('parallel runs and component allowances', () => {
  const baseInputs = {
    pipeNps: '2',
    insulationThicknessIn: 1,
    lineLengthFt: 100,
    maintainTempC: 60,
    ambientTempC: 0,
    pipeMaterial: 'carbonSteel',
    environment: 'outdoor-sheltered',
    safetyMarginPct: 10,
    voltageV: 240,
  };

  it('traceRunCount doubles installed output and current without changing required W/ft', () => {
    const single = runHeatTraceSizingAnalysis({ ...baseInputs, traceRunCount: 1 });
    const double = runHeatTraceSizingAnalysis({ ...baseInputs, traceRunCount: 2 });

    assert.strictEqual(double.requiredWPerFt, single.requiredWPerFt);
    assert.strictEqual(double.installedWPerFt, single.installedWPerFt * 2);
    assert.strictEqual(double.installedTotalWatts, single.installedTotalWatts * 2);
    approx(double.installedLoadAmps, single.installedLoadAmps * 2, 0.01);
    assert.ok(double.warnings.some(warning => warning.includes('Multiple parallel heat-trace runs selected')));
  });

  it('component allowances increase effective length and installed connected load', () => {
    const noAllowance = runHeatTraceSizingAnalysis(baseInputs);
    const withAllowance = runHeatTraceSizingAnalysis({
      ...baseInputs,
      componentAllowances: [
        { type: 'valve', quantity: 2, equivalentLengthFtEach: 5 },
        { type: 'flangePair', quantity: 1, equivalentLengthFtEach: 2 },
      ],
    });

    assert.strictEqual(withAllowance.componentAllowanceLengthFt, 12);
    assert.strictEqual(withAllowance.effectiveTraceLengthFt, 112);
    assert.ok(withAllowance.installedTotalWatts > noAllowance.installedTotalWatts);
    assert.ok(withAllowance.warnings.some(warning => warning.includes('Component equivalent-length allowances')));
  });

  it('legacy inputs default to one run and zero component allowance', () => {
    const result = runHeatTraceSizingAnalysis(baseInputs);

    assert.strictEqual(result.traceRunCount, 1);
    assert.deepStrictEqual(result.componentAllowances, []);
    assert.strictEqual(result.componentAllowanceLengthFt, 0);
    assert.strictEqual(result.effectiveTraceLengthFt, result.lineLengthFt);
  });

  it('warns when installed W/ft is below required W/ft', () => {
    const result = runHeatTraceSizingAnalysis({
      pipeNps: '12',
      insulationThicknessIn: 0.25,
      lineLengthFt: 100,
      maintainTempC: 250,
      ambientTempC: -60,
      pipeMaterial: 'carbonSteel',
      environment: 'outdoor-windy',
      windSpeedMph: 100,
      safetyMarginPct: 100,
    });

    assert.ok(result.coverageRatio < 1);
    assert.ok(result.warnings.some(warning => warning.includes('Installed trace output is below required W/ft')));
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

  it('throws on unsupported heat trace cable type', () => {
    assert.throws(
      () => runHeatTraceSizingAnalysis({
        pipeNps: '2',
        insulationThicknessIn: 1,
        lineLengthFt: 100,
        maintainTempC: 60,
        ambientTempC: 0,
        heatTraceCableType: 'unknownType',
      }),
      /Unsupported heatTraceCableType/
    );
  });

  it('throws on invalid trace run count', () => {
    assert.throws(
      () => runHeatTraceSizingAnalysis({
        pipeNps: '2',
        insulationThicknessIn: 1,
        lineLengthFt: 100,
        maintainTempC: 60,
        ambientTempC: 0,
        traceRunCount: 5,
      }),
      /traceRunCount must be an integer between 1 and 4/
    );
  });
});
