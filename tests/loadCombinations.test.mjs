/**
 * Tests for analysis/loadCombinations.mjs
 *
 * Verifies ASCE 7-22 §2.3.2 LRFD load combination calculations against
 * hand-calculated reference values.
 */
import assert from 'assert';
import {
  calcLoadCombinations,
  findControllingCombination,
  evaluateLoadCombinations,
} from '../analysis/loadCombinations.mjs';

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

/** Assert two numbers are within tolerance of each other. */
function assertClose(actual, expected, tol = 0.01, msg = '') {
  const diff = Math.abs(actual - expected);
  assert.ok(
    diff <= tol,
    `${msg}Expected ${expected} ± ${tol}, got ${actual} (diff ${diff.toFixed(4)})`
  );
}

// ---------------------------------------------------------------------------
// Group 1: Wind-only inputs (E = 0)
// ---------------------------------------------------------------------------
describe('calcLoadCombinations — wind only (E=0, S=0)', () => {
  const result = calcLoadCombinations({ D_lbs_ft: 10, W_lbs_ft: 8 });

  it('LC-W1 vertical = 1.2 × 10 = 12.0 lbs/ft', () => {
    assertClose(result.LC_W1.vertical_lbs_ft, 12.0, 0.01, 'LC-W1 vertical: ');
  });

  it('LC-W1 horizontal = 1.6 × 8 = 12.8 lbs/ft', () => {
    assertClose(result.LC_W1.horizontal_lbs_ft, 12.8, 0.01, 'LC-W1 horizontal: ');
  });

  it('LC-W1 resultant = √(12² + 12.8²) = 17.545 lbs/ft', () => {
    assertClose(result.LC_W1.resultant_lbs_ft, 17.55, 0.02, 'LC-W1 resultant: ');
  });

  it('LC-W2 vertical = 0.9 × 10 = 9.0 lbs/ft', () => {
    assertClose(result.LC_W2.vertical_lbs_ft, 9.0, 0.01, 'LC-W2 vertical: ');
  });

  it('LC-W2 horizontal = 1.0 × 8 = 8.0 lbs/ft', () => {
    assertClose(result.LC_W2.horizontal_lbs_ft, 8.0, 0.01, 'LC-W2 horizontal: ');
  });

  it('LC-S1 applicable = false when E = 0', () => {
    assert.strictEqual(result.LC_S1.applicable, false);
  });

  it('LC-S2 applicable = false when E = 0', () => {
    assert.strictEqual(result.LC_S2.applicable, false);
  });

  it('LC-W1 applicable = true when W > 0', () => {
    assert.strictEqual(result.LC_W1.applicable, true);
  });

  it('LC-W2 applicable = true when W > 0', () => {
    assert.strictEqual(result.LC_W2.applicable, true);
  });
});

// ---------------------------------------------------------------------------
// Group 2: Seismic-only inputs (W = 0, S = 0)
// ---------------------------------------------------------------------------
describe('calcLoadCombinations — seismic only (W=0, S=0)', () => {
  // D=15, E_lat=6, E_v=3
  // LC-S1: vertical = 1.2×15 + 3 + 0 = 21.0, horizontal = 6.0
  // LC-S2: vertical = 0.9×15 + 3 = 16.5, horizontal = 6.0
  const result = calcLoadCombinations({ D_lbs_ft: 15, E_lat_lbs_ft: 6, E_v_lbs_ft: 3 });

  it('LC-W1 applicable = false when W = 0', () => {
    assert.strictEqual(result.LC_W1.applicable, false);
  });

  it('LC-W2 applicable = false when W = 0', () => {
    assert.strictEqual(result.LC_W2.applicable, false);
  });

  it('LC-S1 applicable = true when E > 0', () => {
    assert.strictEqual(result.LC_S1.applicable, true);
  });

  it('LC-S1 vertical = 1.2×15 + 3 = 21.0 lbs/ft', () => {
    assertClose(result.LC_S1.vertical_lbs_ft, 21.0, 0.01, 'LC-S1 vertical: ');
  });

  it('LC-S1 horizontal = 1.0×6 = 6.0 lbs/ft', () => {
    assertClose(result.LC_S1.horizontal_lbs_ft, 6.0, 0.01, 'LC-S1 horizontal: ');
  });

  it('LC-S1 resultant = √(21² + 6²) = 21.847 lbs/ft', () => {
    const expected = Math.sqrt(21 * 21 + 6 * 6);
    assertClose(result.LC_S1.resultant_lbs_ft, expected, 0.02, 'LC-S1 resultant: ');
  });

  it('LC-S2 vertical = 0.9×15 + 3 = 16.5 lbs/ft', () => {
    assertClose(result.LC_S2.vertical_lbs_ft, 16.5, 0.01, 'LC-S2 vertical: ');
  });

  it('LC-S2 horizontal = 1.0×6 = 6.0 lbs/ft', () => {
    assertClose(result.LC_S2.horizontal_lbs_ft, 6.0, 0.01, 'LC-S2 horizontal: ');
  });
});

// ---------------------------------------------------------------------------
// Group 3: Combined all loads
// ---------------------------------------------------------------------------
describe('calcLoadCombinations — combined (D=12, W=9, E_lat=5, E_v=2.4, S=3)', () => {
  // LC-S1: vertical = 1.2×12 + 2.4 + 0.2×3 = 14.4 + 2.4 + 0.6 = 17.4, horizontal = 5.0
  // LC-S2: vertical = 0.9×12 + 2.4 = 10.8 + 2.4 = 13.2, horizontal = 5.0
  // LC-W1: vertical = 1.2×12 = 14.4, horizontal = 1.6×9 = 14.4
  // LC-W2: vertical = 0.9×12 = 10.8, horizontal = 1.0×9 = 9.0
  const result = calcLoadCombinations({
    D_lbs_ft: 12, W_lbs_ft: 9, E_lat_lbs_ft: 5, E_v_lbs_ft: 2.4, S_lbs_ft: 3,
  });

  it('all four combinations are applicable', () => {
    assert.strictEqual(result.LC_W1.applicable, true);
    assert.strictEqual(result.LC_W2.applicable, true);
    assert.strictEqual(result.LC_S1.applicable, true);
    assert.strictEqual(result.LC_S2.applicable, true);
  });

  it('LC-S1 vertical = 1.2×12 + 2.4 + 0.2×3 = 17.4 lbs/ft', () => {
    assertClose(result.LC_S1.vertical_lbs_ft, 17.4, 0.01, 'LC-S1 vertical: ');
  });

  it('LC-S1 horizontal = 5.0 lbs/ft', () => {
    assertClose(result.LC_S1.horizontal_lbs_ft, 5.0, 0.01, 'LC-S1 horizontal: ');
  });

  it('LC-S1 resultant = √(17.4² + 5²) = 18.104 lbs/ft', () => {
    const expected = Math.sqrt(17.4 * 17.4 + 5 * 5);
    assertClose(result.LC_S1.resultant_lbs_ft, expected, 0.02, 'LC-S1 resultant: ');
  });

  it('LC-S2 vertical = 0.9×12 + 2.4 = 13.2 lbs/ft', () => {
    assertClose(result.LC_S2.vertical_lbs_ft, 13.2, 0.01, 'LC-S2 vertical: ');
  });

  it('LC-W1 horizontal > LC-S1 horizontal when W > E_lat', () => {
    assert.ok(result.LC_W1.horizontal_lbs_ft > result.LC_S1.horizontal_lbs_ft,
      `Expected LC-W1 horizontal (${result.LC_W1.horizontal_lbs_ft}) > ` +
      `LC-S1 horizontal (${result.LC_S1.horizontal_lbs_ft})`);
  });
});

// ---------------------------------------------------------------------------
// Group 4: Envelope (findControllingCombination)
// ---------------------------------------------------------------------------
describe('findControllingCombination — envelope selection', () => {
  it('wind-heavy scenario: LC-W1 controls', () => {
    // Large W, small E — LC-W1 (1.6W factor) should produce highest resultant
    const combos = calcLoadCombinations({ D_lbs_ft: 10, W_lbs_ft: 20, E_lat_lbs_ft: 2 });
    const env = findControllingCombination(combos);
    assert.strictEqual(env.controllingId, 'LC-W1',
      `Expected LC-W1 to control, got ${env.controllingId}`);
  });

  it('seismic-heavy scenario: LC-S1 or LC-S2 controls', () => {
    // Large E, zero W — only seismic combos applicable
    const combos = calcLoadCombinations({ D_lbs_ft: 10, E_lat_lbs_ft: 15, E_v_lbs_ft: 5 });
    const env = findControllingCombination(combos);
    assert.ok(
      env.controllingId === 'LC-S1' || env.controllingId === 'LC-S2',
      `Expected seismic combo to control, got ${env.controllingId}`
    );
  });

  it('returns null when no load is applicable (pure dead load)', () => {
    // D only, no W or E — no combinations are applicable
    const combos = calcLoadCombinations({ D_lbs_ft: 10 });
    const env = findControllingCombination(combos);
    assert.strictEqual(env, null);
  });

  it('maxResultant_lbs_ft equals the controlling combination resultant', () => {
    const combos = calcLoadCombinations({ D_lbs_ft: 12, W_lbs_ft: 9, E_lat_lbs_ft: 5, E_v_lbs_ft: 2.4 });
    const env = findControllingCombination(combos);
    const controlling = combos[env.controllingId.replace('-', '_')];
    assertClose(env.maxResultant_lbs_ft, controlling.resultant_lbs_ft, 0.01);
  });

  it('envelope maxVertical is the highest vertical across applicable combinations', () => {
    const combos = calcLoadCombinations({ D_lbs_ft: 12, W_lbs_ft: 9, E_lat_lbs_ft: 5, E_v_lbs_ft: 2.4, S_lbs_ft: 3 });
    const env = findControllingCombination(combos);
    const applicable = [combos.LC_W1, combos.LC_W2, combos.LC_S1, combos.LC_S2].filter(c => c.applicable);
    const expected = Math.max(...applicable.map(c => c.vertical_lbs_ft));
    assertClose(env.maxVertical_lbs_ft, expected, 0.01, 'maxVertical: ');
  });

  it('envelope maxHorizontal is the highest horizontal across applicable combinations', () => {
    const combos = calcLoadCombinations({ D_lbs_ft: 12, W_lbs_ft: 9, E_lat_lbs_ft: 5, E_v_lbs_ft: 2.4 });
    const env = findControllingCombination(combos);
    const applicable = [combos.LC_W1, combos.LC_W2, combos.LC_S1, combos.LC_S2].filter(c => c.applicable);
    const expected = Math.max(...applicable.map(c => c.horizontal_lbs_ft));
    assertClose(env.maxHorizontal_lbs_ft, expected, 0.01, 'maxHorizontal: ');
  });
});

// ---------------------------------------------------------------------------
// Group 5: Convenience wrapper (evaluateLoadCombinations)
// ---------------------------------------------------------------------------
describe('evaluateLoadCombinations — convenience wrapper', () => {
  const result = evaluateLoadCombinations({ D_lbs_ft: 10, W_lbs_ft: 8, E_lat_lbs_ft: 3 });

  it('returns object with combinations key', () => {
    assert.ok(result.combinations, 'missing combinations key');
    assert.ok(result.combinations.LC_W1, 'missing LC_W1');
    assert.ok(result.combinations.LC_W2, 'missing LC_W2');
    assert.ok(result.combinations.LC_S1, 'missing LC_S1');
    assert.ok(result.combinations.LC_S2, 'missing LC_S2');
  });

  it('returns object with envelope key', () => {
    assert.ok(result.envelope, 'missing envelope key');
    assert.ok(typeof result.envelope.controllingId === 'string', 'controllingId is not a string');
  });

  it('envelope.maxResultant_lbs_ft is non-negative', () => {
    assert.ok(result.envelope.maxResultant_lbs_ft >= 0);
  });

  it('envelope.controllingId is one of the four combination IDs', () => {
    const valid = ['LC-W1', 'LC-W2', 'LC-S1', 'LC-S2'];
    assert.ok(valid.includes(result.envelope.controllingId),
      `Unexpected controllingId: ${result.envelope.controllingId}`);
  });
});

// ---------------------------------------------------------------------------
// Group 6: Error handling
// ---------------------------------------------------------------------------
describe('calcLoadCombinations — error handling', () => {
  it('throws for D = 0', () => {
    assert.throws(() => calcLoadCombinations({ D_lbs_ft: 0 }), /dead load/i);
  });

  it('throws for D = negative', () => {
    assert.throws(() => calcLoadCombinations({ D_lbs_ft: -5 }), /dead load/i);
  });

  it('throws for D = NaN', () => {
    assert.throws(() => calcLoadCombinations({ D_lbs_ft: NaN }), /dead load/i);
  });

  it('throws for S_lbs_ft = negative', () => {
    assert.throws(() => calcLoadCombinations({ D_lbs_ft: 10, S_lbs_ft: -1 }), /snow/i);
  });

  it('throws for non-finite E_lat_lbs_ft', () => {
    assert.throws(() => calcLoadCombinations({ D_lbs_ft: 10, E_lat_lbs_ft: Infinity }));
  });

  it('does NOT throw for W=0, E=0 (pure dead load is valid)', () => {
    assert.doesNotThrow(() => calcLoadCombinations({ D_lbs_ft: 10 }));
  });

  it('does NOT throw for S=0 (no snow is valid)', () => {
    assert.doesNotThrow(() => calcLoadCombinations({ D_lbs_ft: 10, W_lbs_ft: 5, S_lbs_ft: 0 }));
  });
});

// ---------------------------------------------------------------------------
// Group 7: Combination severity checks
// ---------------------------------------------------------------------------
describe('calcLoadCombinations — combination severity', () => {
  it('LC-W1 resultant > LC-W2 resultant when W is large', () => {
    const result = calcLoadCombinations({ D_lbs_ft: 10, W_lbs_ft: 20 });
    assert.ok(
      result.LC_W1.resultant_lbs_ft > result.LC_W2.resultant_lbs_ft,
      `LC-W1 (${result.LC_W1.resultant_lbs_ft}) should exceed LC-W2 (${result.LC_W2.resultant_lbs_ft})`
    );
  });

  it('LC-W1 horizontal = 1.6 × LC-W2 horizontal (same W)', () => {
    const result = calcLoadCombinations({ D_lbs_ft: 10, W_lbs_ft: 10 });
    assertClose(result.LC_W1.horizontal_lbs_ft, 1.6 * result.LC_W2.horizontal_lbs_ft, 0.01);
  });

  it('LC-S1 vertical > LC-S2 vertical (higher D factor in S1)', () => {
    const result = calcLoadCombinations({ D_lbs_ft: 10, E_lat_lbs_ft: 5, E_v_lbs_ft: 2 });
    assert.ok(
      result.LC_S1.vertical_lbs_ft > result.LC_S2.vertical_lbs_ft,
      `LC-S1 vertical (${result.LC_S1.vertical_lbs_ft}) should exceed LC-S2 (${result.LC_S2.vertical_lbs_ft})`
    );
  });

  it('snow load increases LC-S1 vertical but not LC-S2 vertical', () => {
    const noSnow   = calcLoadCombinations({ D_lbs_ft: 10, E_lat_lbs_ft: 5, E_v_lbs_ft: 2, S_lbs_ft: 0 });
    const withSnow = calcLoadCombinations({ D_lbs_ft: 10, E_lat_lbs_ft: 5, E_v_lbs_ft: 2, S_lbs_ft: 10 });
    assert.ok(withSnow.LC_S1.vertical_lbs_ft > noSnow.LC_S1.vertical_lbs_ft, 'Snow should raise LC-S1 vertical');
    assertClose(withSnow.LC_S2.vertical_lbs_ft, noSnow.LC_S2.vertical_lbs_ft, 0.01, 'Snow should not affect LC-S2: ');
  });
});

// ---------------------------------------------------------------------------
// Group 8: Citation structure
// ---------------------------------------------------------------------------
describe('calcLoadCombinations — citation structure', () => {
  const result = calcLoadCombinations({ D_lbs_ft: 10, W_lbs_ft: 8, E_lat_lbs_ft: 5 });
  const combos = [result.LC_W1, result.LC_W2, result.LC_S1, result.LC_S2];

  it('all combinations have nec.rule === "ASCE 7-22 Section 2.3.2"', () => {
    combos.forEach(c => {
      assert.strictEqual(c.nec.rule, 'ASCE 7-22 Section 2.3.2',
        `${c.id}: expected nec.rule 'ASCE 7-22 Section 2.3.2', got '${c.nec.rule}'`);
    });
  });

  it('all combinations have non-empty nec.description strings', () => {
    combos.forEach(c => {
      assert.ok(typeof c.nec.description === 'string' && c.nec.description.length > 0,
        `${c.id}: nec.description is empty or not a string`);
    });
  });

  it('all combinations have correct id strings', () => {
    const ids = combos.map(c => c.id);
    assert.deepStrictEqual(ids, ['LC-W1', 'LC-W2', 'LC-S1', 'LC-S2']);
  });

  it('all combinations have non-empty formula strings', () => {
    combos.forEach(c => {
      assert.ok(typeof c.formula === 'string' && c.formula.length > 0,
        `${c.id}: formula is empty or not a string`);
    });
  });
});
