/**
 * Tests for buildCableProcurementSchedule() in analysis/spoolSheets.mjs
 *
 * The function groups routed cables by conductor specification, applies a
 * field-trim allowance, and bin-packs them into standard reel lengths.
 */
import assert from 'assert';
import { buildCableProcurementSchedule } from '../analysis/spoolSheets.mjs';

function describe(name, fn) {
  console.log(name);
  fn();
}

function it(name, fn) {
  try {
    fn();
    console.log('  \u2713', name);
  } catch (err) {
    console.error('  \u2717', name, err.message || err);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const cableList = [
  { name: 'C1', cable_type: 'Power', conductors: 3, conductor_size: '#12 AWG' },
  { name: 'C2', cable_type: 'Power', conductors: 3, conductor_size: '#12 AWG' },
  { name: 'C3', cable_type: 'Power', conductors: 3, conductor_size: '#12 AWG' },
  { name: 'C4', cable_type: 'Control', conductors: 7, conductor_size: '#18 AWG' },
  { name: 'C5', cable_type: 'Control', conductors: 7, conductor_size: '#18 AWG' },
];

// ---------------------------------------------------------------------------
describe('buildCableProcurementSchedule — basic usage', () => {
  it('returns an empty array for empty route results', () => {
    const reels = buildCableProcurementSchedule([], cableList);
    assert.deepStrictEqual(reels, []);
  });

  it('returns an empty array for null/undefined inputs', () => {
    const reels = buildCableProcurementSchedule(null, null);
    assert.deepStrictEqual(reels, []);
  });

  it('a single cable shorter than the smallest reel fits on one reel', () => {
    const results = [{ cable: 'C1', total_length: 200 }];
    const reels = buildCableProcurementSchedule(results, cableList);
    assert.strictEqual(reels.length, 1);
    assert.strictEqual(reels[0].cableAssignments.length, 1);
    assert.strictEqual(reels[0].cableAssignments[0].cableTag, 'C1');
  });

  it('applies 10% default field-trim allowance to routed length', () => {
    const results = [{ cable: 'C1', total_length: 100 }];
    const reels = buildCableProcurementSchedule(results, cableList);
    const assignment = reels[0].cableAssignments[0];
    assert.strictEqual(assignment.routedLengthFt, 100);
    assert.strictEqual(assignment.addedAllowanceFt, 10);
    assert.strictEqual(assignment.totalCutFt, 110);
  });

  it('respects custom pull_allowance_pct on the cable spec', () => {
    const customCables = [{ name: 'X', cable_type: 'Power', pull_allowance_pct: 15 }];
    const results = [{ cable: 'X', total_length: 100 }];
    const reels = buildCableProcurementSchedule(results, customCables);
    assert.strictEqual(reels[0].cableAssignments[0].addedAllowanceFt, 15);
    assert.strictEqual(reels[0].cableAssignments[0].totalCutFt, 115);
  });
});

// ---------------------------------------------------------------------------
describe('buildCableProcurementSchedule — reel sizing', () => {
  it('selects the smallest reel that fits a cable with its allowance', () => {
    // 400 ft routed → 440 ft with 10% allowance → needs 500 ft reel
    const results = [{ cable: 'C1', total_length: 400 }];
    const reels = buildCableProcurementSchedule(results, cableList);
    assert.strictEqual(reels[0].standardLengthFt, 500);
  });

  it('offcut is never negative', () => {
    const results = [
      { cable: 'C1', total_length: 100 },
      { cable: 'C2', total_length: 200 },
      { cable: 'C3', total_length: 300 },
    ];
    const reels = buildCableProcurementSchedule(results, cableList);
    for (const reel of reels) {
      assert.ok(reel.offcutFt >= 0, `offcutFt (${reel.offcutFt}) must not be negative`);
    }
  });

  it('reel utilization is between 0 and 100%', () => {
    const results = [{ cable: 'C1', total_length: 100 }];
    const reels = buildCableProcurementSchedule(results, cableList);
    for (const reel of reels) {
      assert.ok(reel.reelUtilizationPct >= 0 && reel.reelUtilizationPct <= 100,
        `utilization ${reel.reelUtilizationPct} out of range`);
    }
  });

  it('uses custom reel catalog when provided', () => {
    const results = [{ cable: 'C1', total_length: 50 }];
    // Only custom lengths available: 150 and 300 ft
    const reels = buildCableProcurementSchedule(results, cableList, [150, 300]);
    assert.strictEqual(reels[0].standardLengthFt, 150, 'Should use 150 ft reel for a 55 ft cut');
  });

  it('falls back to largest reel when cable exceeds all reel sizes', () => {
    // 4600 ft routed → 5060 ft with allowance → exceeds largest 5000 ft reel
    const results = [{ cable: 'C1', total_length: 4600 }];
    const reels = buildCableProcurementSchedule(results, cableList);
    // Should still place on the largest reel (5000 ft), not crash
    assert.strictEqual(reels[0].standardLengthFt, 5000);
  });
});

// ---------------------------------------------------------------------------
describe('buildCableProcurementSchedule — multi-cable packing', () => {
  it('multiple cables of the same spec are packed into shared reels when possible', () => {
    // Three 100 ft cables → 110 ft each with allowance → 330 ft total → should fit in one 500 ft reel
    const results = [
      { cable: 'C1', total_length: 100 },
      { cable: 'C2', total_length: 100 },
      { cable: 'C3', total_length: 100 },
    ];
    const reels = buildCableProcurementSchedule(results, cableList);
    assert.strictEqual(reels.length, 1, 'All three should be packed into one reel');
    assert.strictEqual(reels[0].cableAssignments.length, 3);
  });

  it('cables of different specs are kept in separate reels', () => {
    const results = [
      { cable: 'C1', total_length: 100 }, // Power 3c #12
      { cable: 'C4', total_length: 100 }, // Control 7c #18
    ];
    const reels = buildCableProcurementSchedule(results, cableList);
    const specs = [...new Set(reels.map(r => r.conductorSpec))];
    assert.strictEqual(specs.length, 2, 'Different specs should produce separate groups');
  });

  it('utilization increases when cables share a reel', () => {
    const singleResult = [{ cable: 'C1', total_length: 100 }];
    const reelSingle = buildCableProcurementSchedule(singleResult, cableList)[0];

    const doubleResults = [
      { cable: 'C1', total_length: 100 },
      { cable: 'C2', total_length: 100 },
    ];
    const reelDouble = buildCableProcurementSchedule(doubleResults, cableList)[0];

    assert.ok(reelDouble.reelUtilizationPct > reelSingle.reelUtilizationPct,
      `Shared reel utilization (${reelDouble.reelUtilizationPct}%) should exceed solo (${reelSingle.reelUtilizationPct}%)`);
  });
});

// ---------------------------------------------------------------------------
describe('buildCableProcurementSchedule — output structure', () => {
  it('every reel entry has required fields', () => {
    const results = [{ cable: 'C1', total_length: 150 }];
    const reels = buildCableProcurementSchedule(results, cableList);
    const reel = reels[0];
    assert.ok(typeof reel.reelSpec === 'string');
    assert.ok(typeof reel.conductorSpec === 'string');
    assert.ok(typeof reel.standardLengthFt === 'number');
    assert.ok(Array.isArray(reel.cableAssignments));
    assert.ok(typeof reel.offcutFt === 'number');
    assert.ok(typeof reel.reelUtilizationPct === 'number');
  });

  it('each cable assignment has cableTag, routedLengthFt, addedAllowanceFt, totalCutFt', () => {
    const results = [{ cable: 'C1', total_length: 150 }];
    const reels = buildCableProcurementSchedule(results, cableList);
    const a = reels[0].cableAssignments[0];
    assert.ok(typeof a.cableTag === 'string');
    assert.ok(typeof a.routedLengthFt === 'number');
    assert.ok(typeof a.addedAllowanceFt === 'number');
    assert.ok(typeof a.totalCutFt === 'number');
    assert.ok(a.totalCutFt === a.routedLengthFt + a.addedAllowanceFt);
  });

  it('offcut plus total cut equals standard reel length for a single-cable reel', () => {
    const results = [{ cable: 'C1', total_length: 200 }];
    const reels = buildCableProcurementSchedule(results, cableList);
    const reel = reels[0];
    const totalCut = reel.cableAssignments.reduce((s, a) => s + a.totalCutFt, 0);
    assert.ok(
      Math.abs(totalCut + reel.offcutFt - reel.standardLengthFt) < 0.01,
      `cut(${totalCut}) + offcut(${reel.offcutFt}) should equal reel(${reel.standardLengthFt})`
    );
  });
});
