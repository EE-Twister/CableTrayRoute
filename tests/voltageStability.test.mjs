/**
 * Tests for analysis/voltageStability.mjs
 *
 * Run with:  node tests/voltageStability.test.mjs
 */
import assert from 'node:assert/strict';
import {
  buildPVCurve,
  buildQVCurve,
  calcLoadabilityMargin,
  runVoltageStabilityStudy,
} from '../analysis/voltageStability.mjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Minimal 2-bus test system:
 *   Bus 1 (slack, 13.8 kV) — Z=(r,x) ohms — Bus 2 (PQ load P+jQ kW/kVAR)
 */
function twoBusSys({ r = 0.5, x = 2.0, Pd = 3000, Qd = 1000 } = {}) {
  return [
    {
      id: 'B1', type: 'slack', baseKV: 13.8, Pd: 0, Qd: 0, Pg: 0, Vm: 1.0, Va: 0,
      connections: [{ target: 'B2', r, x }],
    },
    {
      id: 'B2', type: 'PQ', baseKV: 13.8, Pd, Qd, Pg: 0, Vm: 1.0, Va: 0,
      connections: [],
    },
  ];
}

/**
 * 3-bus radial: B1(slack) → B2(PQ) → B3(PQ)
 */
function threeBusSys() {
  return [
    {
      id: 'B1', type: 'slack', baseKV: 13.8, Pd: 0, Qd: 0, Pg: 0, Vm: 1.0, Va: 0,
      connections: [{ target: 'B2', r: 0.3, x: 1.0 }],
    },
    {
      id: 'B2', type: 'PQ', baseKV: 13.8, Pd: 2000, Qd: 800, Pg: 0, Vm: 1.0, Va: 0,
      connections: [{ target: 'B3', r: 0.4, x: 1.2 }],
    },
    {
      id: 'B3', type: 'PQ', baseKV: 13.8, Pd: 1500, Qd: 600, Pg: 0, Vm: 1.0, Va: 0,
      connections: [],
    },
  ];
}

// ---------------------------------------------------------------------------
// buildPVCurve — operating-point convergence
// ---------------------------------------------------------------------------
(function testPVCurveConvergesAtBaseCase() {
  const buses = twoBusSys();
  const result = buildPVCurve(buses, { baseMVA: 100, lambdaMax: 2.0, lambdaStep: 0.1 });
  const basePt = result.points.find(p => Math.abs(p.lambda - 1.0) < 1e-6);
  assert.ok(basePt, 'must have a λ=1 point');
  assert.ok(basePt.converged, 'λ=1 must converge');
  assert.ok(basePt.buses.every(b => b.Vm > 0 && b.Vm <= 1.1), 'voltages must be in plausible range');
  console.log('PASS: PV curve converges at base case');
})();

// ---------------------------------------------------------------------------
// buildPVCurve — voltage decreases as load increases
// ---------------------------------------------------------------------------
(function testPVCurveVoltageDecreases() {
  const buses = twoBusSys();
  const result = buildPVCurve(buses, { baseMVA: 100, lambdaMax: 1.5, lambdaStep: 0.1 });
  const convergedPts = result.points.filter(p => p.converged);
  assert.ok(convergedPts.length >= 3, 'need at least 3 converged points');

  // Voltage at load bus (B2) should decrease as λ increases
  const vSeq = convergedPts.map(p => p.buses.find(b => b.id === 'B2').Vm);
  for (let i = 1; i < vSeq.length; i++) {
    assert.ok(vSeq[i] <= vSeq[i - 1] + 1e-6,
      `V[${i}]=${vSeq[i].toFixed(4)} should be ≤ V[${i-1}]=${vSeq[i-1].toFixed(4)}`);
  }
  console.log('PASS: PV curve voltage decreases with load');
})();

// ---------------------------------------------------------------------------
// buildPVCurve — nose point / collapse detection
// ---------------------------------------------------------------------------
(function testPVCurveCollapseDetected() {
  // Use a high-impedance line that will collapse at moderate loading
  const buses = twoBusSys({ r: 2.0, x: 6.0, Pd: 4000, Qd: 2000 });
  const result = buildPVCurve(buses, { baseMVA: 100, lambdaMax: 5.0, lambdaStep: 0.05 });
  assert.ok(result.collapseFound, 'collapse must be detected for high-impedance line');
  assert.ok(result.collapseLambda !== null, 'collapseLambda must be set');
  assert.ok(result.collapseLambda > 1.0, 'collapse must occur beyond the operating point');
  assert.ok(result.maxLoadMW > 0, 'maxLoadMW must be positive');
  console.log('PASS: PV curve collapse detected');
})();

// ---------------------------------------------------------------------------
// buildPVCurve — loadability margin is positive
// ---------------------------------------------------------------------------
(function testPVCurveLoadabilityMargin() {
  const buses = twoBusSys({ r: 2.0, x: 6.0, Pd: 4000, Qd: 2000 });
  const result = buildPVCurve(buses, { baseMVA: 100, lambdaMax: 5.0, lambdaStep: 0.05 });
  assert.ok(result.loadabilityMarginMW > 0, 'loadability margin must be positive');
  assert.ok(result.loadabilityMarginPct > 0, 'margin percent must be positive');
  assert.ok(result.loadabilityMarginMW < result.maxLoadMW, 'margin < maxLoad (sanity)');
  console.log('PASS: PV curve loadability margin is positive');
})();

// ---------------------------------------------------------------------------
// buildPVCurve — critical bus is a PQ bus (not slack)
// ---------------------------------------------------------------------------
(function testPVCurveCriticalBus() {
  const buses = twoBusSys();
  const result = buildPVCurve(buses, { baseMVA: 100, lambdaMax: 1.5, lambdaStep: 0.1 });
  assert.equal(result.criticalBusId, 'B2', 'critical bus must be the PQ load bus');
  console.log('PASS: PV curve critical bus is PQ bus');
})();

// ---------------------------------------------------------------------------
// buildPVCurve — 3-bus radial system
// ---------------------------------------------------------------------------
(function testPVCurveThreeBus() {
  const buses = threeBusSys();
  const result = buildPVCurve(buses, { baseMVA: 100, lambdaMax: 3.0, lambdaStep: 0.1 });
  const basePt = result.points.find(p => Math.abs(p.lambda - 1.0) < 1e-6 && p.converged);
  assert.ok(basePt, '3-bus system must converge at base case');
  assert.equal(basePt.buses.length, 3, 'point must have 3 bus entries');
  // B3 should have lower voltage than B2 (further from slack)
  const vB2 = basePt.buses.find(b => b.id === 'B2').Vm;
  const vB3 = basePt.buses.find(b => b.id === 'B3').Vm;
  assert.ok(vB3 < vB2, 'B3 (end of feeder) must have lower voltage than B2');
  console.log('PASS: PV curve 3-bus radial system');
})();

// ---------------------------------------------------------------------------
// buildPVCurve — input validation errors
// ---------------------------------------------------------------------------
(function testPVCurveValidation() {
  assert.throws(() => buildPVCurve([], {}), /non-empty/, 'empty buses must throw');
  assert.throws(() => buildPVCurve(twoBusSys(), { lambdaStep: -1 }), /lambdaStep must be positive/);
  assert.throws(() => buildPVCurve(twoBusSys(), { lambdaMax: 0.5 }), /lambdaMax must exceed/);
  const noBusSys = twoBusSys().map(b => ({ ...b, type: 'PQ' }));
  assert.throws(() => buildPVCurve(noBusSys, {}), /slack/, 'no slack bus must throw');
  const dupIds = [
    { id: 'B1', type: 'slack', baseKV: 13.8, Pd: 0, Qd: 0, connections: [] },
    { id: 'B1', type: 'PQ', baseKV: 13.8, Pd: 1000, Qd: 0, connections: [] },
  ];
  assert.throws(() => buildPVCurve(dupIds, {}), /unique/, 'duplicate IDs must throw');
  console.log('PASS: PV curve input validation');
})();

// ---------------------------------------------------------------------------
// buildQVCurve — converges at operating point
// ---------------------------------------------------------------------------
(function testQVCurveOperatingPoint() {
  const buses = twoBusSys();
  const result = buildQVCurve(buses, {
    targetBusId: 'B2', baseMVA: 100, qMinMvar: -20, qMaxMvar: 20, qStepMvar: 2,
  });
  const opPt = result.points.find(p => Math.abs(p.qInjMvar) < 1e-6);
  assert.ok(opPt, 'operating point (Q_inj=0) must exist');
  assert.ok(opPt.converged, 'operating point must converge');
  assert.ok(opPt.voltage > 0 && opPt.voltage < 1.2, 'voltage must be in plausible range');
  console.log('PASS: QV curve operating point converges');
})();

// ---------------------------------------------------------------------------
// buildQVCurve — voltage increases with reactive injection
// ---------------------------------------------------------------------------
(function testQVCurveVoltageTrend() {
  const buses = twoBusSys({ r: 0.5, x: 2.0, Pd: 5000, Qd: 2000 });
  const result = buildQVCurve(buses, {
    targetBusId: 'B2', baseMVA: 100, qMinMvar: 0, qMaxMvar: 30, qStepMvar: 5,
  });
  const convergedPts = result.points.filter(p => p.converged);
  assert.ok(convergedPts.length >= 2, 'need at least 2 converged Q-V points');
  // More Q injection → higher voltage (within the capacitive range)
  const vFirst = convergedPts[0].voltage;
  const vLast = convergedPts[convergedPts.length - 1].voltage;
  assert.ok(vLast >= vFirst - 1e-6, 'voltage must increase with reactive injection');
  console.log('PASS: QV curve voltage increases with Q injection');
})();

// ---------------------------------------------------------------------------
// buildQVCurve — reactive margin is non-negative
// ---------------------------------------------------------------------------
(function testQVCurveReactiveMargin() {
  const buses = twoBusSys({ r: 1.0, x: 3.0, Pd: 4000, Qd: 1500 });
  const result = buildQVCurve(buses, {
    targetBusId: 'B2', baseMVA: 100, qMinMvar: -30, qMaxMvar: 30, qStepMvar: 2,
  });
  if (result.reactiveMarginMvar !== null) {
    assert.ok(result.reactiveMarginMvar >= 0, 'reactive margin must be non-negative');
  }
  console.log('PASS: QV curve reactive margin non-negative');
})();

// ---------------------------------------------------------------------------
// buildQVCurve — input validation
// ---------------------------------------------------------------------------
(function testQVCurveValidation() {
  assert.throws(() => buildQVCurve(twoBusSys(), {}), /targetBusId is required/);
  assert.throws(() => buildQVCurve(twoBusSys(), { targetBusId: 'NOT_EXIST' }), /not found/);
  assert.throws(() => buildQVCurve(twoBusSys(), { targetBusId: 'B2', qStepMvar: 0 }), /qStepMvar/);
  console.log('PASS: QV curve input validation');
})();

// ---------------------------------------------------------------------------
// calcLoadabilityMargin — basic arithmetic
// ---------------------------------------------------------------------------
(function testCalcLoadabilityMargin() {
  const fakeResult = { operatingLoadMW: 4.0, maxLoadMW: 6.5, collapseFound: true };
  const m = calcLoadabilityMargin(fakeResult);
  assert.ok(Math.abs(m.marginMW - 2.5) < 1e-9, `marginMW expected 2.5, got ${m.marginMW}`);
  assert.ok(Math.abs(m.marginPct - 62.5) < 1e-6, `marginPct expected 62.5, got ${m.marginPct}`);
  assert.equal(m.operatingLoadMW, 4.0);
  assert.equal(m.maxLoadMW, 6.5);
  console.log('PASS: calcLoadabilityMargin basic arithmetic');
})();

(function testCalcLoadabilityMarginZeroBase() {
  const m = calcLoadabilityMargin({ operatingLoadMW: 0, maxLoadMW: 5.0 });
  assert.equal(m.marginPct, 0, 'zero base load → zero percent margin');
  console.log('PASS: calcLoadabilityMargin zero base load');
})();

(function testCalcLoadabilityMarginInvalidInput() {
  assert.throws(() => calcLoadabilityMargin(null), /pvResult must be/);
  assert.throws(() => calcLoadabilityMargin('string'), /pvResult must be/);
  console.log('PASS: calcLoadabilityMargin invalid input');
})();

// ---------------------------------------------------------------------------
// runVoltageStabilityStudy — full integration
// ---------------------------------------------------------------------------
(function testRunStudyIntegration() {
  const buses = twoBusSys({ r: 1.5, x: 5.0, Pd: 3000, Qd: 1200 });
  const result = runVoltageStabilityStudy({
    buses,
    baseMVA: 100,
    lambdaMax: 3.0,
    lambdaStep: 0.1,
    targetBusId: 'B2',
    qMinMvar: -20,
    qMaxMvar: 20,
    qStepMvar: 5,
    systemLabel: 'Test System',
  });

  assert.ok(result.pvCurve, 'must have pvCurve');
  assert.ok(result.qvCurve, 'must have qvCurve');
  assert.ok(result.margin, 'must have margin');
  assert.ok(result.summary, 'must have summary');
  assert.equal(result.summary.systemLabel, 'Test System');
  assert.ok(result.summary.operatingLoadMW > 0, 'operatingLoadMW must be positive');
  assert.ok(result.summary.voltageProfile.length > 0, 'voltageProfile must be populated');
  assert.ok(result.summary.pvPointCount > 0, 'pvPointCount must be positive');
  assert.ok(result.summary.qvPointCount > 0, 'qvPointCount must be positive');
  assert.ok(Array.isArray(result.warnings), 'warnings must be an array');
  console.log('PASS: runVoltageStabilityStudy full integration');
})();

// ---------------------------------------------------------------------------
// runVoltageStabilityStudy — default targetBusId selection
// ---------------------------------------------------------------------------
(function testRunStudyDefaultTargetBus() {
  const buses = twoBusSys();
  const result = runVoltageStabilityStudy({ buses, lambdaMax: 1.5 });
  assert.equal(result.inputs.targetBusId, 'B2', 'default target must be first PQ bus');
  console.log('PASS: runVoltageStabilityStudy defaults to first PQ bus');
})();

// ---------------------------------------------------------------------------
// runVoltageStabilityStudy — validation errors
// ---------------------------------------------------------------------------
(function testRunStudyValidation() {
  assert.throws(() => runVoltageStabilityStudy({ buses: [] }), /non-empty/);
  assert.throws(() => runVoltageStabilityStudy({ buses: twoBusSys(), baseMVA: -1 }), /baseMVA/);
  assert.throws(() => runVoltageStabilityStudy({ buses: twoBusSys(), lambdaMax: 0.5 }), /lambdaMax/);
  console.log('PASS: runVoltageStabilityStudy validation errors');
})();

// ---------------------------------------------------------------------------
// P-V curve — base case total load matches input
// ---------------------------------------------------------------------------
(function testPVCurveBaseCaseLoad() {
  const Pd = 4000; const Qd = 1500;
  const buses = twoBusSys({ Pd, Qd });
  const result = buildPVCurve(buses, { baseMVA: 100, lambdaMax: 1.5, lambdaStep: 0.5 });
  const basePt = result.points.find(p => Math.abs(p.lambda - 1.0) < 1e-6);
  assert.ok(basePt, 'base point must exist');
  // Total load should be Pd (only B2 has load) in kW → MW
  assert.ok(Math.abs(basePt.totalLoadMW - Pd / 1000) < 0.01,
    `totalLoadMW at λ=1 should be ~${Pd / 1000} MW, got ${basePt.totalLoadMW}`);
  console.log('PASS: PV curve base case total load matches');
})();

// ---------------------------------------------------------------------------
// P-V curve — lambdaMax warning when no collapse found
// ---------------------------------------------------------------------------
(function testPVCurveLambdaMaxWarning() {
  // Very low load → system won't collapse within lambdaMax=1.2
  const buses = twoBusSys({ r: 0.01, x: 0.05, Pd: 100, Qd: 50 });
  const result = buildPVCurve(buses, { baseMVA: 100, lambdaMax: 1.2, lambdaStep: 0.1 });
  assert.ok(!result.collapseFound, 'should not collapse for low-load stiff system');
  assert.ok(result.warnings.some(w => w.includes('did not collapse')), 'must warn when no collapse');
  console.log('PASS: PV curve lambdaMax warning emitted');
})();

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log('\nAll voltageStability tests passed.');
