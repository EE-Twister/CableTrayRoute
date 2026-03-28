/**
 * Tests for calculateProcurement() and exportProcurementCSV() in
 * analysis/cableProcurement.mjs
 *
 * The module groups routed cables by conductor specification, applies a
 * field-trim tolerance, and bin-packs them into standard reel lengths.
 */
import assert from 'assert';
import { calculateProcurement, exportProcurementCSV, STANDARD_REEL_SIZES } from '../analysis/cableProcurement.mjs';

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
// Fixtures
// ---------------------------------------------------------------------------

const cableList = [
  { name: 'C1', cable_type: 'Power',   conductors: 3, conductor_size: '#12 AWG', diameter: 0.75, weight: 0.5 },
  { name: 'C2', cable_type: 'Power',   conductors: 3, conductor_size: '#12 AWG', diameter: 0.75, weight: 0.5 },
  { name: 'C3', cable_type: 'Power',   conductors: 3, conductor_size: '#8 AWG',  diameter: 1.0,  weight: 0.8 },
  { name: 'C4', cable_type: 'Control', conductors: 7, conductor_size: '#18 AWG', diameter: 0.45, weight: 0.2 },
  { name: 'C5', cable_type: 'Control', conductors: 7, conductor_size: '#18 AWG', diameter: 0.45, weight: 0.2 },
];

// Route results: breakdown must be non-empty for groupCablesIntoPulls to process them
const seg1 = { tray_id: 'T1', length: 200, start: [0, 0, 0], end: [200, 0, 0] };
const seg2 = { tray_id: 'T2', length: 150, start: [0, 0, 0], end: [150, 0, 0] };

function makeResult(cable, totalLength, breakdown) {
  return {
    cable,
    status: '✓ Routed',
    total_length: totalLength,
    breakdown: breakdown ?? [{ tray_id: `T-${cable}`, length: totalLength, start: [0, 0, 0], end: [totalLength, 0, 0] }],
    route_segments: [{ type: 'straight', length: totalLength }],
  };
}

// ---------------------------------------------------------------------------
describe('calculateProcurement — edge cases', () => {
  it('returns empty report for empty routeResults', () => {
    const report = calculateProcurement([], cableList);
    assert.deepStrictEqual(report.lineItems, []);
    assert.strictEqual(report.summary.total_line_items, 0);
    assert.strictEqual(report.summary.total_cut_count, 0);
  });

  it('returns empty report for null/undefined inputs', () => {
    const report = calculateProcurement(null, null);
    assert.deepStrictEqual(report.lineItems, []);
  });

  it('returns empty report when all routes failed', () => {
    const failed = [{ cable: 'C1', status: '✗ Failed', total_length: 100, breakdown: [] }];
    const report = calculateProcurement(failed, cableList);
    assert.deepStrictEqual(report.lineItems, []);
  });

  it('returns empty report when breakdown is missing', () => {
    const noBD = [{ cable: 'C1', status: '✓ Routed', total_length: 100 }];
    const report = calculateProcurement(noBD, cableList);
    assert.deepStrictEqual(report.lineItems, []);
  });

  it('single cable produces exactly one line item', () => {
    const results = [makeResult('C1', 200)];
    const report = calculateProcurement(results, cableList);
    assert.strictEqual(report.lineItems.length, 1);
    assert.strictEqual(report.lineItems[0].cut_count, 1);
  });
});

// ---------------------------------------------------------------------------
describe('calculateProcurement — spec grouping', () => {
  it('cables with same type and size are in the same line item', () => {
    // C1 and C2 share the same route signature and spec
    const results = [
      makeResult('C1', 200, [seg1]),
      makeResult('C2', 200, [seg1]),
    ];
    const report = calculateProcurement(results, cableList);
    // Both are Power #12 AWG → one line item
    const powerItems = report.lineItems.filter(li => li.conductor_size === '#12 AWG');
    assert.strictEqual(powerItems.length, 1);
    assert.strictEqual(powerItems[0].cut_count, 2);
  });

  it('cables with different sizes produce separate line items', () => {
    const results = [
      makeResult('C1', 200),  // Power #12 AWG
      makeResult('C3', 150),  // Power #8 AWG
    ];
    const report = calculateProcurement(results, cableList);
    assert.strictEqual(report.lineItems.length, 2);
    const sizes = report.lineItems.map(li => li.conductor_size).sort();
    assert.deepStrictEqual(sizes, ['#12 AWG', '#8 AWG']);
  });

  it('cables with different types produce separate line items', () => {
    const results = [
      makeResult('C1', 100),  // Power #12 AWG
      makeResult('C4', 100),  // Control #18 AWG
    ];
    const report = calculateProcurement(results, cableList);
    const types = [...new Set(report.lineItems.map(li => li.cable_type))].sort();
    assert.ok(types.includes('Power'), 'should have Power line item');
    assert.ok(types.includes('Control'), 'should have Control line item');
  });

  it('spec_key format is cable_type::conductor_size', () => {
    const results = [makeResult('C1', 100)];
    const report = calculateProcurement(results, cableList);
    assert.strictEqual(report.lineItems[0].spec_key, 'Power::#12 AWG');
  });

  it('derives material as copper by default', () => {
    const results = [makeResult('C1', 100)];
    const report = calculateProcurement(results, cableList);
    assert.strictEqual(report.lineItems[0].material, 'copper');
  });

  it('derives material as aluminum when conductor_size contains AL', () => {
    const alCable = [{ name: 'A1', cable_type: 'Power', conductors: 3, conductor_size: '#4/0 AWG AL', diameter: 1.2, weight: 0.6 }];
    const results = [makeResult('A1', 100)];
    const report = calculateProcurement(results, alCable);
    assert.strictEqual(report.lineItems[0].material, 'aluminum');
  });
});

// ---------------------------------------------------------------------------
describe('calculateProcurement — tolerance and lengths', () => {
  it('applies default 3% tolerance to routed length', () => {
    const results = [makeResult('C1', 100)];
    const report = calculateProcurement(results, cableList);
    const cut = report.lineItems[0].cuts[0];
    assert.strictEqual(cut.length_ft, 103);
  });

  it('respects custom tolerancePct option', () => {
    const results = [makeResult('C1', 100)];
    const report = calculateProcurement(results, cableList, { tolerancePct: 5 });
    const cut = report.lineItems[0].cuts[0];
    assert.strictEqual(cut.length_ft, 105);
  });

  it('zero tolerance uses exact routed length', () => {
    const results = [makeResult('C1', 200)];
    const report = calculateProcurement(results, cableList, { tolerancePct: 0 });
    const cut = report.lineItems[0].cuts[0];
    assert.strictEqual(cut.length_ft, 200);
  });

  it('total_required_ft equals sum of all cuts', () => {
    const results = [
      makeResult('C1', 100),
      makeResult('C2', 150),
    ];
    const report = calculateProcurement(results, cableList);
    const li = report.lineItems.find(l => l.conductor_size === '#12 AWG');
    const sumCuts = li.cuts.reduce((s, c) => s + c.length_ft, 0);
    assert.ok(Math.abs(li.total_required_ft - sumCuts) < 0.01, `${li.total_required_ft} should equal sum ${sumCuts}`);
  });

  it('each cut includes pull_number and cable_tag', () => {
    const results = [makeResult('C1', 200)];
    const report = calculateProcurement(results, cableList);
    const cut = report.lineItems[0].cuts[0];
    assert.strictEqual(typeof cut.pull_number, 'number');
    assert.strictEqual(cut.cable_tag, 'C1');
  });
});

// ---------------------------------------------------------------------------
describe('calculateProcurement — reel assignment', () => {
  it('total_ordered_ft equals num_reels * reel feet', () => {
    const results = [makeResult('C1', 200)];
    const report = calculateProcurement(results, cableList);
    const li = report.lineItems[0];
    assert.strictEqual(li.total_ordered_ft, li.num_reels * li.selected_reel_size.feet);
  });

  it('waste_ft is never negative', () => {
    const results = [
      makeResult('C1', 100),
      makeResult('C2', 200),
      makeResult('C3', 300),
    ];
    const report = calculateProcurement(results, cableList);
    for (const li of report.lineItems) {
      assert.ok(li.waste_ft >= 0, `waste_ft (${li.waste_ft}) must not be negative`);
    }
  });

  it('waste_pct is between 0 and 100', () => {
    const results = [makeResult('C1', 100)];
    const report = calculateProcurement(results, cableList);
    const li = report.lineItems[0];
    assert.ok(li.waste_pct >= 0 && li.waste_pct <= 100, `waste_pct ${li.waste_pct} out of range`);
  });

  it('multiple cables of the same spec can share a reel', () => {
    // C1 and C2 are both Power #12 AWG; 103 ft each → 206 ft total → fits in one 250 ft reel
    const results = [
      makeResult('C1', 100),
      makeResult('C2', 100),
    ];
    const report = calculateProcurement(results, cableList);
    const li = report.lineItems.find(l => l.conductor_size === '#12 AWG');
    assert.ok(li.num_reels === 1, `expected 1 reel for 206 ft total, got ${li.num_reels} reel(s) of ${li.selected_reel_size.feet} ft`);
  });

  it('cable exceeding all standard reel sizes falls back to largest reel', () => {
    // 3000 ft cable with 3% tolerance = 3090 ft — exceeds 2500 ft largest reel
    const results = [makeResult('C1', 3000)];
    const report = calculateProcurement(results, cableList);
    const li = report.lineItems[0];
    assert.strictEqual(li.selected_reel_size.feet, 2500);
    assert.ok(li.num_reels >= 2, 'should use multiple reels for an oversized cable');
  });

  it('respects custom reelSizes option', () => {
    const customReels = [{ name: '300 ft', feet: 300 }];
    const results = [makeResult('C1', 100)];
    const report = calculateProcurement(results, cableList, { reelSizes: customReels });
    assert.strictEqual(report.lineItems[0].selected_reel_size.feet, 300);
  });

  it('selected_reel_size has both name and feet', () => {
    const results = [makeResult('C1', 100)];
    const report = calculateProcurement(results, cableList);
    const rs = report.lineItems[0].selected_reel_size;
    assert.strictEqual(typeof rs.name, 'string');
    assert.strictEqual(typeof rs.feet, 'number');
    assert.ok(rs.feet > 0);
  });
});

// ---------------------------------------------------------------------------
describe('calculateProcurement — summary', () => {
  it('total_line_items matches lineItems.length', () => {
    const results = [
      makeResult('C1', 100),  // Power #12 AWG
      makeResult('C4', 100),  // Control #18 AWG
    ];
    const report = calculateProcurement(results, cableList);
    assert.strictEqual(report.summary.total_line_items, report.lineItems.length);
  });

  it('total_cut_count is sum of all cut_counts', () => {
    const results = [
      makeResult('C1', 100),
      makeResult('C2', 100),
      makeResult('C4', 100),
    ];
    const report = calculateProcurement(results, cableList);
    const sumCuts = report.lineItems.reduce((s, li) => s + li.cut_count, 0);
    assert.strictEqual(report.summary.total_cut_count, sumCuts);
  });

  it('total_required_ft equals sum of line item total_required_ft values', () => {
    const results = [makeResult('C1', 100), makeResult('C4', 150)];
    const report = calculateProcurement(results, cableList);
    const sumReq = report.lineItems.reduce((s, li) => s + li.total_required_ft, 0);
    assert.ok(Math.abs(report.summary.total_required_ft - sumReq) < 0.1);
  });

  it('total_ordered_ft equals sum of line item total_ordered_ft values', () => {
    const results = [makeResult('C1', 100), makeResult('C4', 150)];
    const report = calculateProcurement(results, cableList);
    const sumOrdered = report.lineItems.reduce((s, li) => s + li.total_ordered_ft, 0);
    assert.strictEqual(report.summary.total_ordered_ft, sumOrdered);
  });

  it('report includes options.tolerancePct', () => {
    const report = calculateProcurement([makeResult('C1', 100)], cableList, { tolerancePct: 7 });
    assert.strictEqual(report.options.tolerancePct, 7);
  });
});

// ---------------------------------------------------------------------------
describe('exportProcurementCSV', () => {
  const sampleResults = [
    makeResult('C1', 100),
    makeResult('C4', 150),
  ];

  it('returns a non-empty string', () => {
    const report = calculateProcurement(sampleResults, cableList);
    const csv = exportProcurementCSV(report);
    assert.strictEqual(typeof csv, 'string');
    assert.ok(csv.length > 0);
  });

  it('first line is a header with expected column names', () => {
    const report = calculateProcurement(sampleResults, cableList);
    const csv = exportProcurementCSV(report);
    const firstLine = csv.split('\r\n')[0];
    assert.ok(firstLine.includes('Cable Type'), 'header should include Cable Type');
    assert.ok(firstLine.includes('Conductor Size'), 'header should include Conductor Size');
    assert.ok(firstLine.includes('Reel Size'), 'header should include Reel Size');
    assert.ok(firstLine.includes('Num Reels'), 'header should include Num Reels');
    assert.ok(firstLine.includes('Waste'), 'header should include Waste');
  });

  it('has one data row per line item', () => {
    const report = calculateProcurement(sampleResults, cableList);
    const csv = exportProcurementCSV(report);
    const lines = csv.split('\r\n').filter(l => l.trim() !== '' && !l.startsWith('Spec Key') && !l.startsWith('TOTALS'));
    assert.strictEqual(lines.length, report.lineItems.length);
  });

  it('uses CRLF line endings', () => {
    const report = calculateProcurement(sampleResults, cableList);
    const csv = exportProcurementCSV(report);
    assert.ok(csv.includes('\r\n'), 'CSV should use CRLF line endings');
  });

  it('includes a TOTALS row', () => {
    const report = calculateProcurement(sampleResults, cableList);
    const csv = exportProcurementCSV(report);
    assert.ok(csv.includes('TOTALS'), 'CSV should include a TOTALS row');
  });

  it('each data row has the same column count as the header', () => {
    const report = calculateProcurement(sampleResults, cableList);
    const csv = exportProcurementCSV(report);
    const lines = csv.split('\r\n').filter(l => l.trim() !== '');
    const headerCols = lines[0].split(',').length;
    // Check a data row (second line)
    if (lines.length > 1) {
      const dataCols = lines[1].split(',').length;
      assert.strictEqual(dataCols, headerCols, `data row has ${dataCols} cols, header has ${headerCols}`);
    }
  });

  it('empty report produces header + TOTALS row only', () => {
    const emptyReport = calculateProcurement([], cableList);
    const csv = exportProcurementCSV(emptyReport);
    const lines = csv.split('\r\n').filter(l => l.trim() !== '');
    // Expect exactly: header + TOTALS = 2 lines
    assert.strictEqual(lines.length, 2, `expected 2 lines for empty report, got ${lines.length}`);
  });
});

// ---------------------------------------------------------------------------
describe('STANDARD_REEL_SIZES', () => {
  it('is an array of objects with name and feet', () => {
    assert.ok(Array.isArray(STANDARD_REEL_SIZES));
    assert.ok(STANDARD_REEL_SIZES.length > 0);
    for (const rs of STANDARD_REEL_SIZES) {
      assert.strictEqual(typeof rs.name, 'string');
      assert.strictEqual(typeof rs.feet, 'number');
      assert.ok(rs.feet > 0);
    }
  });

  it('is sorted ascending by feet', () => {
    for (let i = 1; i < STANDARD_REEL_SIZES.length; i++) {
      assert.ok(STANDARD_REEL_SIZES[i].feet > STANDARD_REEL_SIZES[i - 1].feet,
        `reel sizes should be ascending: ${STANDARD_REEL_SIZES[i - 1].feet} then ${STANDARD_REEL_SIZES[i].feet}`);
    }
  });
});
