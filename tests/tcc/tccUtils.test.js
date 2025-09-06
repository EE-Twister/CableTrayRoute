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

  describe('tcc utilities', () => {
    it('scales curve points from overrides', () => {
      const scaled = scaleCurve(abb, { pickup: 200, delay: 0.4, instantaneous: 1000 });
      assert.strictEqual(scaled.curve[0].current, 200);
      assert.strictEqual(scaled.curve[0].time, 200);
      const inst = scaled.curve.find(p => p.current === 1000 && p.time === 0.01);
      assert(inst);
    });

    it('detects interrupt rating violations', () => {
      const msg = checkDuty(abb, 70);
      assert(msg && msg.includes('interrupt rating'));
      const ok = checkDuty(abb, 10);
      assert.strictEqual(ok, null);
    });
  });
})();
