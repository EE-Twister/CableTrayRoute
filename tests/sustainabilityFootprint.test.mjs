/**
 * Tests for analysis/sustainabilityFootprint.mjs
 *
 * Covers: GRID_EMISSION_FACTORS, CABLE_CO2E, TRAY_CO2E, CONDUIT_CO2E,
 * EQUIPMENT_CO2E constants; cableCO2eFactor, trayCO2eFactor, conduitCO2eFactor
 * lookup helpers; embodiedCO2e BOM roll-up; operatingCO2e; and
 * buildSustainabilityReport integration (fixture BOM, missing losses, alt
 * comparison, invalid inputs).
 */
import assert from 'assert';
import {
  GRID_EMISSION_FACTORS,
  CABLE_CO2E,
  TRAY_CO2E,
  CONDUIT_CO2E,
  EQUIPMENT_CO2E,
  AWG_TO_MM2,
  cableCO2eFactor,
  trayCO2eFactor,
  conduitCO2eFactor,
  embodiedCO2e,
  operatingCO2e,
  buildSustainabilityReport,
} from '../analysis/sustainabilityFootprint.mjs';

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

const approx = (a, b, tol = 0.001) => Math.abs(a - b) <= tol;

// ---------------------------------------------------------------------------
describe('GRID_EMISSION_FACTORS constant', () => {
  it('contains required region keys', () => {
    for (const key of ['us', 'eu', 'uk', 'ca', 'au', 'cn', 'custom']) {
      assert.ok(GRID_EMISSION_FACTORS[key], `Missing region: ${key}`);
    }
  });

  it('all entries have positive kgPerKwh values', () => {
    for (const [key, def] of Object.entries(GRID_EMISSION_FACTORS)) {
      assert.ok(def.kgPerKwh > 0, `${key}.kgPerKwh must be positive`);
      assert.ok(typeof def.label === 'string', `${key}.label must be string`);
      assert.ok(typeof def.source === 'string', `${key}.source must be string`);
    }
  });

  it('US factor is in a plausible range (0.30–0.50 kg/kWh)', () => {
    assert.ok(GRID_EMISSION_FACTORS.us.kgPerKwh >= 0.30);
    assert.ok(GRID_EMISSION_FACTORS.us.kgPerKwh <= 0.50);
  });
});

// ---------------------------------------------------------------------------
describe('CABLE_CO2E constant', () => {
  it('contains key sizes 2.5, 10, 25, 95, 240 mm²', () => {
    for (const s of [2.5, 10, 25, 95, 240]) {
      assert.ok(CABLE_CO2E[s], `Missing size ${s} mm²`);
    }
  });

  it('all entries have positive Cu and Al factors', () => {
    for (const [size, entry] of Object.entries(CABLE_CO2E)) {
      assert.ok(entry.Cu > 0, `${size}mm² Cu must be > 0`);
      assert.ok(entry.Al > 0, `${size}mm² Al must be > 0`);
    }
  });

  it('Cu factor is greater than Al for the same size (Cu heavier mining footprint per kg but Al needs more kWh/kg)', () => {
    // Cu has lower embodied CO₂e per kg but higher density; combined effect
    // means Cu per-metre > Al per-metre for same mm² cross-section is typical
    // for LV cables (EPD industry data).
    for (const entry of Object.values(CABLE_CO2E)) {
      assert.ok(entry.Cu > entry.Al, 'Cu kg/m should exceed Al kg/m for same cross-section');
    }
  });
});

// ---------------------------------------------------------------------------
describe('TRAY_CO2E constant', () => {
  it('contains key widths 6, 12, 18, 24, 36 inches', () => {
    for (const w of [6, 12, 18, 24, 36]) {
      assert.ok(TRAY_CO2E[w], `Missing tray width ${w}"`);
    }
  });

  it('all entries have positive steel, aluminum, frp factors', () => {
    for (const [w, entry] of Object.entries(TRAY_CO2E)) {
      assert.ok(entry.steel    > 0, `${w}" steel must be > 0`);
      assert.ok(entry.aluminum > 0, `${w}" aluminum must be > 0`);
      assert.ok(entry.frp      > 0, `${w}" frp must be > 0`);
    }
  });
});

// ---------------------------------------------------------------------------
describe('CONDUIT_CO2E constant', () => {
  it('contains key sizes 0.5, 1, 2, 3, 4 inches', () => {
    for (const s of [0.5, 1, 2, 3, 4]) {
      assert.ok(CONDUIT_CO2E[s], `Missing conduit size ${s}"`);
    }
  });

  it('all entries have emt, imc, rgs, pvc factors > 0', () => {
    for (const [s, entry] of Object.entries(CONDUIT_CO2E)) {
      for (const type of ['emt', 'imc', 'rgs', 'pvc']) {
        assert.ok(entry[type] > 0, `${s}" ${type} must be > 0`);
      }
    }
  });

  it('rgs factor > imc > emt for same size (heavier wall)', () => {
    for (const entry of Object.values(CONDUIT_CO2E)) {
      assert.ok(entry.rgs > entry.imc, 'rgs > imc by wall thickness');
      assert.ok(entry.imc > entry.emt, 'imc > emt by wall thickness');
    }
  });
});

// ---------------------------------------------------------------------------
describe('EQUIPMENT_CO2E constant', () => {
  it('contains required category keys', () => {
    for (const key of ['transformer_dist', 'switchgear_lv', 'breaker_lv', 'panel_board', 'general']) {
      assert.ok(EQUIPMENT_CO2E[key], `Missing equipment category: ${key}`);
    }
  });

  it('all entries have positive kgPerUnit and a label string', () => {
    for (const [key, def] of Object.entries(EQUIPMENT_CO2E)) {
      assert.ok(def.kgPerUnit > 0, `${key}.kgPerUnit must be positive`);
      assert.ok(typeof def.label === 'string', `${key}.label must be string`);
    }
  });
});

// ---------------------------------------------------------------------------
describe('AWG_TO_MM2 lookup table', () => {
  it('maps common AWG labels to positive mm² values', () => {
    for (const [awg, mm2] of Object.entries(AWG_TO_MM2)) {
      assert.ok(mm2 > 0, `${awg} → ${mm2} must be positive`);
    }
  });
});

// ---------------------------------------------------------------------------
describe('cableCO2eFactor()', () => {
  it('returns a factor for numeric mm² input', () => {
    const f = cableCO2eFactor(25, 'Cu');
    assert.ok(f !== null);
    assert.ok(f.kgPerM > 0);
    assert.strictEqual(f.mm2Used, 25);
  });

  it('returns a factor for AWG string input', () => {
    const f = cableCO2eFactor('4 AWG', 'Cu');
    assert.ok(f !== null);
    assert.ok(f.kgPerM > 0);
  });

  it('rounds up to next available size', () => {
    // 30 mm² is between 25 and 35 → expect 35
    const f = cableCO2eFactor(30, 'Cu');
    assert.ok(f !== null);
    assert.strictEqual(f.mm2Used, 35);
  });

  it('returns different factors for Cu vs Al', () => {
    const cu = cableCO2eFactor(50, 'Cu');
    const al = cableCO2eFactor(50, 'Al');
    assert.ok(cu !== null && al !== null);
    assert.notStrictEqual(cu.kgPerM, al.kgPerM);
    assert.ok(cu.kgPerM > al.kgPerM);
  });

  it('returns null for invalid size', () => {
    assert.strictEqual(cableCO2eFactor(null, 'Cu'), null);
    assert.strictEqual(cableCO2eFactor('foo bar', 'Cu'), null);
  });
});

// ---------------------------------------------------------------------------
describe('trayCO2eFactor()', () => {
  it('returns a factor for exact width match', () => {
    const f = trayCO2eFactor(12, 'steel');
    assert.ok(f !== null);
    assert.strictEqual(f.widthUsed, 12);
    assert.ok(f.kgPerM > 0);
  });

  it('rounds up to next width', () => {
    // 15" is between 12 and 18 → expect 18
    const f = trayCO2eFactor(15, 'aluminum');
    assert.ok(f !== null);
    assert.strictEqual(f.widthUsed, 18);
  });

  it('returns different factors for steel vs aluminum vs frp', () => {
    const s = trayCO2eFactor(24, 'steel').kgPerM;
    const a = trayCO2eFactor(24, 'aluminum').kgPerM;
    const r = trayCO2eFactor(24, 'frp').kgPerM;
    assert.notStrictEqual(s, a);
    assert.ok(r < s, 'frp lighter than steel per metre');
  });
});

// ---------------------------------------------------------------------------
describe('conduitCO2eFactor()', () => {
  it('returns a factor for exact size match', () => {
    const f = conduitCO2eFactor(2, 'emt');
    assert.ok(f !== null);
    assert.strictEqual(f.sizeUsed, 2);
    assert.ok(f.kgPerM > 0);
  });

  it('rounds up to next trade size', () => {
    // 1.75" is between 1.5 and 2 → expect 2
    const f = conduitCO2eFactor(1.75, 'rgs');
    assert.ok(f !== null);
    assert.strictEqual(f.sizeUsed, 2);
  });

  it('defaults to emt for unknown conduit type', () => {
    const f = conduitCO2eFactor(1, 'galv');
    assert.ok(f !== null);
    assert.strictEqual(f.kgPerM, CONDUIT_CO2E[1].emt);
  });
});

// ---------------------------------------------------------------------------
describe('embodiedCO2e()', () => {
  it('returns zero total for empty BOM', () => {
    const { totalKg, lines, skippedItems } = embodiedCO2e([]);
    assert.strictEqual(totalKg, 0);
    assert.strictEqual(lines.length, 0);
    assert.strictEqual(skippedItems.length, 0);
  });

  it('uses item-level co2eKgPerUnit override over library', () => {
    const bom = [{ id: 'C-1', type: 'cable', quantity: 100, size: '4 AWG', material: 'Cu', co2eKgPerUnit: 9.99, epdSource: 'Nexans EPD 2023' }];
    const { lines, totalKg } = embodiedCO2e(bom);
    assert.strictEqual(lines.length, 1);
    assert.strictEqual(lines[0].co2eKgPerUnit, 9.99);
    assert.ok(approx(totalKg, 999, 0.01));
    assert.strictEqual(lines[0].source, 'override');
  });

  it('falls back to library for cable without override', () => {
    const bom = [{ id: 'C-2', type: 'cable', quantity: 50, size: '10 mm²', material: 'Cu' }];
    const { lines } = embodiedCO2e(bom);
    assert.strictEqual(lines.length, 1);
    assert.strictEqual(lines[0].source, 'library');
    assert.ok(lines[0].co2eKgPerUnit > 0);
  });

  it('multiplies by conductors for cable BOM entry', () => {
    const bom1 = [{ type: 'cable', quantity: 100, size: 25, material: 'Cu', conductors: 1 }];
    const bom3 = [{ type: 'cable', quantity: 100, size: 25, material: 'Cu', conductors: 3 }];
    const { totalKg: t1 } = embodiedCO2e(bom1);
    const { totalKg: t3 } = embodiedCO2e(bom3);
    assert.ok(approx(t3, t1 * 3, 0.01));
  });

  it('handles tray BOM entry', () => {
    const bom = [{ type: 'tray', quantity: 30, widthIn: 12, material: 'steel' }];
    const { lines, totalKg } = embodiedCO2e(bom);
    assert.strictEqual(lines.length, 1);
    assert.ok(approx(totalKg, 30 * TRAY_CO2E[12].steel, 0.01));
  });

  it('handles conduit BOM entry', () => {
    const bom = [{ type: 'conduit', quantity: 20, tradeSizeIn: 1, material: 'emt' }];
    const { lines, totalKg } = embodiedCO2e(bom);
    assert.strictEqual(lines.length, 1);
    assert.ok(approx(totalKg, 20 * CONDUIT_CO2E[1].emt, 0.01));
  });

  it('handles equipment BOM entry', () => {
    const bom = [{ type: 'equipment', quantity: 2, category: 'breaker_lv' }];
    const { lines, totalKg } = embodiedCO2e(bom);
    assert.strictEqual(lines.length, 1);
    assert.ok(approx(totalKg, 2 * EQUIPMENT_CO2E.breaker_lv.kgPerUnit, 0.01));
  });

  it('adds to skippedItems for unknown cable size', () => {
    const bom = [{ type: 'cable', quantity: 50, size: 'foo', material: 'Cu' }];
    const { lines, skippedItems } = embodiedCO2e(bom);
    assert.strictEqual(lines.length, 0);
    assert.strictEqual(skippedItems.length, 1);
  });

  it('adds to skippedItems for unknown equipment category', () => {
    const bom = [{ type: 'equipment', quantity: 1, category: 'nuclear_reactor' }];
    const { skippedItems } = embodiedCO2e(bom);
    assert.strictEqual(skippedItems.length, 1);
  });

  it('adds to skippedItems for zero quantity', () => {
    const bom = [{ type: 'tray', quantity: 0, widthIn: 12 }];
    const { skippedItems } = embodiedCO2e(bom);
    assert.strictEqual(skippedItems.length, 1);
  });

  it('sums multiple BOM lines correctly', () => {
    const bom = [
      { type: 'cable',    quantity: 100, size: 25, material: 'Cu' },
      { type: 'tray',     quantity: 50,  widthIn: 18, material: 'steel' },
      { type: 'conduit',  quantity: 30,  tradeSizeIn: 2, material: 'emt' },
      { type: 'equipment', quantity: 1,  category: 'panel_board' },
    ];
    const { totalKg, lines } = embodiedCO2e(bom);
    assert.strictEqual(lines.length, 4);
    const sum = lines.reduce((s, l) => s + l.subtotalKg, 0);
    assert.ok(approx(totalKg, sum, 0.001));
    assert.ok(totalKg > 0);
  });
});

// ---------------------------------------------------------------------------
describe('operatingCO2e()', () => {
  it('returns correct annual and lifetime kWh and kg CO₂e', () => {
    const result = operatingCO2e(10, 0.386, 25);
    // 10 kW × 8760 h = 87600 kWh/yr; × 25 yr = 2190000 kWh lifetime
    assert.ok(approx(result.annualKwh, 87600, 1));
    assert.ok(approx(result.lifetimeKwh, 2190000, 10));
    assert.ok(approx(result.lifetimeKgCO2e, 2190000 * 0.386, 10));
  });

  it('returns zero CO₂e for zero losses', () => {
    const result = operatingCO2e(0, 0.386, 25);
    assert.strictEqual(result.lifetimeKgCO2e, 0);
    assert.strictEqual(result.annualKwh, 0);
  });

  it('returns zero for zero grid factor', () => {
    const result = operatingCO2e(10, 0, 25);
    assert.strictEqual(result.lifetimeKgCO2e, 0);
  });

  it('scales proportionally with project life', () => {
    const r25 = operatingCO2e(5, 0.3, 25);
    const r50 = operatingCO2e(5, 0.3, 50);
    assert.ok(approx(r50.lifetimeKgCO2e, r25.lifetimeKgCO2e * 2, 0.01));
  });
});

// ---------------------------------------------------------------------------
describe('buildSustainabilityReport()', () => {
  const fixtureBom = [
    { type: 'cable',    quantity: 100, size: 25, material: 'Cu', conductors: 3 },
    { type: 'tray',     quantity: 50,  widthIn: 12, material: 'steel' },
    { type: 'conduit',  quantity: 20,  tradeSizeIn: 1, material: 'emt' },
    { type: 'equipment', quantity: 2,  category: 'panel_board' },
  ];

  it('returns a structured result for a fixture BOM', () => {
    const r = buildSustainabilityReport(fixtureBom);
    assert.ok(r.embodied);
    assert.ok(r.embodied.totalKg > 0);
    assert.ok(r.totalKg > 0);
    assert.ok(approx(r.totalTonnes, r.totalKg / 1000, 0.001));
    assert.strictEqual(r.gridRegion, 'us');
    assert.ok(r.gridFactorKgPerKwh > 0);
    assert.strictEqual(r.projectLifeYears, 25);
  });

  it('operating is null when lossesKw is omitted', () => {
    const r = buildSustainabilityReport(fixtureBom);
    assert.strictEqual(r.operating, null);
    assert.ok(approx(r.totalKg, r.embodied.totalKg, 0.001));
  });

  it('includes operating CO₂e when lossesKw is provided', () => {
    const r = buildSustainabilityReport(fixtureBom, { lossesKw: 5, projectLifeYears: 20 });
    assert.ok(r.operating !== null);
    assert.ok(r.operating.lifetimeKgCO2e > 0);
    assert.ok(approx(r.totalKg, r.embodied.totalKg + r.operating.lifetimeKgCO2e, 0.01));
  });

  it('uses custom gridFactorKgPerKwh over region default', () => {
    const r = buildSustainabilityReport(fixtureBom, { lossesKw: 10, gridFactorKgPerKwh: 0.5, projectLifeYears: 10 });
    assert.ok(approx(r.gridFactorKgPerKwh, 0.5, 0.0001));
  });

  it('uses au grid region factor when specified', () => {
    const r = buildSustainabilityReport(fixtureBom, { gridRegion: 'au', lossesKw: 5 });
    assert.ok(approx(r.gridFactorKgPerKwh, GRID_EMISSION_FACTORS.au.kgPerKwh, 0.0001));
  });

  it('returns alternativeComparison when alternative BOM is provided', () => {
    const altBom = [{ type: 'cable', quantity: 80, size: 16, material: 'Al', conductors: 3 }];
    const r = buildSustainabilityReport(fixtureBom, { alternative: altBom });
    assert.ok(r.alternativeComparison !== null);
    assert.ok(typeof r.alternativeComparison.deltaKg === 'number');
    assert.ok(typeof r.alternativeComparison.totalKg === 'number');
  });

  it('alternativeComparison delta sign is correct', () => {
    const heavyBom  = [{ type: 'equipment', quantity: 10, category: 'transformer_power' }];
    const lightBom  = [{ type: 'equipment', quantity: 10, category: 'breaker_lv' }];
    const r = buildSustainabilityReport(heavyBom, { alternative: lightBom });
    assert.ok(r.alternativeComparison.deltaKg < 0, 'lighter alternative should have negative delta');
  });

  it('handles empty BOM gracefully', () => {
    const r = buildSustainabilityReport([]);
    assert.strictEqual(r.embodied.totalKg, 0);
    assert.strictEqual(r.totalKg, 0);
    assert.strictEqual(r.operating, null);
  });

  it('defaults projectLifeYears to 25', () => {
    const r = buildSustainabilityReport(fixtureBom);
    assert.strictEqual(r.projectLifeYears, 25);
  });
});
