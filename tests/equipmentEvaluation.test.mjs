/**
 * Tests for analysis/equipmentEvaluation.mjs (Gap #80)
 *
 * Covers:
 *   checkInterruptingRating — pass, fail, boundary, incomplete (missing rating, missing fault)
 *   checkWithstand          — pass, fail, I²t-adjusted boundary, incomplete
 *   checkCableThermalDuty   — pass, fail, k-factor selection, incomplete
 *   checkSccr               — pass, fail, incomplete
 *   conductorSizeToMm2      — AWG/kcmil/mm² conversion
 *   conductorMaterial       — material key derivation
 *   evaluateEquipment       — integration: protective device, enclosure, cable, empty input
 *   buildEquipmentReport    — CSV row shape and count
 *   summariseEvaluation     — counts pass/fail/incomplete
 */

import assert from 'assert';
import {
  EVAL_STATUS,
  CABLE_K_FACTORS,
  checkInterruptingRating,
  checkWithstand,
  checkCableThermalDuty,
  checkSccr,
  conductorSizeToMm2,
  conductorMaterial,
  evaluateEquipment,
  buildEquipmentReport,
  summariseEvaluation,
  REPORT_HEADERS,
} from '../analysis/equipmentEvaluation.mjs';

function describe(name, fn) { console.log(name); fn(); }
function it(name, fn) {
  try { fn(); console.log('  ✓', name); }
  catch (err) { console.error('  ✗', name, err.message || err); process.exitCode = 1; }
}

// ============================================================================
// checkInterruptingRating
// ============================================================================
describe('checkInterruptingRating()', () => {
  it('returns pass when rating > fault current', () => {
    const r = checkInterruptingRating(65, 30);
    assert.strictEqual(r.status, EVAL_STATUS.PASS);
    assert.strictEqual(r.ratingKA, 65);
    assert.strictEqual(r.faultKA, 30);
    assert.strictEqual(r.marginKA, 35);
  });

  it('returns pass at exact boundary (rating === fault)', () => {
    const r = checkInterruptingRating(42, 42);
    assert.strictEqual(r.status, EVAL_STATUS.PASS);
    assert.strictEqual(r.marginKA, 0);
  });

  it('returns fail when fault > rating', () => {
    const r = checkInterruptingRating(25, 35);
    assert.strictEqual(r.status, EVAL_STATUS.FAIL);
    assert.ok(r.marginKA < 0);
  });

  it('returns incomplete when ratingKA is null', () => {
    const r = checkInterruptingRating(null, 30);
    assert.strictEqual(r.status, EVAL_STATUS.INCOMPLETE);
    assert.strictEqual(r.ratingKA, null);
    assert.strictEqual(r.faultKA, 30);
  });

  it('returns incomplete when faultKA is null', () => {
    const r = checkInterruptingRating(65, null);
    assert.strictEqual(r.status, EVAL_STATUS.INCOMPLETE);
    assert.strictEqual(r.faultKA, null);
  });

  it('returns incomplete when faultKA is NaN', () => {
    const r = checkInterruptingRating(65, NaN);
    assert.strictEqual(r.status, EVAL_STATUS.INCOMPLETE);
  });
});

// ============================================================================
// checkWithstand
// ============================================================================
describe('checkWithstand()', () => {
  it('passes when rating is sufficient at clearing time', () => {
    // 65 kA @ 30 cycles (0.5 s); adjusted to 0.05 s clearing → 65 × sqrt(0.5/0.05) ≈ 205 kA
    const r = checkWithstand(65, 30, 50, 0.05);
    assert.strictEqual(r.status, EVAL_STATUS.PASS);
    assert.ok(r.adjustedRatingKA > 50);
  });

  it('fails when clearing time is very long and fault is high', () => {
    // 25 kA @ 30 cycles (0.5 s); clearing = 2 s → adjusted = 25 × sqrt(0.5/2) ≈ 12.5 kA
    const r = checkWithstand(25, 30, 20, 2.0);
    assert.strictEqual(r.status, EVAL_STATUS.FAIL);
  });

  it('defaults ratingCycles to 30 when null', () => {
    const r1 = checkWithstand(50, null, 30, 0.5);
    const r2 = checkWithstand(50, 30,   30, 0.5);
    assert.strictEqual(r1.status, r2.status);
    assert.ok(Math.abs(r1.adjustedRatingKA - r2.adjustedRatingKA) < 0.01);
  });

  it('returns incomplete when ratingKA is null', () => {
    const r = checkWithstand(null, 30, 30, 0.5);
    assert.strictEqual(r.status, EVAL_STATUS.INCOMPLETE);
  });

  it('returns incomplete when clearingTimeS is null', () => {
    const r = checkWithstand(65, 30, 30, null);
    assert.strictEqual(r.status, EVAL_STATUS.INCOMPLETE);
  });

  it('returns incomplete when faultKA is null', () => {
    const r = checkWithstand(65, 30, null, 0.1);
    assert.strictEqual(r.status, EVAL_STATUS.INCOMPLETE);
  });
});

// ============================================================================
// checkCableThermalDuty
// ============================================================================
describe('checkCableThermalDuty()', () => {
  it('passes for a large conductor at moderate fault', () => {
    // 500 mm² copper XLPE (k=135), 10 kA for 0.5 s → min = 10000×√0.5/135 ≈ 52.4 mm²
    const r = checkCableThermalDuty(500, 'copper_xlpe', 10, 0.5);
    assert.strictEqual(r.status, EVAL_STATUS.PASS);
    assert.ok(r.minMm2 < 500);
  });

  it('fails when conductor is too small', () => {
    // 2.08 mm² (#14 AWG), 20 kA for 0.1 s → min = 20000×√0.1/135 ≈ 46.8 mm²
    const r = checkCableThermalDuty(2.08, 'copper_xlpe', 20, 0.1);
    assert.strictEqual(r.status, EVAL_STATUS.FAIL);
    assert.ok(r.minMm2 > r.actualMm2);
  });

  it('uses correct k for aluminium_pvc (76)', () => {
    // k=76; same inputs but aluminium should give larger minMm2 than copper
    const rAl = checkCableThermalDuty(100, 'aluminium_pvc', 10, 0.5);
    const rCu = checkCableThermalDuty(100, 'copper_pvc',    10, 0.5);
    assert.ok(rAl.minMm2 > rCu.minMm2);
  });

  it('defaults to copper_xlpe k=135 for unknown material', () => {
    const r = checkCableThermalDuty(100, 'unknown_material', 10, 0.5);
    assert.strictEqual(r.k, CABLE_K_FACTORS.copper_xlpe);
  });

  it('returns incomplete when conductorMm2 is null', () => {
    const r = checkCableThermalDuty(null, 'copper_xlpe', 10, 0.5);
    assert.strictEqual(r.status, EVAL_STATUS.INCOMPLETE);
    assert.strictEqual(r.actualMm2, null);
  });

  it('returns incomplete when faultKA is null', () => {
    const r = checkCableThermalDuty(100, 'copper_xlpe', null, 0.5);
    assert.strictEqual(r.status, EVAL_STATUS.INCOMPLETE);
    assert.strictEqual(r.actualMm2, 100);
  });

  it('returns incomplete when clearingTimeS is null', () => {
    const r = checkCableThermalDuty(100, 'copper_xlpe', 10, null);
    assert.strictEqual(r.status, EVAL_STATUS.INCOMPLETE);
  });
});

// ============================================================================
// checkSccr
// ============================================================================
describe('checkSccr()', () => {
  it('passes when SCCR >= fault', () => {
    const r = checkSccr(65, 42);
    assert.strictEqual(r.status, EVAL_STATUS.PASS);
    assert.strictEqual(r.marginKA, 23);
  });

  it('fails when fault > SCCR', () => {
    const r = checkSccr(10, 25);
    assert.strictEqual(r.status, EVAL_STATUS.FAIL);
    assert.ok(r.marginKA < 0);
  });

  it('returns incomplete when sccrKA is null', () => {
    const r = checkSccr(null, 25);
    assert.strictEqual(r.status, EVAL_STATUS.INCOMPLETE);
  });

  it('returns incomplete when faultKA is null', () => {
    const r = checkSccr(65, null);
    assert.strictEqual(r.status, EVAL_STATUS.INCOMPLETE);
  });
});

// ============================================================================
// conductorSizeToMm2
// ============================================================================
describe('conductorSizeToMm2()', () => {
  it('converts #4 AWG', () => {
    assert.ok(Math.abs(conductorSizeToMm2('#4 AWG') - 21.1) < 0.01);
  });

  it('handles 4 AWG without #', () => {
    assert.ok(Math.abs(conductorSizeToMm2('4 AWG') - 21.1) < 0.01);
  });

  it('converts 500 kcmil', () => {
    assert.ok(Math.abs(conductorSizeToMm2('500 kcmil') - 253.3) < 0.01);
  });

  it('converts 1/0 AWG', () => {
    assert.ok(Math.abs(conductorSizeToMm2('1/0') - 53.5) < 0.01);
  });

  it('parses mm² strings', () => {
    assert.ok(Math.abs(conductorSizeToMm2('95 mm2') - 95) < 0.01);
  });

  it('returns null for empty string', () => {
    assert.strictEqual(conductorSizeToMm2(''), null);
  });

  it('returns null for unknown size', () => {
    assert.strictEqual(conductorSizeToMm2('999XYZ'), null);
  });
});

// ============================================================================
// conductorMaterial
// ============================================================================
describe('conductorMaterial()', () => {
  it('returns copper_xlpe for copper XLPE cable', () => {
    assert.strictEqual(conductorMaterial({ material: 'copper', insulation_type: 'xlpe' }), 'copper_xlpe');
  });

  it('returns copper_pvc for copper PVC cable', () => {
    assert.strictEqual(conductorMaterial({ material: 'copper', insulation_type: 'pvc' }), 'copper_pvc');
  });

  it('returns aluminium_xlpe for al XLPE cable', () => {
    assert.strictEqual(conductorMaterial({ material: 'aluminium', insulation_type: 'xlpe' }), 'aluminium_xlpe');
  });

  it('returns copper_epr for copper EPR cable', () => {
    assert.strictEqual(conductorMaterial({ material: 'copper', insulation_type: 'epr' }), 'copper_epr');
  });

  it('defaults to copper_xlpe with no fields', () => {
    assert.strictEqual(conductorMaterial({}), 'copper_xlpe');
  });
});

// ============================================================================
// evaluateEquipment — integration
// ============================================================================
describe('evaluateEquipment() — protective device', () => {
  const catalog = [
    { id: 'breaker_65ka', type: 'breaker', interruptRating: 65, withstandRatingKA: 65, withstandCycles: 3 },
  ];
  const scResults = { 'B1': { threePhaseKA: 30 } };
  const afResults = { 'B1': { clearingTimeSeconds: 0.05 } };

  it('evaluates a passing breaker', () => {
    const comp = { id: 'B1', type: 'breaker', props: { device: 'breaker_65ka', name: 'Main Breaker' } };
    const evals = evaluateEquipment([comp], [], { shortCircuit: scResults, arcFlash: afResults }, catalog);
    assert.strictEqual(evals.length, 1);
    assert.strictEqual(evals[0].status, EVAL_STATUS.PASS);
    assert.strictEqual(evals[0].checks.aic.status, EVAL_STATUS.PASS);
    assert.strictEqual(evals[0].checks.withstand.status, EVAL_STATUS.PASS);
  });

  it('evaluates a failing breaker (fault > AIC)', () => {
    const overloaded = { 'B1': { threePhaseKA: 80 } };
    const comp = { id: 'B1', type: 'breaker', props: { device: 'breaker_65ka', name: 'Main Breaker' } };
    const evals = evaluateEquipment([comp], [], { shortCircuit: overloaded, arcFlash: afResults }, catalog);
    assert.strictEqual(evals[0].status, EVAL_STATUS.FAIL);
    assert.strictEqual(evals[0].checks.aic.status, EVAL_STATUS.FAIL);
  });

  it('returns incomplete when no short-circuit study', () => {
    const comp = { id: 'B1', type: 'breaker', props: { device: 'breaker_65ka', name: 'Main Breaker' } };
    const evals = evaluateEquipment([comp], [], {}, catalog);
    assert.strictEqual(evals[0].checks.aic.status, EVAL_STATUS.INCOMPLETE);
  });
});

describe('evaluateEquipment() — switchboard', () => {
  it('evaluates a switchboard with interrupting_ka and withstand_1s_ka', () => {
    const comp = {
      id: 'SWB1', type: 'switchboard', subtype: 'switchboard',
      props: { name: 'Main Switchboard', interrupting_ka: 65, withstand_1s_ka: 65 },
    };
    const sc = { 'SWB1': { threePhaseKA: 42 } };
    const af = { 'SWB1': { clearingTimeSeconds: 0.1 } };
    const evals = evaluateEquipment([comp], [], { shortCircuit: sc, arcFlash: af });
    assert.strictEqual(evals.length, 1);
    assert.strictEqual(evals[0].status, EVAL_STATUS.PASS);
  });
});

describe('evaluateEquipment() — cable segment on one-line', () => {
  it('evaluates a cable segment with conductor size', () => {
    const comp = {
      id: 'CAB1', type: 'cable',
      props: { tag: 'F-001', size_awg_kcmil: '500 kcmil', material: 'copper', insulation_type: 'xlpe' },
    };
    const sc = { 'CAB1': { threePhaseKA: 10 } };
    const af = { 'CAB1': { clearingTimeSeconds: 0.5 } };
    const evals = evaluateEquipment([comp], [], { shortCircuit: sc, arcFlash: af });
    assert.strictEqual(evals.length, 1);
    // 500 kcmil = 253.3 mm²; min = 10000×√0.5/135 ≈ 52.4 mm² → pass
    assert.strictEqual(evals[0].status, EVAL_STATUS.PASS);
  });

  it('returns incomplete for cable with no conductor size', () => {
    const comp = { id: 'CAB2', type: 'cable', props: { tag: 'F-002' } };
    const sc   = { 'CAB2': { threePhaseKA: 10 } };
    const af   = { 'CAB2': { clearingTimeSeconds: 0.5 } };
    const evals = evaluateEquipment([comp], [], { shortCircuit: sc, arcFlash: af });
    assert.strictEqual(evals[0].checks.thermal.status, EVAL_STATUS.INCOMPLETE);
  });
});

describe('evaluateEquipment() — empty / edge cases', () => {
  it('returns empty array for empty components', () => {
    const evals = evaluateEquipment([], [], {});
    assert.strictEqual(evals.length, 0);
  });

  it('skips bus and utility_source components', () => {
    const comps = [
      { id: 'BUS1', type: 'bus', props: {} },
      { id: 'U1',   type: 'utility_source', props: {} },
    ];
    const evals = evaluateEquipment(comps, [], {});
    assert.strictEqual(evals.length, 0);
  });

  it('handles null studies gracefully', () => {
    const comp = { id: 'B1', type: 'breaker', props: { interruptRatingKA: 65 } };
    assert.doesNotThrow(() => evaluateEquipment([comp], [], null));
  });
});

// ============================================================================
// buildEquipmentReport
// ============================================================================
describe('buildEquipmentReport()', () => {
  it('returns one row per check', () => {
    const catalog = [{ id: 'b65', type: 'breaker', interruptRating: 65, withstandRatingKA: 65, withstandCycles: 3 }];
    const comp    = { id: 'B1', type: 'breaker', props: { device: 'b65', name: 'Main' } };
    const sc      = { 'B1': { threePhaseKA: 30 } };
    const af      = { 'B1': { clearingTimeSeconds: 0.05 } };
    const evals   = evaluateEquipment([comp], [], { shortCircuit: sc, arcFlash: af }, catalog);
    const rows    = buildEquipmentReport(evals);
    // breaker has aic + withstand = 2 checks
    assert.ok(rows.length >= 2);
    assert.strictEqual(rows[0].length, REPORT_HEADERS.length);
  });

  it('returns empty array for empty evaluations', () => {
    assert.deepStrictEqual(buildEquipmentReport([]), []);
  });
});

// ============================================================================
// summariseEvaluation
// ============================================================================
describe('summariseEvaluation()', () => {
  it('counts pass, fail, incomplete correctly', () => {
    const catalog = [
      { id: 'b_pass', type: 'breaker', interruptRating: 65, withstandRatingKA: 65, withstandCycles: 3 },
      { id: 'b_fail', type: 'breaker', interruptRating: 10, withstandRatingKA: 10, withstandCycles: 3 },
    ];
    const comps = [
      { id: 'B_PASS', type: 'breaker', props: { device: 'b_pass', name: 'P' } },
      { id: 'B_FAIL', type: 'breaker', props: { device: 'b_fail', name: 'F' } },
      { id: 'B_NONE', type: 'breaker', props: { name: 'N' } }, // no ratings
    ];
    const sc = { 'B_PASS': { threePhaseKA: 30 }, 'B_FAIL': { threePhaseKA: 30 }, 'B_NONE': { threePhaseKA: 30 } };
    const af = { 'B_PASS': { clearingTimeSeconds: 0.05 }, 'B_FAIL': { clearingTimeSeconds: 0.05 }, 'B_NONE': { clearingTimeSeconds: 0.05 } };
    const evals = evaluateEquipment(comps, [], { shortCircuit: sc, arcFlash: af }, catalog);
    const summary = summariseEvaluation(evals);
    assert.strictEqual(summary.total, 3);
    assert.ok(summary.pass >= 1,       'At least one pass');
    assert.ok(summary.fail >= 1,       'At least one fail');
    assert.ok(summary.incomplete >= 1, 'At least one incomplete');
  });

  it('handles empty evaluations', () => {
    const s = summariseEvaluation([]);
    assert.strictEqual(s.total, 0);
    assert.strictEqual(s.pass, 0);
    assert.strictEqual(s.fail, 0);
    assert.strictEqual(s.incomplete, 0);
  });
});
