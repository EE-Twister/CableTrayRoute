import assert from 'node:assert/strict';
import {
  runPVCurve,
  runQVCurve,
  COLLAPSE_VOLTAGE_PU,
} from '../analysis/voltageStability.mjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function pvBase(overrides = {}) {
  return {
    scMva: 100,
    xrRatio: 10,
    baseMva: 100,
    systemKv: 4.16,
    loadMw: 10,
    powerFactor: 0.85,
    steps: 100,
    ...overrides,
  };
}

function qvBase(overrides = {}) {
  return {
    scMva: 100,
    xrRatio: 10,
    baseMva: 100,
    systemKv: 4.16,
    loadMw: 10,
    powerFactor: 0.85,
    steps: 100,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// COLLAPSE_VOLTAGE_PU constant
// ---------------------------------------------------------------------------
(function testConstant() {
  assert.equal(COLLAPSE_VOLTAGE_PU, 0.5, 'collapse threshold = 0.5 pu');
})();

// ---------------------------------------------------------------------------
// runPVCurve — result structure
// ---------------------------------------------------------------------------
(function testPVStructure() {
  const r = runPVCurve(pvBase());
  assert.ok(Array.isArray(r.upperPoints),   'upperPoints is array');
  assert.ok(Array.isArray(r.lowerPoints),   'lowerPoints is array');
  assert.ok(r.upperPoints.length > 5,       'upper branch has multiple points');
  assert.ok(r.lowerPoints.length > 5,       'lower branch has multiple points');
  assert.ok(typeof r.nosePoint === 'object', 'nosePoint is object');
  assert.ok(Number.isFinite(r.nosePoint.pMw),   'nosePoint.pMw is finite');
  assert.ok(Number.isFinite(r.nosePoint.vPu),   'nosePoint.vPu is finite');
  assert.ok(Number.isFinite(r.loadMarginMW),     'loadMarginMW is finite');
  assert.ok(Number.isFinite(r.loadMarginPct),    'loadMarginPct is finite');
  assert.ok(Number.isFinite(r.baseCaseVPu),      'baseCaseVPu is finite');
  assert.ok(Array.isArray(r.warnings),           'warnings is array');
  assert.ok(typeof r.timestamp === 'string',     'timestamp is string');
})();

// ---------------------------------------------------------------------------
// runPVCurve — lossless system nose at P_max = 1/(2X)
// ---------------------------------------------------------------------------
(function testPVLosslessNose() {
  // Lossless (R≈0): use very high X/R so R is negligible
  // X/R = 10000 → R ≈ 0, X ≈ Zpu = baseMva/scMva = 100/500 = 0.2 pu
  // P_max(lossless,unity PF) = 1/(2X) = 1/0.4 = 2.5 pu = 250 MW
  const r = runPVCurve(pvBase({
    scMva: 500,
    xrRatio: 10000,
    loadMw: 10,
    powerFactor: 1.0,
    steps: 200,
  }));
  const expectedNoseMW = 250; // 1/(2·0.2) × 100
  assert.ok(Math.abs(r.nosePoint.pMw - expectedNoseMW) < 5,
    `Lossless unity-PF nose ≈ ${expectedNoseMW} MW (got ${r.nosePoint.pMw})`);
})();

// ---------------------------------------------------------------------------
// runPVCurve — margin > 0 for well-loaded system
// ---------------------------------------------------------------------------
(function testPVMarginPositive() {
  const r = runPVCurve(pvBase());
  assert.ok(r.loadMarginMW > 0,  'loadMarginMW > 0');
  assert.ok(r.loadMarginPct > 0, 'loadMarginPct > 0');
  assert.ok(r.nosePoint.pMw > r.baseCasePMw, 'nose MW > base-case MW');
})();

// ---------------------------------------------------------------------------
// runPVCurve — base-case voltage near 1.0 for lightly loaded system
// ---------------------------------------------------------------------------
(function testPVBaseCaseVoltage() {
  // Light load (1 MW on 1000 MVAsc) → V ≈ 1.0 pu
  const r = runPVCurve(pvBase({ scMva: 1000, loadMw: 1 }));
  assert.ok(r.baseCaseVPu > 0.95, `Light-load base voltage ${r.baseCaseVPu} should be > 0.95`);
})();

// ---------------------------------------------------------------------------
// runPVCurve — monotone upper branch (V decreases as P increases)
// ---------------------------------------------------------------------------
(function testPVUpperBranchMonotone() {
  const r = runPVCurve(pvBase({ steps: 50 }));
  const pts = r.upperPoints;
  for (let i = 1; i < pts.length; i++) {
    assert.ok(pts[i].vPu <= pts[i - 1].vPu + 0.001,
      `Upper branch must be monotonically decreasing in V (point ${i})`);
    assert.ok(pts[i].pMw >= pts[i - 1].pMw - 0.001,
      `Upper branch must be monotonically increasing in P (point ${i})`);
  }
})();

// ---------------------------------------------------------------------------
// runPVCurve — nose voltage above collapse threshold
// ---------------------------------------------------------------------------
(function testPVNoseAboveCollapse() {
  const r = runPVCurve(pvBase());
  assert.ok(r.nosePoint.vPu > COLLAPSE_VOLTAGE_PU,
    `Nose voltage ${r.nosePoint.vPu} should be above collapse threshold ${COLLAPSE_VOLTAGE_PU}`);
})();

// ---------------------------------------------------------------------------
// runPVCurve — stronger source → larger margin
// ---------------------------------------------------------------------------
(function testPVStrongerSource() {
  const weak   = runPVCurve(pvBase({ scMva: 50  }));
  const strong = runPVCurve(pvBase({ scMva: 500 }));
  assert.ok(strong.nosePoint.pMw > weak.nosePoint.pMw,
    'Stronger source (higher scMva) has larger nose MW');
  assert.ok(strong.loadMarginMW > weak.loadMarginMW,
    'Stronger source has larger MW margin');
})();

// ---------------------------------------------------------------------------
// runPVCurve — validation errors
// ---------------------------------------------------------------------------
(function testPVValidation() {
  assert.throws(() => runPVCurve(pvBase({ scMva: 0 })),     /scMva must be greater than zero/);
  assert.throws(() => runPVCurve(pvBase({ scMva: -1 })),    /scMva must be greater than zero/);
  assert.throws(() => runPVCurve(pvBase({ xrRatio: 0 })),   /xrRatio must be greater than zero/);
  assert.throws(() => runPVCurve(pvBase({ baseMva: 0 })),   /baseMva must be greater than zero/);
  assert.throws(() => runPVCurve(pvBase({ systemKv: -1 })), /systemKv must be greater than zero/);
  assert.throws(() => runPVCurve(pvBase({ loadMw: 0 })),    /loadMw must be greater than zero/);
  assert.throws(() => runPVCurve(pvBase({ powerFactor: 0 })),    /powerFactor must be in/);
  assert.throws(() => runPVCurve(pvBase({ powerFactor: 1.01 })), /powerFactor must be in/);
  assert.throws(() => runPVCurve(pvBase({ steps: 5 })),     /steps must be an integer/);
  assert.throws(() => runPVCurve(pvBase({ steps: 600 })),   /steps must be an integer/);
})();

// ---------------------------------------------------------------------------
// runPVCurve — overloaded system throws
// ---------------------------------------------------------------------------
(function testPVOverloadThrows() {
  // Very weak source, very heavy load → base case already past nose
  assert.throws(
    () => runPVCurve(pvBase({ scMva: 1, loadMw: 500 })),
    /stability limit/,
    'Overloaded system should throw'
  );
})();

// ---------------------------------------------------------------------------
// runQVCurve — result structure
// ---------------------------------------------------------------------------
(function testQVStructure() {
  const r = runQVCurve(qvBase());
  assert.ok(Array.isArray(r.upperPoints),       'upperPoints is array');
  assert.ok(Array.isArray(r.lowerPoints),       'lowerPoints is array');
  assert.ok(r.upperPoints.length > 5,           'upper branch has multiple points');
  assert.ok(Number.isFinite(r.vOperating),      'vOperating is finite');
  assert.ok(Number.isFinite(r.qMarginMvar),     'qMarginMvar is finite');
  assert.ok(Array.isArray(r.warnings),          'warnings is array');
  assert.ok(typeof r.timestamp === 'string',    'timestamp is string');
})();

// ---------------------------------------------------------------------------
// runQVCurve — upper branch contains operating point (Q_comp ≈ 0 at V_op)
// ---------------------------------------------------------------------------
(function testQVOperatingPoint() {
  const r = runQVCurve(qvBase());
  // Find point on upper branch closest to Q_comp = 0
  const closest = r.upperPoints.reduce((best, pt) =>
    Math.abs(pt.qCompMvar) < Math.abs(best.qCompMvar) ? pt : best
  );
  assert.ok(Math.abs(closest.vPu - r.vOperating) < 0.05,
    `Upper branch at Q_comp≈0 should have V≈vOperating (got ${closest.vPu}, expected ${r.vOperating})`);
})();

// ---------------------------------------------------------------------------
// runQVCurve — stronger source → larger Q-margin
// ---------------------------------------------------------------------------
(function testQVStrongerSource() {
  const weak   = runQVCurve(qvBase({ scMva: 50  }));
  const strong = runQVCurve(qvBase({ scMva: 500 }));
  assert.ok(strong.qMarginMvar >= weak.qMarginMvar,
    'Stronger source should have at least as large Q-margin');
})();

// ---------------------------------------------------------------------------
// runQVCurve — both branches join near nose
// ---------------------------------------------------------------------------
(function testQVBranchesJoin() {
  const r = runQVCurve(qvBase());
  // The nose is where upper and lower branches meet; both must exist
  assert.ok(r.lowerPoints.length > 0, 'Lower branch must exist');
  // At the nose V, upper ≈ lower Q_comp (within tolerance)
  const uMin = r.upperPoints.reduce((a, b) => a.vPu < b.vPu ? a : b);
  const lMin = r.lowerPoints.reduce((a, b) => a.vPu < b.vPu ? a : b);
  assert.ok(Math.abs(uMin.vPu - lMin.vPu) < 0.05,
    'Upper and lower branch minimum voltages should be close (near nose)');
})();

// ---------------------------------------------------------------------------
// runQVCurve — validation errors
// ---------------------------------------------------------------------------
(function testQVValidation() {
  assert.throws(() => runQVCurve(qvBase({ scMva: -1 })),   /scMva must be greater than zero/);
  assert.throws(() => runQVCurve(qvBase({ loadMw: 0 })),   /loadMw must be greater than zero/);
  assert.throws(() => runQVCurve(qvBase({ powerFactor: 1.1 })), /powerFactor must be in/);
  assert.throws(() => runQVCurve(qvBase({ steps: 5 })),    /steps must be an integer/);
})();

// ---------------------------------------------------------------------------
// runQVCurve — overloaded system throws
// ---------------------------------------------------------------------------
(function testQVOverloadThrows() {
  assert.throws(
    () => runQVCurve(qvBase({ scMva: 1, loadMw: 500 })),
    /stability limit/,
    'Overloaded system should throw'
  );
})();

// ---------------------------------------------------------------------------
// inputs echoed in result
// ---------------------------------------------------------------------------
(function testInputsEchoed() {
  const opts = pvBase();
  const r = runPVCurve(opts);
  assert.equal(r.inputs.scMva,        opts.scMva);
  assert.equal(r.inputs.loadMw,       opts.loadMw);
  assert.equal(r.inputs.powerFactor,  opts.powerFactor);
})();

console.log('✓ voltage stability tests passed');
