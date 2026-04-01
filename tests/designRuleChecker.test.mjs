/**
 * Tests for analysis/designRuleChecker.mjs
 *
 * Covers:
 *   DRC-01 — Tray fill limit (NEC 392.22(A))
 *   DRC-02 — Voltage segregation (NEC 392.6(H))
 *   DRC-03 — Ampacity derating (NEC 310.15)
 *   DRC-04 — Grounding conductor (NEC 250.122)
 *   DRC-05 — Unrouted cables
 *   DRC-06 — Structured cabling EMI segregation (TIA-568.0-D §4.5)
 *   Summary counts and passed flag
 *   formatDrcReport output
 */
import assert from 'assert';
import {
  runDRC,
  trayFillPercent,
  traySlotFillPercent,
  formatDrcReport,
  DRC_SEVERITY,
} from '../analysis/designRuleChecker.mjs';

function describe(name, fn) { console.log(name); fn(); }
function it(name, fn) {
  try { fn(); console.log('  \u2713', name); }
  catch (err) { console.error('  \u2717', name, err.message || err); process.exitCode = 1; }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeTray(id, fillSqIn, widthIn = 12, depthIn = 4, opts = {}) {
  return {
    tray_id: id,
    inside_width: widthIn,
    tray_depth: depthIn,
    current_fill: fillSqIn,
    allowed_cable_group: opts.allowed_cable_group ?? '',
    ...opts,
  };
}

function makeCable(name, opts = {}) {
  return {
    name,
    cable_type: opts.cable_type ?? 'Power',
    conductors: opts.conductors ?? 3,
    conductor_size: opts.conductor_size ?? '#4 AWG',
    ampacity: opts.ampacity ?? null,
    design_current: opts.design_current ?? null,
    allowed_cable_group: opts.allowed_cable_group ?? '',
    ground_size: opts.ground_size ?? null,
    ...opts,
  };
}

// ---------------------------------------------------------------------------
// trayFillPercent helper
// ---------------------------------------------------------------------------
describe('trayFillPercent()', () => {
  it('returns correct percentage', () => {
    // 12" × 4" = 48 in²; fill = 19.2 in² → 40 %
    const tray = makeTray('T1', 19.2, 12, 4);
    const pct = trayFillPercent(tray);
    assert.ok(Math.abs(pct - 40) < 0.01, `Expected 40, got ${pct}`);
  });

  it('returns null when dimensions missing', () => {
    const tray = { tray_id: 'T1', current_fill: 10 }; // no width/depth
    assert.strictEqual(trayFillPercent(tray), null);
  });

  it('accepts override fill value', () => {
    const tray = makeTray('T1', 0, 12, 4);
    const pct = trayFillPercent(tray, 24); // 24 / 48 = 50 %
    assert.ok(Math.abs(pct - 50) < 0.01, `Expected 50, got ${pct}`);
  });

  it('halves effective area for a 2-slot compartmented tray', () => {
    // 12" × 4" = 48 in² total; 2 slots → 24 in² per slot
    // fill = 9.6 in² → 9.6 / 24 = 40 %  (same fill that would be 20 % undivided)
    const tray = { ...makeTray('T1', 9.6, 12, 4), num_slots: 2 };
    const pct = trayFillPercent(tray);
    assert.ok(Math.abs(pct - 40) < 0.01, `Expected 40, got ${pct}`);
  });
});

// ---------------------------------------------------------------------------
// DRC-01 — Tray fill
// ---------------------------------------------------------------------------
describe('DRC-01 Tray Fill', () => {
  it('raises ERROR when fill > 40 %', () => {
    // 12" × 4" = 48 in²; 40 % = 19.2; use 20 in² → 41.7 %
    const trays = [makeTray('T1', 20, 12, 4)];
    const { findings, summary } = runDRC({ trays, cables: [], trayCableMap: {} });
    const drc01 = findings.filter(f => f.ruleId === 'DRC-01');
    assert.ok(drc01.length > 0, 'Expected DRC-01 finding');
    assert.strictEqual(drc01[0].severity, DRC_SEVERITY.ERROR);
    assert.ok(summary.errors >= 1);
  });

  it('raises WARNING when fill is 36–40 %', () => {
    // 37.5 % = 18 in² of 48 in²
    const trays = [makeTray('T1', 18, 12, 4)];
    const { findings } = runDRC({ trays, cables: [], trayCableMap: {} });
    const warns = findings.filter(f => f.ruleId === 'DRC-01' && f.severity === DRC_SEVERITY.WARNING);
    assert.ok(warns.length > 0, 'Expected DRC-01 WARNING for near-limit fill');
  });

  it('no finding when fill is within limit', () => {
    // 30 % = 14.4 in²
    const trays = [makeTray('T1', 14.4, 12, 4)];
    const { findings } = runDRC({ trays, cables: [], trayCableMap: {} });
    const drc01 = findings.filter(f => f.ruleId === 'DRC-01');
    assert.strictEqual(drc01.length, 0);
  });

  it('respects custom fillLimit option', () => {
    // 45 % normally OK at 40 % limit, but should ERROR at 44 % custom limit
    const trays = [makeTray('T1', 21.6, 12, 4)]; // 21.6/48 = 45 %
    const { findings } = runDRC(
      { trays, cables: [], trayCableMap: {} },
      { fillLimit: 0.44 }
    );
    const drc01 = findings.filter(f => f.ruleId === 'DRC-01' && f.severity === DRC_SEVERITY.ERROR);
    assert.ok(drc01.length > 0, 'Expected ERROR with custom limit 44 %');
  });
});

// ---------------------------------------------------------------------------
// DRC-02 — Voltage segregation
// ---------------------------------------------------------------------------
describe('DRC-02 Voltage Segregation', () => {
  it('flags mixed cable groups in same tray', () => {
    const trays = [makeTray('T1', 10, 12, 4, { allowed_cable_group: 'HV' })];
    const cable1 = { name: 'C1', allowed_cable_group: 'HV' };
    const cable2 = { name: 'C2', allowed_cable_group: 'LV' };
    const { findings } = runDRC({
      trays,
      cables: [],
      trayCableMap: { T1: [cable1, cable2] },
    });
    const drc02 = findings.filter(f => f.ruleId === 'DRC-02');
    assert.ok(drc02.length > 0, 'Expected DRC-02 finding');
    assert.strictEqual(drc02[0].severity, DRC_SEVERITY.ERROR);
  });

  it('no finding when all cables share same group', () => {
    const trays = [makeTray('T1', 5, 12, 4, { allowed_cable_group: 'LV' })];
    const cable1 = { name: 'C1', allowed_cable_group: 'LV' };
    const cable2 = { name: 'C2', allowed_cable_group: 'LV' };
    const { findings } = runDRC({
      trays,
      cables: [],
      trayCableMap: { T1: [cable1, cable2] },
    });
    const drc02 = findings.filter(f => f.ruleId === 'DRC-02');
    assert.strictEqual(drc02.length, 0);
  });

  it('ignores cables with no group assigned', () => {
    const trays = [makeTray('T1', 5)];
    const cable1 = { name: 'C1', allowed_cable_group: '' };
    const cable2 = { name: 'C2', allowed_cable_group: '' };
    const { findings } = runDRC({
      trays,
      cables: [],
      trayCableMap: { T1: [cable1, cable2] },
    });
    const drc02 = findings.filter(f => f.ruleId === 'DRC-02');
    assert.strictEqual(drc02.length, 0, 'Should not flag cables with no group');
  });
});

// ---------------------------------------------------------------------------
// DRC-03 — Ampacity
// ---------------------------------------------------------------------------
describe('DRC-03 Ampacity Derating', () => {
  it('raises ERROR when design current exceeds derated ampacity', () => {
    // 7 conductors → 80 % derating factor
    // Baseline #4 AWG 75°C Cu = 85 A; 85 × 0.80 = 68 A
    // Design current = 80 A → over derated limit
    const cables = [makeCable('C1', { conductor_size: '#4 AWG', design_current: 80 })];
    const tray1Cables = Array.from({ length: 2 }, (_, i) =>
      ({ name: `X${i}`, cable_type: 'Power', conductors: 3 })
    );
    const trayCableMap = {
      // 3 conductors from cable C1 + 6 from tray1Cables = 9 → 0.70 factor
      // Actually let's put 4 power cables × 3 conductors = 12 conductors → 0.50
      T1: [
        { name: 'C1', cable_type: 'Power', conductors: 3 },
        { name: 'C2', cable_type: 'Power', conductors: 3 },
        { name: 'C3', cable_type: 'Power', conductors: 3 },
        { name: 'C4', cable_type: 'Power', conductors: 3 },
      ],
    };
    const allCables = [
      makeCable('C1', { conductor_size: '#4 AWG', design_current: 80 }),
      makeCable('C2'), makeCable('C3'), makeCable('C4'),
    ];
    const trays = [makeTray('T1', 5)];
    const { findings } = runDRC({ trays, cables: allCables, trayCableMap });
    // 12 conductors → factor 0.50; 85 × 0.50 = 42.5 A; design = 80 A → ERROR
    const drc03errors = findings.filter(f => f.ruleId === 'DRC-03' && f.severity === DRC_SEVERITY.ERROR);
    assert.ok(drc03errors.length > 0, 'Expected DRC-03 ERROR for ampacity exceedance');
  });

  it('can be skipped via skipAmpacity option', () => {
    const cables = [makeCable('C1', { design_current: 200 })];
    const trayCableMap = { T1: [{ name: 'C1', cable_type: 'Power', conductors: 3 }] };
    const { findings } = runDRC(
      { trays: [makeTray('T1', 0)], cables, trayCableMap },
      { skipAmpacity: true }
    );
    const drc03 = findings.filter(f => f.ruleId === 'DRC-03');
    assert.strictEqual(drc03.length, 0, 'DRC-03 should be skipped');
  });
});

// ---------------------------------------------------------------------------
// DRC-04 — Grounding
// ---------------------------------------------------------------------------
describe('DRC-04 Grounding', () => {
  it('raises WARNING for power cable with no ground defined', () => {
    const cables = [makeCable('C1', { cable_type: 'Power', ground_size: null })];
    const { findings } = runDRC({ trays: [], cables, trayCableMap: {} });
    const drc04 = findings.filter(f => f.ruleId === 'DRC-04');
    assert.ok(drc04.length > 0, 'Expected DRC-04 WARNING');
    assert.strictEqual(drc04[0].severity, DRC_SEVERITY.WARNING);
  });

  it('no finding when ground_size is set', () => {
    const cables = [makeCable('C1', { cable_type: 'Power', ground_size: '4' })];
    const { findings } = runDRC({ trays: [], cables, trayCableMap: {} });
    const drc04 = findings.filter(f => f.ruleId === 'DRC-04');
    assert.strictEqual(drc04.length, 0);
  });

  it('skips non-power cables', () => {
    const cables = [makeCable('C1', { cable_type: 'Control', ground_size: null })];
    const { findings } = runDRC({ trays: [], cables, trayCableMap: {} });
    const drc04 = findings.filter(f => f.ruleId === 'DRC-04');
    assert.strictEqual(drc04.length, 0);
  });

  it('can be skipped via skipGrounding option', () => {
    const cables = [makeCable('C1', { cable_type: 'Power' })];
    const { findings } = runDRC({ trays: [], cables, trayCableMap: {} }, { skipGrounding: true });
    const drc04 = findings.filter(f => f.ruleId === 'DRC-04');
    assert.strictEqual(drc04.length, 0);
  });
});

// ---------------------------------------------------------------------------
// DRC-05 — Unrouted cables
// ---------------------------------------------------------------------------
describe('DRC-05 Unrouted Cables', () => {
  it('flags cables not present in trayCableMap', () => {
    const cables = [makeCable('C1'), makeCable('C2')];
    const trayCableMap = { T1: [{ name: 'C1' }] }; // C2 not routed
    const { findings } = runDRC({ trays: [], cables, trayCableMap });
    const drc05 = findings.filter(f => f.ruleId === 'DRC-05');
    assert.ok(drc05.some(f => f.location === 'C2'), 'Expected DRC-05 for C2');
    assert.ok(!drc05.some(f => f.location === 'C1'), 'C1 should not be flagged');
  });

  it('considers routedCableNames for field-routed cables', () => {
    const cables = [makeCable('C1')];
    const { findings } = runDRC({
      trays: [],
      cables,
      trayCableMap: {},
      routedCableNames: new Set(['C1']),
    });
    const drc05 = findings.filter(f => f.ruleId === 'DRC-05');
    assert.strictEqual(drc05.length, 0, 'Field-routed cable should not be flagged');
  });
});

// ---------------------------------------------------------------------------
// Summary and overall pass/fail
// ---------------------------------------------------------------------------
describe('Summary', () => {
  it('passed=true when no errors', () => {
    const { summary } = runDRC({ trays: [], cables: [], trayCableMap: {} });
    assert.strictEqual(summary.passed, true);
    assert.strictEqual(summary.errors, 0);
  });

  it('passed=false when errors exist', () => {
    const trays = [makeTray('T1', 30, 12, 4)]; // 62.5 % fill → ERROR
    const { summary } = runDRC({ trays, cables: [], trayCableMap: {} });
    assert.strictEqual(summary.passed, false);
    assert.ok(summary.errors > 0);
  });

  it('counts all severities correctly', () => {
    // One fill error, one unrouted info
    const trays = [makeTray('T1', 25, 12, 4)]; // >40 % → error
    const cables = [makeCable('C_unrouted')];
    const { summary } = runDRC({
      trays,
      cables,
      trayCableMap: {},
    }, { skipGrounding: true, skipAmpacity: true });
    assert.ok(summary.errors >= 1, 'Expected at least 1 error');
    assert.ok(summary.info >= 1,   'Expected at least 1 info (unrouted cable)');
    assert.strictEqual(summary.total, summary.errors + summary.warnings + summary.info);
  });
});

// ---------------------------------------------------------------------------
// formatDrcReport
// ---------------------------------------------------------------------------
describe('formatDrcReport()', () => {
  it('includes PASSED in output when no errors', () => {
    const result = runDRC({ trays: [], cables: [], trayCableMap: {} });
    const report = formatDrcReport(result);
    assert.ok(report.includes('PASSED'), 'Report should include PASSED');
  });

  it('includes FAILED when errors present', () => {
    const trays = [makeTray('T1', 25, 12, 4)];
    const result = runDRC({ trays, cables: [], trayCableMap: {} });
    const report = formatDrcReport(result);
    assert.ok(report.includes('FAILED'), 'Report should include FAILED');
    assert.ok(report.includes('DRC-01'), 'Report should include DRC-01');
  });

  it('includes rule references', () => {
    const trays = [makeTray('T1', 25, 12, 4)];
    const result = runDRC({ trays, cables: [], trayCableMap: {} });
    const report = formatDrcReport(result);
    assert.ok(report.includes('NEC 392.22'), 'Report should cite NEC reference');
  });

  it('includes remediation guidance in formatted report', () => {
    const cables = [makeCable('UnroutedCable')];
    const result = runDRC({ trays: [], cables, trayCableMap: {} });
    const report = formatDrcReport(result);
    assert.ok(report.includes('HOW TO FIX'), 'Report should include HOW TO FIX section');
    assert.ok(report.includes('Optimal Route'), 'Should mention Optimal Route page in guidance');
  });
});

// ---------------------------------------------------------------------------
// Remediation field presence
// ---------------------------------------------------------------------------
describe('Remediation guidance', () => {
  it('DRC-01 finding includes non-empty remediation text', () => {
    const trays = [makeTray('T1', 25, 12, 4)]; // >40% fill → error
    const { findings } = runDRC({ trays, cables: [], trayCableMap: {} });
    const drc01 = findings.find(f => f.ruleId === 'DRC-01');
    assert.ok(drc01, 'Expected DRC-01 finding');
    assert.ok(typeof drc01.remediation === 'string' && drc01.remediation.length > 0,
      'DRC-01 finding should have non-empty remediation');
  });

  it('DRC-02 finding includes remediation text', () => {
    const trays = [makeTray('T1', 10, 12, 4, { allowed_cable_group: 'HV' })];
    const { findings } = runDRC({
      trays, cables: [],
      trayCableMap: { T1: [{ name: 'C1', allowed_cable_group: 'HV' }, { name: 'C2', allowed_cable_group: 'LV' }] },
    });
    const drc02 = findings.find(f => f.ruleId === 'DRC-02');
    assert.ok(drc02, 'Expected DRC-02 finding');
    assert.ok(typeof drc02.remediation === 'string' && drc02.remediation.length > 0,
      'DRC-02 finding should have non-empty remediation');
  });

  it('DRC-04 finding includes remediation text', () => {
    const cables = [makeCable('C1', { cable_type: 'Power', ground_size: null })];
    const { findings } = runDRC({ trays: [], cables, trayCableMap: {} });
    const drc04 = findings.find(f => f.ruleId === 'DRC-04');
    assert.ok(drc04, 'Expected DRC-04 finding');
    assert.ok(typeof drc04.remediation === 'string' && drc04.remediation.length > 0,
      'DRC-04 finding should have non-empty remediation');
  });

  it('DRC-05 finding includes remediation text', () => {
    const cables = [makeCable('UnroutedCable')];
    const { findings } = runDRC({ trays: [], cables, trayCableMap: {} });
    const drc05 = findings.find(f => f.ruleId === 'DRC-05');
    assert.ok(drc05, 'Expected DRC-05 finding');
    assert.ok(typeof drc05.remediation === 'string' && drc05.remediation.length > 0,
      'DRC-05 finding should have non-empty remediation');
  });
});

// ---------------------------------------------------------------------------
// runDRC — accepted findings
// ---------------------------------------------------------------------------
describe('runDRC — accepted findings', () => {
  it('marks a finding as accepted when its key matches acceptedFindings option', () => {
    // 12" × 4" = 48 in²; 20 in² → 41.7 % → triggers DRC-01 ERROR
    const trays = [makeTray('T1', 20, 12, 4)];
    const result = runDRC({ trays, cables: [], trayCableMap: {} }, {
      acceptedFindings: [{ key: 'DRC-01:T1', ruleId: 'DRC-01', location: 'T1', note: 'Approved per EE-001' }],
    });
    const finding = result.findings.find(f => f.ruleId === 'DRC-01' && f.location === 'T1');
    assert.ok(finding, 'DRC-01 finding should exist');
    assert.strictEqual(finding.isAccepted, true);
    assert.strictEqual(finding.acceptanceNote, 'Approved per EE-001');
  });

  it('summary.passed is true when all errors are accepted', () => {
    const trays = [makeTray('T1', 20, 12, 4)];
    const result = runDRC({ trays, cables: [], trayCableMap: {} }, {
      acceptedFindings: [{ key: 'DRC-01:T1', ruleId: 'DRC-01', location: 'T1', note: 'OK' }],
    });
    assert.strictEqual(result.summary.errors, 0);
    assert.strictEqual(result.summary.accepted, 1);
    assert.strictEqual(result.summary.passed, true);
  });

  it('summary.accepted counts only accepted findings, unaccepted errors remain', () => {
    const trays = [
      makeTray('T1', 20, 12, 4), // overfill → DRC-01 ERROR
      makeTray('T2', 20, 12, 4), // overfill → DRC-01 ERROR
    ];
    const result = runDRC({ trays, cables: [], trayCableMap: {} }, {
      acceptedFindings: [{ key: 'DRC-01:T1', ruleId: 'DRC-01', location: 'T1', note: 'OK' }],
    });
    assert.strictEqual(result.summary.accepted, 1);
    assert.strictEqual(result.summary.errors, 1);   // T2 still an error
    assert.strictEqual(result.summary.passed, false);
  });

  it('non-matching key does not mark finding as accepted', () => {
    const trays = [makeTray('T1', 20, 12, 4)];
    const result = runDRC({ trays, cables: [], trayCableMap: {} }, {
      acceptedFindings: [{ key: 'DRC-01:T9', ruleId: 'DRC-01', location: 'T9', note: 'Wrong tray' }],
    });
    const finding = result.findings.find(f => f.ruleId === 'DRC-01');
    assert.strictEqual(finding.isAccepted, false);
  });
});

// ---------------------------------------------------------------------------
// traySlotFillPercent helper
// ---------------------------------------------------------------------------
describe('traySlotFillPercent()', () => {
  it('returns correct percentage for slot in a 2-slot tray', () => {
    // 12" × 4" = 48 in² total; 2 slots → 24 in² per slot
    // slot 0 fill = 12 in² → 50 %
    const tray = makeTray('T1', 0, 12, 4, { num_slots: 2 });
    const pct = traySlotFillPercent(tray, 0, 12);
    assert.ok(Math.abs(pct - 50) < 0.01, `Expected 50, got ${pct}`);
  });

  it('returns null for invalid slot index', () => {
    const tray = makeTray('T1', 0, 12, 4, { num_slots: 2 });
    assert.strictEqual(traySlotFillPercent(tray, 5, 0), null);
    assert.strictEqual(traySlotFillPercent(tray, -1, 0), null);
  });

  it('returns null when tray dimensions are missing', () => {
    const tray = { tray_id: 'T1', num_slots: 2 };
    assert.strictEqual(traySlotFillPercent(tray, 0, 5), null);
  });

  it('works correctly for a single-slot tray (same as trayFillPercent)', () => {
    // 12" × 4" = 48 in²; fill = 24 in² → 50 %
    const tray = makeTray('T1', 0, 12, 4, { num_slots: 1 });
    const pct = traySlotFillPercent(tray, 0, 24);
    assert.ok(Math.abs(pct - 50) < 0.01, `Expected 50, got ${pct}`);
  });
});

// ---------------------------------------------------------------------------
// DRC-01 per-slot fill checks
// ---------------------------------------------------------------------------
describe('DRC-01 Per-Slot Fill', () => {
  it('raises ERROR for an overfilled individual slot in a 2-slot tray', () => {
    // 12" × 4" = 48 in²; 2 slots → 24 in² per slot; 40 % limit = 9.6 in²
    // slot 0: 15 in² → 62.5 % (overfilled), slot 1: 0 in²
    const tray = {
      ...makeTray('T_SLOT', 0, 12, 4),
      num_slots: 2,
      slotFills: [15, 0],
    };
    const { findings } = runDRC({ trays: [tray], cables: [], trayCableMap: {} });
    const drc01 = findings.filter(f => f.ruleId === 'DRC-01' && f.severity === DRC_SEVERITY.ERROR);
    assert.ok(drc01.length > 0, 'Expected DRC-01 ERROR for overfilled slot 0');
    assert.ok(drc01[0].location.includes('T_SLOT'), 'Finding location should reference the tray');
  });

  it('no ERROR when only slot 1 is within limit in a 2-slot tray', () => {
    // slot 0: 5 in² → 20.8 %, slot 1: 5 in² → 20.8 % — both fine
    const tray = {
      ...makeTray('T_SLOT2', 0, 12, 4),
      num_slots: 2,
      slotFills: [5, 5],
    };
    const { findings } = runDRC({ trays: [tray], cables: [], trayCableMap: {} });
    const drc01 = findings.filter(f => f.ruleId === 'DRC-01' && f.severity === DRC_SEVERITY.ERROR);
    assert.strictEqual(drc01.length, 0);
  });
});

// ---------------------------------------------------------------------------
// DRC-02 multi-slot tray suppression
// ---------------------------------------------------------------------------
describe('DRC-02 Multi-Slot Tray Suppression', () => {
  it('does NOT raise DRC-02 for a 2-slot tray with a valid slot_groups mapping', () => {
    const tray = makeTray('T_COMP', 10, 12, 4, {
      num_slots: 2,
      slot_groups: '{"0":"power","1":"instrument"}',
    });
    const cable1 = { name: 'C1', allowed_cable_group: 'power' };
    const cable2 = { name: 'C2', allowed_cable_group: 'instrument' };
    const { findings } = runDRC({
      trays: [tray],
      cables: [],
      trayCableMap: { T_COMP: [cable1, cable2] },
    });
    const drc02 = findings.filter(f => f.ruleId === 'DRC-02');
    assert.strictEqual(drc02.length, 0,
      'DRC-02 should be suppressed for compartmented tray with valid slot_groups');
  });

  it('still raises DRC-02 for a 2-slot tray with no slot_groups mapping', () => {
    const tray = makeTray('T_NOMAP', 10, 12, 4, { num_slots: 2 });
    const cable1 = { name: 'C1', allowed_cable_group: 'power' };
    const cable2 = { name: 'C2', allowed_cable_group: 'instrument' };
    const { findings } = runDRC({
      trays: [tray],
      cables: [],
      trayCableMap: { T_NOMAP: [cable1, cable2] },
    });
    const drc02 = findings.filter(f => f.ruleId === 'DRC-02');
    assert.ok(drc02.length > 0,
      'DRC-02 should still fire for a multi-slot tray without slot_groups');
  });

  it('still raises DRC-02 for a single-slot tray even with mixed groups', () => {
    const tray = makeTray('T_SINGLE', 10, 12, 4, { num_slots: 1 });
    const cable1 = { name: 'C1', allowed_cable_group: 'power' };
    const cable2 = { name: 'C2', allowed_cable_group: 'instrument' };
    const { findings } = runDRC({
      trays: [tray],
      cables: [],
      trayCableMap: { T_SINGLE: [cable1, cable2] },
    });
    const drc02 = findings.filter(f => f.ruleId === 'DRC-02');
    assert.ok(drc02.length > 0, 'DRC-02 should fire for single-slot tray with mixed groups');
  });
});

// ---------------------------------------------------------------------------
// formatDrcReport — accepted risk section
// ---------------------------------------------------------------------------
describe('formatDrcReport() — accepted risk section', () => {
  it('includes accepted risk section header and note when findings are accepted', () => {
    const trays = [makeTray('T1', 20, 12, 4)];
    const result = runDRC({ trays, cables: [], trayCableMap: {} }, {
      acceptedFindings: [{
        key: 'DRC-01:T1',
        ruleId: 'DRC-01',
        location: 'T1',
        note: 'Approved per ENG-042',
        reviewedBy: 'J. Smith, PE',
        acceptedAt: '2026-03-30T00:00:00.000Z',
      }],
    });
    const report = formatDrcReport(result);
    assert.ok(report.includes('Accepted Risk'), 'Report should include accepted risk section header');
    assert.ok(report.includes('Approved per ENG-042'), 'Report should include the engineering note');
    assert.ok(report.includes('J. Smith, PE'), 'Report should include the reviewer name');
  });

  it('omits accepted risk section when no findings are accepted', () => {
    const result = runDRC({ trays: [], cables: [], trayCableMap: {} });
    const report = formatDrcReport(result);
    assert.ok(!report.includes('Accepted Risk'), 'Report should not include accepted risk section when none exist');
  });
});

// ---------------------------------------------------------------------------
// DRC-06 — Structured cabling EMI segregation (TIA-568.0-D §4.5)
// ---------------------------------------------------------------------------
describe('DRC-06 — Structured cabling EMI segregation', () => {
  it('fires WARNING when a Data cable shares a tray with a Power cable', () => {
    const trayCableMap = {
      'TRAY-MIXED': [
        makeCable('PWR-001', { cable_type: 'Power' }),
        makeCable('DATA-001', { cable_type: 'Data' }),
      ],
    };
    const { findings } = runDRC({
      trays: [makeTray('TRAY-MIXED', 0)],
      cables: [],
      trayCableMap,
    });
    const drc06 = findings.filter(f => f.ruleId === 'DRC-06');
    assert.strictEqual(drc06.length, 1, 'Expected exactly 1 DRC-06 finding');
    assert.strictEqual(drc06[0].severity, DRC_SEVERITY.WARNING, 'DRC-06 should be WARNING severity');
    assert.ok(drc06[0].location === 'TRAY-MIXED', 'Location should be the tray ID');
  });

  it('fires WARNING when a Fiber cable shares a tray with a Power cable', () => {
    const trayCableMap = {
      'TRAY-FIBER-PWR': [
        makeCable('FIBER-SPINE-01', { cable_type: 'Fiber' }),
        makeCable('PWR-FEED-A', { cable_type: 'Power' }),
      ],
    };
    const { findings } = runDRC({
      trays: [makeTray('TRAY-FIBER-PWR', 0)],
      cables: [],
      trayCableMap,
    });
    const drc06 = findings.filter(f => f.ruleId === 'DRC-06');
    assert.strictEqual(drc06.length, 1, 'Expected 1 DRC-06 for Fiber + Power mixing');
    assert.ok(drc06[0].message.includes('FIBER-SPINE-01'), 'Message should name the structured cable');
  });

  it('does NOT fire when only Data cables share a tray (no power)', () => {
    const trayCableMap = {
      'TRAY-DATA-ONLY': [
        makeCable('DATA-001', { cable_type: 'Data' }),
        makeCable('FIBER-001', { cable_type: 'Fiber' }),
      ],
    };
    const { findings } = runDRC({
      trays: [makeTray('TRAY-DATA-ONLY', 0)],
      cables: [],
      trayCableMap,
    });
    const drc06 = findings.filter(f => f.ruleId === 'DRC-06');
    assert.strictEqual(drc06.length, 0, 'No DRC-06 when tray has only structured cabling');
  });

  it('does NOT fire when Power and Control cables share a tray (covered by DRC-02)', () => {
    const trayCableMap = {
      'TRAY-PWR-CTRL': [
        makeCable('PWR-001', { cable_type: 'Power', allowed_cable_group: 'power' }),
        makeCable('CTRL-001', { cable_type: 'Control', allowed_cable_group: 'control' }),
      ],
    };
    const { findings } = runDRC({
      trays: [makeTray('TRAY-PWR-CTRL', 0)],
      cables: [],
      trayCableMap,
    });
    const drc06 = findings.filter(f => f.ruleId === 'DRC-06');
    assert.strictEqual(drc06.length, 0, 'DRC-06 should not fire for Power + Control (only Power + Data/Fiber)');
  });

  it('does NOT fire when a single cable is in the tray', () => {
    const trayCableMap = {
      'TRAY-SINGLE': [makeCable('DATA-001', { cable_type: 'Data' })],
    };
    const { findings } = runDRC({
      trays: [makeTray('TRAY-SINGLE', 0)],
      cables: [],
      trayCableMap,
    });
    const drc06 = findings.filter(f => f.ruleId === 'DRC-06');
    assert.strictEqual(drc06.length, 0, 'No DRC-06 for a single-cable tray');
  });

  it('fires once per mixed tray even with multiple structured cables', () => {
    const trayCableMap = {
      'TRAY-MULTI-DATA': [
        makeCable('PWR-001', { cable_type: 'Power' }),
        makeCable('DATA-001', { cable_type: 'Data' }),
        makeCable('DATA-002', { cable_type: 'Data' }),
        makeCable('FIBER-001', { cable_type: 'Fiber' }),
      ],
    };
    const { findings } = runDRC({
      trays: [makeTray('TRAY-MULTI-DATA', 0)],
      cables: [],
      trayCableMap,
    });
    const drc06 = findings.filter(f => f.ruleId === 'DRC-06');
    assert.strictEqual(drc06.length, 1, 'Exactly one DRC-06 per tray regardless of cable count');
    assert.ok(drc06[0].message.includes('DATA-001'), 'Message lists first structured cable');
  });

  it('DRC-06 finding includes non-empty remediation text', () => {
    const trayCableMap = {
      'TRAY-REM': [
        makeCable('PWR-X', { cable_type: 'Power' }),
        makeCable('CAT6A-X', { cable_type: 'Data' }),
      ],
    };
    const { findings } = runDRC({
      trays: [makeTray('TRAY-REM', 0)],
      cables: [],
      trayCableMap,
    });
    const drc06 = findings.find(f => f.ruleId === 'DRC-06');
    assert.ok(drc06, 'Expected a DRC-06 finding');
    assert.ok(typeof drc06.remediation === 'string' && drc06.remediation.length > 0,
      'DRC-06 finding should have non-empty remediation text');
    assert.ok(drc06.reference.includes('TIA-568'),
      'DRC-06 reference should cite TIA-568');
  });
});
