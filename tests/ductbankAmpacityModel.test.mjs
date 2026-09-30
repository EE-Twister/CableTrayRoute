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
  // Independent derivation for a 500 kcmil THHN cable (0.095 in insulation) in a 4 in PVC duct
  // at 36 in, soil 90 C-cm/W, 20 C earth.
  const conductorDiameterMm = 2 * Math.sqrt(500000 * 5.067e-10 / Math.PI) * 1000;
  const coreDiameterMm = conductorDiameterMm + 2 * 0.095 * 25.4;
  const airGap = diameterMm => 1.87 / (1 + 0.1 * (0.312 + 0.0037 * 60) * diameterMm);
  const rSoil = (0.9 / (2 * Math.PI)) * Math.log(4 * 0.9144 / (2 * Math.sqrt(12.554 / Math.PI) * 0.0254));

  it('preserves the independently derived 90 C resistance and thermal components', () => {
    assert.ok(Math.abs(model.dcResistance('500 kcmil', 'Copper', 90) - 0.000089257) < 1e-12);
    const components = model.calcRcaComponents(cable, params);
    assert.ok(Math.abs(components.Rcond - 0.00274165436) < 1e-10);
    assert.ok(Math.abs(components.Rins - 0.12626014793) < 1e-10);
    assert.ok(Math.abs(components.Rduct - 0.08) < 1e-12);
    assert.ok(Math.abs(components.Rsoil - rSoil) < 1e-9);
    assert.ok(Math.abs(components.Rsoil - 0.51337181622) < 1e-10);
  });

  it('includes the cable-to-duct air gap (about 0.84 K.m/W for a 23 mm cable), not just the duct wall', () => {
    const components = model.calcRcaComponents(cable, params);
    assert.ok(Math.abs(components.Rgap - airGap(coreDiameterMm)) < 1e-9, `${components.Rgap}`);
    assert.ok(components.Rgap > 0.7 && components.Rgap < 1.0);
    assert.ok(Math.abs(components.Rca - (components.Rcond + components.Rins + components.Rduct + components.Rgap + components.Rsoil)) < 1e-12);
  });

  it('a bundle of cables in one conduit has a smaller air-gap resistance than one cable', () => {
    const single = model.calcRcaComponents(cable, params, 1).Rgap;
    const bundle = model.calcRcaComponents(cable, params, 4).Rgap;
    assert.ok(bundle < single);
    assert.ok(Math.abs(bundle - airGap(coreDiameterMm * 2)) < 1e-9);
  });

  it('screening ampacity follows sqrt(margin / (Rdc (1 + Yc) Rca n)) with the air gap included', () => {
    const details = model.ampacityDetails(cable, params);
    const rGap = airGap(coreDiameterMm);
    const rca = 0.00274165436 + 0.12626014793 + 0.08 + rGap + rSoil;
    const expected = Math.sqrt(70 / (0.000089257 * 1.1 * rca));
    assert.ok(Math.abs(details.ampacity - expected) < 0.05, `${details.ampacity} vs ${expected}`);
    // The 4 in duct plus its air gap must rate well below the 993 A the model gave without the gap.
    assert.ok(details.ampacity < 750 && details.ampacity > 600, `${details.ampacity}`);
    assert.equal(details.conductorFactor, 1);
    assert.ok(Math.abs(details.Rduct - (0.08 + rGap)) < 1e-9);
  });

  it('a three-conductor cable rates lower (three heat sources, larger cable)', () => {
    const one = model.ampacityDetails(cable, params).ampacity;
    const three = model.ampacityDetails({ ...cable, conductors: 3 }, params);
    assert.equal(three.conductorFactor, 3);
    assert.ok(three.ampacity < one * 0.7);
  });

  it('keeps the heat-loss and conductor-temperature helpers', () => {
    assert.ok(Math.abs(model.cableHeatLoss(cable) - 15.0871464128) < 1e-10);
    assert.ok(Math.abs(model.cableConductorTemperature(cable, 45) - 46.9462690786) < 1e-8);
    const details = model.ampacityDetails(cable, params);
    assert.ok(Math.abs(model.ampacityDetails(cable, { ...params, airTemp: undefined }).ampacity - details.ampacity) < 1e-8);
  });

  it('does not clamp a high soil resistivity (dry sand, 250 C-cm/W) to 150', () => {
    const dry = model.calcRcaComponents(cable, { ...params, soilResistivity: 250 }).Rsoil;
    const wet = model.calcRcaComponents(cable, { ...params, soilResistivity: 90 }).Rsoil;
    assert.ok(Math.abs(dry / wet - 250 / 90) < 1e-9, `${dry / wet}`);
  });

  it('fails safely for unknown conductor sizes and exhausted temperature margin', () => {
    assert.deepEqual(model.ampacityDetails({ ...cable, conductor_size: 'unknown' }, params), { ampacity: 0 });
    assert.equal(model.estimateAmpacity(cable, { ...params, earthTemp: 95 }).ampacity, 0);
    assert.equal(model.conduitTemperatureLimit('missing', []), 90);
  });
});
