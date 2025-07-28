const assert = require('assert');
const { solveDuctbankTemperatures, SMALL_CONDUITS, SMALL_CABLES, PARAMS } = require('../test');

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

describe('ductbank solver', () => {
  it('produces temperatures above ambient near conduits', () => {
    const res = solveDuctbankTemperatures(SMALL_CONDUITS, SMALL_CABLES, { ...PARAMS, earthTemp: 20, airTemp: 20 });
    let max = -Infinity;
    res.grid.forEach(row => row.forEach(t => { if (t > max) max = t; }));
    assert(max > 20);
  });
});
