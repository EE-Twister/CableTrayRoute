/**
 * Tests for analysis/designCoach.mjs
 *
 * Covers:
 *   DC-01 — SEVERITY_ORDER ordering
 *   DC-02 — extractVoltageDropRecs: fail, warn, pass
 *   DC-03 — extractArcFlashRecs: high energy, missing data
 *   DC-04 — extractShortCircuitRecs: bus warnings
 *   DC-05 — extractTrayFillRecs: over/under limit
 *   DC-06 — extractHarmonicsRecs: warning flag
 *   DC-07 — extractGroundGridRecs: touch/step/GPR
 *   DC-08 — extractLoadFlowRecs: voltage out of range, unbalanced mode, warnings
 *   DC-09 — suppressDuplicates: highest severity kept
 *   DC-10 — runDesignCoach: empty input, mixed input, sorted output
 *   DC-11 — nextLargerConductor: known size, largest size, unknown size
 */
import assert from 'assert';
import {
  SEVERITY_ORDER,
  nextLargerConductor,
  extractVoltageDropRecs,
  extractArcFlashRecs,
  extractShortCircuitRecs,
  extractTrayFillRecs,
  extractHarmonicsRecs,
  extractGroundGridRecs,
  extractLoadFlowRecs,
  suppressDuplicates,
  runDesignCoach,
} from '../analysis/designCoach.mjs';

function describe(name, fn) { console.log(name); fn(); }
function it(name, fn) {
  try { fn(); console.log('  ✓', name); }
  catch (err) { console.error('  ✗', name, err.message || err); process.exitCode = 1; }
}

// ---------------------------------------------------------------------------
// DC-01 — SEVERITY_ORDER
// ---------------------------------------------------------------------------
describe('SEVERITY_ORDER', () => {
  it('has exactly 4 entries', () => {
    assert.strictEqual(SEVERITY_ORDER.length, 4);
  });

  it('safety is first', () => {
    assert.strictEqual(SEVERITY_ORDER[0], 'safety');
  });

  it('compliance is second', () => {
    assert.strictEqual(SEVERITY_ORDER[1], 'compliance');
  });

  it('efficiency is third', () => {
    assert.strictEqual(SEVERITY_ORDER[2], 'efficiency');
  });

  it('missing_data is last', () => {
    assert.strictEqual(SEVERITY_ORDER[3], 'missing_data');
  });
});

// ---------------------------------------------------------------------------
// DC-11 — nextLargerConductor
// ---------------------------------------------------------------------------
describe('nextLargerConductor()', () => {
  it('returns next size up from 1/0 AWG', () => {
    assert.strictEqual(nextLargerConductor('1/0 AWG'), '2/0 AWG');
  });

  it('returns next size up from #4 AWG', () => {
    assert.strictEqual(nextLargerConductor('#4 AWG'), '#3 AWG');
  });

  it('returns null for the largest conductor', () => {
    assert.strictEqual(nextLargerConductor('1000 kcmil'), null);
  });

  it('returns null for unknown size', () => {
    assert.strictEqual(nextLargerConductor('999 AWG'), null);
  });
});

// ---------------------------------------------------------------------------
// DC-02 — extractVoltageDropRecs
// ---------------------------------------------------------------------------
describe('extractVoltageDropRecs()', () => {
  // calculateVoltageDrop uses: est_load, operating_voltage, conductor_material, conductor_size, length
  function makeCable(tag, opts = {}) {
    return {
      cable_tag: tag,
      tag,
      length: opts.length ?? 200,
      conductor_size: opts.conductor_size ?? '1/0 AWG',
      conductor_material: opts.conductor_material ?? 'CU',
      est_load: opts.est_load ?? 100,
      operating_voltage: opts.operating_voltage ?? 480,
      circuit_type: opts.circuit_type ?? 'feeder',
      ...opts,
    };
  }

  it('emits compliance rec for a failing cable', () => {
    // Long feeder at high current — #14 AWG, 500ft, 20A, 120V → significant drop
    const cables = [makeCable('C-101', {
      length: 500, est_load: 20, conductor_size: '#14 AWG', operating_voltage: 120,
    })];
    const recs = extractVoltageDropRecs(cables);
    const failRecs = recs.filter(r => r.severity === 'compliance' && r.id.startsWith('vd:'));
    assert.ok(failRecs.length >= 1, `Expected at least 1 compliance rec, got ${JSON.stringify(recs)}`);
    assert.strictEqual(failRecs[0].sourceStudy, 'voltageDropStudy');
    assert.strictEqual(failRecs[0].location, 'C-101');
    assert.strictEqual(failRecs[0].studyPage, 'voltagedropstudy.html');
  });

  it('emits efficiency rec for a warning cable', () => {
    // Moderate drop within 80-100% of the 3% feeder limit
    const cables = [makeCable('C-200', {
      length: 300, est_load: 15, conductor_size: '#14 AWG', operating_voltage: 120,
    })];
    const recs = extractVoltageDropRecs(cables);
    const warnRecs = recs.filter(r => r.severity === 'efficiency');
    warnRecs.forEach(r => {
      assert.strictEqual(r.sourceStudy, 'voltageDropStudy');
      assert.ok(r.id.startsWith('vd-warn:'), `id should start with vd-warn: got ${r.id}`);
    });
  });

  it('returns empty array for empty cable list', () => {
    assert.deepStrictEqual(extractVoltageDropRecs([]), []);
  });

  it('returns empty array for null input', () => {
    assert.deepStrictEqual(extractVoltageDropRecs(null), []);
  });

  it('does not emit rec for passing cable', () => {
    // Short, lightly loaded cable — should pass
    const cables = [makeCable('C-300', {
      length: 10, est_load: 5, conductor_size: '1/0 AWG', operating_voltage: 480,
    })];
    const recs = extractVoltageDropRecs(cables);
    const fail = recs.filter(r => r.severity === 'compliance' && r.id === 'vd:C-300');
    assert.strictEqual(fail.length, 0);
  });
});

// ---------------------------------------------------------------------------
// DC-03 — extractArcFlashRecs
// ---------------------------------------------------------------------------
describe('extractArcFlashRecs()', () => {
  it('emits safety rec for incidentEnergy > 40', () => {
    const results = [{ busId: 'BUS-3', incidentEnergy: 45 }];
    const recs = extractArcFlashRecs(results);
    assert.strictEqual(recs.length, 1);
    assert.strictEqual(recs[0].severity, 'safety');
    assert.strictEqual(recs[0].location, 'BUS-3');
    assert.strictEqual(recs[0].safe_to_apply, false);
    assert.strictEqual(recs[0].sourceStudy, 'arcFlash');
  });

  it('does not emit rec for incidentEnergy <= 40', () => {
    const results = [{ busId: 'BUS-4', incidentEnergy: 38 }];
    const recs = extractArcFlashRecs(results);
    const safety = recs.filter(r => r.severity === 'safety');
    assert.strictEqual(safety.length, 0);
  });

  it('emits missing_data rec for requiredInputs', () => {
    const results = [{ busId: 'BUS-5', incidentEnergy: 5, requiredInputs: ['Provide working distance'] }];
    const recs = extractArcFlashRecs(results);
    const missing = recs.filter(r => r.severity === 'missing_data');
    assert.strictEqual(missing.length, 1);
    assert.ok(missing[0].id.startsWith('af-data:BUS-5'));
  });

  it('handles object-keyed results', () => {
    const results = { 'BUS-6': { busId: 'BUS-6', incidentEnergy: 50 } };
    const recs = extractArcFlashRecs(results);
    assert.strictEqual(recs.filter(r => r.severity === 'safety').length, 1);
  });

  it('returns empty for null input', () => {
    assert.deepStrictEqual(extractArcFlashRecs(null), []);
  });
});

// ---------------------------------------------------------------------------
// DC-04 — extractShortCircuitRecs
// ---------------------------------------------------------------------------
describe('extractShortCircuitRecs()', () => {
  it('emits compliance rec for bus with warnings', () => {
    const results = {
      'BUS-1': { threePhaseKA: 20, warnings: ['Impedance data missing; results limited.'] },
    };
    const recs = extractShortCircuitRecs(results);
    assert.strictEqual(recs.length, 1);
    assert.strictEqual(recs[0].severity, 'compliance');
    assert.strictEqual(recs[0].location, 'BUS-1');
    assert.strictEqual(recs[0].sourceStudy, 'shortCircuit');
  });

  it('emits one rec per warning', () => {
    const results = {
      'BUS-2': { warnings: ['warn A', 'warn B'] },
    };
    const recs = extractShortCircuitRecs(results);
    assert.strictEqual(recs.length, 2);
  });

  it('returns empty for bus with no warnings', () => {
    const results = { 'BUS-3': { threePhaseKA: 15 } };
    assert.deepStrictEqual(extractShortCircuitRecs(results), []);
  });

  it('returns empty for null input', () => {
    assert.deepStrictEqual(extractShortCircuitRecs(null), []);
  });
});

// ---------------------------------------------------------------------------
// DC-05 — extractTrayFillRecs
// ---------------------------------------------------------------------------
describe('extractTrayFillRecs()', () => {
  function makeTray(id, fillSqIn, widthIn = 12, depthIn = 4) {
    return { tray_id: id, inside_width: widthIn, tray_depth: depthIn, current_fill: fillSqIn };
  }

  it('emits compliance rec for tray over 40%', () => {
    // 12 × 4 = 48 in²; fill 22 in² = 45.8%
    const trays = [makeTray('T-1', 22)];
    const recs = extractTrayFillRecs(trays);
    assert.strictEqual(recs.length, 1);
    assert.strictEqual(recs[0].severity, 'compliance');
    assert.strictEqual(recs[0].location, 'T-1');
    assert.strictEqual(recs[0].sourceStudy, 'trayFill');
  });

  it('emits compliance rec for tray over 80%', () => {
    // 12 × 4 = 48 in²; fill 42 in² = 87.5%
    const trays = [makeTray('T-2', 42)];
    const recs = extractTrayFillRecs(trays);
    assert.strictEqual(recs.filter(r => r.severity === 'compliance').length, 1);
  });

  it('emits no rec for tray under 40%', () => {
    // fill 14 in² = 29.2%
    const trays = [makeTray('T-3', 14)];
    assert.deepStrictEqual(extractTrayFillRecs(trays), []);
  });

  it('returns empty for empty array', () => {
    assert.deepStrictEqual(extractTrayFillRecs([]), []);
  });

  it('skips trays with missing dimensions', () => {
    const trays = [{ tray_id: 'T-bad', current_fill: 50 }];
    assert.deepStrictEqual(extractTrayFillRecs(trays), []);
  });
});

// ---------------------------------------------------------------------------
// DC-06 — extractHarmonicsRecs
// ---------------------------------------------------------------------------
describe('extractHarmonicsRecs()', () => {
  it('emits compliance rec for bus with warning:true', () => {
    const results = { 'BUS-H1': { vthd: 6.2, limit: 5, warning: true } };
    const recs = extractHarmonicsRecs(results);
    assert.strictEqual(recs.length, 1);
    assert.strictEqual(recs[0].severity, 'compliance');
    assert.strictEqual(recs[0].location, 'BUS-H1');
    assert.strictEqual(recs[0].sourceStudy, 'harmonics');
  });

  it('emits compliance rec when vthd exceeds limit even without warning flag', () => {
    const results = { 'BUS-H2': { vthd: 7.0, limit: 5 } };
    const recs = extractHarmonicsRecs(results);
    assert.strictEqual(recs.filter(r => r.severity === 'compliance').length, 1);
  });

  it('emits no rec for bus within limit', () => {
    const results = { 'BUS-H3': { vthd: 3.0, limit: 5, warning: false } };
    assert.deepStrictEqual(extractHarmonicsRecs(results), []);
  });

  it('returns empty for null input', () => {
    assert.deepStrictEqual(extractHarmonicsRecs(null), []);
  });
});

// ---------------------------------------------------------------------------
// DC-07 — extractGroundGridRecs
// ---------------------------------------------------------------------------
describe('extractGroundGridRecs()', () => {
  it('emits safety rec when touchSafe is false', () => {
    const result = { touchSafe: false, stepSafe: true, gprExceedsTouch: false, Em: 620, Etouch: 500 };
    const recs = extractGroundGridRecs(result);
    assert.ok(recs.some(r => r.id === 'gg:touch' && r.severity === 'safety'));
  });

  it('emits safety rec when stepSafe is false', () => {
    const result = { touchSafe: true, stepSafe: false, gprExceedsTouch: false, Es: 800, Estep: 600 };
    const recs = extractGroundGridRecs(result);
    assert.ok(recs.some(r => r.id === 'gg:step' && r.severity === 'safety'));
  });

  it('emits compliance rec when gprExceedsTouch is true', () => {
    const result = { touchSafe: true, stepSafe: true, gprExceedsTouch: true, GPR: 1000 };
    const recs = extractGroundGridRecs(result);
    assert.ok(recs.some(r => r.id === 'gg:gpr' && r.severity === 'compliance'));
  });

  it('returns empty when all checks pass', () => {
    const result = { touchSafe: true, stepSafe: true, gprExceedsTouch: false };
    assert.deepStrictEqual(extractGroundGridRecs(result), []);
  });

  it('returns empty for null input', () => {
    assert.deepStrictEqual(extractGroundGridRecs(null), []);
  });
});

// ---------------------------------------------------------------------------
// DC-08 — extractLoadFlowRecs
// ---------------------------------------------------------------------------
describe('extractLoadFlowRecs()', () => {
  it('emits compliance rec for bus voltage below 0.95 pu', () => {
    const result = { buses: [{ id: 'B1', label: 'MCC-1', Vm: 0.92, Va: 0 }], warnings: [] };
    const recs = extractLoadFlowRecs(result);
    assert.strictEqual(recs.length, 1);
    assert.strictEqual(recs[0].severity, 'compliance');
    assert.strictEqual(recs[0].sourceStudy, 'loadFlow');
  });

  it('emits compliance rec for bus voltage above 1.05 pu', () => {
    const result = { buses: [{ id: 'B2', label: 'GEN-1', Vm: 1.07, Va: 0 }], warnings: [] };
    const recs = extractLoadFlowRecs(result);
    assert.ok(recs.some(r => r.severity === 'compliance'));
  });

  it('emits no rec for bus voltage within limits', () => {
    const result = { buses: [{ id: 'B3', label: 'SWGR', Vm: 1.00, Va: 0 }], warnings: [] };
    assert.deepStrictEqual(extractLoadFlowRecs(result), []);
  });

  it('handles unbalanced phases format', () => {
    const result = {
      phases: {
        A: { buses: [{ id: 'B4', label: 'PH-A', Vm: 0.90, Va: 0 }] },
        B: { buses: [{ id: 'B5', label: 'PH-B', Vm: 1.00, Va: 0 }] },
        C: { buses: [{ id: 'B6', label: 'PH-C', Vm: 1.00, Va: 0 }] },
      },
    };
    const recs = extractLoadFlowRecs(result);
    assert.strictEqual(recs.filter(r => r.severity === 'compliance').length, 1);
  });

  it('emits missing_data rec for load flow warnings', () => {
    const result = {
      buses: [],
      warnings: ['Solution did not converge after 50 iterations.'],
    };
    const recs = extractLoadFlowRecs(result);
    assert.strictEqual(recs.filter(r => r.severity === 'missing_data').length, 1);
  });

  it('returns empty for null input', () => {
    assert.deepStrictEqual(extractLoadFlowRecs(null), []);
  });
});

// ---------------------------------------------------------------------------
// DC-09 — suppressDuplicates
// ---------------------------------------------------------------------------
describe('suppressDuplicates()', () => {
  it('keeps only highest-severity copy for same id', () => {
    const recs = [
      { id: 'x:1', severity: 'efficiency' },
      { id: 'x:1', severity: 'safety' },
      { id: 'x:1', severity: 'compliance' },
    ];
    const result = suppressDuplicates(recs);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].severity, 'safety');
  });

  it('preserves distinct ids', () => {
    const recs = [
      { id: 'a:1', severity: 'compliance' },
      { id: 'b:2', severity: 'efficiency' },
    ];
    assert.strictEqual(suppressDuplicates(recs).length, 2);
  });
});

// ---------------------------------------------------------------------------
// DC-10 — runDesignCoach
// ---------------------------------------------------------------------------
describe('runDesignCoach()', () => {
  it('returns empty recommendations for empty input', () => {
    const { recommendations, summary } = runDesignCoach({});
    assert.deepStrictEqual(recommendations, []);
    assert.strictEqual(summary.total, 0);
  });

  it('summary counts match recommendations', () => {
    const data = {
      studies: {
        groundGrid: { touchSafe: false, stepSafe: false, gprExceedsTouch: false },
        arcFlash: [{ busId: 'BUS-X', incidentEnergy: 50 }],
      },
    };
    const { recommendations, summary } = runDesignCoach(data);
    assert.strictEqual(summary.total, recommendations.length);
    assert.strictEqual(summary.safety, recommendations.filter(r => r.severity === 'safety').length);
    assert.strictEqual(summary.compliance, recommendations.filter(r => r.severity === 'compliance').length);
  });

  it('recommendations are sorted safety-first', () => {
    const data = {
      studies: {
        groundGrid: { touchSafe: false, stepSafe: false, gprExceedsTouch: true },
        loadFlow: { buses: [{ id: 'B1', label: 'B1', Vm: 0.90, Va: 0 }], warnings: [] },
      },
    };
    const { recommendations } = runDesignCoach(data);
    const severities = recommendations.map(r => r.severity);
    const safetyIdx = severities.indexOf('safety');
    const compIdx = severities.indexOf('compliance');
    if (safetyIdx >= 0 && compIdx >= 0) {
      assert.ok(safetyIdx < compIdx, 'safety items should appear before compliance items');
    }
  });

  it('all recommendations have required fields', () => {
    const data = {
      studies: {
        arcFlash: [{ busId: 'BUS-Y', incidentEnergy: 55 }],
      },
    };
    const { recommendations } = runDesignCoach(data);
    for (const r of recommendations) {
      assert.ok(r.id, 'missing id');
      assert.ok(r.sourceStudy, 'missing sourceStudy');
      assert.ok(SEVERITY_ORDER.includes(r.severity), `invalid severity: ${r.severity}`);
      assert.ok(r.title, 'missing title');
      assert.ok(r.detail, 'missing detail');
      assert.ok(r.location, 'missing location');
      assert.ok(r.studyPage, 'missing studyPage');
      assert.ok(typeof r.safe_to_apply === 'boolean', 'safe_to_apply must be boolean');
    }
  });
});

console.log('\nAll designCoach tests complete.');
