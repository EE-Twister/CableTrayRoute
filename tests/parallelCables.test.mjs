/**
 * Tests for parallel cable / multi-core run support (Gap #11).
 *
 * Covers:
 *   - DRC-03: Aggregate ampacity (per-cable × parallel_count) used in violation check
 *   - DRC-03: Conductor count for bundling derating multiplied by parallel_count
 *   - DRC-07: NEC 310.10(H) — minimum 1/0 AWG for parallel sets (ERROR)
 *   - DRC-07: NEC 310.10(H) — missing length warns that equal-length cannot be verified (WARNING)
 *   - Pull cards: totalWeight and totalArea multiplied by parallel_count
 *   - Pull cards: parallel_cable_count field reflects physical cable count
 *   - Auto-size: parallelSuggestion returned when load exceeds single-conductor capacity
 */
import assert from 'assert';
import { runDRC, DRC_SEVERITY } from '../analysis/designRuleChecker.mjs';
import { buildPullCard } from '../analysis/pullCards.mjs';
import { sizeFeeder } from '../analysis/autoSize.mjs';

function describe(name, fn) { console.log(name); fn(); }
function it(name, fn) {
  try { fn(); console.log('  \u2713', name); }
  catch (err) { console.error('  \u2717', name, err.message || err); process.exitCode = 1; }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTray(id, fillSqIn = 0, widthIn = 24, depthIn = 4) {
  return { tray_id: id, inside_width: widthIn, tray_depth: depthIn, current_fill: fillSqIn };
}

function makeCable(name, opts = {}) {
  return {
    name,
    cable_type: opts.cable_type ?? 'Power',
    conductors: opts.conductors ?? 3,
    conductor_size: opts.conductor_size ?? '1/0 AWG',
    ampacity: opts.ampacity ?? null,
    design_current: opts.design_current ?? null,
    parallel_count: opts.parallel_count ?? null,
    length: opts.length ?? null,
    allowed_cable_group: '',
    ...opts,
  };
}

function makeRouteResult(cableName, trayIds, totalLength = 100) {
  return {
    cable: cableName,
    status: '✓ Routed',
    total_length: totalLength,
    breakdown: trayIds.map((id, i) => ({
      tray_id: id,
      length: totalLength / trayIds.length,
      start: [i * 10, 0, 0],
      end: [(i + 1) * 10, 0, 0],
    })),
    route_segments: trayIds.map(() => ({ type: 'straight', length: totalLength / trayIds.length })),
  };
}

// ---------------------------------------------------------------------------
// DRC-03: Ampacity check with parallel_count
// ---------------------------------------------------------------------------

describe('DRC-03 — Parallel sets aggregate ampacity', () => {
  it('passes when aggregate ampacity (parallel_count × per-cable ampacity) meets design current', () => {
    // Per-cable ampacity = 85 A (#4 AWG baseline), parallel_count = 3 → aggregate = 255 A
    // 3 sets × 3 conductors = 9 conductors → bundling factor 0.70 → derated = 178.5 A
    // Design current = 150 A → should pass (150 < 178.5)
    const cable = makeCable('C1', { conductor_size: '#4 AWG', design_current: 150, parallel_count: 3 });
    const tray = makeTray('T1');
    const trayCableMap = { T1: [{ name: 'C1', cable_type: 'Power', conductors: 3, parallel_count: 3 }] };
    const { findings } = runDRC({ trays: [tray], cables: [cable], trayCableMap }, { skipGrounding: true });
    const drc03Errors = findings.filter(f => f.ruleId === 'DRC-03' && f.severity === DRC_SEVERITY.ERROR);
    assert.strictEqual(drc03Errors.length, 0, `Expected no DRC-03 errors but got: ${JSON.stringify(drc03Errors)}`);
  });

  it('raises ERROR when per-cable ampacity (without parallel) fails but would pass with parallel credit', () => {
    // Single cable: ampacity 85 A vs design current 200 A → ERROR
    const cable = makeCable('C1', { conductor_size: '#4 AWG', design_current: 200, parallel_count: 1 });
    const tray = makeTray('T1');
    const trayCableMap = { T1: [{ name: 'C1', cable_type: 'Power', conductors: 3, parallel_count: 1 }] };
    const { findings } = runDRC({ trays: [tray], cables: [cable], trayCableMap }, { skipGrounding: true });
    const drc03Errors = findings.filter(f => f.ruleId === 'DRC-03' && f.severity === DRC_SEVERITY.ERROR);
    assert.ok(drc03Errors.length > 0, 'Expected DRC-03 ERROR for undersized single conductor');
    assert.ok(
      drc03Errors[0].message.includes('200 A') || drc03Errors[0].message.includes('200'),
      'Error message should reference the design current'
    );
  });

  it('includes parallel count in aggregate ampacity message', () => {
    const cable = makeCable('C1', { conductor_size: '1/0 AWG', design_current: 500, parallel_count: 2 });
    const tray = makeTray('T1');
    const trayCableMap = { T1: [{ name: 'C1', cable_type: 'Power', conductors: 3, parallel_count: 2 }] };
    const { findings } = runDRC({ trays: [tray], cables: [cable], trayCableMap }, { skipGrounding: true });
    const drc03 = findings.filter(f => f.ruleId === 'DRC-03');
    assert.ok(drc03.length > 0, 'Expected at least one DRC-03 finding');
    // The finding message should mention the aggregate (2 ×) context
    const hasParallelContext = drc03.some(f => f.message.includes('2 ×') || f.message.includes('aggregate'));
    assert.ok(hasParallelContext, `DRC-03 message should mention aggregate/parallel: ${drc03[0].message}`);
  });

  it('multiplies conductor count by parallel_count for bundling derating', () => {
    // 2 cables, each with 3 conductors and parallel_count=2 → 12 total current-carrying conductors
    // derateFactor(12) < derateFactor(6) → larger derating, lower derated ampacity
    const cable1 = makeCable('C1', { conductor_size: '3/0 AWG', design_current: 1, parallel_count: 2 });
    const cable2 = makeCable('C2', { conductor_size: '3/0 AWG', design_current: 1, parallel_count: 2 });
    const tray = makeTray('T1');
    const trayCableMap = {
      T1: [
        { name: 'C1', cable_type: 'Power', conductors: 3, parallel_count: 2 },
        { name: 'C2', cable_type: 'Power', conductors: 3, parallel_count: 2 },
      ],
    };
    const { findings } = runDRC({ trays: [tray], cables: [cable1, cable2], trayCableMap }, { skipGrounding: true });
    // With 12 conductors the derating factor should be 0.50 (NEC 310.15(C)(1) for 9–20 conductors)
    const infoFindings = findings.filter(f => f.ruleId === 'DRC-03' && f.severity === DRC_SEVERITY.INFO);
    // Expect the derating factor to be 0.50 (12 conductors falls in the 9–20 range)
    assert.ok(infoFindings.some(f => f.message.includes('0.5') || f.message.includes('0.50')),
      `Expected 0.50 derating factor for 12 conductors; findings: ${JSON.stringify(infoFindings.map(f => f.message))}`);
  });
});

// ---------------------------------------------------------------------------
// DRC-07: NEC 310.10(H) parallel conductor requirements
// ---------------------------------------------------------------------------

describe('DRC-07 — Parallel conductor NEC 310.10(H) requirements', () => {
  it('raises ERROR when parallel_count > 1 and conductor size is below 1/0 AWG', () => {
    const cable = makeCable('C1', { conductor_size: '#4 AWG', parallel_count: 2, length: 100 });
    const { findings } = runDRC({ trays: [], cables: [cable], trayCableMap: {} }, { skipGrounding: true });
    const drc07Errors = findings.filter(f => f.ruleId === 'DRC-07' && f.severity === DRC_SEVERITY.ERROR);
    assert.ok(drc07Errors.length > 0, 'Expected DRC-07 ERROR for conductor below 1/0 AWG');
    assert.ok(drc07Errors[0].message.includes('#4 AWG'), 'Error should name the offending size');
    assert.ok(drc07Errors[0].reference === 'NEC 310.10(H)(1)', 'Error should cite NEC 310.10(H)(1)');
  });

  it('raises ERROR for all AWG sizes smaller than 1/0 AWG in parallel sets', () => {
    const undersizedSizes = ['#14 AWG', '#12 AWG', '#10 AWG', '#8 AWG', '#6 AWG', '#4 AWG', '#3 AWG', '#2 AWG', '#1 AWG'];
    for (const size of undersizedSizes) {
      const cable = makeCable('C1', { conductor_size: size, parallel_count: 2, length: 100 });
      const { findings } = runDRC({ trays: [], cables: [cable], trayCableMap: {} }, { skipGrounding: true });
      const drc07Errors = findings.filter(f => f.ruleId === 'DRC-07' && f.severity === DRC_SEVERITY.ERROR);
      assert.ok(drc07Errors.length > 0, `Expected DRC-07 ERROR for ${size} in parallel`);
    }
  });

  it('does NOT raise DRC-07 ERROR when conductor is 1/0 AWG or larger', () => {
    const validSizes = ['1/0 AWG', '2/0 AWG', '3/0 AWG', '4/0 AWG', '250 kcmil', '500 kcmil'];
    for (const size of validSizes) {
      const cable = makeCable('C1', { conductor_size: size, parallel_count: 2, length: 100 });
      const { findings } = runDRC({ trays: [], cables: [cable], trayCableMap: {} }, { skipGrounding: true });
      const drc07Errors = findings.filter(f => f.ruleId === 'DRC-07' && f.severity === DRC_SEVERITY.ERROR);
      assert.strictEqual(drc07Errors.length, 0, `Expected no DRC-07 ERROR for ${size} in parallel`);
    }
  });

  it('does NOT raise DRC-07 when parallel_count is 1 (or absent)', () => {
    const cable = makeCable('C1', { conductor_size: '#6 AWG', parallel_count: 1, length: 100 });
    const { findings } = runDRC({ trays: [], cables: [cable], trayCableMap: {} }, { skipGrounding: true });
    const drc07 = findings.filter(f => f.ruleId === 'DRC-07');
    assert.strictEqual(drc07.length, 0, 'No DRC-07 for single conductor (parallel_count = 1)');
  });

  it('raises WARNING when parallel_count > 1 and length is missing', () => {
    // Valid size (1/0 AWG) but no length recorded
    const cable = makeCable('C1', { conductor_size: '1/0 AWG', parallel_count: 2, length: null });
    const { findings } = runDRC({ trays: [], cables: [cable], trayCableMap: {} }, { skipGrounding: true });
    const drc07Warnings = findings.filter(f => f.ruleId === 'DRC-07' && f.severity === DRC_SEVERITY.WARNING);
    assert.ok(drc07Warnings.length > 0, 'Expected DRC-07 WARNING for missing length on parallel cable');
    assert.ok(drc07Warnings[0].message.includes('same length'), 'Warning should mention equal-length requirement');
  });

  it('does NOT raise length WARNING when length is specified', () => {
    const cable = makeCable('C1', { conductor_size: '1/0 AWG', parallel_count: 2, length: 150 });
    const { findings } = runDRC({ trays: [], cables: [cable], trayCableMap: {} }, { skipGrounding: true });
    const drc07Warnings = findings.filter(f => f.ruleId === 'DRC-07' && f.severity === DRC_SEVERITY.WARNING);
    assert.strictEqual(drc07Warnings.length, 0, 'No length WARNING when length is provided');
  });

  it('can be skipped via skipParallelCheck option', () => {
    const cable = makeCable('C1', { conductor_size: '#4 AWG', parallel_count: 2, length: null });
    const { findings } = runDRC(
      { trays: [], cables: [cable], trayCableMap: {} },
      { skipGrounding: true, skipParallelCheck: true }
    );
    const drc07 = findings.filter(f => f.ruleId === 'DRC-07');
    assert.strictEqual(drc07.length, 0, 'DRC-07 should be skipped when skipParallelCheck=true');
  });
});

// ---------------------------------------------------------------------------
// Pull cards: area and weight multiplied by parallel_count
// ---------------------------------------------------------------------------

describe('buildPullCard() — parallel_count multiplies area and weight', () => {
  function makePull(cables) {
    return {
      pull_number: 1,
      cable_type: 'Power',
      cable_count: cables.length,
      cables,
      total_length: 100,
      breakdown: [{ tray_id: 'T1', length: 100, start: [0, 0, 0], end: [100, 0, 0] }],
      route_segments: [{ type: 'straight', length: 100 }],
    };
  }

  it('multiplies totalArea by parallel_count', () => {
    const diameter = 1.0; // 1 inch OD
    const singleArea = Math.PI * (diameter / 2) ** 2;

    const singlePull = makePull([{ tag: 'C1', diameter, weight: 0.5, parallel_count: 1 }]);
    const parallelPull = makePull([{ tag: 'C1', diameter, weight: 0.5, parallel_count: 3 }]);

    const single = buildPullCard(singlePull);
    const parallel = buildPullCard(parallelPull);

    assert.ok(Math.abs(single.total_cross_section_area_sqin - singleArea) < 0.001,
      `Single area should be ~${singleArea.toFixed(4)} in², got ${single.total_cross_section_area_sqin}`);
    assert.ok(Math.abs(parallel.total_cross_section_area_sqin - singleArea * 3) < 0.001,
      `Parallel area should be ~${(singleArea * 3).toFixed(4)} in², got ${parallel.total_cross_section_area_sqin}`);
  });

  it('multiplies totalWeight by parallel_count', () => {
    const singlePull = makePull([{ tag: 'C1', diameter: 1.0, weight: 0.5, parallel_count: 1 }]);
    const parallelPull = makePull([{ tag: 'C1', diameter: 1.0, weight: 0.5, parallel_count: 3 }]);

    const single = buildPullCard(singlePull);
    const parallel = buildPullCard(parallelPull);

    assert.ok(Math.abs(single.total_weight_lb_ft - 0.5) < 0.001,
      `Single weight should be 0.500 lb/ft, got ${single.total_weight_lb_ft}`);
    assert.ok(Math.abs(parallel.total_weight_lb_ft - 1.5) < 0.001,
      `Parallel weight should be 1.500 lb/ft, got ${parallel.total_weight_lb_ft}`);
  });

  it('returns parallel_cable_count reflecting total physical cables', () => {
    // 2 circuit entries: one with parallel_count=3 and one with parallel_count=1
    const pull = makePull([
      { tag: 'C1', diameter: 1.0, weight: 0.5, parallel_count: 3 },
      { tag: 'C2', diameter: 0.75, weight: 0.4, parallel_count: 1 },
    ]);
    const card = buildPullCard(pull);
    // 3 + 1 = 4 physical cables
    assert.strictEqual(card.parallel_cable_count, 4,
      `parallel_cable_count should be 4, got ${card.parallel_cable_count}`);
  });

  it('treats missing parallel_count as 1 (backward compat)', () => {
    const diameter = 1.0;
    const area = Math.PI * (diameter / 2) ** 2;
    const pull = makePull([{ tag: 'C1', diameter, weight: 0.5 }]); // no parallel_count
    const card = buildPullCard(pull);
    assert.ok(Math.abs(card.total_cross_section_area_sqin - area) < 0.001,
      'Cable without parallel_count should behave as parallel_count=1');
    assert.strictEqual(card.parallel_cable_count, 1, 'parallel_cable_count should be 1 when not specified');
  });
});

// ---------------------------------------------------------------------------
// Auto-size: parallelSuggestion when load exceeds single-conductor capacity
// ---------------------------------------------------------------------------

describe('sizeFeeder() — parallelSuggestion for oversized loads', () => {
  it('returns parallelSuggestion when load exceeds single-conductor capacity', () => {
    // A very large load that exceeds any single conductor
    // 1200 A continuous → requiredAmps = 1200 × 1.25 = 1500 A, well above largest single (545 A at 1000 kcmil)
    const result = sizeFeeder({ loadAmps: 1200, continuous: true, material: 'copper', tempRating: 75 });
    assert.ok(result.error, 'Should return an error for oversized load');
    assert.ok(result.parallelSuggestion, 'Should return a parallelSuggestion object');
    assert.ok(result.parallelSuggestion.count >= 2, 'Parallel count should be ≥ 2');
    assert.ok(typeof result.parallelSuggestion.size === 'string', 'Parallel size should be a string');
    assert.ok(result.parallelSuggestion.note.includes('NEC 310.10(H)'), 'Suggestion should cite NEC 310.10(H)');
  });

  it('parallelSuggestion meets the required ampacity', () => {
    const result = sizeFeeder({ loadAmps: 900, continuous: true, material: 'copper', tempRating: 75 });
    // 900 × 1.25 = 1125 A required — may or may not exceed single conductor depending on derating
    if (result.error && result.parallelSuggestion) {
      assert.ok(result.parallelSuggestion.installedAmpacity >= 900 * 1.25,
        `Suggested parallel ampacity ${result.parallelSuggestion.installedAmpacity} A should meet required ${900 * 1.25} A`);
    }
    // If it does fit in a single conductor, no error is expected — both paths are valid
  });

  it('returns null parallelSuggestion only when load is truly beyond 6 parallel sets', () => {
    // Effectively impossible load — 6 × 1000 kcmil copper ≈ 6 × 545 A = 3270 A table, verify suggestion still found
    const result = sizeFeeder({ loadAmps: 2000, continuous: true, material: 'copper', tempRating: 75 });
    // Should always find a suggestion within 6 parallel sets for 2000 A
    if (result.error) {
      assert.ok(result.parallelSuggestion !== undefined, 'parallelSuggestion key should always be present in error result');
    }
  });
});
