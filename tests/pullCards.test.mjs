/**
 * Tests for analysis/pullCards.mjs — Cable Pull Card & Pull Table Generator
 */
import assert from 'assert';
import {
  groupCablesIntoPulls,
  buildPullCard,
  buildPullTable,
  generateQRDataURL,
  cableQRPayload,
} from '../analysis/pullCards.mjs';

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
// Test data
// ---------------------------------------------------------------------------

const cableList = [
  { name: 'C1', cable_type: 'Power', conductors: 3, conductor_size: '#12 AWG', diameter: 0.75, weight: 0.5, allowed_cable_group: 'HV' },
  { name: 'C2', cable_type: 'Power', conductors: 3, conductor_size: '#12 AWG', diameter: 0.75, weight: 0.5, allowed_cable_group: 'HV' },
  { name: 'C3', cable_type: 'Control', conductors: 7, conductor_size: '#18 AWG', diameter: 0.45, weight: 0.2, allowed_cable_group: 'LV' },
  { name: 'C4', cable_type: 'Power', conductors: 3, conductor_size: '#12 AWG', diameter: 0.75, weight: 0.5, allowed_cable_group: 'HV' },
  { name: 'C5', cable_type: 'Control', conductors: 7, conductor_size: '#18 AWG', diameter: 0.45, weight: 0.2, allowed_cable_group: 'LV' },
];

// C1 and C2 share the same route and type — should be grouped
// C3 and C5 share the same route but are Control type — should be grouped separately from Power
// C4 takes a different route — should be a separate pull
const routeResults = [
  {
    cable: 'C1',
    status: '✓ Routed',
    total_length: 50,
    breakdown: [
      { tray_id: 'T1', length: 20, start: [0, 0, 0], end: [20, 0, 0] },
      { tray_id: 'T2', length: 30, start: [20, 0, 0], end: [50, 0, 0] },
    ],
    route_segments: [
      { type: 'straight', length: 20 },
      { type: 'straight', length: 30 },
    ],
  },
  {
    cable: 'C2',
    status: '✓ Routed',
    total_length: 50,
    breakdown: [
      { tray_id: 'T1', length: 20, start: [0, 0, 0], end: [20, 0, 0] },
      { tray_id: 'T2', length: 30, start: [20, 0, 0], end: [50, 0, 0] },
    ],
    route_segments: [
      { type: 'straight', length: 20 },
      { type: 'straight', length: 30 },
    ],
  },
  {
    cable: 'C3',
    status: '✓ Routed',
    total_length: 40,
    breakdown: [
      { tray_id: 'T3', length: 15, start: [0, 0, 0], end: [15, 0, 0] },
      { tray_id: 'T4', length: 25, start: [15, 0, 0], end: [40, 0, 0] },
    ],
    route_segments: [
      { type: 'straight', length: 15 },
      { type: 'straight', length: 25 },
    ],
  },
  {
    cable: 'C4',
    status: '✓ Routed',
    total_length: 60,
    breakdown: [
      { tray_id: 'T1', length: 20, start: [0, 0, 0], end: [20, 0, 0] },
      { tray_id: 'T5', length: 40, start: [20, 0, 0], end: [60, 0, 0] },
    ],
    route_segments: [
      { type: 'straight', length: 20 },
      { type: 'straight', length: 40 },
    ],
  },
  {
    cable: 'C5',
    status: '✓ Routed',
    total_length: 40,
    breakdown: [
      { tray_id: 'T3', length: 15, start: [0, 0, 0], end: [15, 0, 0] },
      { tray_id: 'T4', length: 25, start: [15, 0, 0], end: [40, 0, 0] },
    ],
    route_segments: [
      { type: 'straight', length: 15 },
      { type: 'straight', length: 25 },
    ],
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('groupCablesIntoPulls', () => {
  it('groups cables with same type and route into one pull', () => {
    const pulls = groupCablesIntoPulls(routeResults, cableList);
    // C1+C2 = Power through T1→T2
    const powerPullT1T2 = pulls.find(p =>
      p.cable_type === 'Power' && p.cables.some(c => c.tag === 'C1') && p.cables.some(c => c.tag === 'C2')
    );
    assert.ok(powerPullT1T2, 'Should find a pull containing C1 and C2');
    assert.strictEqual(powerPullT1T2.cable_count, 2);
  });

  it('separates cables with different types even on same route', () => {
    // Create a scenario where Power and Control share the same route
    const mixed = [
      { ...routeResults[0], cable: 'P1' },
      { ...routeResults[0], cable: 'CT1' },
    ];
    const mixedCables = [
      { name: 'P1', cable_type: 'Power', diameter: 0.75, weight: 0.5 },
      { name: 'CT1', cable_type: 'Control', diameter: 0.45, weight: 0.2 },
    ];
    const pulls = groupCablesIntoPulls(mixed, mixedCables);
    assert.strictEqual(pulls.length, 2, 'Different types on same route should produce 2 pulls');
  });

  it('separates cables with different routes even if same type', () => {
    const pulls = groupCablesIntoPulls(routeResults, cableList);
    // C4 is Power but goes T1→T5 (different from C1/C2 which go T1→T2)
    const c4Pull = pulls.find(p => p.cables.some(c => c.tag === 'C4'));
    assert.ok(c4Pull, 'C4 should be in its own pull');
    assert.strictEqual(c4Pull.cable_count, 1, 'C4 should be alone in its pull');
  });

  it('groups Control cables with same route together', () => {
    const pulls = groupCablesIntoPulls(routeResults, cableList);
    const controlPull = pulls.find(p =>
      p.cable_type === 'Control' && p.cables.some(c => c.tag === 'C3')
    );
    assert.ok(controlPull, 'Should find a Control pull');
    assert.strictEqual(controlPull.cable_count, 2, 'C3 and C5 should be grouped');
    assert.ok(controlPull.cables.some(c => c.tag === 'C5'), 'C5 should be in the Control pull');
  });

  it('returns empty array for empty input', () => {
    assert.deepStrictEqual(groupCablesIntoPulls([], []), []);
  });

  it('skips failed routes', () => {
    const failed = [{ cable: 'X', status: '✗ Failed', breakdown: [] }];
    assert.deepStrictEqual(groupCablesIntoPulls(failed, []), []);
  });

  it('assigns sequential pull numbers sorted by cable count descending', () => {
    const pulls = groupCablesIntoPulls(routeResults, cableList);
    // Multi-cable pulls should come first
    assert.ok(pulls[0].cable_count >= pulls[pulls.length - 1].cable_count);
    pulls.forEach((p, i) => {
      assert.strictEqual(p.pull_number, i + 1);
    });
  });
});

describe('buildPullCard', () => {
  it('computes tension and physical properties', () => {
    const pulls = groupCablesIntoPulls(routeResults, cableList);
    const multiPull = pulls.find(p => p.cable_count === 2 && p.cable_type === 'Power');
    assert.ok(multiPull, 'Should have a multi-cable Power pull');

    const card = buildPullCard(multiPull);
    assert.strictEqual(card.cable_count, 2);
    assert.strictEqual(card.cable_tags.length, 2);
    assert.ok(card.total_length_ft > 0, 'Should have positive length');
    assert.ok(card.total_weight_lb_ft > 0, 'Should have positive combined weight');
    assert.ok(card.max_diameter_in > 0, 'Should have positive max diameter');
    assert.ok(card.total_cross_section_area_sqin > 0, 'Should have positive cross-section area');
    assert.ok(card.route_steps.length > 0, 'Should have route steps');
    assert.ok(card.estimated_tension_lbs >= 0, 'Should have non-negative tension');
  });

  it('identifies from/to coordinates', () => {
    const pulls = groupCablesIntoPulls(routeResults, cableList);
    const card = buildPullCard(pulls[0]);
    assert.ok(card.from, 'Should have a from coordinate');
    assert.ok(card.to, 'Should have a to coordinate');
  });

  it('includes route steps with type and raceway ID', () => {
    const pulls = groupCablesIntoPulls(routeResults, cableList);
    const card = buildPullCard(pulls[0]);
    for (const step of card.route_steps) {
      assert.ok(step.step > 0);
      assert.ok(['Tray', 'Conduit', 'Field'].includes(step.type));
    }
  });
});

describe('buildPullTable', () => {
  it('returns pulls and summary', () => {
    const { pulls, summary } = buildPullTable(routeResults, cableList);

    assert.ok(Array.isArray(pulls));
    assert.ok(pulls.length > 0);

    // 5 cables total
    assert.strictEqual(summary.total_cables, 5);
    // 3 pulls: (C1+C2 Power T1→T2), (C3+C5 Control T3→T4), (C4 Power T1→T5)
    assert.strictEqual(summary.total_pulls, 3);
    assert.strictEqual(summary.multi_cable_pulls, 2);
    assert.strictEqual(summary.single_cable_pulls, 1);
  });

  it('computes average cables per pull', () => {
    const { summary } = buildPullTable(routeResults, cableList);
    const expected = Math.round((5 / 3) * 10) / 10;
    assert.strictEqual(summary.cables_per_pull_avg, expected);
  });

  it('handles conduit segments in route signature', () => {
    const conduitResults = [
      {
        cable: 'D1',
        status: '✓ Routed',
        total_length: 30,
        breakdown: [
          { tray_id: '', conduit_id: 'C1', ductbankTag: 'DB1', length: 30, start: [0,0,-3], end: [30,0,-3] },
        ],
        route_segments: [{ type: 'straight', length: 30 }],
      },
      {
        cable: 'D2',
        status: '✓ Routed',
        total_length: 30,
        breakdown: [
          { tray_id: '', conduit_id: 'C1', ductbankTag: 'DB1', length: 30, start: [0,0,-3], end: [30,0,-3] },
        ],
        route_segments: [{ type: 'straight', length: 30 }],
      },
    ];
    const conduitCables = [
      { name: 'D1', cable_type: 'Power', diameter: 1.0, weight: 1.0 },
      { name: 'D2', cable_type: 'Power', diameter: 1.0, weight: 1.0 },
    ];
    const { pulls, summary } = buildPullTable(conduitResults, conduitCables);
    assert.strictEqual(summary.total_pulls, 1, 'Cables in same conduit should be one pull');
    assert.strictEqual(pulls[0].cable_count, 2);
  });

  it('handles field route segments in grouping', () => {
    const fieldResults = [
      {
        cable: 'F1',
        status: '✓ Routed',
        total_length: 25,
        breakdown: [
          { tray_id: 'N/A', length: 10, start: [0,0,0], end: [10,0,0] },
          { tray_id: 'T1', length: 15, start: [10,0,0], end: [25,0,0] },
        ],
        route_segments: [{ type: 'straight', length: 10 }, { type: 'straight', length: 15 }],
      },
      {
        cable: 'F2',
        status: '✓ Routed',
        total_length: 25,
        breakdown: [
          { tray_id: 'N/A', length: 10, start: [0,0,0], end: [10,0,0] },
          { tray_id: 'T1', length: 15, start: [10,0,0], end: [25,0,0] },
        ],
        route_segments: [{ type: 'straight', length: 10 }, { type: 'straight', length: 15 }],
      },
    ];
    const fieldCables = [
      { name: 'F1', cable_type: 'Signal', diameter: 0.3, weight: 0.1 },
      { name: 'F2', cable_type: 'Signal', diameter: 0.3, weight: 0.1 },
    ];
    const { pulls } = buildPullTable(fieldResults, fieldCables);
    assert.strictEqual(pulls.length, 1, 'Cables with same field+tray route should group');
    assert.strictEqual(pulls[0].cable_count, 2);
  });
});

// Sync tests for cableQRPayload
describe('cableQRPayload', () => {
  it('produces a URL with the cable tag in the fragment', () => {
    const payload = cableQRPayload('CABLE-001');
    assert.ok(payload.includes('cableschedule.html#cable=CABLE-001'), `Got: ${payload}`);
  });

  it('URL-encodes special characters in the cable tag', () => {
    const payload = cableQRPayload('CABLE A/B');
    assert.ok(payload.includes('CABLE%20A%2FB'), `Got: ${payload}`);
  });

  it('uses custom base URL when provided', () => {
    const payload = cableQRPayload('X', 'http://localhost:3000');
    assert.ok(payload.startsWith('http://localhost:3000'), `Got: ${payload}`);
  });
});

// Async tests for generateQRDataURL — run after all sync tests via top-level await
console.log('generateQRDataURL (async)');
async function runQRTests() {
  const tests = [
    ['returns a PNG data URL string for a simple text input', async () => {
      const url = await generateQRDataURL('TEST-CABLE-001');
      assert.ok(typeof url === 'string', 'Should return a string');
      assert.ok(url.startsWith('data:image/png;base64,'), `Expected PNG data URL, got: ${url?.slice(0, 40)}`);
    }],
    ['returns a non-empty base64 payload', async () => {
      const url = await generateQRDataURL('CABLE-TAG-X1');
      const b64 = url.replace('data:image/png;base64,', '');
      assert.ok(b64.length > 100, 'Base64 payload should be substantial');
    }],
    ['gracefully handles empty string input', async () => {
      const url = await generateQRDataURL('');
      assert.ok(url === null || (typeof url === 'string' && url.startsWith('data:image/')),
        'Should return data URL or null');
    }],
  ];
  for (const [name, fn] of tests) {
    try {
      await fn();
      console.log('  \u2713', name);
    } catch (err) {
      console.error('  \u2717', name, err.message || err);
      process.exitCode = 1;
    }
  }
}
await runQRTests();

describe('edge cases', () => {
  it('handles cables with no matching cable list entry', () => {
    const results = [{
      cable: 'UNKNOWN',
      status: '✓ Routed',
      total_length: 10,
      breakdown: [{ tray_id: 'T1', length: 10, start: [0,0,0], end: [10,0,0] }],
      route_segments: [{ type: 'straight', length: 10 }],
    }];
    const { pulls } = buildPullTable(results, []);
    assert.strictEqual(pulls.length, 1);
    assert.strictEqual(pulls[0].cables[0].tag, 'UNKNOWN');
    assert.strictEqual(pulls[0].cable_type, 'Power'); // default
  });

  it('handles single cable producing a single pull', () => {
    const results = [{
      cable: 'SOLO',
      status: '✓ Routed',
      total_length: 100,
      breakdown: [{ tray_id: 'T9', length: 100, start: [0,0,0], end: [100,0,0] }],
      route_segments: [{ type: 'straight', length: 100 }],
    }];
    const cables = [{ name: 'SOLO', cable_type: 'Power', diameter: 1.5, weight: 2.0 }];
    const { pulls, summary } = buildPullTable(results, cables);
    assert.strictEqual(summary.total_pulls, 1);
    assert.strictEqual(summary.single_cable_pulls, 1);
    assert.strictEqual(summary.multi_cable_pulls, 0);
  });
});
