/**
 * Unit tests for reports/coordinationReport.mjs
 * Run with: node tests/tcc/ctiReport.test.mjs
 */

import assert from 'assert';
import { readFile } from 'fs/promises';
import { scaleCurve } from '../../analysis/tccUtils.js';
import { buildCTIRows, CTI_HEADERS } from '../../reports/coordinationReport.mjs';

const library = JSON.parse(await readFile(new URL('../../data/protectiveDevices.json', import.meta.url), 'utf8'));

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
  it('exports an array of 12 column header strings', () => {
    assert.strictEqual(Array.isArray(CTI_HEADERS), true);
    assert.strictEqual(CTI_HEADERS.length, 12);
    CTI_HEADERS.forEach(h => assert.strictEqual(typeof h, 'string'));
  });

  it('contains required column names', () => {
    assert(CTI_HEADERS.includes('Upstream Device'), 'missing Upstream Device');
    assert(CTI_HEADERS.includes('Downstream Device'), 'missing Downstream Device');
    assert(CTI_HEADERS.includes('Study Readiness'), 'missing Study Readiness');
    assert(CTI_HEADERS.includes('Fault Current Source'), 'missing Fault Current Source');
    assert(CTI_HEADERS.includes('Test Current (A)'), 'missing Test Current (A)');
    assert(CTI_HEADERS.includes('Margin (s)'), 'missing Margin (s)');
    assert(CTI_HEADERS.includes('Pass/Fail'), 'missing Pass/Fail');
  });
});

describe('buildCTIRows — study provenance', () => {
  const studyContext = {
    faultCurrentSource: 'Short Circuit study — BUS-1 (three-phase)',
    provenance: {
      heading: 'Device evidence is calculation-ready',
      inputFingerprint: '1234abcd',
      intendedUse: 'Qualified human review required.',
    },
  };
  const rows = buildCTIRows(deviceEntries2, coordResult2, faultCurrentA, margin, { studyContext });

  it('preserves readiness and fault-current provenance on every exported row', () => {
    rows.forEach(row => {
      assert.strictEqual(row['Study Readiness'], 'Device evidence is calculation-ready');
      assert.strictEqual(row['Fault Current Source'], 'Short Circuit study — BUS-1 (three-phase)');
      assert.strictEqual(row['Input Fingerprint'], '1234abcd');
      assert.strictEqual(row['Intended Use'], 'Qualified human review required.');
    });
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
describe('buildCTIRows — devices below pickup do not trip', () => {
  // Upstream curve starts at 1200 A, so it does not operate for a 1000 A fault.
  const highPickupUpstream = makeCurve(1200, 20000, 30, 0.5);
  const noTripResult = {
    allCoordinated: false,
    results: [
      { id: 'CB-LOAD', scaledResult: makeScaledResult(downCurve), timeDial: 1, found: true, violations: [] },
      { id: 'CB-SOURCE', scaledResult: makeScaledResult(highPickupUpstream), timeDial: 1, found: true, violations: [] }
    ]
  };
  const rows = buildCTIRows(deviceEntries2, noTripResult, 1000, margin);
  const byCurrent = Object.fromEntries(rows.map(row => [row['Test Current (A)'], row]));

  it('prints "No trip" for the upstream device below its minimum curve current', () => {
    assert.strictEqual(rows.length, 5);
    rows.forEach(row => {
      assert.strictEqual(row['Upstream Time (s)'], 'No trip', `expected No trip at ${row['Test Current (A)']} A`);
      assert.notStrictEqual(row['Upstream Time (s)'], '30.0000');
    });
  });

  it('reports PASS without a fictitious margin when only the upstream device does not operate', () => {
    const row = byCurrent['1000.0'];
    // Downstream 100 A/2 s → 10 kA/0.1 s; 1000 A is the log midpoint: sqrt(2 × 0.1) s.
    assert.strictEqual(row['Downstream Time (s)'], Math.sqrt(0.2).toFixed(4));
    assert.strictEqual(row['Margin (s)'], 'N/A');
    assert.strictEqual(row['Pass/Fail'], 'PASS (upstream does not operate)');
    assert.strictEqual(byCurrent['100.0']['Pass/Fail'], 'PASS (upstream does not operate)');
  });

  it('reports NOT EVALUATED when the downstream device does not operate', () => {
    const row = byCurrent['50.0'];
    assert.strictEqual(row['Downstream Time (s)'], 'No trip');
    assert.strictEqual(row['Margin (s)'], 'N/A');
    assert.strictEqual(row['Pass/Fail'], 'NOT EVALUATED (downstream does not operate)');
  });

  it('reports NOT EVALUATED above a curve maximum current instead of holding the last time', () => {
    const shortDownstream = makeCurve(100, 5000, 2, 0.2);
    const aboveResult = {
      allCoordinated: false,
      results: [
        { id: 'CB-LOAD', scaledResult: makeScaledResult(shortDownstream), timeDial: 1, found: true, violations: [] },
        { id: 'CB-SOURCE', scaledResult: makeScaledResult(upCurve), timeDial: 1, found: true, violations: [] }
      ]
    };
    const aboveRows = buildCTIRows(deviceEntries2, aboveResult, 8000, margin);
    const top = aboveRows.find(row => row['Test Current (A)'] === '8000.0');
    assert.strictEqual(top['Downstream Time (s)'], 'Above curve range');
    assert.strictEqual(top['Margin (s)'], 'N/A');
    assert.strictEqual(top['Pass/Fail'], 'NOT EVALUATED (outside curve data)');
    const inRange = aboveRows.find(row => row['Test Current (A)'] === '2000.0');
    assert.match(inRange['Pass/Fail'], /^(PASS|FAIL)$/);
  });

  it('keeps an instantaneous element operating above its plotted ceiling', () => {
    const breaker = scaleCurve(library.find(d => d.id === 'abb_tmax_160'), { pickup: 100 });
    const relay = scaleCurve(library.find(d => d.id === 'ge_multilin_750'), { pickup: 600 });
    const instRows = buildCTIRows(deviceEntries2, {
      allCoordinated: false,
      results: [
        { id: 'CB-LOAD', scaledResult: breaker, timeDial: 1, found: true, violations: [] },
        { id: 'CB-SOURCE', scaledResult: relay, timeDial: 1, found: true, violations: [] }
      ]
    }, 10000, margin);
    const top = instRows.find(row => row['Test Current (A)'] === '10000.0');
    // The relay curve is plotted only to 10 x its 600 A instantaneous pickup.
    assert.strictEqual(top['Upstream Time (s)'], '0.0075');
    assert.strictEqual(top['Downstream Time (s)'], '0.0125');
    assert.strictEqual(top['Pass/Fail'], 'FAIL');
    instRows.forEach(row => {
      assert.notStrictEqual(row['Upstream Time (s)'], '0.0001');
      assert.notStrictEqual(row['Downstream Time (s)'], '0.0001');
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
