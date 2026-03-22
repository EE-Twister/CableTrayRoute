/**
 * Tests for analysis/designRuleChecker.mjs
 *
 * Covers:
 *   DRC-01 — Tray fill limit (NEC 392.22(A))
 *   DRC-02 — Voltage segregation (NEC 392.6(H))
 *   DRC-03 — Ampacity derating (NEC 310.15)
 *   DRC-04 — Grounding conductor (NEC 250.122)
 *   DRC-05 — Unrouted cables
 *   Summary counts and passed flag
 *   formatDrcReport output
 */
import assert from 'assert';
import {
  runDRC,
  trayFillPercent,
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
});
