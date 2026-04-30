import assert from 'node:assert/strict';
import {
  calcVoltageDip,
  pstFromTable,
  pltFromPst,
  classifyFlickerRisk,
  runVoltageFlickerStudy,
  normalizeVoltageFlickerStudyCase,
  normalizeFlickerLoadStepRows,
  buildVoltageFlickerComplianceRows,
  buildVoltageFlickerStudyPackage,
  renderVoltageFlickerStudyHTML,
  PST_LIMIT,
  PST_PASS_THRESHOLD,
  PLT_OBSERVATION_PERIODS,
} from '../analysis/voltageFlicker.mjs';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
function baseInputs(overrides = {}) {
  return {
    systemKva: 50000,
    xrRatio: 10,
    loadSteps: [{ label: 'Arc Furnace', loadKw: 5000, repetitionsPerHour: 120 }],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Module constants
// ---------------------------------------------------------------------------
(function testConstants() {
  assert.equal(PST_PASS_THRESHOLD, 0.8, 'planning level = 0.8');
  assert.equal(PST_LIMIT, 1.0, 'mandatory limit = 1.0');
  assert.equal(PLT_OBSERVATION_PERIODS, 12, '12 × 10-min periods in 2-hr Plt');
})();

// ---------------------------------------------------------------------------
// calcVoltageDip
// ---------------------------------------------------------------------------
(function testCalcVoltageDip() {
  // Basic: ΔV% = (loadKw / systemKva) × 100
  const { deltaVPercent, dipPu } = calcVoltageDip(5000, 50000);
  assert.ok(Math.abs(deltaVPercent - 10) < 0.001, 'ΔV% = (5000/50000)×100 = 10%');
  assert.ok(Math.abs(dipPu - 0.1) < 0.0001, 'dipPu = 0.1 pu');

  // Scale check: doubling load doubles dip
  const { deltaVPercent: dv2 } = calcVoltageDip(10000, 50000);
  assert.ok(Math.abs(dv2 - 20) < 0.001, 'doubling load doubles ΔV%');

  // Strong source (large S_sc) gives small dip
  const { deltaVPercent: dvStrong } = calcVoltageDip(1000, 1000000);
  assert.ok(dvStrong < 0.2, 'strong source gives small voltage dip');

  // xrRatio default parameter accepted without error
  const r = calcVoltageDip(1000, 50000, 5);
  assert.ok(r.deltaVPercent > 0, 'custom xrRatio accepted');

  // Validation errors
  assert.throws(() => calcVoltageDip(0, 50000), /loadKw must be greater than zero/, 'zero loadKw throws');
  assert.throws(() => calcVoltageDip(-100, 50000), /loadKw must be greater than zero/, 'negative loadKw throws');
  assert.throws(() => calcVoltageDip(1000, 0), /systemKva must be greater than zero/, 'zero systemKva throws');
  assert.throws(() => calcVoltageDip(1000, 50000, -1), /xrRatio must be a positive number/, 'negative xrRatio throws');
})();

// ---------------------------------------------------------------------------
// pstFromTable
// ---------------------------------------------------------------------------
(function testPstFromTable() {
  // Exact table look-up: ΔV=1.0%, r=0.1/hr → table value = 1.00 (exact)
  const pst1 = pstFromTable(1.0, 0.1);
  assert.ok(Math.abs(pst1 - 1.0) < 0.05, `pstFromTable(1.0%, 0.1/hr) ≈ 1.0 (got ${pst1})`);

  // Exact table look-up: ΔV=0.5%, r=1/hr → table value = 0.87
  const pst2 = pstFromTable(0.5, 1);
  assert.ok(Math.abs(pst2 - 0.87) < 0.05, `pstFromTable(0.5%, 1/hr) ≈ 0.87 (got ${pst2})`);

  // At a very large ΔV and high rate, Pst is well above 1.0
  const pst3 = pstFromTable(3.0, 60);
  assert.ok(pst3 > 5, `pstFromTable(3.0%, 60/hr) should be >> 1 (got ${pst3})`);

  // Monotonicity: larger ΔV → larger Pst (same r)
  const pstLow  = pstFromTable(0.5, 10);
  const pstHigh = pstFromTable(2.0, 10);
  assert.ok(pstHigh > pstLow, 'larger ΔV produces larger Pst at same repetition rate');

  // Monotonicity: higher repetition rate → larger Pst (same ΔV)
  const pstSlow = pstFromTable(1.0, 1);
  const pstFast = pstFromTable(1.0, 3600);
  assert.ok(pstFast > pstSlow, 'higher repetition rate produces larger Pst at same ΔV');

  // Clamping: values outside the table range return the nearest boundary value
  const pstClampLow = pstFromTable(0.001, 0.00001);
  assert.ok(pstClampLow > 0, 'clamped to minimum ΔV/r still returns a positive value');

  const pstClampHigh = pstFromTable(100, 100000);
  assert.ok(pstClampHigh >= pstFromTable(10.0, 3600), 'clamped to max ΔV/r matches table maximum');
})();

// ---------------------------------------------------------------------------
// pltFromPst
// ---------------------------------------------------------------------------
(function testPltFromPst() {
  // Constant series: Plt = Pst
  const plt1 = pltFromPst([1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0]);
  assert.ok(Math.abs(plt1 - 1.0) < 0.001, '12 equal Pst values → Plt = same value');

  // Single value: Plt = that value
  const plt2 = pltFromPst([0.85]);
  assert.ok(Math.abs(plt2 - 0.85) < 0.001, 'single Pst value → Plt = that value');

  // All zeros → Plt = 0
  const plt3 = pltFromPst([0, 0, 0]);
  assert.ok(plt3 === 0, 'all-zero Pst values → Plt = 0');

  // Dominant high value drives Plt up
  const plt4 = pltFromPst([0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 5.0]);
  assert.ok(plt4 > 1.0, 'one high Pst drives Plt above 1.0 even when others are low');

  // cube-root of mean cube: [2, 2, 2] → Plt = 2
  const plt5 = pltFromPst([2, 2, 2]);
  assert.ok(Math.abs(plt5 - 2) < 0.001, 'uniform array [2,2,2] → Plt = 2');

  // Validation
  assert.throws(() => pltFromPst([]), /non-empty array/, 'empty array throws');
  assert.throws(() => pltFromPst([0.5, -0.1]), /invalid entry/, 'negative Pst throws');
})();

// ---------------------------------------------------------------------------
// classifyFlickerRisk
// ---------------------------------------------------------------------------
(function testClassifyFlickerRisk() {
  assert.equal(classifyFlickerRisk(0.0),  'pass',     '0.0 → pass');
  assert.equal(classifyFlickerRisk(0.5),  'pass',     '0.5 → pass');
  assert.equal(classifyFlickerRisk(0.8),  'pass',     '0.8 (boundary) → pass');
  assert.equal(classifyFlickerRisk(0.81), 'marginal', '0.81 → marginal');
  assert.equal(classifyFlickerRisk(1.0),  'marginal', '1.0 (boundary) → marginal');
  assert.equal(classifyFlickerRisk(1.01), 'fail',     '1.01 → fail');
  assert.equal(classifyFlickerRisk(2.5),  'fail',     '2.5 → fail');
  assert.equal(classifyFlickerRisk(50),   'fail',     '50 → fail');
})();

// ---------------------------------------------------------------------------
// runVoltageFlickerStudy — result structure
// ---------------------------------------------------------------------------
(function testRunStructure() {
  const result = runVoltageFlickerStudy(baseInputs());

  assert.ok(Array.isArray(result.loadStepResults), 'loadStepResults is an array');
  assert.equal(result.loadStepResults.length, 1, 'one step → one result');
  assert.ok(Number.isFinite(result.worstPst), 'worstPst is a finite number');
  assert.ok(['pass', 'marginal', 'fail'].includes(result.worstPstRisk), 'worstPstRisk is a valid category');
  assert.ok(Number.isFinite(result.plt), 'plt is a finite number');
  assert.ok(['pass', 'marginal', 'fail'].includes(result.pltRisk), 'pltRisk is a valid category');
  assert.ok(Array.isArray(result.warnings), 'warnings is an array');
  assert.ok(typeof result.timestamp === 'string', 'timestamp is a string');

  // Per-step fields
  const step = result.loadStepResults[0];
  assert.ok('label'               in step, 'step has label');
  assert.ok('loadKw'              in step, 'step has loadKw');
  assert.ok('repetitionsPerHour'  in step, 'step has repetitionsPerHour');
  assert.ok('deltaVPercent'       in step, 'step has deltaVPercent');
  assert.ok('pst'                 in step, 'step has pst');
  assert.ok('pstRisk'             in step, 'step has pstRisk');
  assert.ok('pstLimitPct'         in step, 'step has pstLimitPct');
})();

// ---------------------------------------------------------------------------
// runVoltageFlickerStudy — worst-case aggregation
// ---------------------------------------------------------------------------
(function testRunWorstCase() {
  const result = runVoltageFlickerStudy(baseInputs({
    loadSteps: [
      { label: 'Small', loadKw: 500,  repetitionsPerHour: 5   },
      { label: 'Large', loadKw: 8000, repetitionsPerHour: 120 },
    ],
  }));

  assert.equal(result.loadStepResults.length, 2, 'two steps → two results');
  const largePst = result.loadStepResults[1].pst;
  const smallPst = result.loadStepResults[0].pst;
  assert.ok(largePst > smallPst, 'larger load produces larger Pst');
  assert.ok(Math.abs(result.worstPst - largePst) < 0.001, 'worstPst equals the larger step Pst');
})();

// ---------------------------------------------------------------------------
// runVoltageFlickerStudy — pstLimitPct computation
// ---------------------------------------------------------------------------
(function testPstLimitPct() {
  const result = runVoltageFlickerStudy(baseInputs({
    loadSteps: [{ label: 'Test', loadKw: 1000, repetitionsPerHour: 10 }],
  }));
  const step = result.loadStepResults[0];
  const expected = Math.round((step.pst / PST_LIMIT) * 100 * 10) / 10;
  assert.ok(Math.abs(step.pstLimitPct - expected) < 0.2, `pstLimitPct = (pst/${PST_LIMIT})×100 (got ${step.pstLimitPct}, expected ${expected})`);
})();

// ---------------------------------------------------------------------------
// runVoltageFlickerStudy — measured Pst series for Plt
// ---------------------------------------------------------------------------
(function testMeasuredPstSeries() {
  const pstSeries = [0.7, 0.8, 0.9, 0.85, 0.75, 0.95, 0.88, 0.82, 0.78, 0.91, 0.86, 0.84];
  const result = runVoltageFlickerStudy(baseInputs({ pstSeriesForPlt: pstSeries }));
  assert.equal(result.pltSource, 'measured', 'pltSource = measured when series provided');
  // Plt should be cube-root of mean cube of the series
  const expected = Math.cbrt(pstSeries.reduce((s, p) => s + p ** 3, 0) / pstSeries.length);
  assert.ok(Math.abs(result.plt - expected) < 0.005, `Plt matches manual calculation (got ${result.plt}, expected ${expected.toFixed(3)})`);
})();

// ---------------------------------------------------------------------------
// runVoltageFlickerStudy — conservative Plt estimate (no series)
// ---------------------------------------------------------------------------
(function testEstimatedPlt() {
  const result = runVoltageFlickerStudy(baseInputs());
  assert.equal(result.pltSource, 'estimated', 'pltSource = estimated when no series given');
  assert.ok(result.warnings.some(w => /Plt is estimated/i.test(w)), 'warning emitted for estimated Plt');
  assert.ok(Math.abs(result.plt - result.worstPst) < 0.005, 'estimated Plt = worstPst (single-value cube-root)');
})();

// ---------------------------------------------------------------------------
// runVoltageFlickerStudy — validation errors
// ---------------------------------------------------------------------------
(function testValidationErrors() {
  assert.throws(
    () => runVoltageFlickerStudy({ ...baseInputs(), systemKva: 0 }),
    /systemKva must be greater than zero/,
    'zero systemKva throws'
  );

  assert.throws(
    () => runVoltageFlickerStudy({ ...baseInputs(), systemKva: -100 }),
    /systemKva must be greater than zero/,
    'negative systemKva throws'
  );

  assert.throws(
    () => runVoltageFlickerStudy({ ...baseInputs(), xrRatio: -1 }),
    /xrRatio must be a positive number/,
    'negative xrRatio throws'
  );

  assert.throws(
    () => runVoltageFlickerStudy({ ...baseInputs(), loadSteps: [] }),
    /loadSteps must be a non-empty array/,
    'empty loadSteps throws'
  );

  assert.throws(
    () => runVoltageFlickerStudy({ ...baseInputs(), loadSteps: [{ label: 'x', loadKw: 0, repetitionsPerHour: 10 }] }),
    /loadKw must be greater than zero/,
    'zero loadKw throws'
  );

  assert.throws(
    () => runVoltageFlickerStudy({ ...baseInputs(), loadSteps: [{ label: 'x', loadKw: 1000, repetitionsPerHour: -5 }] }),
    /repetitionsPerHour must be greater than zero/,
    'negative repetitionsPerHour throws'
  );

  assert.throws(
    () => runVoltageFlickerStudy({ ...baseInputs(), pstSeriesForPlt: [0.5, -0.1] }),
    /invalid value/,
    'negative Pst in series throws'
  );
})();

// ---------------------------------------------------------------------------
// Study-case package helpers
// ---------------------------------------------------------------------------
(function testStudyCaseNormalization() {
  const studyCase = normalizeVoltageFlickerStudyCase({
    pccTag: 'PCC <A>',
    sourceShortCircuitMva: 50,
    standardBasis: 'IEEE1453',
    pstPlanningLimit: 0.75,
    pstMandatoryLimit: 1,
    pltLimit: 0.7,
    notes: 'Utility <allocation>',
  });
  assert.equal(studyCase.pccTag, 'PCC <A>');
  assert.equal(studyCase.sourceShortCircuitKva, 50000);
  assert.equal(studyCase.standardBasis, 'IEEE1453');
  assert.equal(studyCase.pstPlanningLimit, 0.75);
  assert.equal(studyCase.pltBasis, 'estimated');

  assert.throws(
    () => normalizeVoltageFlickerStudyCase({ standardBasis: 'bad' }),
    /Unsupported voltage flicker standard basis/,
    'invalid standard throws'
  );
  assert.throws(
    () => normalizeVoltageFlickerStudyCase({ sourceShortCircuitKva: -1 }),
    /source short-circuit kVA/,
    'negative source basis throws'
  );
  assert.throws(
    () => normalizeVoltageFlickerStudyCase({ pstPlanningLimit: 1.1, pstMandatoryLimit: 1 }),
    /pstPlanningLimit/,
    'planning limit above mandatory limit throws'
  );
})();

(function testLoadStepNormalizationAndComplianceRows() {
  const rows = normalizeFlickerLoadStepRows([
    {
      label: 'Welder <A>',
      loadType: 'Welder',
      loadKw: '750',
      repetitionsPerHour: '30',
      notes: 'Shift <1>',
    },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].label, 'Welder <A>');
  assert.equal(rows[0].loadKw, 750);
  assert.equal(rows[0].repetitionsPerHour, 30);
  assert.equal(rows[0].loadType, 'Welder');

  assert.throws(
    () => normalizeFlickerLoadStepRows([{ label: 'bad', loadKw: 0, repetitionsPerHour: 1 }]),
    /loadKw must be greater than zero/,
    'invalid load step throws'
  );

  const result = runVoltageFlickerStudy(baseInputs({ loadSteps: rows, pstSeriesForPlt: [0.7, 0.8, 0.9] }));
  const compliance = buildVoltageFlickerComplianceRows(
    result,
    normalizeVoltageFlickerStudyCase({ sourceShortCircuitKva: 50000 })
  );
  assert(compliance.some(row => row.id === 'worst-pst-planning'), 'planning Pst compliance row exists');
  assert(compliance.some(row => row.id === 'plt-limit' && row.source === 'measuredPstSeries'), 'measured Plt row exists');
  assert(compliance.every(row => ['pass', 'warn', 'fail', 'missingData'].includes(row.status)), 'statuses normalize');
})();

(function testPackageAndEscapedHtml() {
  const pkg = buildVoltageFlickerStudyPackage({
    projectName: 'North <Unit>',
    studyCase: {
      pccTag: 'PCC <Main>',
      sourceShortCircuitKva: 50000,
      standardBasis: 'IEC61000-4-15',
      notes: 'Review <utility> allocation',
    },
    loadStepRows: [
      { label: 'Arc <Furnace>', loadType: 'Arc Furnace', loadKw: 5000, repetitionsPerHour: 120 },
    ],
    inputs: { pstSeriesForPlt: [0.7, 0.8, 0.9] },
  });
  assert.equal(pkg.version, 'voltage-flicker-study-v1');
  assert.equal(pkg.summary.loadStepCount, 1);
  assert(pkg.complianceRows.length >= 4, 'package includes compliance rows');
  assert(pkg.warningRows.some(row => row.id === 'screening-method'), 'screening assumption warning included');

  const html = renderVoltageFlickerStudyHTML(pkg);
  assert(html.includes('Voltage Flicker Study Basis'));
  assert(html.includes('PCC &lt;Main&gt;'));
  assert(html.includes('Arc &lt;Furnace&gt;'));
  assert(!html.includes('PCC <Main>'), 'HTML escapes PCC tag');

  const missing = buildVoltageFlickerStudyPackage({
    studyCase: { pccTag: '', standardBasis: 'utilityCustom' },
    loadStepRows: [{ label: 'Load', loadKw: 100, repetitionsPerHour: 1 }],
  });
  assert.equal(missing.summary.status, 'missingData');
  assert(missing.warningRows.some(row => row.id === 'missing-source-short-circuit'));
})();

console.log('✓ voltage flicker tests passed');
