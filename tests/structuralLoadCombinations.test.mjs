/**
 * Tests for analysis/structuralLoadCombinations.mjs
 *
 * Verifies ASCE 7-22 §2.3 (LRFD) and §2.4 (ASD) combined load combination
 * calculations for cable tray supports.
 */
import assert from 'assert';
import { calcStructuralCombinations } from '../analysis/structuralLoadCombinations.mjs';

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

// Baseline params used across multiple tests — moderate wind, moderate seismic
const BASE = {
  trayWeight_lbs_ft:  2.0,
  cableWeight_lbs_ft: 12.0,
  windSpeed_mph:      115,
  windExposure:       'C',
  sds:                0.50,
  sd1:                0.20,
  riskCategory:       'II',
  height_ft:          20,
  buildingHeight_ft:  30,
  trayWidth_in:       12,
  spanLength_ft:      12,
  fillLevel:          'partial',
};

// ---------------------------------------------------------------------------
// Return shape
// ---------------------------------------------------------------------------
describe('calcStructuralCombinations — return shape', () => {
  it('returns all required top-level keys', () => {
    const r = calcStructuralCombinations(BASE);
    assert.ok('deadLoad_lbs_ft'        in r, 'missing deadLoad_lbs_ft');
    assert.ok('windLateral_lbs_ft'     in r, 'missing windLateral_lbs_ft');
    assert.ok('seismicLateral_lbs_ft'  in r, 'missing seismicLateral_lbs_ft');
    assert.ok('seismicVertical_lbs_ft' in r, 'missing seismicVertical_lbs_ft');
    assert.ok('windResult'             in r, 'missing windResult');
    assert.ok('seismicResult'          in r, 'missing seismicResult');
    assert.ok('loadCombinations'       in r, 'missing loadCombinations');
    assert.ok('governingVertical'      in r, 'missing governingVertical');
    assert.ok('governingLateral'       in r, 'missing governingLateral');
    assert.ok('capacityCheck'          in r, 'missing capacityCheck');
  });

  it('dead load equals trayWeight + cableWeight', () => {
    const r = calcStructuralCombinations(BASE);
    assert.strictEqual(r.deadLoad_lbs_ft, 14.0);
  });

  it('returns 6 LRFD combinations by default', () => {
    const r = calcStructuralCombinations(BASE);
    assert.strictEqual(r.loadCombinations.length, 6);
  });

  it('each combination has required fields', () => {
    const r = calcStructuralCombinations(BASE);
    r.loadCombinations.forEach(lc => {
      assert.ok(typeof lc.id                  === 'string',  `${lc.id} missing id`);
      assert.ok(typeof lc.label               === 'string',  `${lc.id} missing label`);
      assert.ok(typeof lc.standard            === 'string',  `${lc.id} missing standard`);
      assert.ok(typeof lc.verticalDemand_lbs_ft === 'number', `${lc.id} missing verticalDemand_lbs_ft`);
      assert.ok(typeof lc.lateralDemand_lbs_ft  === 'number', `${lc.id} missing lateralDemand_lbs_ft`);
      assert.ok(typeof lc.governingVertical   === 'boolean', `${lc.id} missing governingVertical`);
      assert.ok(typeof lc.governingLateral    === 'boolean', `${lc.id} missing governingLateral`);
    });
  });
});

// ---------------------------------------------------------------------------
// Gravity-only (zero wind and seismic)
// ---------------------------------------------------------------------------
describe('Gravity-only case (W≈0, E=0)', () => {
  const gravityParams = {
    ...BASE,
    windSpeed_mph: 0.001,   // near-zero wind to avoid division errors
    sds: 0.0,
    sd1: 0.0,
  };

  it('LC-1 governs vertical demand at 1.4D', () => {
    const r = calcStructuralCombinations(gravityParams);
    const D = gravityParams.trayWeight_lbs_ft + gravityParams.cableWeight_lbs_ft; // 14
    const lc1 = r.loadCombinations.find(lc => lc.id === 'LC-1');
    assert.ok(lc1, 'LC-1 not found');
    // 1.4 × 14 = 19.6
    assert.ok(Math.abs(lc1.verticalDemand_lbs_ft - 1.4 * D) < 0.01,
      `LC-1 vertical demand expected ${1.4 * D}, got ${lc1.verticalDemand_lbs_ft}`);
    assert.strictEqual(lc1.governingVertical, true, 'LC-1 should govern vertical');
  });

  it('lateral demands are all near zero', () => {
    const r = calcStructuralCombinations(gravityParams);
    r.loadCombinations.forEach(lc => {
      assert.ok(lc.lateralDemand_lbs_ft < 0.5,
        `Expected lateral ≈ 0 for ${lc.id}, got ${lc.lateralDemand_lbs_ft}`);
    });
  });
});

// ---------------------------------------------------------------------------
// LRFD combination values
// ---------------------------------------------------------------------------
describe('LRFD combination values', () => {
  it('LC-5 vertical = (1.2 + 0.2·SDS)·D', () => {
    const r   = calcStructuralCombinations(BASE);
    const D   = r.deadLoad_lbs_ft;        // 14.0
    const Ev  = r.seismicVertical_lbs_ft; // 0.2 × 0.5 × 14 = 1.4
    const lc5 = r.loadCombinations.find(lc => lc.id === 'LC-5');
    const expected = 1.2 * D + Ev;
    assert.ok(Math.abs(lc5.verticalDemand_lbs_ft - expected) < 0.01,
      `LC-5 vertical: expected ${expected.toFixed(2)}, got ${lc5.verticalDemand_lbs_ft}`);
  });

  it('LC-6 vertical = (0.9 − 0.2·SDS)·D', () => {
    const r   = calcStructuralCombinations(BASE);
    const D   = r.deadLoad_lbs_ft;
    const Ev  = r.seismicVertical_lbs_ft;
    const lc6 = r.loadCombinations.find(lc => lc.id === 'LC-6');
    const expected = 0.9 * D - Ev;
    assert.ok(Math.abs(lc6.verticalDemand_lbs_ft - expected) < 0.01,
      `LC-6 vertical: expected ${expected.toFixed(2)}, got ${lc6.verticalDemand_lbs_ft}`);
  });

  it('seismicVertical = 0.2 × SDS × D', () => {
    const r = calcStructuralCombinations(BASE);
    const expected = 0.2 * BASE.sds * r.deadLoad_lbs_ft; // 0.2 × 0.5 × 14 = 1.4
    assert.ok(Math.abs(r.seismicVertical_lbs_ft - expected) < 0.01,
      `seismicVertical expected ${expected}, got ${r.seismicVertical_lbs_ft}`);
  });

  it('LC-3 and LC-4 lateral demands equal wind lateral', () => {
    const r   = calcStructuralCombinations(BASE);
    const W   = r.windLateral_lbs_ft;
    const lc3 = r.loadCombinations.find(lc => lc.id === 'LC-3');
    const lc4 = r.loadCombinations.find(lc => lc.id === 'LC-4');
    assert.ok(Math.abs(lc3.lateralDemand_lbs_ft - W) < 0.01, 'LC-3 lateral should equal W');
    assert.ok(Math.abs(lc4.lateralDemand_lbs_ft - W) < 0.01, 'LC-4 lateral should equal W');
  });
});

// ---------------------------------------------------------------------------
// Wind-dominant vs seismic-dominant governing lateral
// ---------------------------------------------------------------------------
describe('Governing lateral combination', () => {
  it('high wind, near-zero seismic → wind combination governs lateral', () => {
    const r = calcStructuralCombinations({
      ...BASE,
      windSpeed_mph: 200,  // very high wind
      sds: 0.05,           // near-zero seismic
      sd1: 0.02,
    });
    const govId = r.governingLateral.id;
    assert.ok(['LC-3', 'LC-4'].includes(govId),
      `Expected wind combination (LC-3 or LC-4) to govern, got ${govId}`);
  });

  it('high seismic, low wind → seismic combination governs lateral', () => {
    const r = calcStructuralCombinations({
      ...BASE,
      windSpeed_mph: 40,   // low wind
      sds: 2.0,            // high seismic
      sd1: 1.0,
    });
    const govId = r.governingLateral.id;
    assert.ok(['LC-5', 'LC-6'].includes(govId),
      `Expected seismic combination (LC-5 or LC-6) to govern, got ${govId}`);
  });

  it('exactly one combination flagged governingLateral=true', () => {
    const r   = calcStructuralCombinations(BASE);
    const cnt = r.loadCombinations.filter(lc => lc.governingLateral).length;
    assert.ok(cnt >= 1, 'No combination flagged as governing lateral');
  });

  it('exactly one combination flagged governingVertical=true', () => {
    const r   = calcStructuralCombinations(BASE);
    const cnt = r.loadCombinations.filter(lc => lc.governingVertical).length;
    assert.ok(cnt >= 1, 'No combination flagged as governing vertical');
  });
});

// ---------------------------------------------------------------------------
// ASD mode
// ---------------------------------------------------------------------------
describe('ASD design method', () => {
  it('returns 5 ASD combinations', () => {
    const r = calcStructuralCombinations({ ...BASE, designMethod: 'ASD' });
    assert.strictEqual(r.loadCombinations.length, 5);
  });

  it('ASD combination IDs start with ASD-', () => {
    const r = calcStructuralCombinations({ ...BASE, designMethod: 'ASD' });
    r.loadCombinations.forEach(lc => {
      assert.ok(lc.id.startsWith('ASD-'), `Expected ASD-* id, got ${lc.id}`);
    });
  });

  it('ASD-2 lateral = 0.6 × W', () => {
    const r    = calcStructuralCombinations({ ...BASE, designMethod: 'ASD' });
    const W    = r.windLateral_lbs_ft;
    const asd2 = r.loadCombinations.find(lc => lc.id === 'ASD-2');
    assert.ok(Math.abs(asd2.lateralDemand_lbs_ft - 0.6 * W) < 0.01,
      `ASD-2 lateral: expected ${(0.6 * W).toFixed(2)}, got ${asd2.lateralDemand_lbs_ft}`);
  });
});

// ---------------------------------------------------------------------------
// Capacity check
// ---------------------------------------------------------------------------
describe('Capacity check', () => {
  it('capacityCheck is null when no capacity provided', () => {
    const r = calcStructuralCombinations(BASE);
    assert.strictEqual(r.capacityCheck.verticalUtilization, null);
    assert.strictEqual(r.capacityCheck.lateralUtilization, null);
    assert.strictEqual(r.capacityCheck.verticalAdequate, null);
    assert.strictEqual(r.capacityCheck.lateralAdequate, null);
  });

  it('verticalAdequate=true when capacity exceeds governing demand', () => {
    const r = calcStructuralCombinations({
      ...BASE,
      verticalCapacity_lbs_ft: 1000,  // generously over any demand
    });
    assert.strictEqual(r.capacityCheck.verticalAdequate, true);
    assert.ok(r.capacityCheck.verticalUtilization < 1.0,
      `Expected utilization < 1.0, got ${r.capacityCheck.verticalUtilization}`);
  });

  it('verticalAdequate=false when capacity is less than governing demand', () => {
    const r = calcStructuralCombinations({
      ...BASE,
      verticalCapacity_lbs_ft: 1,  // absurdly small
    });
    assert.strictEqual(r.capacityCheck.verticalAdequate, false);
    assert.ok(r.capacityCheck.verticalUtilization > 1.0,
      `Expected utilization > 1.0, got ${r.capacityCheck.verticalUtilization}`);
  });

  it('lateralAdequate computed independently from vertical', () => {
    const r = calcStructuralCombinations({
      ...BASE,
      verticalCapacity_lbs_ft: 1000,
      lateralCapacity_lbs_ft:  1000,
    });
    assert.ok(r.capacityCheck.lateralUtilization !== null);
    assert.ok(r.capacityCheck.lateralAdequate === true);
  });
});

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------
describe('Input validation', () => {
  it('throws for missing windSpeed_mph', () => {
    assert.throws(
      () => calcStructuralCombinations({ ...BASE, windSpeed_mph: -10 }),
      /windSpeed_mph/,
    );
  });

  it('throws for invalid windExposure', () => {
    assert.throws(
      () => calcStructuralCombinations({ ...BASE, windExposure: 'X' }),
      /windExposure/,
    );
  });

  it('throws for invalid riskCategory', () => {
    assert.throws(
      () => calcStructuralCombinations({ ...BASE, riskCategory: 'V' }),
      /riskCategory/,
    );
  });

  it('throws for negative trayWeight_lbs_ft', () => {
    assert.throws(
      () => calcStructuralCombinations({ ...BASE, trayWeight_lbs_ft: -1 }),
      /trayWeight_lbs_ft/,
    );
  });

  it('throws for zero span length', () => {
    assert.throws(
      () => calcStructuralCombinations({ ...BASE, spanLength_ft: 0 }),
      /spanLength_ft/,
    );
  });
});
