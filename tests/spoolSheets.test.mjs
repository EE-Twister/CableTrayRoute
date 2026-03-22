/**
 * Tests for analysis/spoolSheets.mjs
 *
 * Verifies spool sheet generation:
 *   - Empty input handling
 *   - Spool grouping by elevation and position
 *   - Material quantity calculations (sections, brackets, weight)
 *   - Cable assignment to spools
 *   - Summary totals match individual spool sums
 */
import assert from 'assert';
import { generateSpoolSheets } from '../analysis/spoolSheets.mjs';

function describe(name, fn) { console.log(name); fn(); }
function it(name, fn) {
  try { fn(); console.log('  \u2713', name); }
  catch (err) { console.error('  \u2717', name, err.message || err); process.exitCode = 1; }
}

function tray(id, sx, sy, sz, ex, ey, ez, w = 12) {
  return {
    tray_id: id,
    start_x: sx, start_y: sy, start_z: sz,
    end_x: ex,   end_y: ey,   end_z: ez,
    inside_width: w,
    tray_depth: 4,
  };
}

function cable(id, route) {
  return { id, route_preference: route, od: 1.0 };
}

// ---------------------------------------------------------------------------
describe('generateSpoolSheets — empty input', () => {
  it('returns zero-count summary for no trays', () => {
    const r = generateSpoolSheets([], []);
    assert.strictEqual(r.spools.length, 0);
    assert.strictEqual(r.summary.spoolCount, 0);
    assert.strictEqual(r.summary.totalLengthFt, 0);
  });

  it('handles missing cables array gracefully', () => {
    const trays = [tray('T1', 0, 0, 10, 20, 0, 10)];
    const r = generateSpoolSheets(trays);
    assert.strictEqual(r.spools.length, 1);
  });
});

// ---------------------------------------------------------------------------
describe('generateSpoolSheets — single tray', () => {
  it('produces one spool with correct length', () => {
    // 20 ft run along X axis
    const trays = [tray('T1', 0, 0, 10, 20, 0, 10)];
    const r = generateSpoolSheets(trays, []);
    assert.strictEqual(r.spools.length, 1);
    const s = r.spools[0];
    assert.ok(Math.abs(s.totalLengthFt - 20) < 0.01, `expected ~20 ft, got ${s.totalLengthFt}`);
    assert.strictEqual(s.trayCount, 1);
  });

  it('computes section count from 12 ft standard length', () => {
    const trays = [tray('T1', 0, 0, 10, 24, 0, 10)]; // 24 ft → 2 sections
    const r = generateSpoolSheets(trays, [], { sectionLengthFt: 12 });
    assert.strictEqual(r.spools[0].straightSections, 2);
  });

  it('includes at least one bracket for a single tray', () => {
    const trays = [tray('T1', 0, 0, 10, 20, 0, 10)];
    const r = generateSpoolSheets(trays, []);
    assert.ok(r.spools[0].bracketCount >= 1);
  });
});

// ---------------------------------------------------------------------------
describe('generateSpoolSheets — cable assignment', () => {
  it('assigns cables whose route_preference matches tray_id', () => {
    const trays  = [tray('TRAY-01', 0, 0, 10, 20, 0, 10)];
    const cables = [cable('C1', 'TRAY-01'), cable('C2', 'TRAY-02')];
    const r = generateSpoolSheets(trays, cables);
    const spool = r.spools[0];
    assert.strictEqual(spool.cables.length, 1);
    assert.strictEqual(spool.cables[0].cable_tag, 'C1');
  });

  it('spool has no cables when none match', () => {
    const trays  = [tray('T1', 0, 0, 10, 20, 0, 10)];
    const cables = [cable('C1', 'OTHER')];
    const r = generateSpoolSheets(trays, cables);
    assert.strictEqual(r.spools[0].cables.length, 0);
  });
});

// ---------------------------------------------------------------------------
describe('generateSpoolSheets — grouping', () => {
  it('groups trays at same elevation and area into one spool', () => {
    const trays = [
      tray('T1', 0, 0, 10, 10, 0, 10),
      tray('T2', 5, 0, 10, 15, 0, 10), // same zone, same elevation
    ];
    const r = generateSpoolSheets(trays, []);
    // Both should be in the same spool (same W12-E5-G0_0 key)
    assert.strictEqual(r.spools.length, 1);
  });

  it('separates trays at different elevations into different spools', () => {
    const trays = [
      tray('T1', 0, 0, 10, 10, 0, 10),
      tray('T2', 0, 0, 20, 10, 0, 20), // 10 ft higher → different elevation band
    ];
    const r = generateSpoolSheets(trays, []);
    assert.strictEqual(r.spools.length, 2);
  });
});

// ---------------------------------------------------------------------------
describe('generateSpoolSheets — summary totals', () => {
  it('summary totalLengthFt matches sum of spool lengths', () => {
    const trays = [
      tray('T1',  0, 0, 10, 20, 0, 10),
      tray('T2',  0, 0, 20, 15, 0, 20), // different elevation
    ];
    const r = generateSpoolSheets(trays, []);
    const spoolTotal = r.spools.reduce((s, sp) => s + sp.totalLengthFt, 0);
    assert.ok(Math.abs(r.summary.totalLengthFt - spoolTotal) < 0.01);
  });

  it('summary spoolCount matches spools array length', () => {
    const trays = [tray('T1', 0,0,10, 20,0,10), tray('T2', 0,0,20, 20,0,20)];
    const r = generateSpoolSheets(trays, []);
    assert.strictEqual(r.summary.spoolCount, r.spools.length);
  });
});
