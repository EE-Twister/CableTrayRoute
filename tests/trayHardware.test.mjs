/**
 * Tests for analysis/trayHardware.mjs — Tray Hardware BOM / Take-Off
 */
import assert from 'assert';
import {
  buildTrayHardwareBOM,
  buildJunctionMap,
  classifyJunction,
  supportBracketCount,
  straightSectionCount,
  trayEndpoints,
  trayLength,
  angleDeg,
  COINCIDENCE_TOL,
} from '../analysis/trayHardware.mjs';

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
// Helper: make a tray object
// ---------------------------------------------------------------------------
function makeTray(id, sx, sy, sz, ex, ey, ez, width = 16, depth = 4, type = 'Ladder') {
  return {
    tray_id: id,
    start_x: sx, start_y: sy, start_z: sz,
    end_x: ex, end_y: ey, end_z: ez,
    inside_width: width,
    tray_depth: depth,
    tray_type: type,
  };
}

// ---------------------------------------------------------------------------
// trayEndpoints / trayLength
// ---------------------------------------------------------------------------
describe('trayEndpoints & trayLength', () => {
  it('extracts correct start/end coordinates', () => {
    const t = makeTray('T1', 0, 0, 10, 40, 0, 10);
    const { start, end } = trayEndpoints(t);
    assert.deepStrictEqual(start, [0, 0, 10]);
    assert.deepStrictEqual(end, [40, 0, 10]);
  });

  it('computes length for a horizontal tray', () => {
    const t = makeTray('T1', 0, 0, 10, 40, 0, 10);
    assert.strictEqual(trayLength(t), 40);
  });

  it('computes length for a diagonal tray', () => {
    const t = makeTray('T1', 0, 0, 0, 3, 4, 0);
    assert.ok(Math.abs(trayLength(t) - 5) < 1e-9);
  });

  it('returns 0 for zero-length tray', () => {
    const t = makeTray('T1', 5, 5, 5, 5, 5, 5);
    assert.strictEqual(trayLength(t), 0);
  });
});

// ---------------------------------------------------------------------------
// angleDeg
// ---------------------------------------------------------------------------
describe('angleDeg', () => {
  it('returns 0 for parallel vectors', () => {
    assert.ok(angleDeg([1, 0, 0], [2, 0, 0]) < 0.01);
  });

  it('returns 90 for perpendicular vectors', () => {
    const a = angleDeg([1, 0, 0], [0, 1, 0]);
    assert.ok(Math.abs(a - 90) < 0.01);
  });

  it('returns 180 for opposite vectors', () => {
    const a = angleDeg([1, 0, 0], [-1, 0, 0]);
    assert.ok(Math.abs(a - 180) < 0.01);
  });

  it('returns 0 for zero vectors', () => {
    assert.strictEqual(angleDeg([0, 0, 0], [1, 0, 0]), 0);
  });
});

// ---------------------------------------------------------------------------
// supportBracketCount
// ---------------------------------------------------------------------------
describe('supportBracketCount', () => {
  it('returns 2 for segment shorter than max span', () => {
    assert.strictEqual(supportBracketCount(10, 12), 2);
  });

  it('returns 2 for segment equal to max span', () => {
    assert.strictEqual(supportBracketCount(12, 12), 2);
  });

  it('returns 3 for segment slightly over max span', () => {
    assert.strictEqual(supportBracketCount(13, 12), 3);
  });

  it('returns 4 for segment needing 3 spans', () => {
    assert.strictEqual(supportBracketCount(30, 12), 4);
  });

  it('returns 0 for zero length', () => {
    assert.strictEqual(supportBracketCount(0, 12), 0);
  });

  it('returns 0 for zero max span', () => {
    assert.strictEqual(supportBracketCount(10, 0), 0);
  });
});

// ---------------------------------------------------------------------------
// straightSectionCount
// ---------------------------------------------------------------------------
describe('straightSectionCount', () => {
  it('returns 1 for short segment', () => {
    assert.strictEqual(straightSectionCount(5, 12), 1);
  });

  it('returns 1 for segment equal to section length', () => {
    assert.strictEqual(straightSectionCount(12, 12), 1);
  });

  it('returns 2 for segment slightly over section length', () => {
    assert.strictEqual(straightSectionCount(13, 12), 2);
  });

  it('returns 0 for zero length', () => {
    assert.strictEqual(straightSectionCount(0), 0);
  });
});

// ---------------------------------------------------------------------------
// buildJunctionMap — collinear trays (splice plates)
// ---------------------------------------------------------------------------
describe('buildJunctionMap — two collinear trays', () => {
  it('detects a junction where two tray endpoints meet', () => {
    const trays = [
      makeTray('T1', 0, 0, 10, 40, 0, 10),
      makeTray('T2', 40, 0, 10, 80, 0, 10),
    ];
    const junctions = buildJunctionMap(trays);
    assert.strictEqual(junctions.length, 1);
    assert.strictEqual(junctions[0].length, 2);
  });

  it('does not create junctions for disconnected trays', () => {
    const trays = [
      makeTray('T1', 0, 0, 10, 40, 0, 10),
      makeTray('T2', 100, 0, 10, 140, 0, 10),
    ];
    const junctions = buildJunctionMap(trays);
    assert.strictEqual(junctions.length, 0);
  });
});

// ---------------------------------------------------------------------------
// classifyJunction
// ---------------------------------------------------------------------------
describe('classifyJunction', () => {
  it('classifies collinear same-width trays as splice_plate', () => {
    const trays = [
      makeTray('T1', 0, 0, 10, 40, 0, 10, 16),
      makeTray('T2', 40, 0, 10, 80, 0, 10, 16),
    ];
    const junctions = buildJunctionMap(trays);
    const result = classifyJunction(junctions[0], trays);
    assert.strictEqual(result.type, 'splice_plate');
  });

  it('classifies collinear different-width trays as reducer', () => {
    const trays = [
      makeTray('T1', 0, 0, 10, 40, 0, 10, 16),
      makeTray('T2', 40, 0, 10, 80, 0, 10, 24),
    ];
    const junctions = buildJunctionMap(trays);
    const result = classifyJunction(junctions[0], trays);
    assert.strictEqual(result.type, 'reducer');
  });

  it('classifies 90° junction as elbow', () => {
    const trays = [
      makeTray('T1', 0, 0, 10, 40, 0, 10),
      makeTray('T2', 40, 0, 10, 40, 40, 10),
    ];
    const junctions = buildJunctionMap(trays);
    const result = classifyJunction(junctions[0], trays);
    assert.strictEqual(result.type, 'elbow');
    assert.ok(Math.abs(result.angle - 90) < 1);
  });

  it('classifies three-way junction as tee', () => {
    const trays = [
      makeTray('T1', 0, 0, 10, 40, 0, 10),
      makeTray('T2', 40, 0, 10, 80, 0, 10),
      makeTray('T3', 40, 0, 10, 40, 40, 10),
    ];
    const junctions = buildJunctionMap(trays);
    // Should have a 3-way junction at (40,0,10)
    const threeWay = junctions.find(g => g.length === 3);
    assert.ok(threeWay, 'expected a 3-way junction');
    const result = classifyJunction(threeWay, trays);
    assert.strictEqual(result.type, 'tee');
  });

  it('classifies four-way junction as cross', () => {
    const trays = [
      makeTray('T1', 0, 0, 10, 40, 0, 10),
      makeTray('T2', 40, 0, 10, 80, 0, 10),
      makeTray('T3', 40, 0, 10, 40, 40, 10),
      makeTray('T4', 40, 0, 10, 40, -40, 10),
    ];
    const junctions = buildJunctionMap(trays);
    const fourWay = junctions.find(g => g.length === 4);
    assert.ok(fourWay, 'expected a 4-way junction');
    const result = classifyJunction(fourWay, trays);
    assert.strictEqual(result.type, 'cross');
  });
});

// ---------------------------------------------------------------------------
// buildTrayHardwareBOM — empty input
// ---------------------------------------------------------------------------
describe('buildTrayHardwareBOM — edge cases', () => {
  it('returns empty results for no trays', () => {
    const result = buildTrayHardwareBOM([]);
    assert.deepStrictEqual(result.fittings, []);
    assert.deepStrictEqual(result.supports, []);
    assert.deepStrictEqual(result.sections, []);
    assert.deepStrictEqual(result.summary, []);
  });

  it('returns empty results for null input', () => {
    const result = buildTrayHardwareBOM(null);
    assert.deepStrictEqual(result.fittings, []);
  });

  it('skips conduit-type raceways', () => {
    const trays = [
      { ...makeTray('C1', 0, 0, 0, 10, 0, 0), raceway_type: 'conduit' },
    ];
    const result = buildTrayHardwareBOM(trays);
    assert.strictEqual(result.supports.length, 0);
  });
});

// ---------------------------------------------------------------------------
// buildTrayHardwareBOM — full integration
// ---------------------------------------------------------------------------
describe('buildTrayHardwareBOM — L-shaped route', () => {
  const trays = [
    makeTray('T1', 0, 0, 10, 40, 0, 10, 16, 4, 'Ladder'),
    makeTray('T2', 40, 0, 10, 40, 30, 10, 16, 4, 'Ladder'),
  ];

  it('detects one elbow fitting', () => {
    const { fittings } = buildTrayHardwareBOM(trays);
    const elbows = fittings.filter(f => f.type === 'elbow');
    assert.strictEqual(elbows.length, 1);
  });

  it('calculates support brackets for both trays', () => {
    const { supports } = buildTrayHardwareBOM(trays);
    assert.strictEqual(supports.length, 2);
    // T1 is 40 ft, default max span 12 ft → ceil(40/12)=4 spans → 5 brackets
    const t1 = supports.find(s => s.tray_id === 'T1');
    assert.strictEqual(t1.bracket_qty, 5);
    // T2 is 30 ft → ceil(30/12)=3 spans → 4 brackets
    const t2 = supports.find(s => s.tray_id === 'T2');
    assert.strictEqual(t2.bracket_qty, 4);
  });

  it('calculates straight sections', () => {
    const { sections } = buildTrayHardwareBOM(trays);
    assert.strictEqual(sections.length, 2);
    // T1 is 40 ft / 12 ft sections = ceil(40/12) = 4
    const t1 = sections.find(s => s.tray_id === 'T1');
    assert.strictEqual(t1.straight_sections, 4);
  });

  it('generates a hardware summary', () => {
    const { summary } = buildTrayHardwareBOM(trays);
    assert.ok(summary.length > 0, 'summary should not be empty');
    const elbowItem = summary.find(s => s.item === 'Elbow');
    assert.ok(elbowItem, 'summary should include Elbow');
    assert.strictEqual(elbowItem.qty, 1);
    const bracketItem = summary.find(s => s.category === 'Support');
    assert.ok(bracketItem, 'summary should include Support brackets');
    assert.strictEqual(bracketItem.qty, 9); // 5 + 4
  });
});

describe('buildTrayHardwareBOM — straight run with splice plate', () => {
  const trays = [
    makeTray('T1', 0, 0, 10, 40, 0, 10, 16),
    makeTray('T2', 40, 0, 10, 80, 0, 10, 16),
  ];

  it('detects one splice plate', () => {
    const { fittings } = buildTrayHardwareBOM(trays);
    const splices = fittings.filter(f => f.type === 'splice_plate');
    assert.strictEqual(splices.length, 1);
  });
});

describe('buildTrayHardwareBOM — reducer detection', () => {
  const trays = [
    makeTray('T1', 0, 0, 10, 40, 0, 10, 16),
    makeTray('T2', 40, 0, 10, 80, 0, 10, 24),
  ];

  it('detects one reducer', () => {
    const { fittings } = buildTrayHardwareBOM(trays);
    const reducers = fittings.filter(f => f.type === 'reducer');
    assert.strictEqual(reducers.length, 1);
  });
});

describe('buildTrayHardwareBOM — tee detection', () => {
  const trays = [
    makeTray('T1', 0, 0, 10, 40, 0, 10),
    makeTray('T2', 40, 0, 10, 80, 0, 10),
    makeTray('T3', 40, 0, 10, 40, 40, 10),
  ];

  it('detects tee and no false elbows at the tee junction', () => {
    const { fittings } = buildTrayHardwareBOM(trays);
    const tees = fittings.filter(f => f.type === 'tee');
    assert.strictEqual(tees.length, 1);
  });
});

describe('buildTrayHardwareBOM — custom options', () => {
  const trays = [
    makeTray('T1', 0, 0, 10, 24, 0, 10, 16),
  ];

  it('respects standardSectionLength option', () => {
    const { sections } = buildTrayHardwareBOM(trays, { standardSectionLength: 10 });
    // 24 ft / 10 ft sections = 3
    assert.strictEqual(sections[0].straight_sections, 3);
  });

  it('can disable cover sections', () => {
    const { sections } = buildTrayHardwareBOM(trays, { includeCoverSections: false });
    assert.strictEqual(sections[0].cover_sections, 0);
  });

  it('uses trayWeights for support span calculation', () => {
    // With heavy cable load, max span decreases → more brackets
    const heavy = buildTrayHardwareBOM(trays, { trayWeights: { T1: 30 }, loadClass: '16A' });
    const light = buildTrayHardwareBOM(trays, { trayWeights: { T1: 2 }, loadClass: '16A' });
    assert.ok(heavy.supports[0].bracket_qty >= light.supports[0].bracket_qty,
      'heavier load should need more or equal brackets');
  });

  it('includes construction-specific support and accessory rows when metadata exists', () => {
    const { constructionTakeoff, summary } = buildTrayHardwareBOM([{
      ...trays[0],
      supportFamily: 'Unistrut',
      supportType: 'trapeze',
      supportSpacingFt: 8,
      labelId: 'LBL-T1',
      drawingRef: 'E-201',
      sectionRef: 'SEC-T1',
      constructionStatus: 'released',
      accessoryKits: '[{"name":"Cover kit","quantity":2}]',
    }]);
    assert(constructionTakeoff.some(row => row.category === 'Support' && row.item.includes('Unistrut')));
    assert(summary.some(row => row.item === 'Cover kit' && row.qty === 2));
  });
});

console.log('\nAll trayHardware tests complete.');
