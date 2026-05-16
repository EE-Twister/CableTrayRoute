import assert from 'assert';
import {
  buildConduitCableMap,
  cableAreaIn2,
  conduitFillLimit,
  conduitInternalArea,
  evaluateConduitFill,
  extractRacewayIds,
  normalizeConduitType,
  normalizeTradeSize,
} from '../analysis/conduitFill.mjs';

function describe(name, fn) { console.log(name); fn(); }
function it(name, fn) {
  try { fn(); console.log('  \u2713', name); }
  catch (err) { console.error('  \u2717', name, err.message || err); process.exitCode = 1; }
}

describe('conduit fill helpers', () => {
  it('normalizes common conduit type and trade size aliases', () => {
    assert.strictEqual(normalizeConduitType('PVC Schedule 40'), 'PVC Sch 40');
    assert.strictEqual(normalizeConduitType('electrical metallic tubing'), 'EMT');
    assert.strictEqual(normalizeTradeSize('2.5 in', 'EMT'), '2-1/2');
  });

  it('looks up conduit internal area from normalized inputs', () => {
    assert.strictEqual(conduitInternalArea('PVC Sch 40', '2"'), 3.291);
    assert.strictEqual(conduitInternalArea('EMT', '1-1/4'), 1.496);
  });

  it('applies selected Chapter 9 Table 1 fill limits', () => {
    assert.strictEqual(conduitFillLimit(1), 0.53);
    assert.strictEqual(conduitFillLimit(2), 0.31);
    assert.strictEqual(conduitFillLimit(3), 0.40);
  });

  it('calculates cable area from OD when explicit area is absent', () => {
    const area = cableAreaIn2({ cable_od: 0.5 });
    assert.ok(Math.abs(area - 0.19635) < 0.0001);
  });

  it('extracts raceway assignments from arrays, JSON strings, and delimited text', () => {
    assert.deepStrictEqual(extractRacewayIds({ raceway_ids: ['CND-1', 'CND-2'] }), ['CND-1', 'CND-2']);
    assert.deepStrictEqual(extractRacewayIds({ raceway_ids: '["CND-1","CND-2"]' }), ['CND-1', 'CND-2']);
    assert.deepStrictEqual(extractRacewayIds({ raceway_id: 'CND-1; CND-2' }), ['CND-1', 'CND-2']);
  });

  it('builds conduit cable maps from cable raceway assignments', () => {
    const conduits = [{ conduit_id: 'CND-1' }, { conduit_id: 'CND-2' }];
    const cables = [
      { name: 'C-1', raceway_ids: ['CND-1'] },
      { name: 'C-2', raceway_id: 'CND-1; CND-2' },
      { name: 'C-3', raceway_id: 'TRAY-1' },
    ];
    const map = buildConduitCableMap(conduits, cables);
    assert.deepStrictEqual(map.get('CND-1').map(c => c.name), ['C-1', 'C-2']);
    assert.deepStrictEqual(map.get('CND-2').map(c => c.name), ['C-2']);
  });

  it('evaluates known fill and missing cable area data', () => {
    const conduit = { conduit_id: 'CND-1', conduit_type: 'EMT', trade_size: '1' };
    const cables = [
      { name: 'C-1', cable_od: 0.5 },
      { name: 'C-2' },
    ];
    const result = evaluateConduitFill(conduit, cables);
    assert.strictEqual(result.internalAreaIn2, 0.864);
    assert.strictEqual(result.cableCount, 2);
    assert.deepStrictEqual(result.missingAreaCables, ['C-2']);
    assert.ok(result.fillPercent > 20 && result.fillPercent < 25);
  });

  it('falls back to material when imported conduit type is generic', () => {
    const conduit = { conduit_id: 'CND-1', type: 'Conduit', material: 'PVC Sch 40', trade_size: '2' };
    const result = evaluateConduitFill(conduit, [{ name: 'C-1', cable_od: 0.5 }]);
    assert.strictEqual(result.conduitType, 'PVC Sch 40');
    assert.strictEqual(result.internalAreaIn2, 3.291);
  });
});
