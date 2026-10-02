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
  DEMAND_PROFILES,
  iecDiversityFactor,
  NEC_CATEGORIES,
  normalizeDemandProfile,
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

  it('ignores inherited necCategory names and falls back to auto-categorisation', () => {
    const result = buildDemandSchedule([{ kw: '1', quantity: '1', loadType: 'general', necCategory: 'constructor' }], { mode: 'nec' });
    assert.strictEqual(result.rows.length, 1);
    assert.strictEqual(result.rows[0].necCategory, 'general');
    assert.strictEqual(result.summary.totalDemandKw, 1);
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

  it('keeps lighting at 100% for all other occupancies, however large (Table 220.42)', () => {
    const loads = [{ tag: 'L1', kw: '80', quantity: '1', loadType: 'LED lighting', powerFactor: '1' }];
    const result = buildDemandSchedule(loads, { mode: 'nec' });
    assert.strictEqual(result.summary.totalDemandKw, 80);
  });

  it('applies the Table 220.42 occupancy tiers when an occupancy is selected', () => {
    const lighting = kw => [{ tag: 'L1', kw: String(kw), loadType: 'LED lighting', powerFactor: '1' }];
    // Warehouse: first 12.5 kVA 100%, remainder 50%: 12.5 + 37.5 x 0.5 = 31.25
    assert.strictEqual(buildDemandSchedule(lighting(50), { mode: 'nec', lightingOccupancy: 'warehouse' }).summary.totalDemandKw, 31.25);
    // Hospital: first 50 kVA 40%, remainder 20%: 20 + 30 x 0.2 = 26
    assert.strictEqual(buildDemandSchedule(lighting(80), { mode: 'nec', lightingOccupancy: 'hospital' }).summary.totalDemandKw, 26);
    // Hotel: 20 x 0.5 + 80 x 0.4 + 50 x 0.3 = 10 + 32 + 15 = 57
    assert.strictEqual(buildDemandSchedule(lighting(150), { mode: 'nec', lightingOccupancy: 'hotel' }).summary.totalDemandKw, 57);
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

  it('keeps non-dwelling fixed appliances at 100% even with 4 or more (220.53 is dwelling only)', () => {
    const loads = [
      { tag: 'A1', kw: '2', quantity: '1', loadType: 'washer', powerFactor: '1' },
      { tag: 'A2', kw: '3', quantity: '1', loadType: 'dryer', powerFactor: '1' },
      { tag: 'A3', kw: '2', quantity: '1', loadType: 'appliance unit', powerFactor: '1' },
      { tag: 'A4', kw: '3', quantity: '1', loadType: 'fixed appliance', powerFactor: '1' },
    ];
    const result = buildDemandSchedule(loads, { mode: 'nec' });
    result.rows.forEach(r => assert.strictEqual(r.demandFactor, 1));
    assert.strictEqual(result.summary.totalDemandKw, 10);
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

  it('keeps the 125% largest-motor adder in dwelling profile', () => {
    const loads = [{ tag: 'M1', kw: '10', quantity: '1', loadType: 'motor', powerFactor: '1' }];
    const result = buildDemandSchedule(loads, { mode: 'nec', profile: 'dwelling' });
    assert.strictEqual(result.rows[0].demandFactor, 1.25);
    assert.strictEqual(result.summary.totalDemandKw, 12.5);
  });
});

// ---------------------------------------------------------------------------
describe('buildDemandSchedule() — NEC 220.56 kitchen demand', () => {
  it('applies 100% for 1–2 kitchen units', () => {
    const loads = Array.from({ length: 2 }, (_, index) => ({ tag: `K${index + 1}`, kw: '10', loadType: 'commercial oven', powerFactor: '1' }));
    const result = buildDemandSchedule(loads, { mode: 'nec' });
    assert.strictEqual(result.rows[0].demandFactor, 1.0);
  });

  it('applies 65% for 6+ kitchen units', () => {
    const loads = Array.from({ length: 6 }, (_, index) => ({ tag: `K${index + 1}`, kw: '5', loadType: 'commercial fryer', powerFactor: '1' }));
    const result = buildDemandSchedule(loads, { mode: 'nec' });
    assert.strictEqual(result.rows[0].demandFactor, 0.65);
    // Six uniquely tagged 5 kW loads at 65% = 19.5 kW demand.
    assert.strictEqual(result.summary.totalDemandKw, 19.5);
  });
});

// ---------------------------------------------------------------------------
describe('buildDemandSchedule() — NEC 625.42 EV charging', () => {
  it('keeps every EV charger at 100% (continuous load, no ordinal demand factors)', () => {
    const loads = [
      { tag: 'EV1', kw: '7.2', quantity: '1', loadType: 'EV charger', powerFactor: '1' },
      { tag: 'EV2', kw: '7.2', quantity: '1', loadType: 'EV charger', powerFactor: '1' },
      { tag: 'EV3', kw: '7.2', quantity: '1', loadType: 'EVSE', powerFactor: '1' },
    ];
    const result = buildDemandSchedule(loads, { mode: 'nec' });
    result.rows.forEach(r => assert.strictEqual(r.demandFactor, 1.0));
    assert.strictEqual(result.summary.totalDemandKw, 21.6);
  });

  it('five EV chargers are still 100% (an old table gave the 5th only 50%)', () => {
    const loads = Array.from({ length: 5 }, (_, i) => ({
      tag: `EV${i + 1}`, kw: '10', quantity: '1', loadType: 'EV charger', powerFactor: '1'
    }));
    const result = buildDemandSchedule(loads, { mode: 'nec' });
    assert.strictEqual(result.rows[4].demandFactor, 1.0);
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
describe('buildDemandSchedule() — unique rows and power factor', () => {
  it('ignores legacy quantity because each tagged row is one load', () => {
    const loads = [{ tag: 'P1', kw: '5', quantity: '3', loadType: 'general', powerFactor: '1' }];
    const result = buildDemandSchedule(loads, { mode: 'nec' });
    assert.strictEqual(result.rows[0].connectedKw, 5);
    assert.strictEqual(Object.hasOwn(result.rows[0], 'quantity'), false);
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
describe('buildDemandSchedule() — demand classification profiles', () => {
  it('defaults to commercial non-dwelling profile', () => {
    const result = buildDemandSchedule([{ tag: 'R1', kw: '20', loadType: 'receptacle', powerFactor: '1' }]);
    assert.strictEqual(result.profile, 'commercial');
    assert.strictEqual(result.profileLabel, DEMAND_PROFILES.commercial.label);
    assert.strictEqual(result.summary.totalDemandKw, 15);
    assert.deepStrictEqual(result.reviewNotes, []);
  });

  it('normalizes common demand profile aliases', () => {
    assert.strictEqual(normalizeDemandProfile('commercial non dwelling'), 'commercial');
    assert.strictEqual(normalizeDemandProfile('health care'), 'healthcare');
    assert.strictEqual(normalizeDemandProfile('shore power'), 'marina');
    assert.strictEqual(normalizeDemandProfile('unknown'), 'commercial');
  });

  it('keeps industrial lighting and receptacles at 100% and emits review notes', () => {
    const loads = [
      { tag: 'L1', kw: '80', loadType: 'LED lighting', powerFactor: '1' },
      { tag: 'R1', kw: '20', loadType: 'receptacle', powerFactor: '1' },
      { tag: 'M1', kw: '10', loadType: 'motor', powerFactor: '1' },
    ];
    const result = buildDemandSchedule(loads, { mode: 'nec', profile: 'industrial' });
    assert.strictEqual(result.profile, 'industrial');
    assert.strictEqual(result.rows.find(r => r.tag === 'L1').demandFactor, 1);
    assert.strictEqual(result.rows.find(r => r.tag === 'R1').demandFactor, 1);
    assert.strictEqual(result.rows.find(r => r.tag === 'M1').demandFactor, 1.25);
    assert.ok(result.reviewNotes.some(note => note.category === 'lighting'));
    assert.ok(result.reviewNotes.some(note => note.category === 'receptacle'));
  });

  it('keeps dwelling profile loads at 100% and flags the dedicated calculation path', () => {
    const loads = [
      { tag: 'LTG', kw: '80', loadType: 'lighting', powerFactor: '1' },
      { tag: 'APP', kw: '10', loadType: 'fixed appliance', powerFactor: '1' },
    ];
    const result = buildDemandSchedule(loads, { mode: 'nec', profile: 'dwelling' });
    assert.strictEqual(result.summary.totalConnectedKw, 90);
    assert.strictEqual(result.summary.totalDemandKw, 90);
    assert.ok(result.reviewNotes.some(note => note.reference.includes('dwelling')));
  });

  it('returns profile metadata in IEC mode without changing IEC diversity math', () => {
    const loads = Array.from({ length: 4 }, (_, i) => ({
      tag: `L${i + 1}`, kw: '10', loadType: 'lighting', powerFactor: '1'
    }));
    const result = buildDemandSchedule(loads, { mode: 'iec', profile: 'healthcare' });
    assert.strictEqual(result.summary.totalDemandKw, 36);
    assert.strictEqual(result.profile, 'healthcare');
    assert.ok(result.reviewNotes.some(note => note.category === 'profile'));
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


// ---------------------------------------------------------------------------
describe('review regressions: largest motor ties and kitchen minimum', () => {
  it('only one of several identical motors carries the +25%', () => {
    const loads = Array.from({ length: 5 }, (_, i) => ({ tag: `M${i + 1}`, kw: '10', loadType: 'pump motor', powerFactor: '1' }));
    const result = buildDemandSchedule(loads, { mode: 'nec' });
    assert.strictEqual(result.rows.filter(r => r.demandFactor === 1.25).length, 1);
    assert.strictEqual(result.summary.totalDemandKw, 52.5); // 50 + 25% of one 10 kW motor, not 62.5
  });

  it('identifies the largest motor on the efficiency-adjusted connected kW', () => {
    const loads = [
      { tag: 'M1', kw: '10', efficiency: '50', loadType: 'motor', powerFactor: '1' }, // 20 kW connected
      { tag: 'M2', kw: '15', efficiency: '100', loadType: 'motor', powerFactor: '1' }, // 15 kW connected
    ];
    const result = buildDemandSchedule(loads, { mode: 'nec' });
    assert.strictEqual(result.rows.find(r => r.tag === 'M1').demandFactor, 1.25);
    assert.strictEqual(result.rows.find(r => r.tag === 'M2').demandFactor, 1);
  });

  it('kitchen demand never falls below the two largest pieces (Table 220.56)', () => {
    // Six pieces totalling 40 kW: 65% gives 26 kW, but the two largest pieces (30 + 8) set a 38 kW minimum
    const kw = [30, 8, 1, 0.5, 0.25, 0.25];
    const loads = kw.map((v, i) => ({ tag: `K${i + 1}`, kw: String(v), loadType: 'commercial oven', powerFactor: '1' }));
    const result = buildDemandSchedule(loads, { mode: 'nec' });
    const total = kw.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(result.summary.totalDemandKw - 38) < 0.02, `demand ${result.summary.totalDemandKw} of ${total}`);
  });
});
