const assert = require('assert');
const {
  dcResistance,
  conductorThermalResistance,
  calcRcaComponents,
  skinEffect,
  dielectricRise,
  ampacity,
  calibrateAmpacityModel
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
  it('calibrateAmpacityModel brings results within 10%', () => {
    const res = calibrateAmpacityModel();
    assert(res.maxError <= 0.10);

    const cases = [
      { ref: 260, cable: { conductor_size: '4/0 AWG', conductor_material: 'Copper', insulation_rating: 90, voltage_rating: 600 } },
      { ref: 430, cable: { conductor_size: '500 kcmil', conductor_material: 'Copper', insulation_rating: 90, voltage_rating: 600 } },
      { ref: 215, cable: { conductor_size: '250 kcmil', conductor_material: 'Aluminum', insulation_rating: 75, voltage_rating: 600 } }
    ];
    cases.forEach(c => {
      const I = ampacity(c.cable, { medium: 'air' }).ampacity;
      const err = Math.abs(I - c.ref) / c.ref;
      assert(err <= 0.10);
    });
  });
  it('500 kcmil Cu THHN at 90C close to IEEE 835', () => {
    const cable = {
      conductor_size: '500 kcmil',
      conductor_material: 'Copper',
      insulation_rating: 90,
      voltage_rating: 600
    };
    const I = ampacity(cable, { medium: 'air' }).ampacity;
    assert(Math.abs(I - 430) / 430 < 0.1);
  });

  it('2/0 Al at 75C ~150A', () => {
    const cable = {
      conductor_size: '2/0 AWG',
      conductor_material: 'Aluminum',
      insulation_rating: 75,
      voltage_rating: 600
    };
    const I = ampacity(cable, { medium: 'air' }).ampacity;
    assert(Math.abs(I - 150) / 150 < 0.1);
  });
});
