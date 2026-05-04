/**
 * Tests for analysis/demandSchedule.mjs
 *
 * Covers: NEC 220 per-category demand factors, IEC 60439-1 diversity,
 * largest-motor adder (NEC 430.24), and schedule rendering correctness.
 */
import assert from 'assert';
import {
  buildDemandSchedule,
  categorise,
  iecDiversityFactor,
  NEC_CATEGORIES,
} from '../analysis/demandSchedule.mjs';

function describe(name, fn) {
  console.log(name);
  fn();
}

function it(name, fn) {
  try {
    fn();
    console.log('  ✓', name);
  } catch (err) {
    console.error('  ✗', name, err.message || err);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
describe('categorise()', () => {
  it('maps lighting keywords', () => {
    assert.strictEqual(categorise('LED lighting'), 'lighting');
    assert.strictEqual(categorise('luminaire'), 'lighting');
    assert.strictEqual(categorise('lamp'), 'lighting');
  });

  it('maps receptacle keywords', () => {
    assert.strictEqual(categorise('General receptacle'), 'receptacle');
    assert.strictEqual(categorise('outlet strip'), 'receptacle');
    assert.strictEqual(categorise('Plug load'), 'receptacle');
  });

  it('maps motor keywords', () => {
    assert.strictEqual(categorise('HVAC pump motor'), 'motor');
    assert.strictEqual(categorise('supply fan'), 'motor');
    assert.strictEqual(categorise('VFD drive'), 'motor');
    assert.strictEqual(categorise('compressor'), 'motor');
  });

  it('maps kitchen keywords', () => {
    assert.strictEqual(categorise('commercial oven'), 'kitchen');
    assert.strictEqual(categorise('fryer'), 'kitchen');
    assert.strictEqual(categorise('range'), 'kitchen');
  });

  it('maps HVAC keywords', () => {
    assert.strictEqual(categorise('HVAC unit'), 'hvac');
    assert.strictEqual(categorise('chiller'), 'hvac');
    assert.strictEqual(categorise('boiler'), 'hvac');
  });

  it('maps EV keywords', () => {
    assert.strictEqual(categorise('EV charger'), 'ev');
    assert.strictEqual(categorise('EVSE station'), 'ev');
    assert.strictEqual(categorise('electric vehicle supply'), 'ev');
  });

  it('maps appliance keywords', () => {
    assert.strictEqual(categorise('washer'), 'appliance');
    assert.strictEqual(categorise('dryer'), 'appliance');
  });

  it('maps UPS/critical keywords', () => {
    assert.strictEqual(categorise('UPS'), 'critical');
    assert.strictEqual(categorise('server rack'), 'critical');
    assert.strictEqual(categorise('datacenter PDU'), 'critical');
  });

  it('defaults unknown types to general', () => {
    assert.strictEqual(categorise(''), 'general');
    assert.strictEqual(categorise('misc equipment'), 'general');
    assert.strictEqual(categorise(undefined), 'general');
  });
});

// ---------------------------------------------------------------------------
describe('iecDiversityFactor()', () => {
  it('returns 1.0 for 1–2 consumers', () => {
    assert.strictEqual(iecDiversityFactor(1), 1.0);
    assert.strictEqual(iecDiversityFactor(2), 1.0);
  });

  it('returns 0.9 for 3–5 consumers', () => {
    assert.strictEqual(iecDiversityFactor(3), 0.9);
    assert.strictEqual(iecDiversityFactor(5), 0.9);
  });

  it('returns 0.8 for 6–10 consumers', () => {
    assert.strictEqual(iecDiversityFactor(6), 0.8);
    assert.strictEqual(iecDiversityFactor(10), 0.8);
  });

  it('returns 0.7 for 11–40 consumers', () => {
    assert.strictEqual(iecDiversityFactor(11), 0.7);
    assert.strictEqual(iecDiversityFactor(40), 0.7);
  });

  it('returns 0.6 for > 40 consumers', () => {
    assert.strictEqual(iecDiversityFactor(41), 0.6);
    assert.strictEqual(iecDiversityFactor(100), 0.6);
  });
});

// ---------------------------------------------------------------------------
describe('buildDemandSchedule() — empty / edge cases', () => {
  it('returns zero totals for empty load list', () => {
    const result = buildDemandSchedule([]);
    assert.strictEqual(result.summary.totalConnectedKw, 0);
    assert.strictEqual(result.summary.totalDemandKw, 0);
    assert.deepStrictEqual(result.rows, []);
  });

  it('returns zero totals for undefined load list', () => {
    const result = buildDemandSchedule(undefined);
    assert.strictEqual(result.summary.totalDemandKw, 0);
  });

  it('handles load with no kw', () => {
    const result = buildDemandSchedule([{ loadType: 'general' }]);
    assert.strictEqual(result.summary.totalConnectedKw, 0);
    assert.strictEqual(result.rows.length, 1);
  });
});

// ---------------------------------------------------------------------------
describe('buildDemandSchedule() — NEC 220 category factors', () => {
  it('applies 100% to general loads', () => {
    const loads = [{ tag: 'G1', kw: '10', quantity: '1', loadType: 'misc equipment', powerFactor: '1' }];
    const result = buildDemandSchedule(loads, { mode: 'nec' });
    const row = result.rows[0];
    assert.strictEqual(row.demandFactor, 1.0);
    assert.strictEqual(row.demandKw, 10);
    assert.strictEqual(result.summary.totalDemandKw, 10);
  });

  it('applies 100% to lighting ≤ 50 kVA', () => {
    const loads = [{ tag: 'L1', kw: '20', quantity: '1', loadType: 'LED lighting', powerFactor: '1' }];
    const result = buildDemandSchedule(loads, { mode: 'nec' });
    assert.strictEqual(result.rows[0].demandFactor, 1.0);
    assert.strictEqual(result.summary.totalDemandKw, 20);
  });

  it('applies tiered demand to lighting > 50 kVA', () => {
    // 80 kW connected: first 50 at 100%, remaining 30 at 50% = 65 kW demand
    const loads = [{ tag: 'L1', kw: '80', quantity: '1', loadType: 'LED lighting', powerFactor: '1' }];
    const result = buildDemandSchedule(loads, { mode: 'nec' });
    assert.strictEqual(result.summary.totalDemandKw, 65);
  });

  it('applies 100% to receptacles ≤ 10 kVA', () => {
    const loads = [{ tag: 'R1', kw: '8', quantity: '1', loadType: 'receptacle', powerFactor: '1' }];
    const result = buildDemandSchedule(loads, { mode: 'nec' });
    assert.strictEqual(result.rows[0].demandFactor, 1.0);
    assert.strictEqual(result.summary.totalDemandKw, 8);
  });

  it('applies 50% tier to receptacles > 10 kVA', () => {
    // 20 kW: first 10 at 100%, next 10 at 50% → 15 kW demand
    const loads = [{ tag: 'R1', kw: '20', quantity: '1', loadType: 'receptacle outlets', powerFactor: '1' }];
    const result = buildDemandSchedule(loads, { mode: 'nec' });
    assert.strictEqual(result.summary.totalDemandKw, 15);
  });

  it('applies 100% to critical/UPS loads', () => {
    const loads = [{ tag: 'U1', kw: '30', quantity: '1', loadType: 'UPS system', powerFactor: '0.9' }];
    const result = buildDemandSchedule(loads, { mode: 'nec' });
    assert.strictEqual(result.rows[0].demandFactor, 1.0);
    assert.strictEqual(result.rows[0].demandKw, 30);
  });

  it('applies 75% to fixed appliances when count ≥ 4', () => {
    const loads = [
      { tag: 'A1', kw: '2', quantity: '1', loadType: 'washer', powerFactor: '1' },
      { tag: 'A2', kw: '3', quantity: '1', loadType: 'dryer', powerFactor: '1' },
      { tag: 'A3', kw: '2', quantity: '1', loadType: 'appliance unit', powerFactor: '1' },
      { tag: 'A4', kw: '3', quantity: '1', loadType: 'fixed appliance', powerFactor: '1' },
    ];
    const result = buildDemandSchedule(loads, { mode: 'nec' });
    result.rows.forEach(r => assert.strictEqual(r.demandFactor, 0.75));
    // total connected 10 kW × 0.75 = 7.5 kW
    assert.strictEqual(result.summary.totalDemandKw, 7.5);
  });

  it('applies 100% to fixed appliances when count < 4', () => {
    const loads = [
      { tag: 'A1', kw: '5', quantity: '1', loadType: 'fixed appliance', powerFactor: '1' },
      { tag: 'A2', kw: '5', quantity: '1', loadType: 'appliance', powerFactor: '1' },
    ];
    const result = buildDemandSchedule(loads, { mode: 'nec' });
    result.rows.forEach(r => assert.strictEqual(r.demandFactor, 1.0));
  });
});

// ---------------------------------------------------------------------------
describe('buildDemandSchedule() — NEC 430.24 motor demand', () => {
  it('adds 25% to the largest motor', () => {
    // Motor A: 10 kW, Motor B: 20 kW (largest)
    // Demand = 10 + 20×1.25 = 35 kW
    const loads = [
      { tag: 'M1', kw: '10', quantity: '1', loadType: 'pump motor', powerFactor: '1' },
      { tag: 'M2', kw: '20', quantity: '1', loadType: 'fan motor', powerFactor: '1' },
    ];
    const result = buildDemandSchedule(loads, { mode: 'nec' });
    assert.strictEqual(result.summary.totalDemandKw, 35);
    const m2 = result.rows.find(r => r.tag === 'M2');
    assert.strictEqual(m2.demandFactor, 1.25);
  });

  it('applies 100% to non-largest motors', () => {
    const loads = [
      { tag: 'M1', kw: '5',  quantity: '1', loadType: 'compressor', powerFactor: '1' },
      { tag: 'M2', kw: '15', quantity: '1', loadType: 'pump motor',  powerFactor: '1' },
    ];
    const result = buildDemandSchedule(loads, { mode: 'nec' });
    const m1 = result.rows.find(r => r.tag === 'M1');
    assert.strictEqual(m1.demandFactor, 1.0);
  });

  it('applies 125% to a single motor (it is both only and largest)', () => {
    const loads = [{ tag: 'M1', kw: '10', quantity: '1', loadType: 'motor', powerFactor: '1' }];
    const result = buildDemandSchedule(loads, { mode: 'nec' });
    assert.strictEqual(result.rows[0].demandFactor, 1.25);
    assert.strictEqual(result.summary.totalDemandKw, 12.5);
  });
});

// ---------------------------------------------------------------------------
describe('buildDemandSchedule() — NEC 220.56 kitchen demand', () => {
  it('applies 100% for 1–2 kitchen units', () => {
    const loads = [{ tag: 'K1', kw: '10', quantity: '2', loadType: 'commercial oven', powerFactor: '1' }];
    const result = buildDemandSchedule(loads, { mode: 'nec' });
    assert.strictEqual(result.rows[0].demandFactor, 1.0);
  });

  it('applies 65% for 6+ kitchen units', () => {
    const loads = [{ tag: 'K1', kw: '5', quantity: '6', loadType: 'commercial fryer', powerFactor: '1' }];
    const result = buildDemandSchedule(loads, { mode: 'nec' });
    assert.strictEqual(result.rows[0].demandFactor, 0.65);
    // 5 kW × 6 qty × 0.65 = 19.5 kW demand
    assert.strictEqual(result.summary.totalDemandKw, 19.5);
  });
});

// ---------------------------------------------------------------------------
describe('buildDemandSchedule() — NEC 625.42 EV charging', () => {
  it('applies 100% to first EV charger, 75% to 2nd–4th', () => {
    const loads = [
      { tag: 'EV1', kw: '7.2', quantity: '1', loadType: 'EV charger', powerFactor: '1' },
      { tag: 'EV2', kw: '7.2', quantity: '1', loadType: 'EV charger', powerFactor: '1' },
      { tag: 'EV3', kw: '7.2', quantity: '1', loadType: 'EVSE', powerFactor: '1' },
    ];
    const result = buildDemandSchedule(loads, { mode: 'nec' });
    const [ev1, ev2, ev3] = result.rows;
    assert.strictEqual(ev1.demandFactor, 1.0);
    assert.strictEqual(ev2.demandFactor, 0.75);
    assert.strictEqual(ev3.demandFactor, 0.75);
  });

  it('applies 50% from 5th EV charger onward', () => {
    const loads = Array.from({ length: 5 }, (_, i) => ({
      tag: `EV${i + 1}`, kw: '10', quantity: '1', loadType: 'EV charger', powerFactor: '1'
    }));
    const result = buildDemandSchedule(loads, { mode: 'nec' });
    assert.strictEqual(result.rows[4].demandFactor, 0.50);
  });
});

// ---------------------------------------------------------------------------
describe('buildDemandSchedule() — IEC 60439-1 mode', () => {
  it('applies diversity factor 0.9 for 4-load list', () => {
    const loads = Array.from({ length: 4 }, (_, i) => ({
      tag: `L${i}`, kw: '10', quantity: '1', loadType: 'general', powerFactor: '1'
    }));
    const result = buildDemandSchedule(loads, { mode: 'iec' });
    assert.strictEqual(result.mode, 'iec');
    assert.strictEqual(result.summary.diversityFactor, 0.9);
    assert.strictEqual(result.summary.totalConnectedKw, 40);
    assert.strictEqual(result.summary.totalDemandKw, 36);
  });

  it('applies diversity factor 1.0 for 2-load list', () => {
    const loads = Array.from({ length: 2 }, (_, i) => ({
      tag: `L${i}`, kw: '20', quantity: '1', loadType: 'general', powerFactor: '1'
    }));
    const result = buildDemandSchedule(loads, { mode: 'iec' });
    assert.strictEqual(result.summary.diversityFactor, 1.0);
    assert.strictEqual(result.summary.totalDemandKw, 40);
  });

  it('produces same result with standard option alias', () => {
    const loads = [{ kw: '10', quantity: '1', loadType: 'general', powerFactor: '1' }];
    const r1 = buildDemandSchedule(loads, { mode: 'iec' });
    const r2 = buildDemandSchedule(loads, { standard: 'iec' });
    assert.strictEqual(r1.summary.totalDemandKw, r2.summary.totalDemandKw);
  });
});

// ---------------------------------------------------------------------------
describe('buildDemandSchedule() — quantity and power factor', () => {
  it('multiplies kW by quantity', () => {
    const loads = [{ tag: 'P1', kw: '5', quantity: '3', loadType: 'general', powerFactor: '1' }];
    const result = buildDemandSchedule(loads, { mode: 'nec' });
    assert.strictEqual(result.rows[0].connectedKw, 15);
  });

  it('computes kVA correctly from kW and power factor', () => {
    const loads = [{ tag: 'P1', kw: '10', quantity: '1', loadType: 'general', powerFactor: '0.85' }];
    const result = buildDemandSchedule(loads, { mode: 'nec' });
    const expected = Math.round((10 / 0.85) * 100) / 100;
    assert.strictEqual(result.rows[0].connectedKva, expected);
  });
});

// ---------------------------------------------------------------------------
describe('buildDemandSchedule() — source breakdown', () => {
  it('groups rows by source', () => {
    const loads = [
      { tag: 'A1', source: 'MDP-A', kw: '10', quantity: '1', loadType: 'general', powerFactor: '1' },
      { tag: 'A2', source: 'MDP-A', kw: '5',  quantity: '1', loadType: 'general', powerFactor: '1' },
      { tag: 'B1', source: 'MDP-B', kw: '20', quantity: '1', loadType: 'general', powerFactor: '1' },
    ];
    const result = buildDemandSchedule(loads, { mode: 'nec' });
    const sources = result.sourceBreakdown.map(s => s.source).sort();
    assert.deepStrictEqual(sources, ['MDP-A', 'MDP-B']);
    const a = result.sourceBreakdown.find(s => s.source === 'MDP-A');
    assert.strictEqual(a.connectedKw, 15);
  });

  it('uses (unassigned) for loads without a source', () => {
    const loads = [{ kw: '5', quantity: '1', loadType: 'general', powerFactor: '1' }];
    const result = buildDemandSchedule(loads, { mode: 'nec' });
    const sources = result.sourceBreakdown.map(s => s.source);
    assert.ok(sources.includes('(unassigned)'));
  });
});

// ---------------------------------------------------------------------------
describe('NEC_CATEGORIES constant', () => {
  it('exports recognised category keys', () => {
    const keys = ['lighting', 'receptacle', 'motor', 'kitchen', 'hvac', 'ev', 'appliance', 'critical', 'general'];
    for (const k of keys) {
      assert.ok(NEC_CATEGORIES[k], `Missing category: ${k}`);
      assert.ok(NEC_CATEGORIES[k].label, `Missing label for: ${k}`);
    }
  });
});
