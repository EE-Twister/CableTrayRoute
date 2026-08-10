import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createDuctbankAmpacityModel } from '../src/ductbank-route/ampacityModel.js';

const conductorProperties = {
  '500 kcmil': {
    area_cm: 500000,
    rdc_cu: 0.00007,
    rdc_al: 0.00011,
    insulation_thickness: 0.095
  }
};

const conduit = {
  conduit_id: 'C1',
  conduit_type: 'PVC Sch 40',
  trade_size: '4'
};

const model = createDuctbankAmpacityModel({
  getConductorProperties: () => conductorProperties,
  findConduit: id => id === conduit.conduit_id ? conduit : {},
  getConductorRating: () => 90,
  getCableTemperatureRating: () => 90,
  normalizeConduitId: value => String(value || '').trim().toUpperCase(),
  ductResistanceTable: {
    PVC: { '4': 0.08 },
    steel: { '4': 0.055 },
    concrete: { '4': 0.075 }
  }
});

const cable = {
  conduit_id: 'C1',
  conductor_size: '500 kcmil',
  conductor_material: 'Copper',
  insulation_type: 'THHN',
  insulation_rating: '90',
  voltage_rating: '600V',
  est_load: 392
};

const params = {
  soilResistivity: 90,
  ductbankDepth: 36,
  earthTemp: 20,
  airTemp: Number.NaN,
  concreteEncasement: false
};

describe('ductbank ampacity model boundary', () => {
  it('preserves the independently derived 90 C resistance and thermal components', () => {
    assert.ok(Math.abs(model.dcResistance('500 kcmil', 'Copper', 90) - 0.000089257) < 1e-12);
    const components = model.calcRcaComponents(cable, params);
    assert.ok(Math.abs(components.Rcond - 0.00274165436) < 1e-10);
    assert.ok(Math.abs(components.Rins - 0.12626014793) < 1e-10);
    assert.ok(Math.abs(components.Rduct - 0.08) < 1e-12);
    assert.ok(Math.abs(components.Rsoil - 0.51337181622) < 1e-10);
  });

  it('preserves the page-level nominal screening output and conductor heat rise', () => {
    const details = model.ampacityDetails(cable, params);
    assert.ok(Math.abs(details.ampacity - 993.4604813654) < 1e-8);
    assert.equal(details.conductorFactor, 1);
    const threeConductorDetails = model.ampacityDetails({ ...cable, conductors: 3 }, params);
    assert.ok(Math.abs(threeConductorDetails.ampacity - 573.5746763456) < 1e-8);
    assert.equal(threeConductorDetails.conductorFactor, 3);
    assert.ok(Math.abs(model.cableHeatLoss(cable) - 15.0871464128) < 1e-10);
    assert.ok(Math.abs(model.cableConductorTemperature(cable, 45) - 46.9462690786) < 1e-8);
    assert.ok(Math.abs(model.ampacityDetails(cable, { ...params, airTemp: undefined }).ampacity - details.ampacity) < 1e-8);
  });

  it('fails safely for unknown conductor sizes and exhausted temperature margin', () => {
    assert.deepEqual(model.ampacityDetails({ ...cable, conductor_size: 'unknown' }, params), { ampacity: 0 });
    assert.equal(model.estimateAmpacity(cable, { ...params, earthTemp: 95 }).ampacity, 0);
    assert.equal(model.conduitTemperatureLimit('missing', []), 90);
  });
});
