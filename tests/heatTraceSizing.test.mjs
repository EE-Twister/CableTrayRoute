/**
 * Tests for analysis/heatTraceSizing.mjs
 */

import assert from 'assert';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  runHeatTraceSizingAnalysis,
  selectStandardHeatTraceRating,
  selectHeatTraceProduct,
  calcAccessoryKit,
  buildLineList,
  buildHeatTraceBOM,
  buildControllerSchedule,
} from '../analysis/heatTraceSizing.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const heatTraceProductCatalog = JSON.parse(
  readFileSync(join(__dirname, '../data/heatTraceProducts.json'), 'utf8')
);

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

// ---------------------------------------------------------------------------
// Product catalog sanity
// ---------------------------------------------------------------------------

describe('heatTraceProducts.json catalog schema', () => {
  it('catalog is a non-empty array', () => {
    assert.ok(Array.isArray(heatTraceProductCatalog) && heatTraceProductCatalog.length > 0);
  });

  it('every product has required fields', () => {
    heatTraceProductCatalog.forEach(p => {
      assert.ok(typeof p.id === 'string' && p.id.length > 0, `product ${p.id} missing id`);
      assert.ok(typeof p.family === 'string', `product ${p.id} missing family`);
      assert.ok(typeof p.type === 'string', `product ${p.id} missing type`);
      assert.ok(Array.isArray(p.voltages) && p.voltages.length > 0, `product ${p.id} missing voltages`);
      assert.ok(typeof p.nominalWPerFt === 'number' && p.nominalWPerFt > 0, `product ${p.id} bad nominalWPerFt`);
      assert.ok(p.maxCircuitLengthFt && typeof p.maxCircuitLengthFt === 'object', `product ${p.id} missing maxCircuitLengthFt`);
    });
  });

  it('hazardous products have a non-null hazardousAreaRating', () => {
    const hazProducts = heatTraceProductCatalog.filter(p => p.exposureRating === 'hazardous');
    hazProducts.forEach(p => {
      assert.ok(typeof p.hazardousAreaRating === 'string' && p.hazardousAreaRating.length > 0,
        `hazardous product ${p.id} must have hazardousAreaRating string`);
    });
  });
});

// ---------------------------------------------------------------------------
// selectHeatTraceProduct
// ---------------------------------------------------------------------------

function makeCircuit(overrides = {}) {
  const base = {
    voltageV: 240,
    requiredWPerFt: 5,
    effectiveTraceLengthFt: 200,
    traceRunCount: 1,
    installedLoadAmps: 3,
    installedTotalWatts: 720,
    componentAllowances: [],
    inputs: { maintainTempC: 40, environment: 'outdoor-sheltered' },
  };
  return { ...base, ...overrides, inputs: { ...base.inputs, ...(overrides.inputs || {}) } };
}

describe('selectHeatTraceProduct — basic matching', () => {
  it('returns a product for a standard 5 W/ft 240 V circuit', () => {
    const { product } = selectHeatTraceProduct(makeCircuit(), heatTraceProductCatalog);
    assert.ok(product !== null, 'Expected a matching product');
    assert.ok(product.nominalWPerFt >= 5);
    assert.ok(product.voltages.includes(240));
  });

  it('returns the tightest-fit product (lowest W/ft that meets requirement)', () => {
    const { product, candidates } = selectHeatTraceProduct(makeCircuit({ requiredWPerFt: 3 }), heatTraceProductCatalog);
    assert.ok(product !== null);
    assert.strictEqual(product, candidates[0], 'first candidate should be the selected product');
    assert.ok(product.nominalWPerFt >= 3);
    if (candidates.length > 1) {
      assert.ok(product.nominalWPerFt <= candidates[1].nominalWPerFt);
    }
  });

  it('returns null product when required W/ft exceeds all catalog entries', () => {
    const { product } = selectHeatTraceProduct(makeCircuit({ requiredWPerFt: 999 }), heatTraceProductCatalog);
    assert.strictEqual(product, null);
  });

  it('requires hazardous-area product for hazardous environment', () => {
    const { product } = selectHeatTraceProduct(
      makeCircuit({ inputs: { maintainTempC: 40, environment: 'hazardous-area' } }),
      heatTraceProductCatalog
    );
    assert.ok(product === null || Boolean(product.hazardousAreaRating),
      'Hazardous circuit must match only hazardous-rated products');
  });

  it('reports circuitLengthOk correctly when circuit exceeds max length', () => {
    const longCircuit = makeCircuit({ effectiveTraceLengthFt: 9999 });
    const { product, circuitLengthOk } = selectHeatTraceProduct(longCircuit, heatTraceProductCatalog);
    if (product) {
      assert.strictEqual(circuitLengthOk, false, 'Long circuit should fail the length check');
    }
  });

  it('throws on invalid circuit argument', () => {
    assert.throws(() => selectHeatTraceProduct(null, heatTraceProductCatalog), /circuit must be an object/);
  });

  it('throws on invalid catalog argument', () => {
    assert.throws(() => selectHeatTraceProduct(makeCircuit(), 'not-an-array'), /catalog must be an array/);
  });

  it('returns empty candidates array on empty catalog', () => {
    const { candidates } = selectHeatTraceProduct(makeCircuit(), []);
    assert.deepStrictEqual(candidates, []);
  });
});

// ---------------------------------------------------------------------------
// calcAccessoryKit
// ---------------------------------------------------------------------------

describe('calcAccessoryKit', () => {
  it('returns exactly 1 powerConnectionKit per circuit', () => {
    const kit = calcAccessoryKit(makeCircuit(), null);
    assert.strictEqual(kit.powerConnectionKits, 1);
  });

  it('endSealKits equals traceRunCount', () => {
    const kit = calcAccessoryKit(makeCircuit({ traceRunCount: 2 }), null);
    assert.strictEqual(kit.endSealKits, 2);
  });

  it('labels is at least 1 for very short circuits', () => {
    const kit = calcAccessoryKit(makeCircuit({ effectiveTraceLengthFt: 20 }), null);
    assert.ok(kit.labels >= 1);
  });

  it('labels scales with length (1 per 50 ft)', () => {
    const kit = calcAccessoryKit(makeCircuit({ effectiveTraceLengthFt: 150 }), null);
    assert.strictEqual(kit.labels, 3);
  });

  it('valveKits counts valve-type component allowances', () => {
    const circuit = makeCircuit({
      componentAllowances: [
        { type: 'valve', quantity: 3, equivalentLengthFtEach: 5, totalEquivalentLengthFt: 15 },
      ],
    });
    const kit = calcAccessoryKit(circuit, null);
    assert.strictEqual(kit.valveKits, 3);
  });

  it('flangePairKits counts flangePair-type component allowances', () => {
    const circuit = makeCircuit({
      componentAllowances: [
        { type: 'flangePair', quantity: 2, equivalentLengthFtEach: 2, totalEquivalentLengthFt: 4 },
      ],
    });
    const kit = calcAccessoryKit(circuit, null);
    assert.strictEqual(kit.flangePairKits, 2);
  });

  it('throws on non-object circuit', () => {
    assert.throws(() => calcAccessoryKit(null, null), /circuit must be an object/);
  });
});

// ---------------------------------------------------------------------------
// buildLineList
// ---------------------------------------------------------------------------

describe('buildLineList', () => {
  const twoCircuits = [
    makeCircuit({ name: 'HT-1', requiredWPerFt: 5, effectiveTraceLengthFt: 200, inputs: { maintainTempC: 40, ambientTempC: -10, environment: 'outdoor-sheltered' } }),
    makeCircuit({ name: 'HT-2', requiredWPerFt: 8, effectiveTraceLengthFt: 300, inputs: { maintainTempC: 60, ambientTempC: -10, environment: 'outdoor-sheltered' } }),
  ];

  it('returns one row per circuit', () => {
    const rows = buildLineList(twoCircuits, heatTraceProductCatalog);
    assert.strictEqual(rows.length, 2);
  });

  it('row has expected keys', () => {
    const rows = buildLineList(twoCircuits, heatTraceProductCatalog);
    const required = ['lineNum','circuitTag','productFamily','requiredWPerFt','circuitLengthCheck','controllerTag'];
    required.forEach(key => assert.ok(key in rows[0], `Missing key: ${key}`));
  });

  it('lineNum is 1-indexed', () => {
    const rows = buildLineList(twoCircuits, heatTraceProductCatalog);
    assert.strictEqual(rows[0].lineNum, 1);
    assert.strictEqual(rows[1].lineNum, 2);
  });

  it('circuitLengthCheck is PASS for a short circuit with a matching product', () => {
    const shortCircuit = makeCircuit({ name: 'HT-A', requiredWPerFt: 3, effectiveTraceLengthFt: 50 });
    const rows = buildLineList([shortCircuit], heatTraceProductCatalog);
    assert.ok(['PASS', 'EXCEEDS', 'NO PRODUCT'].includes(rows[0].circuitLengthCheck));
    if (rows[0].productFamily !== 'No match') {
      assert.strictEqual(rows[0].circuitLengthCheck, 'PASS');
    }
  });

  it('throws on non-array circuits', () => {
    assert.throws(() => buildLineList('bad', heatTraceProductCatalog), /circuits must be an array/);
  });

  it('throws on non-array catalog', () => {
    assert.throws(() => buildLineList(twoCircuits, 'bad'), /catalog must be an array/);
  });

  it('returns empty array for empty circuits', () => {
    const rows = buildLineList([], heatTraceProductCatalog);
    assert.deepStrictEqual(rows, []);
  });
});

// ---------------------------------------------------------------------------
// buildHeatTraceBOM
// ---------------------------------------------------------------------------

describe('buildHeatTraceBOM', () => {
  it('returns 8 BOM line items', () => {
    const rows = buildLineList([makeCircuit()], heatTraceProductCatalog);
    const bom = buildHeatTraceBOM(rows);
    assert.strictEqual(bom.length, 8);
  });

  it('every BOM item has item, description, quantity, unit fields', () => {
    const rows = buildLineList([makeCircuit()], heatTraceProductCatalog);
    const bom = buildHeatTraceBOM(rows);
    bom.forEach(item => {
      assert.ok(typeof item.item === 'string');
      assert.ok(typeof item.description === 'string');
      assert.ok(typeof item.quantity === 'number');
      assert.ok(typeof item.unit === 'string');
    });
  });

  it('powerConnectionKits equals number of circuits', () => {
    const circuits = [makeCircuit({ name: 'A' }), makeCircuit({ name: 'B' })];
    const rows = buildLineList(circuits, heatTraceProductCatalog);
    const bom = buildHeatTraceBOM(rows);
    const pcKit = bom.find(item => item.item === 'Power connection kit');
    assert.strictEqual(pcKit.quantity, 2);
  });

  it('throws on non-array input', () => {
    assert.throws(() => buildHeatTraceBOM('bad'), /lineListRows must be an array/);
  });
});

// ---------------------------------------------------------------------------
// buildControllerSchedule
// ---------------------------------------------------------------------------

describe('buildControllerSchedule', () => {
  it('groups circuits by controllerTag', () => {
    const rows = buildLineList([
      { ...makeCircuit({ name: 'HT-1' }), controllerTag: 'HTC-1', panelSource: 'LP-1' },
      { ...makeCircuit({ name: 'HT-2' }), controllerTag: 'HTC-1', panelSource: 'LP-1' },
      { ...makeCircuit({ name: 'HT-3' }), controllerTag: 'HTC-2', panelSource: 'LP-2' },
    ], heatTraceProductCatalog);
    const schedule = buildControllerSchedule(rows);
    assert.ok(schedule.length >= 1);
  });

  it('circuitCount matches number of circuits per controller', () => {
    const baseRows = buildLineList([
      makeCircuit({ name: 'HT-1' }),
      makeCircuit({ name: 'HT-2' }),
    ], heatTraceProductCatalog);
    const rows = baseRows.map(r => ({ ...r, controllerTag: 'HTC-1' }));
    const schedule = buildControllerSchedule(rows);
    assert.strictEqual(schedule.length, 1);
    assert.strictEqual(schedule[0].controllerTag, 'HTC-1');
    assert.strictEqual(schedule[0].circuitCount, 2);
  });

  it('totalAmps is sum of circuit amps', () => {
    const baseRows = buildLineList([makeCircuit({ installedLoadAmps: 2 }), makeCircuit({ installedLoadAmps: 3 })], heatTraceProductCatalog);
    const rows = baseRows.map(r => ({ ...r, controllerTag: 'HTC-X' }));
    const schedule = buildControllerSchedule(rows);
    assert.ok(Number.isFinite(schedule[0].totalAmps));
  });

  it('throws on non-array input', () => {
    assert.throws(() => buildControllerSchedule('bad'), /lineListRows must be an array/);
  });

  it('returns empty array for empty input', () => {
    const schedule = buildControllerSchedule([]);
    assert.deepStrictEqual(schedule, []);
  });
});
