const assert = require('assert');
const {
  dcResistance,
  conductorThermalResistance,
  calcRcaComponents,
  skinEffect,
  dielectricRise,
  ampacity
} = require('../ampacity');

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

describe('core thermal functions', () => {
  it('dcResistance matches expected value', () => {
    const r = dcResistance('500 kcmil', 'Copper', 90);
    assert(Math.abs(r - 0.0000893) < 5e-7);
  });

  it('skinEffect interpolates correctly', () => {
    const y = skinEffect('500 kcmil');
    assert(Math.abs(y - 0.1) < 0.001);
  });

  it('dielectricRise gives 0 at 600V', () => {
    const d = dielectricRise(600);
    assert.strictEqual(d, 0);
  });

  it('conductorThermalResistance returns reasonable values', () => {
    const res = conductorThermalResistance({
      conductor_size: '500 kcmil',
      conductor_material: 'Copper'
    });
    assert(Math.abs(res.Rcond - 0.00274) < 1e-4);
    assert(Math.abs(res.Rins - 0.12626) < 1e-4);
  });

  it('calcRcaComponents includes air resistance', () => {
    const comps = calcRcaComponents({
      conductor_size: '500 kcmil',
      conductor_material: 'Copper'
    }, { medium: 'air' });
    assert(Math.abs(comps.Rca - 3.529) < 0.01);
  });
});

describe('ampacity calibration', () => {
  it('500 kcmil Cu THHN at 90C ~430A', () => {
    const cable = {
      conductor_size: '500 kcmil',
      conductor_material: 'Copper',
      insulation_rating: 90,
      voltage_rating: 600
    };
    const I = ampacity(cable, { medium: 'air' }).ampacity;
    assert(Math.abs(I - 430) / 430 < 0.05);
  });

  it('2/0 Al at 75C ~150A', () => {
    const cable = {
      conductor_size: '2/0 AWG',
      conductor_material: 'Aluminum',
      insulation_rating: 75,
      voltage_rating: 600
    };
    const I = ampacity(cable, { medium: 'air' }).ampacity;
    assert(Math.abs(I - 150) / 150 < 0.05);
  });
});
