import assert from 'assert';
import { parseRevit } from '../src/importers/revit.mjs';

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

describe('parseRevit - JSON object input', () => {
  it('parses trays with standard field names', () => {
    const result = parseRevit({
      trays: [{ id: 'T1', start_x: 0, start_y: 0, start_z: 0, end_x: 10, end_y: 0, end_z: 0, width: 300, height: 100 }],
      conduits: []
    });
    assert.strictEqual(result.trays.length, 1);
    assert.strictEqual(result.trays[0].id, 'T1');
    assert.strictEqual(result.trays[0].start_x, 0);
    assert.strictEqual(result.trays[0].end_x, 10);
    assert.strictEqual(result.trays[0].width, 300);
    assert.strictEqual(result.trays[0].height, 100);
  });

  it('falls back to Trays field name', () => {
    const result = parseRevit({ Trays: [{ id: 'T2' }] });
    assert.strictEqual(result.trays.length, 1);
    assert.strictEqual(result.trays[0].id, 'T2');
  });

  it('falls back to cableTrays field name', () => {
    const result = parseRevit({ cableTrays: [{ id: 'T3' }] });
    assert.strictEqual(result.trays.length, 1);
  });

  it('falls back to CableTrays field name', () => {
    const result = parseRevit({ CableTrays: [{ TrayID: 'T4' }] });
    assert.strictEqual(result.trays.length, 1);
    assert.strictEqual(result.trays[0].id, 'T4');
  });

  it('parses conduits with standard field names', () => {
    const result = parseRevit({
      trays: [],
      conduits: [{ conduit_id: 'C1', type: 'EMT', trade_size: '1"', start_x: 0, end_x: 5 }]
    });
    assert.strictEqual(result.conduits.length, 1);
    assert.strictEqual(result.conduits[0].conduit_id, 'C1');
    assert.strictEqual(result.conduits[0].type, 'EMT');
    assert.strictEqual(result.conduits[0].trade_size, '1"');
    assert.strictEqual(result.conduits[0].start_x, 0);
    assert.strictEqual(result.conduits[0].end_x, 5);
  });

  it('falls back to Conduits field name', () => {
    const result = parseRevit({ Conduits: [{ id: 'C2' }] });
    assert.strictEqual(result.conduits.length, 1);
  });

  it('falls back to cableConduits field name', () => {
    const result = parseRevit({ cableConduits: [{ id: 'C3' }] });
    assert.strictEqual(result.conduits.length, 1);
  });

  it('falls back to ConduitSegments field name', () => {
    const result = parseRevit({ ConduitSegments: [{ id: 'C4' }] });
    assert.strictEqual(result.conduits.length, 1);
  });

  it('returns empty arrays when no recognized field names present', () => {
    const result = parseRevit({ someRandomField: [{ id: 'X' }] });
    assert.deepStrictEqual(result.trays, []);
    assert.deepStrictEqual(result.conduits, []);
  });

  it('returns empty arrays for null input', () => {
    const result = parseRevit(null);
    assert.deepStrictEqual(result.trays, []);
    assert.deepStrictEqual(result.conduits, []);
  });

  it('returns empty arrays for non-object input', () => {
    const result = parseRevit(42);
    assert.deepStrictEqual(result.trays, []);
    assert.deepStrictEqual(result.conduits, []);
  });
});

describe('parseRevit - JSON string input', () => {
  it('parses a valid JSON string', () => {
    const input = JSON.stringify({ trays: [{ id: 'T5', start_x: 1, end_x: 2 }], conduits: [] });
    const result = parseRevit(input);
    assert.strictEqual(result.trays.length, 1);
    assert.strictEqual(result.trays[0].id, 'T5');
    assert.strictEqual(result.trays[0].start_x, 1);
  });

  it('falls back to IFC parsing for non-JSON strings', () => {
    // A string that fails JSON.parse but is valid IFC-like text
    const result = parseRevit('not json at all');
    assert.ok(Array.isArray(result.trays));
    assert.ok(Array.isArray(result.conduits));
  });
});

describe('parseRevit - tray coordinate normalization', () => {
  it('uses sx/sy/sz fallback field names', () => {
    const result = parseRevit({ trays: [{ sx: 1, sy: 2, sz: 3, ex: 4, ey: 5, ez: 6 }] });
    assert.strictEqual(result.trays[0].start_x, 1);
    assert.strictEqual(result.trays[0].start_y, 2);
    assert.strictEqual(result.trays[0].start_z, 3);
    assert.strictEqual(result.trays[0].end_x, 4);
    assert.strictEqual(result.trays[0].end_y, 5);
    assert.strictEqual(result.trays[0].end_z, 6);
  });

  it('uses x1/y1/z1 fallback field names', () => {
    const result = parseRevit({ trays: [{ x1: 10, y1: 20, z1: 30, x2: 40, y2: 50, z2: 60 }] });
    assert.strictEqual(result.trays[0].start_x, 10);
    assert.strictEqual(result.trays[0].start_y, 20);
    assert.strictEqual(result.trays[0].end_x, 40);
  });

  it('uses StartX/EndX uppercase fallback field names', () => {
    const result = parseRevit({ trays: [{ StartX: 7, StartY: 8, StartZ: 9, EndX: 17, EndY: 18, EndZ: 19 }] });
    assert.strictEqual(result.trays[0].start_x, 7);
    assert.strictEqual(result.trays[0].end_x, 17);
  });

  it('uses nested start/end object as fallback', () => {
    const result = parseRevit({ trays: [{ start: { x: 5, y: 6, z: 7 }, end: { x: 15, y: 16, z: 17 } }] });
    assert.strictEqual(result.trays[0].start_x, 5);
    assert.strictEqual(result.trays[0].start_y, 6);
    assert.strictEqual(result.trays[0].end_x, 15);
  });

  it('returns undefined (not 0) for missing numeric coordinate fields', () => {
    const result = parseRevit({ trays: [{ id: 'T-empty' }] });
    assert.strictEqual(result.trays[0].start_x, undefined);
    assert.strictEqual(result.trays[0].end_x, undefined);
    assert.strictEqual(result.trays[0].width, undefined);
  });

  it('returns undefined for non-finite coordinate values', () => {
    const result = parseRevit({ trays: [{ start_x: 'not-a-number', end_x: null }] });
    assert.strictEqual(result.trays[0].start_x, undefined);
    assert.strictEqual(result.trays[0].end_x, undefined);
  });

  it('resolves tray ID from tag field', () => {
    assert.strictEqual(parseRevit({ trays: [{ tag: 'TAG1' }] }).trays[0].id, 'TAG1');
  });

  it('resolves tray ID from tray_id field', () => {
    assert.strictEqual(parseRevit({ trays: [{ tray_id: 'TID1' }] }).trays[0].id, 'TID1');
  });

  it('resolves tray ID from name field', () => {
    assert.strictEqual(parseRevit({ trays: [{ name: 'NAME1' }] }).trays[0].id, 'NAME1');
  });

  it('resolves tray ID from Tag field', () => {
    assert.strictEqual(parseRevit({ trays: [{ Tag: 'TAG2' }] }).trays[0].id, 'TAG2');
  });

  it('returns empty string when no ID field is present', () => {
    assert.strictEqual(parseRevit({ trays: [{}] }).trays[0].id, '');
  });
});

describe('parseRevit - conduit normalization', () => {
  it('uses sx/sy fallback coordinates', () => {
    const result = parseRevit({ conduits: [{ sx: 2, sy: 3, ex: 12, ey: 13 }] });
    assert.strictEqual(result.conduits[0].start_x, 2);
    assert.strictEqual(result.conduits[0].end_x, 12);
  });

  it('uses nested start/end object for conduit coordinates', () => {
    const result = parseRevit({ conduits: [{ start: { x: 1, y: 2, z: 3 }, end: { x: 4, y: 5, z: 6 } }] });
    assert.strictEqual(result.conduits[0].start_x, 1);
    assert.strictEqual(result.conduits[0].end_z, 6);
  });

  it('resolves conduit_id from id fallback', () => {
    assert.strictEqual(parseRevit({ conduits: [{ id: 'CID1' }] }).conduits[0].conduit_id, 'CID1');
  });

  it('resolves conduit_id from ConduitID fallback', () => {
    assert.strictEqual(parseRevit({ conduits: [{ ConduitID: 'COND1' }] }).conduits[0].conduit_id, 'COND1');
  });

  it('resolves trade_size from tradeSize/size/TradeSize fallbacks', () => {
    assert.strictEqual(parseRevit({ conduits: [{ tradeSize: '2"' }] }).conduits[0].trade_size, '2"');
    assert.strictEqual(parseRevit({ conduits: [{ size: '3"' }] }).conduits[0].trade_size, '3"');
    assert.strictEqual(parseRevit({ conduits: [{ TradeSize: '4"' }] }).conduits[0].trade_size, '4"');
  });

  it('reads capacity from fill fallback', () => {
    const result = parseRevit({ conduits: [{ fill: 0.4 }] });
    assert.strictEqual(result.conduits[0].capacity, 0.4);
  });
});

describe('parseRevit - IFC STEP input', () => {
  // The regex: /#\d+=IFC([^;]*?)SEGMENT[^;]*?IFCPOLYLINE\(\(([^)]+)\),\(([^)]+)\)\)/gi
  // A minimal matching string: #N=IFCCABLECARRIERSEGMENTIFCPOLYLINE((x,y,z),(x,y,z))

  it('parses CABLECARRIER entity as a tray', () => {
    const ifc = '#1=IFCCABLECARRIERSEGMENTIFCPOLYLINE((0.0,1.0,2.0),(10.0,1.0,2.0))';
    const result = parseRevit(ifc);
    assert.strictEqual(result.trays.length, 1);
    assert.strictEqual(result.conduits.length, 0);
    assert.strictEqual(result.trays[0].start_x, 0.0);
    assert.strictEqual(result.trays[0].start_y, 1.0);
    assert.strictEqual(result.trays[0].start_z, 2.0);
    assert.strictEqual(result.trays[0].end_x, 10.0);
  });

  it('parses non-CABLECARRIER entity as a conduit', () => {
    const ifc = '#2=IFCCONDUITSEGMENTIFCPOLYLINE((5.0,3.0,1.0),(15.0,3.0,1.0))';
    const result = parseRevit(ifc);
    assert.strictEqual(result.trays.length, 0);
    assert.strictEqual(result.conduits.length, 1);
    assert.strictEqual(result.conduits[0].start_x, 5.0);
    assert.strictEqual(result.conduits[0].end_x, 15.0);
  });

  it('assigns sequential SEG-N IDs to parsed entities', () => {
    const ifc = [
      '#1=IFCCABLECARRIERSEGMENTIFCPOLYLINE((0,0,0),(1,0,0))',
      '#2=IFCCONDUITSEGMENTIFCPOLYLINE((2,0,0),(3,0,0))',
      '#3=IFCCABLECARRIERSEGMENTIFCPOLYLINE((4,0,0),(5,0,0))'
    ].join('\n');
    const result = parseRevit(ifc);
    assert.strictEqual(result.trays[0].id, 'SEG-0');
    assert.strictEqual(result.conduits[0].id, 'SEG-1');
    assert.strictEqual(result.trays[1].id, 'SEG-2');
  });

  it('returns empty arrays for IFC text with no matching segment entities', () => {
    const result = parseRevit('ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(...);\nENDSEC;');
    assert.deepStrictEqual(result.trays, []);
    assert.deepStrictEqual(result.conduits, []);
  });

  it('handles mixed tray and conduit segments', () => {
    const ifc = [
      '#10=IFCCABLECARRIERSEGMENTIFCPOLYLINE((0,0,0),(10,0,0))',
      '#11=IFCCONDUITSEGMENTIFCPOLYLINE((0,5,0),(0,15,0))',
      '#12=IFCCABLECARRIERSEGMENTIFCPOLYLINE((0,10,0),(10,10,0))'
    ].join('\n');
    const result = parseRevit(ifc);
    assert.strictEqual(result.trays.length, 2);
    assert.strictEqual(result.conduits.length, 1);
  });
});
