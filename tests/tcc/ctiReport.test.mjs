/**
 * Unit tests for reports/coordinationReport.mjs
 * Run with: node tests/tcc/ctiReport.test.mjs
 */

import assert from 'assert';
import { buildCTIRows, CTI_HEADERS } from '../../reports/coordinationReport.mjs';

function describe(name, fn) { console.log(name); fn(); }
function it(name, fn) {
  try { fn(); console.log('  \u2713', name); }
  catch (err) { console.log('  \u2717', name); console.error(err); process.exitCode = 1; }
}

// ──────────────────────────────────────────────────────────────────────────────
// Helper: build a simple two-point curve where time decreases linearly on a
// log-log scale as current increases.
// ──────────────────────────────────────────────────────────────────────────────
function makeCurve(currentMin, currentMax, timeAtMin, timeAtMax) {
  return [
    { current: currentMin, time: timeAtMin },
    { current: currentMax, time: timeAtMax }
  ];
}

function makeScaledResult(curve) {
  return { curve, minCurve: curve, maxCurve: curve };
}

// Two-device scenario: downstream reference (index 0) and upstream (index 1).
// Upstream curve is uniformly 0.5 s slower than downstream.
const downCurve = makeCurve(100, 10000, 2, 0.1);
const upCurve = makeCurve(100, 10000, 2.6, 0.6);

const deviceEntries2 = [
  { id: 'CB-LOAD', device: {}, overrides: {} },
  { id: 'CB-SOURCE', device: {}, overrides: {} }
];

const coordResult2 = {
  allCoordinated: true,
  results: [
    { id: 'CB-LOAD', scaledResult: makeScaledResult(downCurve), timeDial: 1, found: true, violations: [] },
    { id: 'CB-SOURCE', scaledResult: makeScaledResult(upCurve), timeDial: 1, found: true, violations: [] }
  ]
};

const faultCurrentA = 10000;
const margin = 0.3;

// ──────────────────────────────────────────────────────────────────────────────
describe('CTI_HEADERS', () => {
  it('exports an array of 8 column header strings', () => {
    assert.strictEqual(Array.isArray(CTI_HEADERS), true);
    assert.strictEqual(CTI_HEADERS.length, 8);
    CTI_HEADERS.forEach(h => assert.strictEqual(typeof h, 'string'));
  });

  it('contains required column names', () => {
    assert(CTI_HEADERS.includes('Upstream Device'), 'missing Upstream Device');
    assert(CTI_HEADERS.includes('Downstream Device'), 'missing Downstream Device');
    assert(CTI_HEADERS.includes('Test Current (A)'), 'missing Test Current (A)');
    assert(CTI_HEADERS.includes('Margin (s)'), 'missing Margin (s)');
    assert(CTI_HEADERS.includes('Pass/Fail'), 'missing Pass/Fail');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('buildCTIRows — basic two-device scenario', () => {
  const rows = buildCTIRows(deviceEntries2, coordResult2, faultCurrentA, margin);

  it('returns 5 rows for one device pair (5 test-current levels)', () => {
    assert.strictEqual(rows.length, 5);
  });

  it('each row has all CTI_HEADERS as keys', () => {
    rows.forEach(row => {
      CTI_HEADERS.forEach(h => {
        assert(Object.prototype.hasOwnProperty.call(row, h), `row missing key: ${h}`);
      });
    });
  });

  it('Upstream Device is CB-SOURCE and Downstream Device is CB-LOAD', () => {
    rows.forEach(row => {
      assert.strictEqual(row['Upstream Device'], 'CB-SOURCE');
      assert.strictEqual(row['Downstream Device'], 'CB-LOAD');
    });
  });

  it('test currents are positive finite numbers', () => {
    rows.forEach(row => {
      const val = parseFloat(row['Test Current (A)']);
      assert(Number.isFinite(val) && val > 0, `invalid test current: ${val}`);
    });
  });

  it('times are positive finite numbers', () => {
    rows.forEach(row => {
      const up = parseFloat(row['Upstream Time (s)']);
      const down = parseFloat(row['Downstream Time (s)']);
      assert(Number.isFinite(up) && up > 0, `invalid upstream time: ${up}`);
      assert(Number.isFinite(down) && down > 0, `invalid downstream time: ${down}`);
    });
  });

  it('Required CTI matches the margin argument', () => {
    rows.forEach(row => {
      assert.strictEqual(parseFloat(row['Required CTI (s)']), margin);
    });
  });

  it('Pass/Fail is PASS when upstream time - downstream time >= margin', () => {
    rows.forEach(row => {
      const up = parseFloat(row['Upstream Time (s)']);
      const down = parseFloat(row['Downstream Time (s)']);
      const actualMargin = parseFloat(row['Margin (s)']);
      const expectedPass = actualMargin >= margin;
      assert.strictEqual(row['Pass/Fail'], expectedPass ? 'PASS' : 'FAIL');
      // Verify Margin column consistency
      assert(Math.abs(up - down - actualMargin) < 1e-3, 'Margin column inconsistent with times');
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('buildCTIRows — three-device scenario', () => {
  const deviceEntries3 = [
    { id: 'FUSE-A', device: {}, overrides: {} },
    { id: 'CB-B', device: {}, overrides: {} },
    { id: 'RELAY-C', device: {}, overrides: {} }
  ];
  const coordResult3 = {
    allCoordinated: true,
    results: [
      { id: 'FUSE-A', scaledResult: makeScaledResult(downCurve), timeDial: 1, found: true, violations: [] },
      { id: 'CB-B', scaledResult: makeScaledResult(upCurve), timeDial: 1, found: true, violations: [] },
      { id: 'RELAY-C', scaledResult: makeScaledResult(makeCurve(100, 10000, 3.2, 1.2)), timeDial: 1, found: true, violations: [] }
    ]
  };

  it('returns 10 rows for two device pairs (2 × 5 levels)', () => {
    const rows = buildCTIRows(deviceEntries3, coordResult3, faultCurrentA, margin);
    assert.strictEqual(rows.length, 10);
  });

  it('first 5 rows are for pair CB-B / FUSE-A, next 5 for RELAY-C / CB-B', () => {
    const rows = buildCTIRows(deviceEntries3, coordResult3, faultCurrentA, margin);
    rows.slice(0, 5).forEach(row => {
      assert.strictEqual(row['Downstream Device'], 'FUSE-A');
      assert.strictEqual(row['Upstream Device'], 'CB-B');
    });
    rows.slice(5, 10).forEach(row => {
      assert.strictEqual(row['Downstream Device'], 'CB-B');
      assert.strictEqual(row['Upstream Device'], 'RELAY-C');
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('buildCTIRows — FAIL rows when upstream is too fast', () => {
  // Upstream curve matches downstream exactly — no margin
  const failCoordResult = {
    allCoordinated: false,
    results: [
      { id: 'CB-LOAD', scaledResult: makeScaledResult(downCurve), timeDial: 1, found: true, violations: [] },
      { id: 'CB-SOURCE', scaledResult: makeScaledResult(downCurve), timeDial: 1, found: false, violations: [] }
    ]
  };

  it('all rows are FAIL when upstream == downstream (zero margin)', () => {
    const rows = buildCTIRows(deviceEntries2, failCoordResult, faultCurrentA, margin);
    assert.strictEqual(rows.length, 5);
    rows.forEach(row => {
      assert.strictEqual(row['Pass/Fail'], 'FAIL', `expected FAIL, got ${row['Pass/Fail']}`);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('buildCTIRows — edge cases / invalid inputs', () => {
  it('returns [] for empty deviceEntries array', () => {
    const rows = buildCTIRows([], coordResult2, faultCurrentA, margin);
    assert.strictEqual(rows.length, 0);
  });

  it('returns [] for single device (no pairs)', () => {
    const singleResult = {
      allCoordinated: true,
      results: [{ id: 'CB-LOAD', scaledResult: makeScaledResult(downCurve), timeDial: 1, found: true, violations: [] }]
    };
    const rows = buildCTIRows([deviceEntries2[0]], singleResult, faultCurrentA, margin);
    assert.strictEqual(rows.length, 0);
  });

  it('returns [] for null deviceEntries', () => {
    assert.strictEqual(buildCTIRows(null, coordResult2, faultCurrentA, margin).length, 0);
  });

  it('returns [] for null coordResult', () => {
    assert.strictEqual(buildCTIRows(deviceEntries2, null, faultCurrentA, margin).length, 0);
  });

  it('returns [] for non-positive faultCurrentA', () => {
    assert.strictEqual(buildCTIRows(deviceEntries2, coordResult2, 0, margin).length, 0);
    assert.strictEqual(buildCTIRows(deviceEntries2, coordResult2, -1, margin).length, 0);
    assert.strictEqual(buildCTIRows(deviceEntries2, coordResult2, NaN, margin).length, 0);
  });

  it('falls back to default margin (0.3) when margin argument is invalid', () => {
    const rows = buildCTIRows(deviceEntries2, coordResult2, faultCurrentA, -0.5);
    assert.strictEqual(rows.length, 5);
    rows.forEach(row => {
      assert.strictEqual(parseFloat(row['Required CTI (s)']), 0.3);
    });
  });
});
