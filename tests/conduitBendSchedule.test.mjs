/**
 * Tests for analysis/conduitBendSchedule.mjs and analysis/pullBoxSizing.mjs
 *
 * Covers: bend geometry for all four types, cumulative-degree accumulation,
 * NEC 358.24 violation detection, pull-box sizing (straight and angle),
 * runConduitBendSchedule integration, and input-validation paths.
 */
import assert from 'assert';
import {
  bendGeometry,
  cumulativeDegrees,
  nec358_24Check,
  runConduitBendSchedule,
  BEND_TYPES,
  TAKE_UP,
  OFFSET_TABLE,
} from '../analysis/conduitBendSchedule.mjs';
import {
  straightPullMinLength,
  anglePullMinDimension,
  selectStandardBox,
  sizePullBox,
} from '../analysis/pullBoxSizing.mjs';

function describe(name, fn) {
  console.log(name);
  fn();
}

function it(name, fn) {
  try {
    fn();
    console.log('  ✓', name);
  } catch (err) {
    console.error('  ✗', name, err.message || err);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
describe('BEND_TYPES constant', () => {
  it('contains 90, offset, kick, saddle', () => {
    assert.ok(BEND_TYPES.includes('90'));
    assert.ok(BEND_TYPES.includes('offset'));
    assert.ok(BEND_TYPES.includes('kick'));
    assert.ok(BEND_TYPES.includes('saddle'));
  });
});

// ---------------------------------------------------------------------------
describe('bendGeometry() — 90° stub-up', () => {
  it('returns 90 degrees', () => {
    const g = bendGeometry('90', 12, { tradeSize: 1 });
    assert.strictEqual(g.degrees, 90);
  });

  it('uses correct take-up for 1" EMT', () => {
    const g = bendGeometry('90', 10, { tradeSize: 1 });
    assert.strictEqual(g.takeUp ?? g.shrink, 8, '1" EMT take-up should be 8"');
    assert.strictEqual(g.markSpacing, 8);
  });

  it('uses correct take-up for 2" EMT', () => {
    const g = bendGeometry('90', 20, { tradeSize: 2 });
    assert.strictEqual(g.shrink, 16);
  });

  it('sets rise to stub-up dimension', () => {
    const g = bendGeometry('90', 15, { tradeSize: 1 });
    assert.strictEqual(g.rise, 15);
  });

  it('run is 0 for a 90° bend', () => {
    const g = bendGeometry('90', 10, { tradeSize: 1 });
    assert.strictEqual(g.run, 0);
  });
});

// ---------------------------------------------------------------------------
describe('bendGeometry() — offset', () => {
  it('45° offset: multiplier ≈ 1.414', () => {
    const g = bendGeometry('offset', 6, { angle: 45 });
    assert.ok(Math.abs(g.multiplier - 1.414) < 0.01, `Expected ~1.414, got ${g.multiplier}`);
  });

  it('45° offset: mark spacing = 6 × 1.414 ≈ 8.48"', () => {
    const g = bendGeometry('offset', 6, { angle: 45 });
    assert.ok(Math.abs(g.markSpacing - 8.48) < 0.05, `Expected ~8.48, got ${g.markSpacing}`);
  });

  it('45° offset: shrink = 6 × 0.375 = 2.25"', () => {
    const g = bendGeometry('offset', 6, { angle: 45 });
    assert.ok(Math.abs(g.shrink - 2.25) < 0.02, `Expected ~2.25, got ${g.shrink}`);
  });

  it('45° offset adds 90° (two bends)', () => {
    const g = bendGeometry('offset', 6, { angle: 45 });
    assert.strictEqual(g.degrees, 90);
  });

  it('30° offset: multiplier = 2.0', () => {
    const g = bendGeometry('offset', 4, { angle: 30 });
    assert.strictEqual(g.multiplier, 2.0);
  });

  it('30° offset: shrink = 4 × 0.25 = 1.0"', () => {
    const g = bendGeometry('offset', 4, { angle: 30 });
    assert.ok(Math.abs(g.shrink - 1.0) < 0.01, `Expected 1.0, got ${g.shrink}`);
  });
});

// ---------------------------------------------------------------------------
describe('bendGeometry() — kick', () => {
  it('single 30° kick adds 30°', () => {
    const g = bendGeometry('kick', 5, { angle: 30 });
    assert.strictEqual(g.degrees, 30);
  });

  it('kick has zero shrink', () => {
    const g = bendGeometry('kick', 5, { angle: 45 });
    assert.strictEqual(g.shrink, 0);
  });

  it('45° kick: mark spacing = 5 × 1.414 ≈ 7.07"', () => {
    const g = bendGeometry('kick', 5, { angle: 45 });
    assert.ok(Math.abs(g.markSpacing - 7.07) < 0.05, `Expected ~7.07, got ${g.markSpacing}`);
  });
});

// ---------------------------------------------------------------------------
describe('bendGeometry() — 3-bend saddle', () => {
  it('saddle adds 90° (45 + 22.5 + 22.5)', () => {
    const g = bendGeometry('saddle', 4);
    assert.strictEqual(g.degrees, 90);
  });

  it('outer-to-centre spacing = 2.5 × height', () => {
    const g = bendGeometry('saddle', 6);
    assert.ok(Math.abs(g.markSpacing - 15) < 0.01, `Expected 15, got ${g.markSpacing}`);
  });

  it('total span = 5 × height', () => {
    const g = bendGeometry('saddle', 4);
    assert.ok(Math.abs(g.run - 20) < 0.01, `Expected 20, got ${g.run}`);
  });

  it('shrink ≈ 0.213 per inch', () => {
    const g = bendGeometry('saddle', 8);
    assert.ok(Math.abs(g.shrink - 1.70) < 0.05, `Expected ~1.70, got ${g.shrink}`);
  });
});

// ---------------------------------------------------------------------------
describe('bendGeometry() — unknown type', () => {
  it('throws on unknown bend type', () => {
    assert.throws(() => bendGeometry('elbow', 6), /Unknown bend type/);
  });
});

// ---------------------------------------------------------------------------
describe('cumulativeDegrees()', () => {
  it('sums degrees across an array', () => {
    const bends = [{ degrees: 90 }, { degrees: 90 }, { degrees: 45 }];
    assert.strictEqual(cumulativeDegrees(bends), 225);
  });

  it('returns 0 for empty array', () => {
    assert.strictEqual(cumulativeDegrees([]), 0);
  });

  it('returns 0 for non-array', () => {
    assert.strictEqual(cumulativeDegrees(null), 0);
  });

  it('ignores undefined degrees', () => {
    const bends = [{ degrees: 90 }, {}, { degrees: 45 }];
    assert.strictEqual(cumulativeDegrees(bends), 135);
  });
});

// ---------------------------------------------------------------------------
describe('nec358_24Check()', () => {
  it('passes a run with 270°', () => {
    const result = nec358_24Check([{ label: 'Run A', bends: [{ degrees: 90 }, { degrees: 90 }, { degrees: 90 }] }]);
    assert.strictEqual(result[0].pass, true);
    assert.strictEqual(result[0].totalDegrees, 270);
  });

  it('passes exactly 360°', () => {
    const result = nec358_24Check([{ bends: [{ degrees: 180 }, { degrees: 180 }] }]);
    assert.strictEqual(result[0].pass, true);
  });

  it('fails 361°', () => {
    const result = nec358_24Check([{ bends: [{ degrees: 180 }, { degrees: 181 }] }]);
    assert.strictEqual(result[0].pass, false);
    assert.ok(result[0].message.includes('exceeds'));
  });

  it('uses segment label in result', () => {
    const result = nec358_24Check([{ label: 'MCC Room', bends: [{ degrees: 90 }] }]);
    assert.strictEqual(result[0].segmentLabel, 'MCC Room');
  });

  it('generates default label if none provided', () => {
    const result = nec358_24Check([{ bends: [] }]);
    assert.ok(result[0].segmentLabel.startsWith('Segment'));
  });

  it('returns empty array for non-array input', () => {
    assert.deepStrictEqual(nec358_24Check(null), []);
  });
});

// ---------------------------------------------------------------------------
describe('runConduitBendSchedule() integration', () => {
  it('returns empty result for no runs', () => {
    const r = runConduitBendSchedule([]);
    assert.deepStrictEqual(r.runs, []);
    assert.strictEqual(r.summary.totalRuns, 0);
  });

  it('processes a valid run with two bends', () => {
    const r = runConduitBendSchedule([{
      label: 'Run 1',
      tradeSize: 1,
      bends: [
        { type: 'offset', dimension: 6, angle: 45 },
        { type: 'kick', dimension: 3, angle: 30 },
      ],
    }]);
    assert.strictEqual(r.runs.length, 1);
    assert.strictEqual(r.runs[0].bends.length, 2);
    assert.ok(r.runs[0].totalDegrees > 0);
  });

  it('detects NEC 358.24 violation on a run with > 360°', () => {
    const r = runConduitBendSchedule([{
      label: 'Overcrowded',
      tradeSize: 1,
      bends: [
        { type: '90', dimension: 12 },
        { type: '90', dimension: 12 },
        { type: '90', dimension: 12 },
        { type: '90', dimension: 12 },
        { type: 'offset', dimension: 6, angle: 45 },
      ],
    }]);
    assert.strictEqual(r.runs[0].nec358_24Pass, false);
    assert.ok(r.violations.length > 0);
  });

  it('flags invalid bend type in violations', () => {
    const r = runConduitBendSchedule([{
      label: 'Bad',
      tradeSize: 1,
      bends: [{ type: 'loop', dimension: 5 }],
    }]);
    assert.ok(r.violations.some(v => v.message.includes('Unknown')));
  });

  it('flags invalid dimension in violations', () => {
    const r = runConduitBendSchedule([{
      label: 'Bad dim',
      tradeSize: 1,
      bends: [{ type: 'offset', dimension: -1 }],
    }]);
    assert.ok(r.violations.some(v => v.message.includes('Invalid dimension')));
  });

  it('returns correct summary counts', () => {
    const r = runConduitBendSchedule([
      { label: 'A', tradeSize: 1, bends: [{ type: 'offset', dimension: 6, angle: 45 }] },
      { label: 'B', tradeSize: 0.75, bends: [{ type: '90', dimension: 12 }] },
    ]);
    assert.strictEqual(r.summary.totalRuns, 2);
    assert.strictEqual(r.summary.totalBends, 2);
  });

  it('handles run with no bends gracefully', () => {
    const r = runConduitBendSchedule([{ label: 'Empty', tradeSize: 1, bends: [] }]);
    assert.strictEqual(r.runs[0].totalDegrees, 0);
    assert.strictEqual(r.runs[0].nec358_24Pass, true);
  });
});

// ---------------------------------------------------------------------------
describe('straightPullMinLength() — NEC 314.28(A)(1)', () => {
  it('2" conduit: min length = 16"', () => {
    const { minLength } = straightPullMinLength(2);
    assert.strictEqual(minLength, 16);
  });

  it('3" conduit: min length = 24"', () => {
    const { minLength } = straightPullMinLength(3);
    assert.strictEqual(minLength, 24);
  });

  it('includes NEC reference in formula string', () => {
    const { formula } = straightPullMinLength(1);
    assert.ok(formula.includes('314.28'));
  });
});

// ---------------------------------------------------------------------------
describe('anglePullMinDimension() — NEC 314.28(A)(2)', () => {
  it('single 2" conduit on wall: 6 × 2 = 12"', () => {
    const { minDimension } = anglePullMinDimension([2]);
    assert.strictEqual(minDimension, 12);
  });

  it('2" + 1.5" + 1.5" on wall: 6×2 + 1.5 + 1.5 = 15"', () => {
    const { minDimension } = anglePullMinDimension([2, 1.5, 1.5]);
    assert.strictEqual(minDimension, 15);
  });

  it('returns 0 for empty wall', () => {
    const { minDimension } = anglePullMinDimension([]);
    assert.strictEqual(minDimension, 0);
  });

  it('formula string contains NEC reference', () => {
    const { formula } = anglePullMinDimension([2, 1]);
    assert.ok(formula.includes('314.28'));
  });
});

// ---------------------------------------------------------------------------
describe('selectStandardBox()', () => {
  it('selects smallest adequate box for 12" × 12"', () => {
    const box = selectStandardBox(12, 12);
    assert.strictEqual(box.length, 12);
    assert.strictEqual(box.width, 12);
    assert.strictEqual(box.adequate, true);
  });

  it('selects next size up when required is between standard sizes', () => {
    const box = selectStandardBox(13, 13);
    assert.ok(box.length >= 13);
    assert.ok(box.width >= 13);
    assert.strictEqual(box.adequate, true);
  });

  it('marks as not adequate when exceeding catalogue', () => {
    const box = selectStandardBox(200, 200);
    assert.strictEqual(box.adequate, false);
  });
});

// ---------------------------------------------------------------------------
describe('sizePullBox()', () => {
  it('straight pull: 2" largest → min 16", selects 16×16 or larger', () => {
    const r = sizePullBox({ label: 'PB-1', pullType: 'straight', largestTradeSize: 2 });
    assert.strictEqual(r.minLength, 16);
    assert.ok(r.standardBox.length >= 16);
  });

  it('angle pull: wall A [2, 1.5] → 6×2+1.5 = 13.5"', () => {
    const r = sizePullBox({ label: 'PB-2', pullType: 'angle', wallA: [2, 1.5], wallB: [2] });
    assert.ok(Math.abs(r.minLength - 13.5) < 0.01, `Expected 13.5, got ${r.minLength}`);
  });

  it('angle pull: wall B [2] → min width 12"', () => {
    const r = sizePullBox({ label: 'PB-3', pullType: 'angle', wallA: [2], wallB: [2] });
    assert.strictEqual(r.minWidth, 12);
  });

  it('returns standardBox with adequate flag', () => {
    const r = sizePullBox({ label: 'PB-4', pullType: 'straight', largestTradeSize: 1 });
    assert.ok('adequate' in r.standardBox);
  });
});
