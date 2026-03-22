/**
 * Tests for analysis/clashDetect.mjs
 *
 * Verifies AABB clash detection for cable tray segments:
 *   - Hard clashes (overlapping bounding boxes)
 *   - Soft clashes (within clearance distance)
 *   - No clash for well-separated trays
 *   - Self-comparison exclusion (same tray_id)
 *   - overallSeverity helper
 */
import assert from 'assert';
import { detectClashes, overallSeverity, CLASH_SEVERITY } from '../analysis/clashDetect.mjs';

function describe(name, fn) { console.log(name); fn(); }
function it(name, fn) {
  try { fn(); console.log('  \u2713', name); }
  catch (err) { console.error('  \u2717', name, err.message || err); process.exitCode = 1; }
}

// Convenience tray builder
function tray(id, sx, sy, sz, ex, ey, ez, opts = {}) {
  return {
    tray_id: id,
    start_x: sx, start_y: sy, start_z: sz,
    end_x: ex,   end_y: ey,   end_z: ez,
    inside_width: opts.inside_width ?? 12, // inches
    tray_depth:   opts.tray_depth   ?? 4,  // inches
  };
}

// ---------------------------------------------------------------------------
describe('detectClashes — empty / no input', () => {
  it('returns empty results for no trays', () => {
    const r = detectClashes([]);
    assert.deepStrictEqual(r.clashes, []);
    assert.strictEqual(r.stats.totalTrays, 0);
  });

  it('returns empty results for single tray', () => {
    const r = detectClashes([tray('T1', 0,0,10, 20,0,10)]);
    assert.deepStrictEqual(r.clashes, []);
    assert.strictEqual(r.stats.pairs, 0);
  });
});

// ---------------------------------------------------------------------------
describe('detectClashes — hard clash', () => {
  it('detects direct Z-stack overlap as hard clash', () => {
    // Two identical-position trays, different IDs
    const t1 = tray('T1', 0,0,10, 20,0,10);
    const t2 = tray('T2', 0,0,10, 20,0,10); // exact same position → hard clash
    const r = detectClashes([t1, t2]);
    assert.ok(r.clashes.length > 0, 'expected at least one clash');
    assert.strictEqual(r.clashes[0].severity, CLASH_SEVERITY.HARD);
    assert.strictEqual(r.stats.hardClashes, 1);
  });

  it('detects crossing trays in XY plane as hard clash', () => {
    // T1 runs along X; T2 runs along Y crossing at (10,0,10)
    const t1 = tray('T1', 0, 0, 10, 20, 0, 10);
    const t2 = tray('T2', 10,-5, 10, 10, 5, 10);
    const r = detectClashes([t1, t2]);
    assert.ok(r.stats.hardClashes > 0);
  });
});

// ---------------------------------------------------------------------------
describe('detectClashes — soft clash', () => {
  it('detects gap within clearance as soft clash', () => {
    // T1 AABB top = z + depth/12 = 10 + 4/12 ≈ 10.333 ft
    // T2 bottom = 10.4 ft → gap ≈ 0.067 ft < 0.25 ft default clearance
    const t1 = tray('T1', 0, 0, 10,  20, 0, 10);
    const t2 = tray('T2', 0, 0, 10.4, 20, 0, 10.4);
    const r = detectClashes([t1, t2]);
    const softClashes = r.clashes.filter(c => c.severity === CLASH_SEVERITY.SOFT);
    assert.ok(softClashes.length > 0, 'expected a soft clash');
  });
});

// ---------------------------------------------------------------------------
describe('detectClashes — no clash', () => {
  it('no clash for well-separated parallel trays', () => {
    const t1 = tray('T1',  0, 0, 10, 20, 0, 10);
    const t2 = tray('T2',  0, 5, 10, 20, 5, 10); // 5 ft apart in Y
    const r = detectClashes([t1, t2]);
    assert.strictEqual(r.clashes.length, 0);
  });

  it('same tray_id is excluded from clash check', () => {
    const t1 = tray('SAME', 0, 0, 10, 20, 0, 10);
    const t2 = tray('SAME', 0, 0, 10, 20, 0, 10); // identical id → skip
    const r = detectClashes([t1, t2]);
    assert.strictEqual(r.clashes.length, 0);
  });
});

// ---------------------------------------------------------------------------
describe('overallSeverity', () => {
  it('returns "fail" when any hard clash exists', () => {
    const clashes = [{ severity: 'soft' }, { severity: 'hard' }];
    assert.strictEqual(overallSeverity(clashes), 'fail');
  });

  it('returns "warning" when only soft clashes', () => {
    const clashes = [{ severity: 'soft' }];
    assert.strictEqual(overallSeverity(clashes), 'warning');
  });

  it('returns "pass" for empty list', () => {
    assert.strictEqual(overallSeverity([]), 'pass');
  });
});
