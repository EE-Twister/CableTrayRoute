/**
 * Unit tests for Differential Protection Zone Modeling — Gap #67 (87B / 87T / 87G)
 *
 * Verifies:
 *   1. Device library — 3 differential entries with correct schema
 *   2. percentDifferentialCharacteristic() — dual-slope regions and boundary behaviour
 *   3. ctRatioMismatch() — tap factor and mismatch percentage
 *   4. harmonicRestraintCheck() — 2nd/5th harmonic blocking logic (87T)
 *   5. protectionZoneCheck() — OPERATE / RESTRAIN / BLOCKED decisions
 *   6. runDifferentialProtectionStudy() — integrated smoke test with persistence shape
 *
 * Run with:  node tests/tcc/differentialProtection.test.mjs
 */

import assert from 'assert';
import { readFileSync } from 'fs';
import {
  percentDifferentialCharacteristic,
  ctRatioMismatch,
  harmonicRestraintCheck,
  protectionZoneCheck,
  runDifferentialProtectionStudy,
  buildCharacteristicCurve,
  DIFF_TYPES,
} from '../../analysis/differentialProtection.mjs';

function describe(name, fn) { console.log('\n' + name); fn(); }
function it(name, fn) {
  try { fn(); console.log('  \u2713', name); }
  catch (err) { console.log('  \u2717', name); console.error(err); process.exitCode = 1; }
}

const devices = JSON.parse(readFileSync(new URL('../../data/protectiveDevices.json', import.meta.url), 'utf8'));
const diffDevices = devices.filter(d => d.differential === true);
const diffById = Object.fromEntries(diffDevices.map(d => [d.id, d]));

// ─── 1. Device Library ────────────────────────────────────────────────────────
describe('Differential relay device library', () => {
  it('has exactly 3 differential entries', () => {
    assert.strictEqual(diffDevices.length, 3, `expected 3, got ${diffDevices.length}`);
  });

  it('all entries have differential === true', () => {
    diffDevices.forEach(d => assert.strictEqual(d.differential, true, `${d.id} missing differential flag`));
  });

  it('all entries have a valid diffType (87B, 87T, or 87G)', () => {
    diffDevices.forEach(d => {
      assert.ok(DIFF_TYPES.includes(d.diffType), `${d.id} invalid diffType: ${d.diffType}`);
    });
  });

  it('all entries have type "relay"', () => {
    diffDevices.forEach(d => assert.strictEqual(d.type, 'relay', `${d.id} unexpected type: ${d.type}`));
  });

  it('expected device IDs exist (diff_bus_87b, diff_xfmr_87t, diff_gen_87g)', () => {
    ['diff_bus_87b', 'diff_xfmr_87t', 'diff_gen_87g'].forEach(id =>
      assert.ok(diffById[id], `Missing device: ${id}`)
    );
  });

  it('87T entry has harmonicRestraint === true', () => {
    assert.strictEqual(diffById['diff_xfmr_87t'].harmonicRestraint, true);
  });

  it('87B and 87G entries do NOT have harmonicRestraint', () => {
    assert.ok(!diffById['diff_bus_87b'].harmonicRestraint);
    assert.ok(!diffById['diff_gen_87g'].harmonicRestraint);
  });

  it('87T entry has restraint2ndPct and restraint5thPct in settingOptions', () => {
    const opts = diffById['diff_xfmr_87t'].settingOptions;
    assert.ok(Array.isArray(opts.restraint2ndPct), 'missing restraint2ndPct options');
    assert.ok(Array.isArray(opts.restraint5thPct), 'missing restraint5thPct options');
  });

  it('generator relay (87G) has lower slope1Pct than transformer relay (87T)', () => {
    assert.ok(
      diffById['diff_gen_87g'].settings.slope1Pct < diffById['diff_xfmr_87t'].settings.slope1Pct,
      '87G should have a lower Slope 1 than 87T (tighter generator CT matching)'
    );
  });
});

// ─── 2. percentDifferentialCharacteristic() ──────────────────────────────────
describe('percentDifferentialCharacteristic()', () => {
  const settings = { slope1Pct: 25, slope2Pct: 50, minPickupMultiple: 0.2, breakpointMultiple: 3.0 };

  it('returns flat region at zero restraint', () => {
    const r = percentDifferentialCharacteristic(0, settings);
    assert.strictEqual(r.region, 'flat');
    assert.strictEqual(r.threshold, 0.2);
  });

  it('returns flat region at exactly minPickupMultiple', () => {
    const r = percentDifferentialCharacteristic(0.2, settings);
    assert.strictEqual(r.region, 'flat');
    assert.strictEqual(r.threshold, 0.2);
  });

  it('returns slope1 region for restraint in (minPickup, breakpoint)', () => {
    const r = percentDifferentialCharacteristic(1.0, settings);
    assert.strictEqual(r.region, 'slope1');
    assert.ok(Math.abs(r.threshold - 0.25) < 1e-9, `expected 0.25, got ${r.threshold}`);
  });

  it('slope1 threshold never falls below minPickupMultiple', () => {
    // at restraint=0.5, 25%*0.5=0.125 < 0.2 → clamp to 0.2
    const r = percentDifferentialCharacteristic(0.5, settings);
    assert.ok(r.threshold >= settings.minPickupMultiple);
  });

  it('returns slope2 region above breakpoint', () => {
    const r = percentDifferentialCharacteristic(4.0, settings);
    assert.strictEqual(r.region, 'slope2');
  });

  it('slope2 threshold at breakpoint equals slope1 threshold at breakpoint', () => {
    const atBp = percentDifferentialCharacteristic(3.0, settings);
    const justAbove = percentDifferentialCharacteristic(3.0 + 1e-9, settings);
    assert.ok(Math.abs(atBp.threshold - justAbove.threshold) < 1e-6, 'continuity at breakpoint');
  });

  it('slope2 increases by slope2Pct per unit above breakpoint', () => {
    const r3 = percentDifferentialCharacteristic(3.0, settings);
    const r4 = percentDifferentialCharacteristic(4.0, settings);
    const delta = r4.threshold - r3.threshold;
    assert.ok(Math.abs(delta - 0.5) < 1e-9, `expected 0.5 increase, got ${delta}`);
  });

  it('throws on negative restraint', () => {
    assert.throws(() => percentDifferentialCharacteristic(-0.1, settings), RangeError);
  });
});

// ─── 3. ctRatioMismatch() ─────────────────────────────────────────────────────
describe('ctRatioMismatch()', () => {
  it('perfect matching gives tapFactor=1.0 and mismatch=0%', () => {
    // turns = 2, priCT=120, secCT=60 → tap = (2×60)/120 = 1.0
    const r = ctRatioMismatch(120, 60, 2);
    assert.ok(Math.abs(r.tapFactor - 1.0) < 1e-9, `tapFactor ${r.tapFactor}`);
    assert.ok(Math.abs(r.mismatchPct) < 1e-9, `mismatch ${r.mismatchPct}%`);
    assert.ok(r.withinLimit);
  });

  it('computes correct mismatch for non-ideal ratios', () => {
    // turns=2, priCT=120, secCT=50 → tap=(2×50)/120 = 100/120 ≈ 0.8333
    const r = ctRatioMismatch(120, 50, 2);
    assert.ok(Math.abs(r.tapFactor - (100 / 120)) < 1e-6);
    assert.ok(Math.abs(r.mismatchPct - 16.667) < 0.001, `mismatch ${r.mismatchPct}%`);
    assert.ok(!r.withinLimit, 'mismatch > 10% should fail withinLimit');
  });

  it('mismatch within 5% passes with low-concern message', () => {
    // turns=1, priCT=100, secCT=103 → tap=1.03 → mismatch=3%
    const r = ctRatioMismatch(100, 103, 1);
    assert.ok(r.mismatchPct < 5);
    assert.ok(r.withinLimit);
    assert.ok(r.correction.includes('no compensation'));
  });

  it('throws on non-positive inputs', () => {
    assert.throws(() => ctRatioMismatch(0, 60, 2), RangeError);
    assert.throws(() => ctRatioMismatch(120, -1, 2), RangeError);
  });
});

// ─── 4. harmonicRestraintCheck() ─────────────────────────────────────────────
describe('harmonicRestraintCheck()', () => {
  const settings = { restraint2ndPct: 20, restraint5thPct: 35 };

  it('returns not-blocked with zero harmonics', () => {
    const r = harmonicRestraintCheck(0.5, 0, 0, settings);
    assert.strictEqual(r.blocked, false);
    assert.strictEqual(r.inrushBlocked, false);
    assert.strictEqual(r.overexcitationBlocked, false);
  });

  it('blocks on 2nd harmonic at threshold', () => {
    // i2nd = 0.2 × idiff → ratio2nd = 20% ≥ 20%
    const r = harmonicRestraintCheck(1.0, 0.20, 0, settings);
    assert.strictEqual(r.inrushBlocked, true);
    assert.strictEqual(r.blocked, true);
    assert.ok(r.reason.includes('inrush'));
  });

  it('does NOT block on 2nd harmonic below threshold', () => {
    // ratio = 19% < 20%
    const r = harmonicRestraintCheck(1.0, 0.19, 0, settings);
    assert.strictEqual(r.inrushBlocked, false);
  });

  it('blocks on 5th harmonic at threshold', () => {
    // ratio5th = 35% ≥ 35%
    const r = harmonicRestraintCheck(1.0, 0, 0.35, settings);
    assert.strictEqual(r.overexcitationBlocked, true);
    assert.strictEqual(r.blocked, true);
    assert.ok(r.reason.includes('overexcitation'));
  });

  it('reason mentions both when both thresholds are exceeded', () => {
    const r = harmonicRestraintCheck(1.0, 0.25, 0.40, settings);
    assert.ok(r.blocked);
    assert.ok(r.reason.includes('inrush'));
    assert.ok(r.reason.includes('overexcitation'));
  });

  it('returns not-blocked when iDiffPu is 0', () => {
    const r = harmonicRestraintCheck(0, 0.5, 0.5, settings);
    assert.strictEqual(r.blocked, false);
  });
});

// ─── 5. protectionZoneCheck() ────────────────────────────────────────────────
describe('protectionZoneCheck()', () => {
  const settings = { slope1Pct: 25, slope2Pct: 50, minPickupMultiple: 0.2, breakpointMultiple: 3.0 };

  it('returns OPERATE when I_diff >= threshold', () => {
    // threshold at I_rest=1 is max(0.25, 0.2)=0.25; I_diff=0.4 > 0.25
    const r = protectionZoneCheck('87T', 0.4, 1.0, settings);
    assert.strictEqual(r.decision, 'OPERATE');
  });

  it('returns RESTRAIN when I_diff < threshold', () => {
    // threshold at I_rest=1 is 0.25; I_diff=0.1 < 0.25
    const r = protectionZoneCheck('87T', 0.1, 1.0, settings);
    assert.strictEqual(r.decision, 'RESTRAIN');
  });

  it('returns BLOCKED for 87T when 2nd harmonic exceeds threshold', () => {
    const r = protectionZoneCheck('87T', 0.4, 1.0, settings, { i2ndPu: 0.25, i5thPu: 0 });
    // ratio2nd = 0.25/0.4 = 62.5% > 20%
    assert.strictEqual(r.decision, 'BLOCKED');
    assert.ok(r.reason.includes('Harmonic restraint'));
  });

  it('does NOT check harmonics for 87B', () => {
    // Same harmonic values — 87B ignores them
    const r = protectionZoneCheck('87B', 0.4, 1.0, settings, { i2ndPu: 0.25, i5thPu: 0 });
    assert.notStrictEqual(r.decision, 'BLOCKED');
    assert.strictEqual(r.harmonicCheck, null);
  });

  it('does NOT check harmonics for 87G', () => {
    const r = protectionZoneCheck('87G', 0.4, 1.0, settings, { i2ndPu: 0.25, i5thPu: 0 });
    assert.notStrictEqual(r.decision, 'BLOCKED');
    assert.strictEqual(r.harmonicCheck, null);
  });

  it('margin is positive (> 0) in OPERATE region', () => {
    const r = protectionZoneCheck('87B', 0.5, 1.0, settings);
    assert.ok(r.margin > 0);
  });

  it('margin is negative (< 0) in RESTRAIN region', () => {
    const r = protectionZoneCheck('87G', 0.1, 1.0, settings);
    assert.ok(r.margin < 0);
  });

  it('throws on invalid diffType', () => {
    assert.throws(() => protectionZoneCheck('87X', 0.4, 1.0, settings), RangeError);
  });

  it('throws on negative iDiffPu', () => {
    assert.throws(() => protectionZoneCheck('87B', -0.1, 1.0, settings), RangeError);
  });
});

// ─── 6. buildCharacteristicCurve() ───────────────────────────────────────────
describe('buildCharacteristicCurve()', () => {
  it('returns an array of {restraint, threshold} points', () => {
    const pts = buildCharacteristicCurve();
    assert.ok(Array.isArray(pts) && pts.length > 0);
    pts.forEach(p => {
      assert.ok('restraint' in p && 'threshold' in p);
      assert.ok(p.restraint >= 0 && p.threshold > 0);
    });
  });

  it('threshold is monotonically non-decreasing', () => {
    const pts = buildCharacteristicCurve({ slope1Pct: 25, slope2Pct: 50, minPickupMultiple: 0.2, breakpointMultiple: 3.0 });
    for (let i = 1; i < pts.length; i++) {
      assert.ok(pts[i].threshold >= pts[i - 1].threshold - 1e-9,
        `Non-monotonic at index ${i}: ${pts[i].threshold} < ${pts[i - 1].threshold}`);
    }
  });
});

// ─── 7. runDifferentialProtectionStudy() ─────────────────────────────────────
describe('runDifferentialProtectionStudy()', () => {
  it('returns a complete result object for 87T', () => {
    const result = runDifferentialProtectionStudy({
      diffType: '87T',
      zoneLabel: 'TR-1 HV',
      slope1Pct: 25,
      slope2Pct: 50,
      minPickupMultiple: 0.2,
      breakpointMultiple: 3.0,
      primaryCTRatio: 120,
      secondaryCTRatio: 60,
      xfmrTurnsRatio: 2,
      iDiffPu: 0.4,
      iRestraintPu: 1.0,
      restraint2ndPct: 20,
      restraint5thPct: 35,
      i2ndPu: 0,
      i5thPu: 0,
    });

    assert.strictEqual(result.diffType, '87T');
    assert.strictEqual(result.zoneLabel, 'TR-1 HV');
    assert.ok(['OPERATE', 'RESTRAIN', 'BLOCKED'].includes(result.zoneCheck.decision));
    assert.ok(result.ctMismatch !== null);
    assert.ok(Array.isArray(result.characteristicCurve) && result.characteristicCurve.length > 0);
    assert.ok(typeof result.timestamp === 'string');
  });

  it('returns OPERATE for a clear internal fault', () => {
    // I_diff=2.0 pu, I_rest=1.0 pu → threshold≈0.25 → clearly in operate region
    const result = runDifferentialProtectionStudy({ diffType: '87B', iDiffPu: 2.0, iRestraintPu: 1.0 });
    assert.strictEqual(result.zoneCheck.decision, 'OPERATE');
  });

  it('returns RESTRAIN for normal load', () => {
    // I_diff=0.02 pu (small imbalance), I_rest=1.0 → below threshold
    const result = runDifferentialProtectionStudy({ diffType: '87G', iDiffPu: 0.02, iRestraintPu: 1.0 });
    assert.strictEqual(result.zoneCheck.decision, 'RESTRAIN');
  });

  it('returns BLOCKED on inrush for 87T', () => {
    // High 2nd harmonic → inrush blocking
    const result = runDifferentialProtectionStudy({
      diffType: '87T',
      iDiffPu: 0.5,
      iRestraintPu: 1.0,
      i2ndPu: 0.2,   // 40% of iDiff > 20% threshold
      i5thPu: 0,
    });
    assert.strictEqual(result.zoneCheck.decision, 'BLOCKED');
  });

  it('ctMismatch is null when CT ratios are not provided', () => {
    const result = runDifferentialProtectionStudy({ diffType: '87B', iDiffPu: 0.1, iRestraintPu: 1.0 });
    assert.strictEqual(result.ctMismatch, null);
  });

  it('throws on invalid diffType', () => {
    assert.throws(() => runDifferentialProtectionStudy({ diffType: 'INVALID', iDiffPu: 0.1, iRestraintPu: 1.0 }), RangeError);
  });

  it('throws on missing / negative iDiffPu', () => {
    assert.throws(() => runDifferentialProtectionStudy({ diffType: '87B', iDiffPu: -1, iRestraintPu: 1.0 }), RangeError);
  });
});

console.log('\nDone.');
