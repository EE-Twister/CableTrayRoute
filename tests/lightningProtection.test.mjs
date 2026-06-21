import assert from 'node:assert/strict';
import {
  DEFAULT_NC,
  LPL_TABLE,
  DOWN_CONDUCTOR_MIN_MM2,
  LOCATION_FACTORS,
  STANDARD_ARRESTER_KV,
  groundFlashDensity,
  collectionArea,
  expectedStrikes,
  recommendLPL,
  strikingDistance,
  singleMastRadius,
  downConductorCount,
  arresterMCOV,
  recommendArrester,
  runLightningProtection,
} from '../analysis/lightningProtection.mjs';

const approx = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg} (got ${a}, expected ${b} ±${tol})`);

// ---------------------------------------------------------------------------
// Tables & constants
// ---------------------------------------------------------------------------
(function testTables() {
  assert.equal(LPL_TABLE.I.radius, 20);
  assert.equal(LPL_TABLE.IV.radius, 60);
  assert.ok(LPL_TABLE.I.iMin < LPL_TABLE.IV.iMin, 'lower LPL captures lower currents');
  assert.equal(DOWN_CONDUCTOR_MIN_MM2.copper, 16);
  assert.equal(LOCATION_FACTORS.isolated, 1.0);
  assert.ok(STANDARD_ARRESTER_KV.length > 10 && STANDARD_ARRESTER_KV.every((v, i, a) => i === 0 || v > a[i - 1]),
    'arrester table is sorted ascending');
  assert.ok(DEFAULT_NC > 0);
})();

// ---------------------------------------------------------------------------
// Ground flash density
// ---------------------------------------------------------------------------
(function testNg() {
  approx(groundFlashDensity(30), 0.04 * Math.pow(30, 1.25), 1e-9, 'Ng = 0.04·Td^1.25');
  approx(groundFlashDensity(30), 2.808, 0.01, 'Ng(30) ≈ 2.81');
  assert.equal(groundFlashDensity(0), 0, 'no storm days → zero Ng');
  // Monotonic increasing in Td
  assert.ok(groundFlashDensity(50) > groundFlashDensity(20), 'Ng increases with Td');
})();

// ---------------------------------------------------------------------------
// Collection area and expected strikes
// ---------------------------------------------------------------------------
(function testAreaStrikes() {
  // Ad = L·W + 2·(3H)(L+W) + π·(3H)²
  const expected = 50 * 30 + 2 * 60 * 80 + Math.PI * 3600;
  approx(collectionArea(50, 30, 20), expected, 1e-6, 'collection area formula');
  approx(collectionArea(50, 30, 20), 22409.7, 1, 'collection area ≈ 22410 m²');

  // Nd = Ng · Ad · Cd · 1e-6
  approx(expectedStrikes(2.81, 22410, 1), 2.81 * 22410 * 1e-6, 1e-12, 'expected strikes formula');
  // Location factor scales linearly
  approx(expectedStrikes(2.81, 22410, 0.5), expectedStrikes(2.81, 22410, 1) * 0.5, 1e-12, 'Cd scales Nd');
})();

// ---------------------------------------------------------------------------
// LPL recommendation (efficiency table)
// ---------------------------------------------------------------------------
(function testRecommendLPL() {
  // Nd ≤ Nc → not required
  const none = recommendLPL(1e-4, 1e-3);
  assert.equal(none.required, false, 'low strike rate → no LPS required');

  // Efficiency thresholds
  // E = 1 - Nc/Nd. Choose Nd so E lands in each band.
  assert.equal(recommendLPL(1.0, 0.005).level, 'I', 'E=0.995 → LPL I');     // E=0.995
  assert.equal(recommendLPL(1.0, 0.03).level, 'II', 'E=0.97 → LPL II');     // E=0.97
  assert.equal(recommendLPL(1.0, 0.07).level, 'III', 'E=0.93 → LPL III');   // E=0.93
  assert.equal(recommendLPL(1.0, 0.15).level, 'IV', 'E=0.85 → LPL IV');     // E=0.85
  assert.equal(recommendLPL(1.0, 0.30).level, 'IV', 'E=0.70 → LPL IV sufficient');

  const r = recommendLPL(0.05, 1e-3);
  approx(r.efficiency, 1 - 1e-3 / 0.05, 1e-9, 'efficiency = 1 - Nc/Nd');
  assert.ok(r.required);
})();

// ---------------------------------------------------------------------------
// Rolling sphere geometry
// ---------------------------------------------------------------------------
(function testRollingSphere() {
  // Striking distance r = 10·I^0.65
  approx(strikingDistance(10), 10 * Math.pow(10, 0.65), 1e-9, 'striking distance formula');

  // Single mast: rp = √(h(2R-h)) - √(hx(2R-hx))
  const rp = singleMastRadius(30, 3, 45);
  approx(rp, Math.sqrt(30 * 60) - Math.sqrt(3 * 87), 1e-9, 'single-mast protective radius');
  approx(rp, 26.27, 0.05, 'protective radius ≈ 26.3 m');

  // Protected radius shrinks as the protected object gets taller
  assert.ok(singleMastRadius(30, 10, 45) < singleMastRadius(30, 3, 45), 'taller object → smaller protected radius');
  // No protection when object is as tall as the mast
  assert.equal(singleMastRadius(20, 20, 45), 0, 'object at mast height → zero radius');
  // Larger sphere (lower LPL) gives larger protective radius for the same mast
  assert.ok(singleMastRadius(30, 3, 60) > singleMastRadius(30, 3, 20), 'bigger sphere → bigger radius');
})();

// ---------------------------------------------------------------------------
// Down-conductors
// ---------------------------------------------------------------------------
(function testDownConductors() {
  assert.equal(downConductorCount(160, 10), 16, 'perimeter 160 / spacing 10 = 16');
  assert.equal(downConductorCount(15, 10), 2, 'minimum two down-conductors');
  assert.equal(downConductorCount(0, 10), 2, 'degenerate → minimum two');
})();

// ---------------------------------------------------------------------------
// Surge arrester selection
// ---------------------------------------------------------------------------
(function testArrester() {
  // Solidly grounded 138 kV: Uc ≥ 1.05·138/√3
  approx(arresterMCOV(138, 'solid'), 1.05 * 138 / Math.sqrt(3), 1e-9, 'solid MCOV formula');
  approx(arresterMCOV(138, 'solid'), 83.66, 0.05, 'MCOV(138 kV solid) ≈ 83.7 kV');
  // Ungrounded uses full line-to-line
  approx(arresterMCOV(13.8, 'ungrounded'), 1.05 * 13.8, 1e-9, 'ungrounded MCOV = 1.05·VLL');
  assert.ok(arresterMCOV(138, 'ungrounded') > arresterMCOV(138, 'solid'), 'ungrounded needs higher MCOV');

  const rec = recommendArrester(138, 'solid');
  approx(rec.ratedRequired, rec.mcov / 0.8, 1e-9, 'rated = MCOV/0.8');
  assert.ok(rec.ratedStandard >= rec.ratedRequired, 'standard rating ≥ required');
  assert.ok(STANDARD_ARRESTER_KV.includes(rec.ratedStandard), 'standard rating is from the table');
})();

// ---------------------------------------------------------------------------
// runLightningProtection — full study
// ---------------------------------------------------------------------------
(function testRun() {
  const r = runLightningProtection({
    thunderstormDays: 40,
    length: 60, width: 40, height: 25,
    location: 'isolated',
    tolerableFrequency: 1e-3,
    protectedHeight: 3,
    downConductorMaterial: 'copper',
    systemKvLL: 138,
    grounding: 'solid',
  });

  assert.ok(r.groundFlashDensity > 0, 'Ng computed');
  approx(r.collectionAreaM2, collectionArea(60, 40, 25), 1e-6, 'area matches helper');
  assert.ok(r.expectedStrikesPerYear > 0, 'Nd computed');
  assert.ok(['I', 'II', 'III', 'IV'].includes(r.lpl.level), 'an LPL is recommended');
  assert.equal(r.rollingSphereRadius, LPL_TABLE[r.lpl.level].radius, 'sphere radius matches LPL');
  assert.ok(r.mastProtectiveRadiusM >= 0, 'protective radius present');
  assert.equal(r.perimeterM, 2 * (60 + 40), 'perimeter = 2(L+W)');
  assert.ok(r.downConductorCount >= 2, 'at least two down-conductors');
  assert.equal(r.downConductorMinAreaMm2, 16, 'copper min 16 mm²');
  assert.ok(r.arrester && r.arrester.ratedStandard > 0, 'arrester recommended');
  assert.ok(Array.isArray(r.warnings));
})();

// ---------------------------------------------------------------------------
// runLightningProtection — Ng override and no-arrester path
// ---------------------------------------------------------------------------
(function testRunVariants() {
  const r = runLightningProtection({ groundFlashDensity: 4.0, length: 10, width: 10, height: 5 });
  approx(r.groundFlashDensity, 4.0, 1e-9, 'direct Ng override honoured');
  assert.equal(r.arrester, null, 'no arrester when system voltage omitted');
})();

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
(function testValidation() {
  assert.throws(() => runLightningProtection({ length: 0, width: 10, height: 5, thunderstormDays: 30 }),
    /positive structure/i, 'zero dimension rejected');
  assert.throws(() => runLightningProtection({ length: 10, width: 10, height: 5 }),
    /ground flash density|thunderstorm/i, 'missing Ng/Td rejected');
})();

console.log('lightningProtection.test.mjs — all assertions passed');
