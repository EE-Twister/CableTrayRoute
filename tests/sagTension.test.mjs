import assert from 'node:assert/strict';
import {
  ICE_DENSITY_LBFT3,
  NESC_DISTRICTS,
  CONDUCTOR_LIBRARY,
  catenarySag,
  parabolicSag,
  catenaryLength,
  parabolicLength,
  supportTension,
  rulingSpan,
  iceWeight,
  windLoad,
  resultantWeight,
  districtLoad,
  changeOfStateTension,
  stringingTable,
  runSagTension,
} from '../analysis/sagTension.mjs';

const approx = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg} (got ${a}, expected ${b} ±${tol})`);
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);

const DRAKE = CONDUCTOR_LIBRARY[0];

// ---------------------------------------------------------------------------
// Constants & library
// ---------------------------------------------------------------------------
(function testConstants() {
  assert.equal(ICE_DENSITY_LBFT3, 57);
  assert.equal(NESC_DISTRICTS.heavy.iceIn, 0.50);
  assert.equal(NESC_DISTRICTS.light.iceIn, 0);
  assert.ok(CONDUCTOR_LIBRARY.length >= 4, 'conductor library populated');
  assert.ok(CONDUCTOR_LIBRARY.every(c => c.uts > 0 && c.weight > 0 && c.e > 0 && c.alpha > 0),
    'library entries have valid physical properties');
})();

// ---------------------------------------------------------------------------
// Catenary vs parabolic agreement at small sag/span
// ---------------------------------------------------------------------------
(function testCatenaryParabolic() {
  const w = 1.094, S = 600, H = 6000; // sag/span ≈ small
  const cat = catenarySag(w, S, H);
  const par = parabolicSag(w, S, H);
  assert.ok(rel(cat, par) < 0.01, `catenary≈parabolic at small sag (cat=${cat}, par=${par})`);
  // Catenary sag is always slightly greater than parabolic
  assert.ok(cat >= par, 'catenary sag ≥ parabolic sag');

  // Length: both exceed the span, and agree for small sag
  const lc = catenaryLength(w, S, H);
  const lp = parabolicLength(w, S, H);
  assert.ok(lc > S && lp > S, 'conductor length exceeds span');
  assert.ok(rel(lc, lp) < 0.001, 'catenary≈parabolic length at small sag');
})();

// ---------------------------------------------------------------------------
// supportTension
// ---------------------------------------------------------------------------
(function testSupportTension() {
  // Support tension exceeds horizontal tension by w·sag
  approx(supportTension(5000, 1.0, 20), 5020, 1e-9, 'support tension = H + w·sag');
})();

// ---------------------------------------------------------------------------
// Ruling span
// ---------------------------------------------------------------------------
(function testRulingSpan() {
  approx(rulingSpan([300, 300, 300]), 300, 1e-9, 'equal spans → ruling span = span');
  // sqrt((Σ S³)/(Σ S)) for mixed spans
  const spans = [200, 400, 300];
  const expected = Math.sqrt((200 ** 3 + 400 ** 3 + 300 ** 3) / (200 + 400 + 300));
  approx(rulingSpan(spans), expected, 1e-9, 'ruling span formula');
  // Ruling span lies between the min and max span
  assert.ok(rulingSpan(spans) > 200 && rulingSpan(spans) < 400, 'ruling span within span range');
  assert.ok(Number.isNaN(rulingSpan([])), 'empty spans → NaN');
})();

// ---------------------------------------------------------------------------
// Ice and wind loading
// ---------------------------------------------------------------------------
(function testIceWind() {
  // 0.5 in radial ice on a 1.108 in conductor → ~1.0 lb/ft
  const wi = iceWeight(1.108, 0.5);
  approx(wi, (Math.PI * 0.5 * (1.108 + 0.5) / 144) * 57, 1e-9, 'ice weight annulus formula');
  approx(wi, 1.0, 0.05, 'half-inch ice on Drake ≈ 1.0 lb/ft');
  assert.equal(iceWeight(1.0, 0), 0, 'no ice → zero ice weight');

  // Wind on iced conductor uses projected width (d + 2t)
  const ww = windLoad(1.108, 0.5, 4);
  approx(ww, 4 * (1.108 + 1.0) / 12, 1e-9, 'wind load projected-width formula');

  // Resultant combines vertical and transverse plus K
  const wr = resultantWeight(1.094, 1.0, 0.7, 0.30);
  approx(wr, Math.sqrt((1.094 + 1.0) ** 2 + 0.7 ** 2) + 0.30, 1e-9, 'resultant weight formula');
  assert.ok(wr > 1.094, 'loaded resultant exceeds bare weight');

  // District load: heavy > medium > light resultant for Drake
  const heavy = districtLoad(DRAKE, NESC_DISTRICTS.heavy).wResultant;
  const medium = districtLoad(DRAKE, NESC_DISTRICTS.medium).wResultant;
  const light = districtLoad(DRAKE, NESC_DISTRICTS.light).wResultant;
  assert.ok(heavy > medium && medium > light, 'heavy > medium > light loading');
})();

// ---------------------------------------------------------------------------
// Change-of-state equation
// ---------------------------------------------------------------------------
(function testChangeOfState() {
  const cond = { e: DRAKE.e, area: DRAKE.area, alpha: DRAKE.alpha };
  const S = 600, H1 = 6000, w1 = 1.094, t1 = 60;

  // Same temperature and load → tension unchanged
  approx(changeOfStateTension(cond, S, H1, w1, t1, w1, t1), H1, 1e-3, 'no change → H₂ = H₁');

  // Higher temperature → lower tension (conductor expands)
  const hot = changeOfStateTension(cond, S, H1, w1, t1, w1, t1 + 60);
  assert.ok(hot < H1, 'higher temperature lowers tension');

  // Lower temperature → higher tension
  const cold = changeOfStateTension(cond, S, H1, w1, t1, w1, t1 - 60);
  assert.ok(cold > H1, 'lower temperature raises tension');

  // Heavier load (ice) at same temp → higher tension
  const iced = changeOfStateTension(cond, S, H1, w1, t1, w1 + 1.5, t1);
  assert.ok(iced > H1, 'added ice load raises tension');

  // Solved root actually satisfies the change-of-state equation
  const EA = cond.e * cond.area;
  const H2 = hot;
  const lhs = H2 * H2 * (H2 - H1 + cond.alpha * EA * (120 - t1) + (EA * w1 * w1 * S * S) / (24 * H1 * H1));
  const rhs = (EA * w1 * w1 * S * S) / 24;
  assert.ok(rel(lhs, rhs) < 1e-4, 'change-of-state root satisfies the equation');
})();

// ---------------------------------------------------------------------------
// Stringing table monotonicity
// ---------------------------------------------------------------------------
(function testStringingTable() {
  const S = 600, designH = 0.25 * DRAKE.uts, designW = 1.094, designTemp = 0;
  const temps = [0, 20, 40, 60, 80, 100, 120];
  const table = stringingTable(DRAKE, S, designH, designW, designTemp, temps);
  assert.equal(table.length, temps.length);
  // Sag increases and tension decreases monotonically with temperature
  for (let i = 1; i < table.length; i++) {
    assert.ok(table[i].sagFt > table[i - 1].sagFt, `sag increases with temp (row ${i})`);
    assert.ok(table[i].tensionLb < table[i - 1].tensionLb, `tension decreases with temp (row ${i})`);
    assert.ok(table[i].supportTensionLb >= table[i].tensionLb, 'support tension ≥ horizontal');
  }
})();

// ---------------------------------------------------------------------------
// runSagTension — full study
// ---------------------------------------------------------------------------
(function testRunSagTension() {
  const r = runSagTension({
    conductor: DRAKE,
    spans: [500, 600, 550],
    district: 'heavy',
    designTensionPct: 25,
    stringingTemps: { min: 0, max: 120, step: 20 },
  });

  approx(r.rulingSpan, rulingSpan([500, 600, 550]), 1e-9, 'ruling span from spans');
  approx(r.designTensionLb, 0.25 * DRAKE.uts, 1e-6, 'design tension = 25% UTS');
  assert.ok(r.designSagFt > 0, 'positive design sag');
  assert.equal(r.loadingCases.length, 3, 'three NESC loading cases');
  assert.ok(r.stringingTable.length === 7, '7 stringing rows (0..120 step 20)');
  // Stringing table is bare-conductor → sag rises with temperature
  const sags = r.stringingTable.map(t => t.sagFt);
  for (let i = 1; i < sags.length; i++) assert.ok(sags[i] > sags[i - 1], 'bare sag rises with temp');
  assert.ok(Array.isArray(r.warnings), 'warnings array present');
})();

// ---------------------------------------------------------------------------
// runSagTension — validation
// ---------------------------------------------------------------------------
(function testValidation() {
  assert.throws(() => runSagTension({ conductor: null, rulingSpan: 400 }), /valid weight/i, 'missing conductor rejected');
  assert.throws(() => runSagTension({ conductor: DRAKE }), /ruling span/i, 'missing span rejected');
  assert.throws(() => runSagTension({ conductor: DRAKE, rulingSpan: 400, designTensionPct: 0 }),
    /between 0 and 100/i, 'invalid design tension rejected');
  assert.throws(() => runSagTension({ conductor: DRAKE, spans: [-5, -3] }), /ruling span/i, 'all-invalid spans rejected');
})();

console.log('sagTension.test.mjs — all assertions passed');
