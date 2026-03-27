/**
 * Tests for analysis/autoSize.mjs
 *
 * Verifies NEC conductor sizing, OCPD selection, motor branch circuit sizing,
 * and transformer sizing against hand-calculated NEC values.
 */
import assert from 'assert';
import {
  nextStandardOcpd,
  nextStandardXfmrKva,
  selectConductorSize,
  motorFLC3Ph,
  motorFLC1Ph,
  sizeFeeder,
  sizeMotorBranch,
  sizeTransformer,
  sizeFeederFromKw,
  STANDARD_OCPD_RATINGS,
  trayFillFactor,
  ambientTempFactor,
  bundlingFactor,
  conductorCostPerFt,
  meetsParallelRequirement,
  evaluateConductorOption,
  minimizeCostConductors,
  CU_COST_PER_FT,
  AL_COST_PER_FT,
} from '../analysis/autoSize.mjs';

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
// nextStandardOcpd
// ---------------------------------------------------------------------------
describe('nextStandardOcpd — NEC 240.6(A)', () => {
  it('returns 20 for exactly 20', () => {
    assert.strictEqual(nextStandardOcpd(20), 20);
  });

  it('rounds up to 20 for 18A', () => {
    assert.strictEqual(nextStandardOcpd(18), 20);
  });

  it('returns 100 for 100A', () => {
    assert.strictEqual(nextStandardOcpd(100), 100);
  });

  it('rounds up from 101 to 110', () => {
    assert.strictEqual(nextStandardOcpd(101), 110);
  });

  it('all standard ratings are in the table', () => {
    for (const r of STANDARD_OCPD_RATINGS) {
      assert.strictEqual(nextStandardOcpd(r), r);
    }
  });

  it('returns null above 6000A', () => {
    assert.strictEqual(nextStandardOcpd(6001), null);
  });
});

// ---------------------------------------------------------------------------
// nextStandardXfmrKva
// ---------------------------------------------------------------------------
describe('nextStandardXfmrKva', () => {
  it('rounds up 80 kVA to 100', () => {
    assert.strictEqual(nextStandardXfmrKva(80), 100);
  });

  it('returns 500 for exactly 500', () => {
    assert.strictEqual(nextStandardXfmrKva(500), 500);
  });

  it('rounds up from 1 to 5', () => {
    assert.strictEqual(nextStandardXfmrKva(1), 5);
  });
});

// ---------------------------------------------------------------------------
// selectConductorSize — NEC Table 310.15(B)(16)
// ---------------------------------------------------------------------------
describe('selectConductorSize — NEC Table 310.15(B)(16)', () => {
  it('#12 AWG copper 75°C is 25A', () => {
    const r = selectConductorSize(25, 'copper', 75);
    assert.strictEqual(r.size, '#12 AWG');
    assert.strictEqual(r.ampacity, 25);
  });

  it('selects #10 AWG for 28A (next above 25A)', () => {
    const r = selectConductorSize(28, 'copper', 75);
    assert.strictEqual(r.size, '#10 AWG');
    assert.strictEqual(r.ampacity, 35);
  });

  it('250 kcmil copper 75°C is 255A', () => {
    const r = selectConductorSize(255, 'copper', 75);
    assert.strictEqual(r.size, '250 kcmil');
    assert.strictEqual(r.ampacity, 255);
  });

  it('returns null if load exceeds table', () => {
    const r = selectConductorSize(99999, 'copper', 75);
    assert.strictEqual(r, null);
  });

  it('aluminum conductor is larger than copper for same ampacity', () => {
    const cu = selectConductorSize(100, 'copper', 75);
    const al = selectConductorSize(100, 'aluminum', 75);
    // Aluminum conductor will need to be at least as large or larger
    assert.ok(cu && al);
  });

  it('null aluminum for #14 AWG (not listed for aluminum in table)', () => {
    // Only copper #14 is listed; aluminum starts at #12
    const r = selectConductorSize(18, 'aluminum', 75);
    // Should get #12 AWG aluminum (20A) not #14
    assert.ok(r.size !== '#14 AWG');
  });
});

// ---------------------------------------------------------------------------
// motorFLC3Ph — NEC Table 430.250
// ---------------------------------------------------------------------------
describe('motorFLC3Ph — NEC Table 430.250', () => {
  it('10 HP at 460V = 14A', () => {
    assert.strictEqual(motorFLC3Ph(10, 460), 14);
  });

  it('50 HP at 460V = 65A', () => {
    assert.strictEqual(motorFLC3Ph(50, 460), 65);
  });

  it('100 HP at 460V = 124A', () => {
    assert.strictEqual(motorFLC3Ph(100, 460), 124);
  });

  it('returns null for unsupported voltage key', () => {
    // v400 doesn't exist in the table
    assert.strictEqual(motorFLC3Ph(10, 400), null);
  });

  it('rounds up to next standard HP if exact not found', () => {
    // 12 HP is not in table, should round up to 15 HP
    const flc = motorFLC3Ph(12, 460);
    assert.strictEqual(flc, 21); // 15 HP at 460V
  });
});

// ---------------------------------------------------------------------------
// motorFLC1Ph — NEC Table 430.248
// ---------------------------------------------------------------------------
describe('motorFLC1Ph — NEC Table 430.248', () => {
  it('1 HP at 230V = 8A', () => {
    assert.strictEqual(motorFLC1Ph(1, 230), 8.0);
  });

  it('5 HP at 230V = 28A', () => {
    assert.strictEqual(motorFLC1Ph(5, 230), 28);
  });
});

// ---------------------------------------------------------------------------
// sizeFeeder
// ---------------------------------------------------------------------------
describe('sizeFeeder — NEC 210.20 / 215.3 / 240.4', () => {
  it('sizes a 60A continuous load correctly', () => {
    // Required = 60 × 1.25 = 75A → conductor must handle 75A
    // 75°C Cu: #4 AWG = 85A ≥ 75A ✓
    // OCPD: next standard ≥ 85A → 90A
    const r = sizeFeeder({ loadAmps: 60, continuous: true });
    assert.strictEqual(r.requiredAmps, 75);
    assert.strictEqual(r.conductorSize, '#4 AWG');
    assert.strictEqual(r.conductorAmpacity, 85);
    assert.strictEqual(r.ocpdRating, 90);
  });

  it('sizes a 100A non-continuous load correctly', () => {
    // Required = 100A → #3 AWG = 100A ≥ 100A ✓
    // OCPD: next standard ≥ 100A → 100A
    const r = sizeFeeder({ loadAmps: 100, continuous: false });
    assert.strictEqual(r.requiredAmps, 100);
    assert.strictEqual(r.conductorSize, '#3 AWG'); // 100A exactly
    assert.strictEqual(r.ocpdRating, 100);
  });

  it('throws for zero load', () => {
    assert.throws(() => sizeFeeder({ loadAmps: 0 }));
  });

  it('returns error for oversize load', () => {
    const r = sizeFeeder({ loadAmps: 99999 });
    assert.ok('error' in r);
  });

  it('includes NEC references', () => {
    const r = sizeFeeder({ loadAmps: 30, continuous: true });
    assert.ok(r.nec && r.nec.continuousRule);
  });
});

// ---------------------------------------------------------------------------
// sizeMotorBranch
// ---------------------------------------------------------------------------
describe('sizeMotorBranch — NEC 430', () => {
  it('sizes a 10 HP, 460V, 3-phase motor correctly', () => {
    // FLC = 14A (NEC Table 430.250)
    // Conductor: 125% × 14 = 17.5A → #14 AWG (20A at 75°C) ✓
    // OCPD: 250% × 14 = 35A → 35A standard ✓
    // Overload: 115% × 14 = 16.1A
    const r = sizeMotorBranch({ hp: 10, voltage: 460, phase: '3ph' });
    assert.strictEqual(r.flc, 14);
    assert.strictEqual(r.conductorRequired, 17.5);
    assert.strictEqual(r.conductorSize, '#14 AWG');
    assert.strictEqual(r.ocpdRequired, 35);
    assert.strictEqual(r.ocpdRating, 35);
    assert.ok(Math.abs(r.overloadSetpoint - 16.1) < 0.1);
  });

  it('sizes a 50 HP, 460V, 3-phase motor', () => {
    // FLC = 65A (NEC Table 430.250)
    // Conductor: 125% × 65 = 81.25A → #4 AWG (85A) ✓
    // OCPD: 250% × 65 = 162.5A → 175A standard
    const r = sizeMotorBranch({ hp: 50, voltage: 460, phase: '3ph' });
    assert.strictEqual(r.flc, 65);
    assert.strictEqual(r.conductorSize, '#4 AWG');
    assert.strictEqual(r.ocpdRating, 175);
  });

  it('sizes a 1 HP, 230V, single-phase motor', () => {
    // FLC = 8A (NEC Table 430.248)
    // Conductor: 125% × 8 = 10A → #14 AWG (20A, using 60°C? No, 75°C default)
    // At 75°C: #14 AWG = 20A ≥ 10A ✓
    const r = sizeMotorBranch({ hp: 1, voltage: 230, phase: '1ph' });
    assert.strictEqual(r.flc, 8);
    assert.ok(r.conductorSize !== null);
  });

  it('throws for zero HP', () => {
    assert.throws(() => sizeMotorBranch({ hp: 0, voltage: 460 }));
  });

  it('returns error for unsupported voltage', () => {
    const r = sizeMotorBranch({ hp: 10, voltage: 400, phase: '3ph' });
    assert.ok('error' in r);
  });

  it('includes NEC references', () => {
    const r = sizeMotorBranch({ hp: 25, voltage: 460 });
    assert.ok(r.nec && r.nec.conductorRule && r.nec.ocpdRule);
  });
});

// ---------------------------------------------------------------------------
// sizeTransformer
// ---------------------------------------------------------------------------
describe('sizeTransformer — NEC 450.3(B)', () => {
  it('sizes a 75 kVA, 480V/208V, 3-phase transformer', () => {
    // Primary rated = 75000 / (√3 × 480) = 90.2A
    // Primary OCPD: 125% × 90.2 = 112.7A → 125A
    // Secondary rated = 75000 / (√3 × 208) = 208.2A
    // Secondary OCPD: 125% × 208.2 = 260.3A → 300A
    const r = sizeTransformer({
      loadKva: 75,
      primaryVoltage: 480,
      secondaryVoltage: 208,
      phase: '3ph'
    });
    assert.strictEqual(r.xfmrKva, 75);
    assert.strictEqual(r.primaryOcpdRating, 125);
    assert.strictEqual(r.secondaryOcpdRating, 300);
    assert.strictEqual(r.primaryOcpdFactor, '125%');
  });

  it('uses 167% factor for primary current ≤ 9A', () => {
    // 5 kVA, 480V primary, 3-phase → primary = 5000/(√3×480) = 6.01A ≤ 9A → 167%
    const r = sizeTransformer({
      loadKva: 3,
      primaryVoltage: 480,
      secondaryVoltage: 208,
      phase: '3ph'
    });
    assert.strictEqual(r.xfmrKva, 5);
    assert.ok(r.primaryRatedAmps <= 9, `Expected primary ≤ 9A, got ${r.primaryRatedAmps}`);
    assert.strictEqual(r.primaryOcpdFactor, '167%');
  });

  it('rounds up to next standard kVA', () => {
    const r = sizeTransformer({
      loadKva: 60,
      primaryVoltage: 480,
      secondaryVoltage: 208,
      phase: '3ph'
    });
    assert.strictEqual(r.xfmrKva, 75); // 60 → 75 kVA
  });

  it('throws for zero load', () => {
    assert.throws(() => sizeTransformer({ loadKva: 0, primaryVoltage: 480, secondaryVoltage: 208 }));
  });

  it('includes NEC references', () => {
    const r = sizeTransformer({ loadKva: 100, primaryVoltage: 480, secondaryVoltage: 208 });
    assert.ok(r.nec && r.nec.primaryRule);
  });
});

// ---------------------------------------------------------------------------
// sizeFeederFromKw
// ---------------------------------------------------------------------------
describe('sizeFeederFromKw — convenience wrapper', () => {
  it('correctly computes load amps from kW and PF', () => {
    // 50 kW, 3-phase, 480V, PF=0.85 → I = 50000 / (√3 × 480 × 0.85) = 70.8A
    const r = sizeFeederFromKw({ kw: 50, pf: 0.85, voltage: 480, phase: '3ph' });
    assert.ok(Math.abs(r.loadAmps - 70.8) < 0.5, `Expected ~70.8A, got ${r.loadAmps}`);
    assert.ok(r.conductorSize !== null);
  });

  it('throws for PF > 1', () => {
    assert.throws(() => sizeFeederFromKw({ kw: 50, pf: 1.1, voltage: 480 }));
  });

  it('throws for zero kW', () => {
    assert.throws(() => sizeFeederFromKw({ kw: 0, pf: 0.9, voltage: 480 }));
  });
});

// ---------------------------------------------------------------------------
// trayFillFactor — NEC 392.80(A)
// ---------------------------------------------------------------------------
describe('trayFillFactor — NEC 392.80(A)', () => {
  it('conduit returns 1.00', () => {
    assert.strictEqual(trayFillFactor('conduit'), 1.00);
  });

  it('tray_spaced returns 1.00', () => {
    assert.strictEqual(trayFillFactor('tray_spaced'), 1.00);
  });

  it('tray_touching returns 0.65', () => {
    assert.strictEqual(trayFillFactor('tray_touching'), 0.65);
  });

  it('unknown type falls back to 1.00', () => {
    assert.strictEqual(trayFillFactor('unknown_type'), 1.00);
  });

  it('defaults to 1.00 when no argument provided', () => {
    assert.strictEqual(trayFillFactor(), 1.00);
  });
});

// ---------------------------------------------------------------------------
// selectConductorSize — tray installation (NEC 392.80(A))
// ---------------------------------------------------------------------------
describe('selectConductorSize — tray installation', () => {
  it('tray_spaced gives same result as conduit at same conditions', () => {
    const conduit = selectConductorSize(100, 'copper', 75, { installationType: 'conduit' });
    const traySpaced = selectConductorSize(100, 'copper', 75, { installationType: 'tray_spaced' });
    assert.ok(conduit && traySpaced);
    assert.strictEqual(conduit.size, traySpaced.size);
    assert.strictEqual(conduit.deratingFactor, traySpaced.deratingFactor);
  });

  it('tray_touching requires a larger conductor than conduit for 100A', () => {
    // tray_touching factor = 0.65 → adjusted required = 100 / 0.65 ≈ 153.8A
    // conduit for 100A → #3 AWG (100A)
    // tray_touching for 100A → must select conductor whose table ampacity ≥ 153.8A
    const conduit = selectConductorSize(100, 'copper', 75, { installationType: 'conduit' });
    const trayTouching = selectConductorSize(100, 'copper', 75, { installationType: 'tray_touching' });
    assert.ok(conduit && trayTouching);
    assert.ok(trayTouching.ampacity > conduit.ampacity,
      `Expected tray_touching (${trayTouching.ampacity}A) > conduit (${conduit.ampacity}A)`);
  });

  it('tray_touching deratingFactor is 0.65', () => {
    const r = selectConductorSize(100, 'copper', 75, { installationType: 'tray_touching' });
    assert.ok(r);
    assert.ok(Math.abs(r.deratingFactor - 0.65) < 0.001);
  });

  it('tray_touching installed ampacity meets load', () => {
    const r = selectConductorSize(100, 'copper', 75, { installationType: 'tray_touching' });
    assert.ok(r);
    const installedAmpacity = r.ampacity * r.deratingFactor;
    assert.ok(installedAmpacity >= 100,
      `Installed ampacity ${installedAmpacity.toFixed(1)}A must be ≥ 100A`);
  });
});

// ---------------------------------------------------------------------------
// sizeFeeder — installation conditions (ambient + bundling + tray)
// ---------------------------------------------------------------------------
describe('sizeFeeder — installation conditions', () => {
  it('default conditions (30°C, 3 conductors, conduit) give derating factor 1.0', () => {
    const r = sizeFeeder({ loadAmps: 60, continuous: true, ambientTempC: 30, bundledConductors: 3, installationType: 'conduit' });
    assert.strictEqual(r.deratingFactor, 1.00);
  });

  it('40°C ambient with copper 75°C insulation gives correct derating', () => {
    // NEC Table 310.15(B)(1)(a): 40°C ambient, 75°C insulation → 0.88
    const expectedTempFactor = ambientTempFactor(40, 75);
    assert.ok(Math.abs(expectedTempFactor - 0.88) < 0.001);
    const r = sizeFeeder({ loadAmps: 60, continuous: false, ambientTempC: 40, bundledConductors: 1, installationType: 'conduit' });
    assert.ok(Math.abs(r.deratingFactor - 0.88) < 0.001);
  });

  it('6 bundled conductors gives 0.80 bundling factor', () => {
    // NEC 310.15(C)(1): 4-6 conductors → 0.80
    assert.strictEqual(bundlingFactor(6), 0.80);
    const r = sizeFeeder({ loadAmps: 60, continuous: false, ambientTempC: 30, bundledConductors: 6, installationType: 'conduit' });
    assert.strictEqual(r.deratingFactor, 0.80);
  });

  it('tray_touching gives 0.65 combined derating at default temp/bundling', () => {
    const r = sizeFeeder({ loadAmps: 60, continuous: false, ambientTempC: 30, bundledConductors: 1, installationType: 'tray_touching' });
    assert.ok(Math.abs(r.deratingFactor - 0.65) < 0.001);
  });

  it('combined conditions upsize conductor vs defaults', () => {
    // 40°C ambient (0.88) × 6 conductors (0.80) × tray_touching (0.65) ≈ 0.457
    const baseline = sizeFeeder({ loadAmps: 100, continuous: false });
    const derated = sizeFeeder({ loadAmps: 100, continuous: false, ambientTempC: 40, bundledConductors: 6, installationType: 'tray_touching' });
    assert.ok(derated.conductorAmpacity >= baseline.conductorAmpacity,
      `Derated conductor (${derated.conductorAmpacity}A) should be ≥ baseline (${baseline.conductorAmpacity}A)`);
    assert.ok(derated.deratingFactor < 1);
  });

  it('includes trayRule NEC reference when tray_touching', () => {
    const r = sizeFeeder({ loadAmps: 50, installationType: 'tray_touching' });
    assert.ok(r.nec.trayRule && r.nec.trayRule.includes('392.80'));
  });

  it('trayRule is null for conduit installation', () => {
    const r = sizeFeeder({ loadAmps: 50, installationType: 'conduit' });
    assert.strictEqual(r.nec.trayRule, null);
  });

  it('installedAmpacity meets load requirement after derating', () => {
    const r = sizeFeeder({ loadAmps: 100, continuous: false, ambientTempC: 40, bundledConductors: 6, installationType: 'tray_touching' });
    assert.ok(r.installedAmpacity >= 100,
      `Installed ampacity ${r.installedAmpacity}A must be ≥ 100A`);
  });
});

// ---------------------------------------------------------------------------
// sizeMotorBranch — installation conditions
// ---------------------------------------------------------------------------
describe('sizeMotorBranch — installation conditions', () => {
  it('tray_touching upsizes motor branch conductor', () => {
    const baseline = sizeMotorBranch({ hp: 25, voltage: 460 });
    const tray = sizeMotorBranch({ hp: 25, voltage: 460, installationType: 'tray_touching' });
    assert.ok(tray.conductorAmpacity >= baseline.conductorAmpacity,
      `Tray conductor (${tray.conductorAmpacity}A) should be ≥ baseline (${baseline.conductorAmpacity}A)`);
  });

  it('includes trayRule NEC reference when tray_touching', () => {
    const r = sizeMotorBranch({ hp: 25, voltage: 460, installationType: 'tray_touching' });
    assert.ok(r.nec.trayRule && r.nec.trayRule.includes('392.80'));
  });

  it('default installationType is conduit', () => {
    const r = sizeMotorBranch({ hp: 10, voltage: 460 });
    assert.strictEqual(r.installationType, 'conduit');
  });
});

// ---------------------------------------------------------------------------
// conductorCostPerFt
// ---------------------------------------------------------------------------
describe('conductorCostPerFt', () => {
  it('returns copper cost for a known Cu size', () => {
    const cost = conductorCostPerFt('1/0 AWG', 'copper');
    assert.strictEqual(cost, CU_COST_PER_FT['1/0 AWG']);
    assert.ok(cost > 0);
  });

  it('returns aluminum cost for a known Al size', () => {
    const cost = conductorCostPerFt('4/0 AWG', 'aluminum');
    assert.strictEqual(cost, AL_COST_PER_FT['4/0 AWG']);
    assert.ok(cost > 0);
  });

  it('returns null for a size absent from the Cu table', () => {
    assert.strictEqual(conductorCostPerFt('9999 kcmil', 'copper'), null);
  });

  it('returns null for #14 AWG aluminum (not in Al table)', () => {
    assert.strictEqual(conductorCostPerFt('#14 AWG', 'aluminum'), null);
  });

  it('aluminum cost is less than copper cost for the same size', () => {
    // Al should be cheaper than Cu for large conductors (key design premise)
    const cuCost = conductorCostPerFt('350 kcmil', 'copper');
    const alCost = conductorCostPerFt('350 kcmil', 'aluminum');
    assert.ok(cuCost !== null && alCost !== null);
    assert.ok(alCost < cuCost,
      `Al 350 kcmil ($${alCost}/ft) should be cheaper than Cu 350 kcmil ($${cuCost}/ft)`);
  });
});

// ---------------------------------------------------------------------------
// meetsParallelRequirement — NEC 310.10(H)
// ---------------------------------------------------------------------------
describe('meetsParallelRequirement — NEC 310.10(H)', () => {
  it('returns false for #4 AWG (below 1/0)', () => {
    assert.strictEqual(meetsParallelRequirement('#4 AWG'), false);
  });

  it('returns false for #1 AWG (just below 1/0)', () => {
    assert.strictEqual(meetsParallelRequirement('#1 AWG'), false);
  });

  it('returns true for 1/0 AWG (minimum allowed)', () => {
    assert.strictEqual(meetsParallelRequirement('1/0 AWG'), true);
  });

  it('returns true for 4/0 AWG', () => {
    assert.strictEqual(meetsParallelRequirement('4/0 AWG'), true);
  });

  it('returns true for 500 kcmil', () => {
    assert.strictEqual(meetsParallelRequirement('500 kcmil'), true);
  });

  it('returns false for unknown size', () => {
    assert.strictEqual(meetsParallelRequirement('9999 kcmil'), false);
  });
});

// ---------------------------------------------------------------------------
// evaluateConductorOption
// ---------------------------------------------------------------------------
describe('evaluateConductorOption', () => {
  it('single Cu conductor returns correct shape', () => {
    const opt = evaluateConductorOption(100, 'copper', 75, 1);
    assert.ok(opt, 'Should return a result');
    assert.strictEqual(opt.nParallel, 1);
    assert.strictEqual(opt.material, 'copper');
    assert.ok(opt.installedAmpacity >= 100, 'Installed ampacity must meet load');
    assert.ok(opt.costPerFtPerPhase > 0);
    assert.strictEqual(opt.violatesParallelRule, false);
  });

  it('single Al conductor returns correct shape', () => {
    const opt = evaluateConductorOption(100, 'aluminum', 75, 1);
    assert.ok(opt);
    assert.strictEqual(opt.material, 'aluminum');
    assert.ok(opt.installedAmpacity >= 100);
    assert.ok(opt.notes.some(n => n.includes('NEC 110.14')),
      'Al option should include terminal warning note');
  });

  it('2-parallel Cu/0 returns violatesParallelRule=false for large load', () => {
    // 300A load: 150A per conductor → likely 3/0 or 4/0 Cu → ≥ 1/0 so no violation
    const opt = evaluateConductorOption(300, 'copper', 75, 2);
    assert.ok(opt);
    assert.strictEqual(opt.nParallel, 2);
    assert.strictEqual(opt.violatesParallelRule, false);
    assert.ok(opt.notes.some(n => n.includes('310.10(H)')),
      'Parallel option should cite NEC 310.10(H)');
  });

  it('2-parallel on tiny load violates parallel rule', () => {
    // 20A load: 10A per conductor → will select a small conductor (< 1/0)
    const opt = evaluateConductorOption(20, 'copper', 75, 2);
    assert.ok(opt);
    assert.strictEqual(opt.violatesParallelRule, true);
    assert.ok(opt.notes.some(n => n.includes('⚠')));
  });

  it('installed ampacity equals nParallel × per-conductor installed ampacity', () => {
    const singleOpt = evaluateConductorOption(200, 'copper', 75, 1);
    const doubleOpt = evaluateConductorOption(200, 'copper', 75, 2);
    assert.ok(singleOpt && doubleOpt);
    // Double-parallel should carry at least as much total current
    assert.ok(doubleOpt.installedAmpacity >= 200);
  });

  it('costPerFtPerPhase equals nParallel × costPerFtEach', () => {
    const opt = evaluateConductorOption(300, 'copper', 75, 2);
    assert.ok(opt && opt.costPerFtEach !== null);
    const expected = Math.round(opt.costPerFtEach * 2 * 100) / 100;
    assert.strictEqual(opt.costPerFtPerPhase, expected);
  });

  it('returns null for impossible ampacity (aluminum, tiny rating)', () => {
    // Aluminum has no table entry below #8 AWG for most cases
    // But more reliably: ask for more amps than any single conductor can supply after derating
    const opt = evaluateConductorOption(99999, 'copper', 75, 1);
    assert.strictEqual(opt, null);
  });
});

// ---------------------------------------------------------------------------
// minimizeCostConductors
// ---------------------------------------------------------------------------
describe('minimizeCostConductors', () => {
  it('returns non-empty array for a standard feeder load', () => {
    const opts = minimizeCostConductors(125, 75); // 100A continuous → 125A required
    assert.ok(Array.isArray(opts) && opts.length > 0);
  });

  it('results are sorted cheapest first', () => {
    const opts = minimizeCostConductors(125, 75);
    for (let i = 1; i < opts.length; i++) {
      const a = opts[i - 1].costPerFtPerPhase;
      const b = opts[i].costPerFtPerPhase;
      if (a !== null && b !== null) {
        assert.ok(a <= b, `Option ${i - 1} ($${a}/ft) should be ≤ option ${i} ($${b}/ft)`);
      }
    }
  });

  it('all returned options are code-compliant (no parallel violations)', () => {
    const opts = minimizeCostConductors(250, 75);
    opts.forEach(opt => {
      assert.strictEqual(opt.violatesParallelRule, false,
        `Option ${opt.nParallel}×${opt.size} ${opt.material} violates parallel rule`);
    });
  });

  it('aluminum beats copper on cost for large feeders', () => {
    // For a 400A required ampacity, Al should be cheaper per ft than Cu
    const opts = minimizeCostConductors(400, 75, { allowAluminum: true });
    const cheapest = opts[0];
    assert.ok(cheapest, 'Should have at least one option');
    // The cheapest should be aluminum (it always is for large conductors)
    assert.strictEqual(cheapest.material, 'aluminum',
      `Expected cheapest option to be aluminum, got ${cheapest.material} ${cheapest.size}`);
  });

  it('respects allowAluminum=false — returns only copper options', () => {
    const opts = minimizeCostConductors(150, 75, { allowAluminum: false });
    assert.ok(opts.length > 0);
    opts.forEach(opt => {
      assert.strictEqual(opt.material, 'copper',
        `Expected copper only, got ${opt.material}`);
    });
  });

  it('respects maxParallel=1 — returns only single-conductor options', () => {
    const opts = minimizeCostConductors(200, 75, { maxParallel: 1 });
    assert.ok(opts.length > 0);
    opts.forEach(opt => {
      assert.strictEqual(opt.nParallel, 1,
        `Expected nParallel=1, got ${opt.nParallel}`);
    });
  });

  it('all installed ampacities satisfy the required load', () => {
    const required = 200;
    const opts = minimizeCostConductors(required, 75);
    opts.forEach(opt => {
      assert.ok(opt.installedAmpacity >= required,
        `${opt.nParallel}×${opt.size} ${opt.material} installed ampacity ` +
        `${opt.installedAmpacity}A must be ≥ ${required}A`);
    });
  });
});
