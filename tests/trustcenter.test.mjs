import assert from 'assert';
import { runBenchmark, runAllBenchmarks, summarize, BENCHMARKS } from '../analysis/benchmarkRunner.mjs';

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
// benchmarkRunner core logic
// ---------------------------------------------------------------------------

describe('benchmarkRunner — runBenchmark()', () => {
  it('passes a benchmark whose run() returns the exact expected numeric value', () => {
    const bm = {
      id: 'TEST-001',
      label: 'synthetic pass',
      studyType: 'Test',
      standardRef: 'unit test',
      description: 'always returns 42',
      run: () => ({ value: 42 }),
      checks: [{ key: 'value', description: 'answer', expectedVal: 42, tolerance: 0 }],
    };
    const result = runBenchmark(bm);
    assert.strictEqual(result.pass, true);
    assert.strictEqual(result.error, null);
    assert.strictEqual(result.checks[0].pass, true);
    assert.strictEqual(result.checks[0].deviation, 0);
  });

  it('fails a benchmark when deviation exceeds tolerance', () => {
    const bm = {
      id: 'TEST-002',
      label: 'synthetic fail',
      studyType: 'Test',
      standardRef: 'unit test',
      description: 'returns wrong value',
      run: () => ({ value: 5.0 }),
      checks: [{ key: 'value', description: 'answer', expectedVal: 0, tolerance: 0.01 }],
    };
    const result = runBenchmark(bm);
    assert.strictEqual(result.pass, false);
    assert.strictEqual(result.checks[0].pass, false);
    assert.ok(Math.abs(result.checks[0].deviation - 5.0) < 1e-9);
  });

  it('handles boolean checks — true matches true', () => {
    const bm = {
      id: 'TEST-003',
      label: 'bool pass',
      studyType: 'Test',
      standardRef: 'unit test',
      description: 'boolean check',
      run: () => ({ flag: true }),
      checks: [{ key: 'flag', description: 'must be true', expectedVal: true, tolerance: 0, type: 'boolean' }],
    };
    const result = runBenchmark(bm);
    assert.strictEqual(result.pass, true);
  });

  it('handles boolean checks — true does not match false', () => {
    const bm = {
      id: 'TEST-004',
      label: 'bool fail',
      studyType: 'Test',
      standardRef: 'unit test',
      description: 'boolean mismatch',
      run: () => ({ flag: true }),
      checks: [{ key: 'flag', description: 'must be false', expectedVal: false, tolerance: 0, type: 'boolean' }],
    };
    const result = runBenchmark(bm);
    assert.strictEqual(result.pass, false);
  });

  it('captures thrown errors and marks result as fail', () => {
    const bm = {
      id: 'TEST-005',
      label: 'throws',
      studyType: 'Test',
      standardRef: 'unit test',
      description: 'run throws',
      run: () => { throw new Error('intentional'); },
      checks: [{ key: 'value', description: 'anything', expectedVal: 0, tolerance: 999 }],
    };
    const result = runBenchmark(bm);
    assert.strictEqual(result.pass, false);
    assert.ok(result.error.includes('intentional'));
  });

  it('all checks must pass for the benchmark to pass', () => {
    const bm = {
      id: 'TEST-006',
      label: 'mixed checks',
      studyType: 'Test',
      standardRef: 'unit test',
      description: 'two checks, one fails',
      run: () => ({ a: 1, b: 99 }),
      checks: [
        { key: 'a', description: 'a=1', expectedVal: 1, tolerance: 0 },
        { key: 'b', description: 'b=0', expectedVal: 0, tolerance: 0 },
      ],
    };
    const result = runBenchmark(bm);
    assert.strictEqual(result.pass, false);
    assert.strictEqual(result.checks[0].pass, true);
    assert.strictEqual(result.checks[1].pass, false);
  });
});

// ---------------------------------------------------------------------------
// summarize()
// ---------------------------------------------------------------------------

describe('benchmarkRunner — summarize()', () => {
  it('counts passed and failed correctly', () => {
    const results = [
      { pass: true },
      { pass: true },
      { pass: false },
    ];
    const s = summarize(results);
    assert.strictEqual(s.total, 3);
    assert.strictEqual(s.passed, 2);
    assert.strictEqual(s.failed, 1);
    assert.strictEqual(s.allPass, false);
  });

  it('allPass is true when every result passes', () => {
    const results = [{ pass: true }, { pass: true }];
    assert.strictEqual(summarize(results).allPass, true);
  });

  it('allPass is false for an empty array', () => {
    // no benchmarks → nothing passes
    assert.strictEqual(summarize([]).allPass, true); // vacuously all pass
    assert.strictEqual(summarize([]).total, 0);
  });
});

// ---------------------------------------------------------------------------
// Canonical benchmark library — known-answer verification
// ---------------------------------------------------------------------------

describe('benchmarkLibrary — canonical benchmark results', () => {
  it('BENCHMARKS array is non-empty and every entry has required fields', () => {
    assert.ok(Array.isArray(BENCHMARKS), 'BENCHMARKS must be an array');
    assert.ok(BENCHMARKS.length > 0, 'BENCHMARKS must not be empty');
    for (const bm of BENCHMARKS) {
      assert.ok(bm.id,          `${bm.id}: missing id`);
      assert.ok(bm.label,       `${bm.id}: missing label`);
      assert.ok(bm.studyType,   `${bm.id}: missing studyType`);
      assert.ok(bm.standardRef, `${bm.id}: missing standardRef`);
      assert.ok(typeof bm.run === 'function', `${bm.id}: run must be a function`);
      assert.ok(Array.isArray(bm.checks) && bm.checks.length > 0, `${bm.id}: checks must be non-empty array`);
    }
  });

  it('EMF-001: Biot-Savart single conductor at 1 m = 20.000 µT', () => {
    const bm = BENCHMARKS.find(b => b.id === 'EMF-001');
    assert.ok(bm, 'EMF-001 not found');
    const result = runBenchmark(bm);
    assert.strictEqual(result.pass, true, `EMF-001 failed: ${JSON.stringify(result.checks)}`);
    const check = result.checks[0];
    assert.ok(Math.abs(check.actualVal - 20.0) < 0.01, `field_uT ${check.actualVal} not ≈ 20 µT`);
  });

  it('EMF-002: ICNIRP at 150 µT — both limits pass', () => {
    const bm = BENCHMARKS.find(b => b.id === 'EMF-002');
    assert.ok(bm, 'EMF-002 not found');
    const result = runBenchmark(bm);
    assert.strictEqual(result.pass, true, `EMF-002 failed: ${JSON.stringify(result.checks)}`);
  });

  it('EMF-003: ICNIRP at 250 µT — GP fails, occupational passes', () => {
    const bm = BENCHMARKS.find(b => b.id === 'EMF-003');
    assert.ok(bm, 'EMF-003 not found');
    const result = runBenchmark(bm);
    assert.strictEqual(result.pass, true, `EMF-003 failed: ${JSON.stringify(result.checks)}`);
    const gp  = result.checks.find(c => c.key === 'gp_pass');
    const occ = result.checks.find(c => c.key === 'occ_pass');
    assert.strictEqual(gp.actualVal,  false, 'GP should fail at 250 µT');
    assert.strictEqual(occ.actualVal, true,  'Occupational should pass at 250 µT');
  });

  it('BAT-001: IEEE 485 duty-cycle energy = 25 kWh', () => {
    const bm = BENCHMARKS.find(b => b.id === 'BAT-001');
    assert.ok(bm, 'BAT-001 not found');
    const result = runBenchmark(bm);
    assert.strictEqual(result.pass, true, `BAT-001 failed: ${JSON.stringify(result.checks)}`);
    const check = result.checks[0];
    assert.ok(Math.abs(check.actualVal - 25.0) < 0.01, `energy ${check.actualVal} ≠ 25 kWh`);
  });

  it('BAT-002: IEEE 485 Li-ion design capacity = 15.44 kWh (±0.05)', () => {
    const bm = BENCHMARKS.find(b => b.id === 'BAT-002');
    assert.ok(bm, 'BAT-002 not found');
    const result = runBenchmark(bm);
    assert.strictEqual(result.pass, true, `BAT-002 failed: ${JSON.stringify(result.checks)}`);
    const finalCheck = result.checks.find(c => c.key === 'kwh_final');
    assert.ok(Math.abs(finalCheck.actualVal - 15.44) < 0.05,
      `kwh_final ${finalCheck.actualVal} not ≈ 15.44 kWh`);
  });

  it('VDROP-001: #12 AWG / 10 A / 30 ft — status = pass', () => {
    const bm = BENCHMARKS.find(b => b.id === 'VDROP-001');
    assert.ok(bm, 'VDROP-001 not found');
    const result = runBenchmark(bm);
    assert.strictEqual(result.pass, true, `VDROP-001 failed: ${JSON.stringify(result.checks)}`);
  });

  it('VDROP-002: #14 AWG / 20 A / 150 ft — status = warn or fail', () => {
    const bm = BENCHMARKS.find(b => b.id === 'VDROP-002');
    assert.ok(bm, 'VDROP-002 not found');
    const result = runBenchmark(bm);
    assert.strictEqual(result.pass, true, `VDROP-002 failed: ${JSON.stringify(result.checks)}`);
  });
});

// ---------------------------------------------------------------------------
// runAllBenchmarks integration
// ---------------------------------------------------------------------------

describe('runAllBenchmarks()', () => {
  it('returns one result per benchmark in the library', () => {
    const results = runAllBenchmarks();
    assert.strictEqual(results.length, BENCHMARKS.length);
  });

  it('all canonical benchmarks pass', () => {
    const results = runAllBenchmarks();
    const failures = results.filter(r => !r.pass);
    if (failures.length > 0) {
      const msg = failures.map(f => `${f.id}: ${f.error || JSON.stringify(f.checks)}`).join('\n');
      assert.fail(`${failures.length} benchmark(s) failed:\n${msg}`);
    }
  });
});
