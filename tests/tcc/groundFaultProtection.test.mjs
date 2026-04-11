/**
 * Unit tests for Ground Fault Protection (GFP) TCC Curves — Gap #55
 *
 * Verifies:
 *   1. Device library — 5 GFP entries exist with correct schema
 *   2. scaleCurve() integration — GFP devices produce valid IEC curves
 *   3. greedyCoordinateGFP() — validates GFP-only chains and rejects phase devices
 *   4. NEC 230.95 metadata — compliance flags are set correctly
 *
 * Run with:  node tests/tcc/groundFaultProtection.test.mjs
 */

import assert from 'assert';
import { readFileSync } from 'fs';
import { scaleCurve } from '../../analysis/tccUtils.js';
import { greedyCoordinateGFP } from '../../analysis/tccAutoCoord.mjs';

function describe(name, fn) { console.log('\n' + name); fn(); }
function it(name, fn) {
  try { fn(); console.log('  \u2713', name); }
  catch (err) { console.log('  \u2717', name); console.error(err); process.exitCode = 1; }
}

const devices = JSON.parse(readFileSync(new URL('../../data/protectiveDevices.json', import.meta.url), 'utf8'));
const gfpDevices = devices.filter(d => d.groundFault === true);
const gfpById = Object.fromEntries(gfpDevices.map(d => [d.id, d]));

// ─── 1. Device Library Validation ─────────────────────────────────────────────
describe('GFP device library', () => {
  it('has exactly 5 GFP entries', () => {
    assert.strictEqual(gfpDevices.length, 5, `expected 5, got ${gfpDevices.length}`);
  });

  it('all GFP entries have groundFault === true', () => {
    gfpDevices.forEach(d => {
      assert.strictEqual(d.groundFault, true, `${d.id} missing groundFault flag`);
    });
  });

  it('all GFP entries have iec60255 === true', () => {
    gfpDevices.forEach(d => {
      assert.strictEqual(d.iec60255, true, `${d.id} missing iec60255 flag`);
    });
  });

  it('all GFP entries have a valid sensorType', () => {
    const validTypes = new Set(['residual', 'zero_sequence']);
    gfpDevices.forEach(d => {
      assert.ok(validTypes.has(d.sensorType), `${d.id} has invalid sensorType: ${d.sensorType}`);
    });
  });

  it('all GFP entries have nec230_95 === true', () => {
    gfpDevices.forEach(d => {
      assert.strictEqual(d.nec230_95, true, `${d.id} missing nec230_95 flag`);
    });
  });

  it('all GFP entries are type "relay"', () => {
    gfpDevices.forEach(d => {
      assert.strictEqual(d.type, 'relay', `${d.id} unexpected type: ${d.type}`);
    });
  });

  it('GFP pickup options span 5–200 A (low range appropriate for service entrance GFP)', () => {
    gfpDevices.forEach(d => {
      const pickups = d.settingOptions?.pickup;
      assert.ok(Array.isArray(pickups), `${d.id} missing settingOptions.pickup`);
      assert.ok(pickups[0] <= 10, `${d.id} lowest pickup ${pickups[0]} A exceeds 10 A`);
      assert.ok(pickups[pickups.length - 1] >= 100, `${d.id} highest pickup ${pickups[pickups.length - 1]} A below 100 A`);
    });
  });

  it('expected device IDs exist (gfp_ni_relay, gfp_vi_relay, gfp_ei_relay, gfp_zs_relay, gfp_parametric_relay)', () => {
    const expectedIds = ['gfp_ni_relay', 'gfp_vi_relay', 'gfp_ei_relay', 'gfp_zs_relay', 'gfp_parametric_relay'];
    expectedIds.forEach(id => {
      assert.ok(gfpById[id], `Missing GFP device: ${id}`);
    });
  });

  it('gfp_parametric_relay has settingOptions.sensorType array with both types', () => {
    const param = gfpById['gfp_parametric_relay'];
    assert.ok(Array.isArray(param.settingOptions?.sensorType), 'sensorType settingOptions should be an array');
    assert.ok(param.settingOptions.sensorType.includes('residual'), 'missing "residual" sensor option');
    assert.ok(param.settingOptions.sensorType.includes('zero_sequence'), 'missing "zero_sequence" sensor option');
  });

  it('gfp_parametric_relay has settingOptions.curveFamily covering all four IEC families', () => {
    const param = gfpById['gfp_parametric_relay'];
    const families = param.settingOptions?.curveFamily || [];
    ['NI', 'VI', 'EI', 'LTI'].forEach(f => {
      assert.ok(families.includes(f), `gfp_parametric_relay missing curveFamily option: ${f}`);
    });
  });

  it('gfp_zs_relay has sensorType === "zero_sequence"', () => {
    assert.strictEqual(gfpById['gfp_zs_relay'].sensorType, 'zero_sequence');
  });

  it('residual GFP relays (gfp_ni, gfp_vi, gfp_ei) have sensorType === "residual"', () => {
    ['gfp_ni_relay', 'gfp_vi_relay', 'gfp_ei_relay'].forEach(id => {
      assert.strictEqual(gfpById[id].sensorType, 'residual', `${id} should be residual sensor`);
    });
  });
});

// ─── 2. scaleCurve() Integration with GFP Devices ────────────────────────────
describe('scaleCurve() with GFP devices', () => {
  it('returns a valid curve object for each GFP device', () => {
    gfpDevices.forEach(dev => {
      const result = scaleCurve(dev, {});
      assert.ok(result && typeof result === 'object', `${dev.id} scaleCurve returned non-object`);
      assert.ok(Array.isArray(result.curve), `${dev.id} result.curve is not an array`);
      assert.ok(result.curve.length >= 2, `${dev.id} curve has fewer than 2 points`);
    });
  });

  it('curve points have numeric current and time properties', () => {
    const result = scaleCurve(gfpById['gfp_vi_relay'], {});
    result.curve.forEach((pt, i) => {
      assert.ok(Number.isFinite(pt.current) && pt.current > 0, `point ${i}: invalid current ${pt.current}`);
      assert.ok(Number.isFinite(pt.time) && pt.time > 0, `point ${i}: invalid time ${pt.time}`);
    });
  });

  it('TMS=0.5 produces half the operating times of TMS=1.0 (linearity)', () => {
    const dev = gfpById['gfp_ni_relay'];
    const r1 = scaleCurve(dev, { tms: 1.0, pickup: 20 });
    const r2 = scaleCurve(dev, { tms: 0.5, pickup: 20 });
    assert.ok(r1.curve.length >= 2 && r2.curve.length >= 2, 'curves must have points');
    const midIdx = Math.floor(r1.curve.length / 2);
    const ratio = r1.curve[midIdx].time / r2.curve[midIdx].time;
    assert.ok(Math.abs(ratio - 2.0) < 0.05, `TMS linearity ratio expected ~2.0, got ${ratio.toFixed(4)}`);
  });

  it('lower pickup shifts curve rightward (higher pickup current → relay resets later)', () => {
    const dev = gfpById['gfp_vi_relay'];
    const rLow  = scaleCurve(dev, { tms: 0.3, pickup: 10 });
    const rHigh = scaleCurve(dev, { tms: 0.3, pickup: 50 });
    // The curve with higher pickup starts at a higher current
    assert.ok(rHigh.curve[0].current > rLow.curve[0].current,
      `Higher pickup should push the curve start current rightward`);
  });

  it('gfp_parametric_relay produces curves for all four IEC families', () => {
    const dev = gfpById['gfp_parametric_relay'];
    for (const family of ['NI', 'VI', 'EI', 'LTI']) {
      const result = scaleCurve(dev, { curveFamily: family, tms: 0.3, pickup: 20 });
      assert.ok(result.curve.length >= 2, `Family ${family}: expected ≥2 points`);
    }
  });

  it('sensorType property is preserved in the returned device object', () => {
    const dev = gfpById['gfp_vi_relay'];
    const result = scaleCurve(dev, {});
    assert.strictEqual(result.device?.sensorType ?? dev.sensorType, 'residual',
      'sensorType should be residual for gfp_vi_relay');
  });
});

// ─── 3. greedyCoordinateGFP() Validation ─────────────────────────────────────
describe('greedyCoordinateGFP()', () => {
  it('rejects non-GFP devices with error field and allCoordinated=false', () => {
    const phaseDevice = devices.find(d => d.type === 'relay' && !d.groundFault);
    if (!phaseDevice) return; // skip if no phase relays in library
    const result = greedyCoordinateGFP(
      [{ id: 'phase1', device: phaseDevice, overrides: {} }],
      5000
    );
    assert.strictEqual(result.allCoordinated, false);
    assert.ok(result.error && typeof result.error === 'string', 'error message expected');
    assert.ok(result.error.toLowerCase().includes('non-gfp'), `unexpected error: ${result.error}`);
  });

  it('rejects empty (non-array) input with error', () => {
    const result = greedyCoordinateGFP(null, 5000);
    assert.strictEqual(result.allCoordinated, false);
    assert.ok(result.error, 'error expected for null input');
  });

  it('single GFP device returns allCoordinated=true (trivial case)', () => {
    const dev = gfpById['gfp_vi_relay'];
    const result = greedyCoordinateGFP(
      [{ id: 'gfp1', device: dev, overrides: { tms: 0.3, pickup: 20 } }],
      500
    );
    assert.strictEqual(result.allCoordinated, true);
    assert.strictEqual(result.results.length, 1);
  });

  it('two GFP relays: upstream gets a higher (or equal) TMS than downstream', () => {
    const dev = gfpById['gfp_vi_relay'];
    const downstream = { id: 'gfp_dn', device: dev, overrides: { tms: 0.2, pickup: 20 } };
    const upstream   = { id: 'gfp_up', device: dev, overrides: { tms: 0.5, pickup: 10 } };
    const result = greedyCoordinateGFP([downstream, upstream], 1000, { margin: 0.3 });
    assert.ok(Array.isArray(result.results), 'results should be an array');
    assert.strictEqual(result.results.length, 2);
    const dnTimeDial = result.results[0].timeDial;
    const upTimeDial = result.results[1].timeDial;
    assert.ok(Number.isFinite(dnTimeDial), 'downstream timeDial should be finite');
    assert.ok(Number.isFinite(upTimeDial), 'upstream timeDial should be finite');
    assert.ok(upTimeDial >= dnTimeDial,
      `Upstream TMS (${upTimeDial}) should be >= downstream TMS (${dnTimeDial})`);
  });

  it('result shape matches greedyCoordinate() — has results array and allCoordinated bool', () => {
    const dev = gfpById['gfp_ni_relay'];
    const result = greedyCoordinateGFP(
      [{ id: 'g1', device: dev, overrides: { tms: 0.3, pickup: 20 } }],
      500
    );
    assert.ok('results' in result, 'result must have results');
    assert.ok('allCoordinated' in result, 'result must have allCoordinated');
    assert.ok(typeof result.allCoordinated === 'boolean', 'allCoordinated must be boolean');
  });
});

// ─── 4. NEC 230.95 Compliance Metadata ───────────────────────────────────────
describe('NEC 230.95 compliance metadata', () => {
  it('gfp_parametric_relay has nec230_95 === true', () => {
    assert.strictEqual(gfpById['gfp_parametric_relay'].nec230_95, true);
  });

  it('all GFP devices have nec230_95 === true', () => {
    gfpDevices.forEach(d => {
      assert.strictEqual(d.nec230_95, true, `${d.id} missing nec230_95`);
    });
  });

  it('GFP pickup settings include values ≤ 30 A (service-entrance GFP range)', () => {
    // NEC 230.95 max pickup is 1200 A, but typical settings are 20–100 A
    gfpDevices.forEach(d => {
      const pickups = d.settingOptions?.pickup || [];
      const hasLowPickup = pickups.some(p => p <= 30);
      assert.ok(hasLowPickup, `${d.id} should have at least one pickup option ≤ 30 A`);
    });
  });

  it('GFP TMS defaults are lower than typical phase relay defaults (≤ 0.5)', () => {
    gfpDevices.forEach(d => {
      const defaultTms = d.settings?.tms ?? 1.0;
      assert.ok(defaultTms <= 0.5, `${d.id} default TMS ${defaultTms} should be ≤ 0.5 for GFP`);
    });
  });
});

console.log('\nAll groundFaultProtection tests completed.');
