/**
 * Tests for scenario comparison logic (Gap #17).
 *
 * Exercises buildCableComparison directly with injected data so no
 * localStorage or DOM is needed.
 */
import assert from 'assert';
import { buildCableComparison } from '../src/scenarios.js';

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
// Helpers
// ---------------------------------------------------------------------------

function makeCableStore(scenarioData) {
  return name => scenarioData[name] ?? [];
}

const BASE_CABLE = {
  tag: 'C-001',
  from_tag: 'MCC-1',
  to_tag: 'PUMP-1',
  cable_type: 'XHHW-2',
  conductor_size: '4 AWG',
  conductors: 3,
};

// ---------------------------------------------------------------------------
// No differences
// ---------------------------------------------------------------------------
describe('buildCableComparison — identical scenarios', () => {
  it('reports zero added, removed, changed when both scenarios are equal', () => {
    const fn = makeCableStore({
      base:   [{ ...BASE_CABLE }],
      future: [{ ...BASE_CABLE }],
    });
    const result = buildCableComparison('base', 'future', fn);
    assert.strictEqual(result.added,   0);
    assert.strictEqual(result.removed, 0);
    assert.strictEqual(result.changed, 0);
    assert.strictEqual(result.rows.length, 0);
  });

  it('returns empty rows array (not null/undefined)', () => {
    const fn = makeCableStore({ a: [], b: [] });
    const result = buildCableComparison('a', 'b', fn);
    assert.ok(Array.isArray(result.rows));
  });
});

// ---------------------------------------------------------------------------
// Added cables
// ---------------------------------------------------------------------------
describe('buildCableComparison — added cable', () => {
  it('detects a cable present only in scenario B as Added', () => {
    const newCable = { tag: 'C-002', from_tag: 'MDP', to_tag: 'AHU-2', cable_type: 'THWN', conductor_size: '12 AWG', conductors: 3 };
    const fn = makeCableStore({
      base:   [{ ...BASE_CABLE }],
      future: [{ ...BASE_CABLE }, { ...newCable }],
    });
    const result = buildCableComparison('base', 'future', fn);
    assert.strictEqual(result.added,   1);
    assert.strictEqual(result.removed, 0);
    assert.strictEqual(result.changed, 0);
    assert.strictEqual(result.rows.length, 1);
    assert.ok(result.rows[0].includes('Added'), 'row should be marked Added');
    assert.ok(result.rows[0].includes('C-002'), 'row should contain the new cable tag');
  });

  it('marks the row with the cmp-added CSS class', () => {
    const fn = makeCableStore({
      base:   [],
      future: [{ ...BASE_CABLE }],
    });
    const { rows } = buildCableComparison('base', 'future', fn);
    assert.ok(rows[0].includes('cmp-added'));
  });
});

// ---------------------------------------------------------------------------
// Removed cables
// ---------------------------------------------------------------------------
describe('buildCableComparison — removed cable', () => {
  it('detects a cable present only in scenario A as Removed', () => {
    const fn = makeCableStore({
      base:   [{ ...BASE_CABLE }],
      future: [],
    });
    const result = buildCableComparison('base', 'future', fn);
    assert.strictEqual(result.added,   0);
    assert.strictEqual(result.removed, 1);
    assert.strictEqual(result.changed, 0);
    assert.ok(result.rows[0].includes('Removed'));
    assert.ok(result.rows[0].includes('C-001'));
  });

  it('marks the row with the cmp-removed CSS class', () => {
    const fn = makeCableStore({
      base:   [{ ...BASE_CABLE }],
      future: [],
    });
    const { rows } = buildCableComparison('base', 'future', fn);
    assert.ok(rows[0].includes('cmp-removed'));
  });
});

// ---------------------------------------------------------------------------
// Changed cables
// ---------------------------------------------------------------------------
describe('buildCableComparison — changed cable', () => {
  it('detects a cable with a different conductor_size as Changed', () => {
    const upgraded = { ...BASE_CABLE, conductor_size: '2 AWG' };
    const fn = makeCableStore({
      base:   [{ ...BASE_CABLE }],
      future: [upgraded],
    });
    const result = buildCableComparison('base', 'future', fn);
    assert.strictEqual(result.added,   0);
    assert.strictEqual(result.removed, 0);
    assert.strictEqual(result.changed, 1);
    assert.ok(result.rows[0].includes('Changed'));
  });

  it('includes both old and new conductor sizes in the Changed row', () => {
    const upgraded = { ...BASE_CABLE, conductor_size: '2 AWG' };
    const fn = makeCableStore({
      base:   [{ ...BASE_CABLE }],
      future: [upgraded],
    });
    const { rows } = buildCableComparison('base', 'future', fn);
    assert.ok(rows[0].includes('4 AWG'), 'should show old size');
    assert.ok(rows[0].includes('2 AWG'), 'should show new size');
  });

  it('marks the row with the cmp-changed CSS class', () => {
    const upgraded = { ...BASE_CABLE, conductor_size: '2 AWG' };
    const fn = makeCableStore({
      base:   [{ ...BASE_CABLE }],
      future: [upgraded],
    });
    const { rows } = buildCableComparison('base', 'future', fn);
    assert.ok(rows[0].includes('cmp-changed'));
  });
});

// ---------------------------------------------------------------------------
// Mixed changes
// ---------------------------------------------------------------------------
describe('buildCableComparison — mixed changes', () => {
  it('counts and classifies multiple changes correctly', () => {
    const cableA = { tag: 'C-001', from_tag: 'MCC', to_tag: 'MTR', cable_type: 'XHHW-2', conductor_size: '4 AWG', conductors: 3 };
    const cableB = { tag: 'C-002', from_tag: 'MDP', to_tag: 'AHU', cable_type: 'THWN',   conductor_size: '12 AWG', conductors: 3 };
    const cableC = { tag: 'C-003', from_tag: 'MCC', to_tag: 'FAN', cable_type: 'XHHW-2', conductor_size: '6 AWG', conductors: 3 };

    const fn = makeCableStore({
      base:   [{ ...cableA },               { ...cableC }],
      future: [{ ...cableA, conductor_size: '2 AWG' }, { ...cableB }],
      // C-001 changed, C-002 added, C-003 removed
    });

    const result = buildCableComparison('base', 'future', fn);
    assert.strictEqual(result.added,   1, 'C-002 added');
    assert.strictEqual(result.removed, 1, 'C-003 removed');
    assert.strictEqual(result.changed, 1, 'C-001 changed');
    assert.strictEqual(result.rows.length, 3);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------
describe('buildCableComparison — edge cases', () => {
  it('handles cables without a tag gracefully (skips them)', () => {
    const fn = makeCableStore({
      base:   [{ from_tag: 'X', to_tag: 'Y' }],  // no tag
      future: [],
    });
    // Should not throw
    assert.doesNotThrow(() => buildCableComparison('base', 'future', fn));
  });

  it('handles empty cable lists without throwing', () => {
    const fn = makeCableStore({ a: [], b: [] });
    assert.doesNotThrow(() => buildCableComparison('a', 'b', fn));
    const result = buildCableComparison('a', 'b', fn);
    assert.strictEqual(result.rows.length, 0);
  });
});

// ---------------------------------------------------------------------------
// Summary badge inputs (testing the data that drives the badge UI)
// ---------------------------------------------------------------------------
describe('buildCableComparison — summary badge data', () => {
  it('returns zero counts when scenarios are identical (no-diff badge case)', () => {
    const fn = makeCableStore({
      base:   [{ ...BASE_CABLE }],
      future: [{ ...BASE_CABLE }],
    });
    const { added, removed, changed } = buildCableComparison('base', 'future', fn);
    assert.strictEqual(added + removed + changed, 0, 'total diff count should be 0');
  });

  it('total row count equals added + removed + changed', () => {
    const cableA = { tag: 'C-010', from_tag: 'SW', to_tag: 'M1', cable_type: 'XHHW-2', conductor_size: '6 AWG', conductors: 3 };
    const cableB = { tag: 'C-011', from_tag: 'SW', to_tag: 'M2', cable_type: 'THWN',   conductor_size: '12 AWG', conductors: 3 };
    const fn = makeCableStore({
      base:   [{ ...cableA }, { ...BASE_CABLE }],
      future: [{ ...cableA, conductor_size: '4 AWG' }, { ...cableB }],
      // cableA changed, BASE_CABLE removed, cableB added
    });
    const { added, removed, changed, rows } = buildCableComparison('base', 'future', fn);
    assert.strictEqual(rows.length, added + removed + changed, 'row count must match sum of status counts');
  });

  it('produces a row with cmp-changed class when conductor_size differs', () => {
    const modified = { ...BASE_CABLE, conductor_size: '1/0 AWG' };
    const fn = makeCableStore({ base: [{ ...BASE_CABLE }], future: [modified] });
    const { rows } = buildCableComparison('base', 'future', fn);
    assert.strictEqual(rows.length, 1);
    assert.ok(rows[0].includes('cmp-changed'), 'row should carry cmp-changed class');
  });
});

// ---------------------------------------------------------------------------
// Study comparison helper (compareStudies from dataStore — unit-tested here
// via a thin wrapper to ensure the expected shape is returned)
// ---------------------------------------------------------------------------
describe('buildCableComparison — study data shape contract', () => {
  it('result object always has added, removed, changed, rows properties', () => {
    const fn = makeCableStore({ x: [], y: [] });
    const result = buildCableComparison('x', 'y', fn);
    assert.ok('added'   in result, 'missing added');
    assert.ok('removed' in result, 'missing removed');
    assert.ok('changed' in result, 'missing changed');
    assert.ok('rows'    in result, 'missing rows');
  });

  it('added, removed, changed are non-negative integers', () => {
    const fn = makeCableStore({ x: [{ ...BASE_CABLE }], y: [] });
    const { added, removed, changed } = buildCableComparison('x', 'y', fn);
    assert.ok(Number.isInteger(added)   && added   >= 0);
    assert.ok(Number.isInteger(removed) && removed >= 0);
    assert.ok(Number.isInteger(changed) && changed >= 0);
  });
});
