import assert from 'assert';
import {
  buildSpoolSheetVisualModel,
  summarizeSpoolImpact,
} from '../analysis/spoolSheetVisualModel.mjs';

function describe(name, fn) { console.log(name); fn(); }
function it(name, fn) {
  try { fn(); console.log('  \u2713', name); }
  catch (err) { console.error('  \u2717', name, err.message || err); process.exitCode = 1; }
}

function tray(id, sx, sy, sz, ex, ey, ez, w = 12) {
  return {
    tray_id: id,
    start_x: sx, start_y: sy, start_z: sz,
    end_x: ex, end_y: ey, end_z: ez,
    inside_width: w,
    tray_depth: 4,
  };
}

function cable(id, route) {
  return {
    cable_tag: id,
    from: 'SRC',
    to: 'LOAD',
    length_ft: 42,
    route_preference: route,
  };
}

describe('buildSpoolSheetVisualModel', () => {
  it('returns a useful empty-state model without tray data', () => {
    const model = buildSpoolSheetVisualModel([], []);
    assert.strictEqual(model.hasTrayData, false);
    assert.strictEqual(model.summary.spoolCount, 0);
    assert.ok(model.warnings.some(w => w.includes('No trays')));
  });

  it('builds drawable segments and grid cells from tray coordinates', () => {
    const trays = [
      tray('T1', 0, 0, 10, 10, 0, 10),
      tray('T2', 5, 5, 10, 15, 5, 10),
    ];
    const model = buildSpoolSheetVisualModel(trays, [cable('C1', 'T1')], {
      gridCellFt: 20,
      elevBandFt: 2,
      sectionLengthFt: 10,
      maxSpoolSegments: 10,
    });

    assert.strictEqual(model.hasExactCoordinates, true);
    assert.strictEqual(model.spools.length, 1);
    assert.strictEqual(model.segments.length, 2);
    assert.strictEqual(model.gridCells.length, 1);
    assert.strictEqual(model.elevationBands.length, 1);
    assert.deepStrictEqual(model.spools[0].cableTags, ['C1']);
    assert.strictEqual(model.spools[0].sections.length, 2);
  });

  it('flags max-segment capacity splits in the visual model', () => {
    const trays = [
      tray('T1', 0, 0, 10, 5, 0, 10),
      tray('T2', 1, 1, 10, 6, 1, 10),
      tray('T3', 2, 2, 10, 7, 2, 10),
    ];
    const model = buildSpoolSheetVisualModel(trays, [], {
      gridCellFt: 20,
      elevBandFt: 2,
      maxSpoolSegments: 2,
    });

    assert.strictEqual(model.spools.length, 2);
    assert.strictEqual(model.summary.capacitySplitCount, 2);
    assert.ok(model.spools.every(spool => spool.wasCapacitySplit));
  });

  it('keeps quantities while warning about incomplete visual coordinates', () => {
    const model = buildSpoolSheetVisualModel([
      tray('T1', 0, 0, 10, 10, 0, 10),
      { tray_id: 'LEGACY', inside_width: 12 },
    ], []);

    assert.strictEqual(model.trayCount, 2);
    assert.strictEqual(model.hasExactCoordinates, false);
    assert.strictEqual(model.segments.length, 1);
    assert.ok(model.warnings.some(w => w.includes('missing complete coordinates')));
  });

  it('reports shipping and handling constraint warnings', () => {
    const model = buildSpoolSheetVisualModel([
      tray('LONG', 0, 0, 10, 50, 0, 10, 24),
    ], [], {
      maxShippingLengthFt: 40,
      maxHandlingWeightLb: 25,
    });

    assert.ok(model.constraints.some(alert => alert.title === 'Shipping length'));
    assert.ok(model.constraints.some(alert => alert.title === 'Handling weight'));
    assert.strictEqual(model.summary.warningCount, 2);
  });
});

describe('summarizeSpoolImpact', () => {
  it('reports signed deltas between summary states', () => {
    const delta = summarizeSpoolImpact(
      { spoolCount: 3, totalLengthFt: 40, totalSections: 6 },
      { spoolCount: 2, totalLengthFt: 44.2, totalSections: 5 }
    );
    assert.strictEqual(delta.spoolCount, -1);
    assert.strictEqual(delta.totalLengthFt, 4.2);
    assert.strictEqual(delta.totalSections, -1);
  });

  it('includes hardware deltas', () => {
    const delta = summarizeSpoolImpact(
      { totalClampKits: 4, totalSplicePlatePairs: 1 },
      { totalClampKits: 9, totalSplicePlatePairs: 3 }
    );
    assert.strictEqual(delta.totalClampKits, 5);
    assert.strictEqual(delta.totalSplicePlatePairs, 2);
  });
});
