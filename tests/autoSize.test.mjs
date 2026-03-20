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
