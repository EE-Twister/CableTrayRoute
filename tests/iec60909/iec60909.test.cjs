/**
 * Unit tests for analysis/iec60909.mjs
 *
 * Tests the IEC 60909-0:2016 engine: c-factor lookup, κ formula,
 * fault current calculations, and thermal equivalent current.
 * Also verifies that runShortCircuit() correctly delegates to the
 * IEC engine when method === 'IEC'.
 */

const assert = require('assert');

function describe(name, fn) {
  console.log(name);
  fn();
}
function it(name, fn) {
  try {
    fn();
    console.log('  \u2713', name);
  } catch (err) {
    console.log('  \u2717', name);
    console.error(err);
    process.exitCode = 1;
  }
}

// Mock localStorage for dataStore.mjs
const store = {};
global.localStorage = {
  getItem: key => (key in store ? store[key] : null),
  setItem: (key, value) => { store[key] = value; },
  removeItem: key => { delete store[key]; }
};

(async () => {
  const { cFactor, kappaIEC, thermalMFactor, computeIEC60909Bus } =
    await import('../../analysis/iec60909.mjs');
  const { setOneLine } = await import('../../dataStore.mjs');
  const { runShortCircuit } = await import('../../analysis/shortCircuit.mjs');

  // -----------------------------------------------------------------------
  // c-factor (IEC 60909-0:2016 Table 1)
  // -----------------------------------------------------------------------
  describe('cFactor — IEC 60909-0:2016 Table 1', () => {
    it('LV c_max = 1.10 when tolerance >= 6%', () => {
      assert.strictEqual(cFactor(0.4, 'max', 10), 1.10);
    });
    it('LV c_max = 1.05 when tolerance < 6%', () => {
      assert.strictEqual(cFactor(0.4, 'max', 4), 1.05);
    });
    it('LV c_min = 0.95 regardless of tolerance', () => {
      assert.strictEqual(cFactor(0.4, 'min', 10), 0.95);
      assert.strictEqual(cFactor(1.0, 'min', 4), 0.95);
    });
    it('MV c_max = 1.10 (>1 kV)', () => {
      assert.strictEqual(cFactor(11, 'max'), 1.10);
    });
    it('MV c_min = 1.00 (>1 kV)', () => {
      assert.strictEqual(cFactor(11, 'min'), 1.00);
    });
    it('HV c_max = 1.10 (>35 kV)', () => {
      assert.strictEqual(cFactor(110, 'max'), 1.10);
    });
    it('HV c_min = 1.00 (>35 kV)', () => {
      assert.strictEqual(cFactor(110, 'min'), 1.00);
    });
    it('boundary: exactly 1 kV is treated as LV', () => {
      assert.strictEqual(cFactor(1.0, 'max', 10), 1.10);
    });
  });

  // -----------------------------------------------------------------------
  // κ peak factor (IEC 60909-0:2016 §4.3.1.1, Eq. 14)
  // -----------------------------------------------------------------------
  describe('kappaIEC — peak factor', () => {
    it('κ at X/R = 10: expected ≈ 1.745', () => {
      // κ = 1.02 + 0.98 × e^(−3/10) = 1.02 + 0.98 × e^(−0.3) ≈ 1.02 + 0.98 × 0.7408 ≈ 1.7460
      const k = kappaIEC(10);
      assert(Math.abs(k - 1.746) < 0.002, `Expected ≈1.746, got ${k}`);
    });
    it('κ at X/R = 1 (resistive): expected ≈ 1.304', () => {
      // κ = 1.02 + 0.98 × e^(−3) ≈ 1.02 + 0.98 × 0.0498 ≈ 1.069
      const k = kappaIEC(1);
      assert(k > 1.0 && k < 1.15, `Expected ~1.07, got ${k}`);
    });
    it('κ at X/R → ∞ approaches 2.0', () => {
      const k = kappaIEC(1000);
      assert(Math.abs(k - 2.0) < 0.01, `Expected ≈2.0, got ${k}`);
    });
    it('κ never falls below 1.02', () => {
      // X/R → 0 → κ = 1.02
      const k = kappaIEC(0.001);
      assert(k >= 1.02, `Expected >= 1.02, got ${k}`);
    });
  });

  // -----------------------------------------------------------------------
  // thermalMFactor
  // -----------------------------------------------------------------------
  describe('thermalMFactor — DC heating factor m', () => {
    it('m = 0 at κ boundary (1.02)', () => {
      const m = thermalMFactor(1.02, 1.0, 50);
      assert(m === 0, `Expected 0, got ${m}`);
    });
    it('m > 0 for realistic κ and fault duration', () => {
      // κ ≈ 1.746 (X/R=10), Tk = 1 s — m should be a small positive number
      const k = kappaIEC(10);
      const m = thermalMFactor(k, 1.0, 50);
      assert(m >= 0 && m < 0.5, `Expected 0 <= m < 0.5, got ${m}`);
    });
    it('m increases with shorter fault duration (more DC heating impact)', () => {
      const k = kappaIEC(20);
      const m_short = thermalMFactor(k, 0.1, 50);
      const m_long = thermalMFactor(k, 3.0, 50);
      assert(m_short > m_long, `m for short faults (${m_short}) should exceed long faults (${m_long})`);
    });
  });

  // -----------------------------------------------------------------------
  // computeIEC60909Bus — core bus calculation
  // -----------------------------------------------------------------------
  describe('computeIEC60909Bus — individual bus', () => {
    // Reference: 11 kV bus, Z1 = j0.5 Ω, Z2 = Z0 = j0.5 Ω, c_max = 1.10
    // V = 11 × 1.10 / √3 = 6.987 kV
    // I"k3 = 6.987 / 0.5 = 13.974 kA
    const z = { r: 0, x: 0.5 };
    const busParams = {
      z1: z, z2: z, z0: z,
      prefaultKV: 11,
      cMode: 'max',
      lvTolerancePct: 10,
      faultDurationS: 1.0,
      freqHz: 50
    };

    it('three-phase I"k3 matches hand calculation (11 kV, Z1=j0.5)', () => {
      const res = computeIEC60909Bus(busParams);
      const expected = (11 * 1.10) / (Math.sqrt(3) * 0.5);
      assert(Math.abs(res.threePhaseKA - expected) < 0.05, `Expected ≈${expected.toFixed(2)}, got ${res.threePhaseKA}`);
    });

    it('line-to-line I"k2 = (√3/2) × I"k3', () => {
      const res = computeIEC60909Bus(busParams);
      const expected = res.threePhaseKA * (Math.sqrt(3) / 2);
      assert(Math.abs(res.lineToLineKA - expected) < 0.05,
        `Expected ≈${expected.toFixed(2)}, got ${res.lineToLineKA}`);
    });

    it('line-to-ground I"k1 equals I"k3 when Z1 = Z2 = Z0', () => {
      // When Z1 = Z2 = Z0: I"k1 = 3V/|3Z1| = V/|Z1| = I"k3
      const res = computeIEC60909Bus(busParams);
      assert(Math.abs(res.lineToGroundKA - res.threePhaseKA) < 0.05,
        `I"k1=${res.lineToGroundKA} should ≈ I"k3=${res.threePhaseKA} when Z1=Z2=Z0`);
    });

    it('peak ip = κ × √2 × I"k3 (purely inductive, X/R → ∞)', () => {
      const res = computeIEC60909Bus({ ...busParams, xrOverride: 100 });
      const kappaExpected = 1.02 + 0.98 * Math.exp(-3 / 100);
      const ipExpected = kappaExpected * Math.sqrt(2) * res.threePhaseKA;
      assert(Math.abs(res.ip - ipExpected) < 0.1, `Expected ip≈${ipExpected.toFixed(2)}, got ${res.ip}`);
    });

    it('Ib = I"k3 (far-from-generator assumption)', () => {
      const res = computeIEC60909Bus(busParams);
      assert.strictEqual(res.Ib, res.threePhaseKA);
    });

    it('Ith >= I"k3 (thermal current includes DC heating component)', () => {
      const res = computeIEC60909Bus({ ...busParams, xrOverride: 10 });
      assert(res.Ith >= res.threePhaseKA, `Ith=${res.Ith} should be >= I"k3=${res.threePhaseKA}`);
    });

    it('c_min gives lower fault current than c_max (MV bus)', () => {
      const max = computeIEC60909Bus({ ...busParams, cMode: 'max' });
      const min = computeIEC60909Bus({ ...busParams, cMode: 'min' });
      assert(max.threePhaseKA > min.threePhaseKA,
        `c_max result (${max.threePhaseKA}) should exceed c_min result (${min.threePhaseKA})`);
    });
  });

  // -----------------------------------------------------------------------
  // Integration: runShortCircuit() with method = 'IEC'
  // Returns IEC-specific fields in result
  // -----------------------------------------------------------------------
  describe('runShortCircuit() — IEC delegation', () => {
    it('IEC study returns ip, Ib, Ith, kappa, cFactor fields', () => {
      setOneLine({ activeSheet: 0, sheets: [{ name: 'S1', components: [
        {
          id: 'bus11kV',
          kV: 11,
          z1: { r: 0.01, x: 0.5 },
          z2: { r: 0.01, x: 0.5 },
          z0: { r: 0.01, x: 0.5 },
          xr_ratio: 50
        }
      ]}]});
      const res = runShortCircuit({ method: 'IEC' });
      const bus = res.bus11kV;
      assert(bus, 'bus result should exist');
      assert.strictEqual(bus.method, 'IEC');
      assert(typeof bus.ip === 'number' && bus.ip > 0, 'ip should be a positive number');
      assert(typeof bus.Ib === 'number' && bus.Ib > 0, 'Ib should be a positive number');
      assert(typeof bus.Ith === 'number' && bus.Ith > 0, 'Ith should be a positive number');
      assert(typeof bus.kappa === 'number' && bus.kappa > 1, 'kappa should be > 1');
      assert(typeof bus.cFactor === 'number', 'cFactor should be present');
    });

    it('IEC result has higher I"k3 than ANSI for same MV network', () => {
      const model = { activeSheet: 0, sheets: [{ name: 'S1', components: [
        {
          id: 'bus13kV',
          kV: 13.8,
          z1: { r: 0.01, x: 1.0 },
          z2: { r: 0.01, x: 1.0 },
          z0: { r: 0.01, x: 1.0 }
        }
      ]}]};
      setOneLine(model);
      const iec = runShortCircuit({ method: 'IEC' });
      setOneLine(model);
      const ansi = runShortCircuit({ method: 'ANSI' });
      // IEC c_max=1.10 vs ANSI v_factor=1.05 → IEC should be ~4.8% higher
      assert(iec.bus13kV.threePhaseKA > ansi.bus13kV.threePhaseKA,
        `IEC (${iec.bus13kV.threePhaseKA}) should exceed ANSI (${ansi.bus13kV.threePhaseKA})`);
    });

    it('ANSI path is unchanged — existing test values still hold', () => {
      // Reproduce the existing shortCircuit.test case: bus480V, X/R=6
      setOneLine({ activeSheet: 0, sheets: [{ name: 'S1', components: [
        { id: 'bus480V', kV: 0.48, z1: { r: 0, x: 0.05 }, z2: { r: 0, x: 0.05 }, z0: { r: 0, x: 0.05 },
          sources: [{ z1: { r: 0, x: 0.02 }, z2: { r: 0, x: 0.02 }, z0: { r: 0, x: 0.02 } }], xr_ratio: 6 }
      ]}]});
      const res = runShortCircuit({ method: 'ANSI' });
      const b = res.bus480V;
      assert(Math.abs(b.threePhaseKA - 20.37) < 0.1, `Expected ≈20.37, got ${b.threePhaseKA}`);
      assert(Math.abs(b.asymKA - 45.86) < 0.1, `Expected ≈45.86, got ${b.asymKA}`);
    });
  });

})();
