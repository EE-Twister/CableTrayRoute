const assert = require('assert');
const units = require('../units.js');

function describe(name, fn){
  console.log(name); fn();
}
function it(name, fn){
  try{ fn(); console.log('  \u2713', name);}catch(err){ console.error('  \u2717', name, err.message||err); process.exitCode=1; }
}

describe('unit conversions', () => {
  it('distance round trip', () => {
    units.setUnitSystem('metric');
    const meters = units.distanceToDisplay(10); // feet to meters
    const back = units.distanceFromInput(meters);
    assert(Math.abs(back - 10) < 1e-9);
    units.setUnitSystem('imperial');
  });
  it('conduit size round trip', () => {
    units.setUnitSystem('metric');
    const mm = units.conduitToDisplay(2); // inches to mm
    const back = units.conduitFromInput(mm);
    assert(Math.abs(back - 2) < 1e-9);
    units.setUnitSystem('imperial');
  });
});
