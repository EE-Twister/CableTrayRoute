import assert from 'node:assert/strict';
import {
  QUADRATIC_EPS,
  DEFAULT_FLEET,
  unitCost,
  incrementalCost,
  dispatchUnitAtLambda,
  economicDispatch,
  proportionalDispatch,
  runOptimalPowerFlow,
  parseFleetCsv,
  fleetToCsv,
} from '../analysis/optimalPowerFlow.mjs';

const approx = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg} (got ${a}, expected ${b} ±${tol})`);

// ---------------------------------------------------------------------------
// Constants & default fleet
// ---------------------------------------------------------------------------
(function testConstants() {
  assert.ok(QUADRATIC_EPS > 0 && QUADRATIC_EPS < 1e-6, 'QUADRATIC_EPS is a small positive threshold');
  assert.equal(DEFAULT_FLEET.length, 3, 'default fleet is the 3-unit W&W example');
  assert.equal(DEFAULT_FLEET[0].pmax, 600);
  assert.equal(DEFAULT_FLEET[2].pmin, 50);
})();

// ---------------------------------------------------------------------------
// unitCost / incrementalCost
// ---------------------------------------------------------------------------
(function testCostFns() {
  const u = { a: 561, b: 7.92, c: 0.001562 };
  // C(400) = 561 + 7.92*400 + 0.001562*160000 = 561 + 3168 + 249.92 = 3978.92
  approx(unitCost(u, 400), 3978.92, 1e-6, 'unitCost quadratic');
  // IC(400) = 7.92 + 2*0.001562*400 = 7.92 + 1.2496 = 9.1696
  approx(incrementalCost(u, 400), 9.1696, 1e-9, 'incrementalCost quadratic');
  // No-load (P=0) cost is the constant term
  approx(unitCost(u, 0), 561, 1e-9, 'unitCost at zero output = fixed term');
})();

// ---------------------------------------------------------------------------
// dispatchUnitAtLambda — interior, clamped, and linear cases
// ---------------------------------------------------------------------------
(function testDispatchUnitAtLambda() {
  const u = { pmin: 150, pmax: 600, b: 7.92, c: 0.001562 };
  // Interior: P = (lambda - b)/(2c)
  approx(dispatchUnitAtLambda(u, 9.148), (9.148 - 7.92) / (2 * 0.001562), 1e-9, 'interior dispatch');
  // Below Pmin -> clamp to Pmin
  assert.equal(dispatchUnitAtLambda(u, 7.0), 150, 'clamp to Pmin when lambda low');
  // Above Pmax -> clamp to Pmax
  assert.equal(dispatchUnitAtLambda(u, 20), 600, 'clamp to Pmax when lambda high');
  // Linear unit (c=0): off below b, full at/above b
  const lin = { pmin: 10, pmax: 100, b: 8.0, c: 0 };
  assert.equal(dispatchUnitAtLambda(lin, 7.99), 10, 'linear unit at Pmin below breakpoint');
  assert.equal(dispatchUnitAtLambda(lin, 8.01), 100, 'linear unit at Pmax above breakpoint');
})();

// ---------------------------------------------------------------------------
// economicDispatch — canonical Wood & Wollenberg 3-unit, 850 MW
// ---------------------------------------------------------------------------
(function testCanonicalDispatch() {
  const ed = economicDispatch(DEFAULT_FLEET, 850);
  assert.equal(ed.feasible, true, '850 MW is feasible for the fleet');
  approx(ed.lambda, 9.148, 2e-3, 'system lambda ~ 9.148 $/MWh');
  approx(ed.outputs[0], 393.2, 0.5, 'P1 ~ 393.2 MW');
  approx(ed.outputs[1], 334.6, 0.5, 'P2 ~ 334.6 MW');
  approx(ed.outputs[2], 122.2, 0.5, 'P3 ~ 122.2 MW');
  approx(ed.totalGen, 850, 1e-3, 'total generation meets demand');
  // Every interior unit operates at the same incremental cost = lambda
  const ic = DEFAULT_FLEET.map((u, i) => incrementalCost(u, ed.outputs[i]));
  approx(ic[0], ed.lambda, 1e-2, 'unit 1 IC = lambda');
  approx(ic[1], ed.lambda, 1e-2, 'unit 2 IC = lambda');
  approx(ic[2], ed.lambda, 1e-2, 'unit 3 IC = lambda');
})();

// ---------------------------------------------------------------------------
// economicDispatch — limit binding (low demand pins units at Pmin)
// ---------------------------------------------------------------------------
(function testLimitBinding() {
  // Demand = 350 MW: near total Pmin (300). Cheapest units carry the slack.
  const ed = economicDispatch(DEFAULT_FLEET, 350);
  assert.equal(ed.feasible, true);
  approx(ed.totalGen, 350, 1e-3, 'meets 350 MW');
  ed.outputs.forEach((p, i) => {
    assert.ok(p >= DEFAULT_FLEET[i].pmin - 1e-6, `unit ${i} respects Pmin`);
    assert.ok(p <= DEFAULT_FLEET[i].pmax + 1e-6, `unit ${i} respects Pmax`);
  });
})();

// ---------------------------------------------------------------------------
// economicDispatch — infeasible high & low
// ---------------------------------------------------------------------------
(function testInfeasible() {
  const sumPmax = DEFAULT_FLEET.reduce((s, u) => s + u.pmax, 0); // 1200
  const high = economicDispatch(DEFAULT_FLEET, sumPmax + 100);
  assert.equal(high.feasible, false, 'demand above capacity is infeasible');
  approx(high.unservedMW, 100, 1e-6, 'unserved = demand - sumPmax');
  approx(high.totalGen, sumPmax, 1e-6, 'all units at Pmax');

  const sumPmin = DEFAULT_FLEET.reduce((s, u) => s + u.pmin, 0); // 300
  const low = economicDispatch(DEFAULT_FLEET, sumPmin - 50);
  assert.equal(low.feasible, false, 'demand below min stable gen is infeasible');
  approx(low.overGenerationMW, 50, 1e-6, 'over-generation = sumPmin - demand');
})();

// ---------------------------------------------------------------------------
// proportionalDispatch — meets target, respects limits
// ---------------------------------------------------------------------------
(function testProportional() {
  const out = proportionalDispatch(DEFAULT_FLEET.map(u => ({ ...u })), 850);
  approx(out.reduce((s, p) => s + p, 0), 850, 1e-6, 'proportional dispatch meets target');
  out.forEach((p, i) => {
    assert.ok(p >= DEFAULT_FLEET[i].pmin - 1e-6 && p <= DEFAULT_FLEET[i].pmax + 1e-6,
      `proportional unit ${i} within limits`);
  });
})();

// ---------------------------------------------------------------------------
// runOptimalPowerFlow — full result + canonical total cost
// ---------------------------------------------------------------------------
(function testRunOpf() {
  const r = runOptimalPowerFlow(DEFAULT_FLEET, 850);
  assert.equal(r.feasible, true);
  approx(r.totalCostPerHr, 8194.36, 2.0, 'canonical total cost ~ $8194.36/h');
  approx(r.systemLambda, 9.148, 2e-3, 'system lambda ~ 9.148');
  approx(r.totalGenMW, 850, 1e-3, 'generation meets demand with no losses');
  assert.equal(r.lossesMW, 0, 'no losses by default');
  // Economic dispatch never costs more than the naive baseline
  assert.ok(r.savingsPerHr >= -1e-6, 'economic dispatch ≤ naive cost (savings ≥ 0)');
  assert.ok(r.totalCostPerHr <= r.naiveCostPerHr + 1e-6, 'econ cost ≤ naive cost');
  // Per-unit fields present
  assert.equal(r.dispatch.length, 3);
  assert.ok(r.dispatch.every(d => Number.isFinite(d.output) && Number.isFinite(d.cost)));
  assert.ok(r.dispatch.every(d => d.loadingPct >= 0 && d.loadingPct <= 100.001));
})();

// ---------------------------------------------------------------------------
// runOptimalPowerFlow — loss percentage raises required generation
// ---------------------------------------------------------------------------
(function testLosses() {
  const r = runOptimalPowerFlow(DEFAULT_FLEET, 800, { lossPercent: 5 });
  approx(r.lossesMW, 40, 1e-9, '5% of 800 MW = 40 MW losses');
  approx(r.requiredGenMW, 840, 1e-9, 'required generation = demand + losses');
  approx(r.totalGenMW, 840, 1e-3, 'generation covers demand + losses');
})();

// ---------------------------------------------------------------------------
// runOptimalPowerFlow — infeasible surfaces a warning
// ---------------------------------------------------------------------------
(function testRunInfeasible() {
  const r = runOptimalPowerFlow(DEFAULT_FLEET, 5000);
  assert.equal(r.feasible, false);
  assert.ok(r.unservedMW > 0, 'reports unserved MW');
  assert.ok(r.warnings.some(w => /unserved/i.test(w)), 'warns about unserved demand');
})();

// ---------------------------------------------------------------------------
// runOptimalPowerFlow — input validation
// ---------------------------------------------------------------------------
(function testValidation() {
  assert.throws(() => runOptimalPowerFlow([], 100), /at least one/i, 'empty fleet rejected');
  assert.throws(() => runOptimalPowerFlow(DEFAULT_FLEET, -1), /non-negative/i, 'negative demand rejected');
  assert.throws(() => runOptimalPowerFlow(DEFAULT_FLEET, 100, { lossPercent: 150 }), /between 0 and 100/i,
    'loss percent out of range rejected');
  assert.throws(() => runOptimalPowerFlow([{ id: 'X', pmin: 200, pmax: 100, b: 8, c: 0.001 }], 100),
    /cannot exceed/i, 'Pmin > Pmax rejected');
  assert.throws(() => runOptimalPowerFlow([{ id: 'Y', pmin: 0, pmax: 100, b: 8, c: -1 }], 50),
    /convex/i, 'negative quadratic term rejected (non-convex)');
})();

// ---------------------------------------------------------------------------
// CSV round-trip
// ---------------------------------------------------------------------------
(function testCsv() {
  const csv = fleetToCsv(DEFAULT_FLEET);
  const parsed = parseFleetCsv(csv);
  assert.equal(parsed.length, 3, 'round-trip preserves unit count');
  approx(parsed[0].pmax, 600, 1e-9, 'round-trip preserves Pmax');
  approx(parsed[2].c, 0.00482, 1e-9, 'round-trip preserves quadratic coefficient');

  // Comments and header skipped; tab and comma delimiters accepted.
  const messy = '# fleet\nid,name,pmin,pmax,a,b,c\nA, Alpha, 0, 100, 10, 8, 0.01\nB\tBeta\t0\t50\t5\t9\t0.02\n';
  const m = parseFleetCsv(messy);
  assert.equal(m.length, 2, 'parses comma + tab rows, skips header/comment');
  assert.equal(m[0].id, 'A');
  approx(m[1].pmax, 50, 1e-9);

  // Dispatched result from parsed fleet matches the original fleet result.
  const r1 = runOptimalPowerFlow(DEFAULT_FLEET, 850);
  const r2 = runOptimalPowerFlow(parsed, 850);
  approx(r1.totalCostPerHr, r2.totalCostPerHr, 1e-6, 'parsed fleet dispatches identically');
})();

console.log('optimalPowerFlow.test.mjs — all assertions passed');
