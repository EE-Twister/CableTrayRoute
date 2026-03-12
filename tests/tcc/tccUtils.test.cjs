const assert = require('assert');
const fs = require('fs');

function describe(name, fn){
  console.log(name); fn();
}
function it(name, fn){
  try { fn(); console.log('  \u2713', name); }
  catch(err){ console.log('  \u2717', name); console.error(err); process.exitCode = 1; }
}

(async () => {
  const { scaleCurve, checkDuty } = await import('../../analysis/tccUtils.js');
  const devices = JSON.parse(fs.readFileSync('data/protectiveDevices.json', 'utf8'));
  const abb = devices.find(d => d.id === 'abb_tmax_160');
  const geRelay = devices.find(d => d.id === 'ge_multilin_750');

  describe('tcc utilities', () => {
    it('scales curve points from overrides', () => {
      const scaled = scaleCurve(abb, { pickup: 200, time: 0.4, instantaneous: 1000 });
      assert.strictEqual(scaled.curve[0].current, 200);
      assert.strictEqual(scaled.curve[0].time, 200);
      const inst = scaled.curve.find(p => p.current === 1000 && p.time === 0.01);
      assert(inst);
      for (let i = 1; i < scaled.curve.length; i += 1) {
        assert(
          scaled.curve[i].current >= scaled.curve[i - 1].current,
          'curve currents should be non-decreasing'
        );
        assert(
          scaled.curve[i].time <= scaled.curve[i - 1].time + 1e-9,
          'curve times should be non-increasing as current rises'
        );
      }
    });

    it('applies short-time pickup and delay overrides to the curve plateau', () => {
      const scaled = scaleCurve(geRelay, {
        shortTimePickup: 600,
        shortTimeDelay: 0.1,
        instantaneousPickup: 1000
      });
      const start = scaled.curve.find(p => Math.abs(p.current - 600) < 1e-6);
      assert(start, 'expected curve to include short-time pickup point');
      assert(Math.abs(start.time - 0.1) < 1e-6, 'short-time delay should set plateau time');
      const plateau = scaled.curve.filter(p => p.current >= 600 && p.time >= 0.099);
      assert(plateau.some(p => p.current > 600), 'plateau should extend beyond pickup before instantaneous region');
      plateau.forEach(point => {
        assert(Math.abs(point.time - 0.1) < 1e-6, 'plateau points should use short-time delay');
      });
    });

    it('detects interrupt rating violations', () => {
      const msg = checkDuty(abb, 70);
      assert(msg && msg.includes('interrupt rating'));
      const ok = checkDuty(abb, 10);
      assert.strictEqual(ok, null);
    });
  });
})();
