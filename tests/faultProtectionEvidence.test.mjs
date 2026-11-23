import assert from 'node:assert/strict';

import { FAULT_PROTECTION_BENCHMARKS } from '../analysis/benchmarks/faultProtectionEvidence.mjs';
import { runShortCircuit } from '../analysis/shortCircuit.mjs';

function within(actual, expected, tolerance, label) {
  assert.equal(typeof actual, 'number', `${label} must be numeric`);
  assert.ok(Number.isFinite(actual), `${label} must be finite`);
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} not within ${tolerance} of ${expected}`);
}

const byId = new Map(FAULT_PROTECTION_BENCHMARKS.map(benchmark => [benchmark.id, benchmark]));

assert.equal(FAULT_PROTECTION_BENCHMARKS.length, 4);
for (const benchmark of FAULT_PROTECTION_BENCHMARKS) {
  assert.ok(benchmark.fixtureId, `${benchmark.id} needs fixtureId`);
  assert.ok(benchmark.inputs && typeof benchmark.inputs === 'object', `${benchmark.id} needs inputs`);
  assert.ok(benchmark.inputUnits && Object.keys(benchmark.inputUnits).length > 0, `${benchmark.id} needs input units`);
  assert.ok(benchmark.source?.url, `${benchmark.id} needs a source URL`);
  assert.ok(benchmark.source?.locator, `${benchmark.id} needs a source locator`);
  assert.equal(benchmark.source.accessedOn, '2026-09-17');
  assert.ok(Array.isArray(benchmark.limitations) && benchmark.limitations.length > 0, `${benchmark.id} needs applicability limits`);
  for (const check of benchmark.checks) {
    assert.ok(check.unit, `${benchmark.id}/${check.key} needs a unit`);
    assert.ok(check.toleranceBasis, `${benchmark.id}/${check.key} needs a tolerance basis`);
  }
}

for (const benchmark of FAULT_PROTECTION_BENCHMARKS) {
  const actual = benchmark.run();
  for (const check of benchmark.checks) {
    if (check.type === 'boolean') {
      assert.equal(actual[check.key], check.expectedVal, `${benchmark.id}/${check.key}`);
    } else {
      within(actual[check.key], check.expectedVal, check.tolerance, `${benchmark.id}/${check.key}`);
    }
  }
}

// Recompute the IEC unequal-sequence constants in this test from the stated
// equations. This guards against accidentally replacing independent expected
// values with numbers copied from the production helper.
{
  const benchmark = byId.get('FAULT-IEC-UNEQUAL-SEQUENCE');
  const { z1, z2, z0, prefaultKV } = benchmark.inputs;
  const magnitude = z => Math.hypot(z.r, z.x);
  const add = (a, b) => ({ r: a.r + b.r, x: a.x + b.x });
  const phaseVoltage = (1.1 * prefaultKV) / Math.sqrt(3);
  const ik3 = phaseVoltage / magnitude(z1);
  const ik2 = (Math.sqrt(3) * phaseVoltage) / magnitude(add(z1, z2));
  const ik1 = (3 * phaseVoltage) / magnitude(add(add(z1, z2), z0));
  const kappa = 1.02 + 0.98 * Math.exp(-3 * (z1.r / z1.x));
  const peak = kappa * Math.sqrt(2) * ik3;
  within(ik3, benchmark.checks[0].expectedVal, 0.01, 'independent unequal-sequence I3');
  within(ik2, benchmark.checks[1].expectedVal, 0.01, 'independent unequal-sequence I2');
  within(ik1, benchmark.checks[2].expectedVal, 0.01, 'independent unequal-sequence I1');
  within(peak, benchmark.checks[3].expectedVal, 0.02, 'independent unequal-sequence peak');
}

// Independent source-side to fault-side conversion for the generator case.
{
  const benchmark = byId.get('FAULT-GENERATOR-TRANSFORMER-LV-BASE');
  const result = benchmark.run();
  const generator = benchmark.inputs.model[0];
  const transformer = benchmark.inputs.model[1];
  const cMax = 1.1;
  const ratio = transformer.volts_secondary / generator.rated_kv / 1000;
  const generatorBaseOhm = (generator.rated_kv ** 2 / generator.rated_mva) * generator.xdpp_pu;
  const generatorCorrection = cMax / (1 + generator.xdpp_pu * Math.sqrt(1 - generator.pf ** 2));
  const generatorLV = generatorBaseOhm * generatorCorrection * ratio ** 2;
  const transformerBaseOhm = ((transformer.volts_secondary / 1000) ** 2 / (transformer.kva_secondary / 1000))
    * (transformer.percent_secondary / 100);
  const transformerReactancePU = (transformer.percent_secondary / 100) * transformer.xr_ratio
    / Math.sqrt(1 + transformer.xr_ratio ** 2);
  const transformerCorrection = (0.95 * cMax) / (1 + 0.6 * transformerReactancePU);
  const transformerLV = transformerBaseOhm * transformerCorrection;
  const xrScale = Math.sqrt(1 + generator.xr_ratio ** 2);
  const totalR = (generatorLV / xrScale) + (transformerLV / xrScale);
  const totalX = ((generatorLV * generator.xr_ratio) / xrScale)
    + ((transformerLV * transformer.xr_ratio) / xrScale);
  const referredCurrent = (cMax * (transformer.volts_secondary / 1000))
    / (Math.sqrt(3) * Math.hypot(totalR, totalX));
  const faultSideRatedCurrent = (generator.rated_mva)
    / (Math.sqrt(3) * (transformer.volts_secondary / 1000));
  const q = referredCurrent / faultSideRatedCurrent;
  const mu = 0.71 + 0.51 * Math.exp(-0.30 * q);
  const breaking = mu * referredCurrent;

  const expected = benchmark.checks;
  within(referredCurrent, expected.find(check => check.key === 'three_phase_ka').expectedVal, 0.02, 'independent generator LV I3');
  within(q, expected.find(check => check.key === 'generator_ratio').expectedVal, 0.002, 'independent generator q');
  within(breaking, expected.find(check => check.key === 'breaking_ka').expectedVal, 0.02, 'independent generator Ib');
  assert.equal(expected.find(check => check.key === 'near_generator').expectedVal, true);
  within(result.three_phase_ka, referredCurrent, 0.02, 'production generator LV I3');
  within(result.generator_ratio, q, 0.002, 'production generator q');
  within(result.breaking_ka, breaking, 0.02, 'production generator Ib');
  assert.equal(result.near_generator, true, 'production generator case should use the near-generator path');
}

// A prefault operating-voltage override must scale I″k, while the nameplate
// rated current used for q stays on the nominal winding/transformer base.
{
  const benchmark = byId.get('FAULT-GENERATOR-TRANSFORMER-LV-BASE');
  const model = structuredClone(benchmark.inputs.model);
  model[2].prefault_voltage = 0.432;
  const result = runShortCircuit(model, benchmark.inputs.options)['BUS-480'];
  within(result.generatorRatioIkgIrg, 4.005525678856658, 0.002, 'prefault override q');
  assert.equal(result.nearToGenerator, true);
}

// Exercise the opposite voltage direction with the same nameplate data. The
// winding ratio is reversed, so the correct fault-side current is about 1.862 kA.
{
  const benchmark = byId.get('FAULT-GENERATOR-TRANSFORMER-LV-BASE');
  const model = structuredClone(benchmark.inputs.model);
  model[0].rated_kv = 0.48;
  model[1].volts_primary = 480;
  model[1].volts_secondary = 13800;
  model[2].kV = 13.8;
  const result = runShortCircuit(model, benchmark.inputs.options)['BUS-480'];
  within(result.threePhaseKA, 1.862, 0.01, 'step-up fault current');
  within(result.generatorRatioIkgIrg, 4.451, 0.002, 'step-up q');
  within(result.Ib, 1.572, 0.01, 'step-up breaking current');
}

// The same two-winding model must work when the edge is represented from the
// fault bus back toward the transformer (the UI permits either orientation).
{
  const benchmark = byId.get('FAULT-GENERATOR-TRANSFORMER-LV-BASE');
  const model = structuredClone(benchmark.inputs.model);
  model[1].connections = [];
  model[2].connections = [{ target: 'XF-13K8-480', sourcePort: 0, targetPort: 1 }];
  const result = runShortCircuit(model, benchmark.inputs.options)['BUS-480'];
  within(result.threePhaseKA, 53.53, 0.02, 'reverse-edge fault current');
  const transformerSegment = result.impedanceProvenance.segments.find(segment => segment.type === 'transformer');
  within(transformerSegment.referralRatioSquared, (0.48 / 13.8) ** 2, 1e-12, 'reverse-edge referral ratio');
}

// Two cascaded transformers require each upstream impedance to be referred one
// winding at a time. The independently calculated 480 V result is 43.00 kA.
{
  const model = [
    {
      id: 'GEN-13K8', type: 'generator', subtype: 'synchronous', rated_kv: 13.8,
      rated_mva: 10, xdpp_pu: 0.2, pf: 0.8, xr_ratio: 20,
      connections: [{ target: 'XF-13K8-4160', sourcePort: 0, targetPort: 0 }]
    },
    {
      id: 'XF-13K8-4160', type: 'transformer', subtype: 'two_winding',
      percent_secondary: 5, kva_secondary: 10000, volts_primary: 13800,
      volts_secondary: 4160, xr_ratio: 20,
      connections: [{ target: 'XF-4160-480', sourcePort: 1, targetPort: 0 }]
    },
    {
      id: 'XF-4160-480', type: 'transformer', subtype: 'two_winding',
      percent_secondary: 6, kva_secondary: 10000, volts_primary: 4160,
      volts_secondary: 480, xr_ratio: 20,
      connections: [{ target: 'BUS-480-CASCADE', sourcePort: 1, targetPort: 0 }]
    },
    { id: 'BUS-480-CASCADE', type: 'bus', subtype: 'Bus', kV: 0.48 }
  ];
  const result = runShortCircuit(model, { method: 'IEC', cMode: 'max', minTimeDelayS: 0.05 })['BUS-480-CASCADE'];
  within(result.threePhaseKA, 43.002, 0.02, 'cascaded transformer fault current');
  within(result.generatorRatioIkgIrg, 3.575, 0.002, 'cascaded transformer q');
  assert.equal(result.impedanceProvenance.segments.filter(segment => segment.type === 'transformer').length, 2);
}

// A cable on the generator-side winding must also be referred through the
// transformer; its presence lowers the LV fault current and remains in path data.
{
  const benchmark = byId.get('FAULT-GENERATOR-TRANSFORMER-LV-BASE');
  const model = structuredClone(benchmark.inputs.model);
  model[0].connections = [{ target: 'GEN-CABLE', sourcePort: 0, targetPort: 0 }];
  model.splice(1, 0, {
    id: 'GEN-CABLE', type: 'cable', impedance: { r: 0.1, x: 0.2 },
    connections: [{ target: 'XF-13K8-480', sourcePort: 0, targetPort: 0 }]
  });
  const result = runShortCircuit(model, benchmark.inputs.options)['BUS-480'];
  assert.ok(result.threePhaseKA < 53.53 && result.threePhaseKA > 50, 'generator-side cable should reduce LV fault current');
  assert.equal(result.impedanceProvenance.segments.find(segment => segment.type === 'cable')?.tag, 'GEN-CABLE');
}

// A missing winding base and an unsupported three-winding referral are
// incomplete inputs in both calculation methods; neither may return .08 kA
// or another numeric result from mixed voltage bases.
for (const method of ['ANSI', 'IEC']) {
  const model = [
    {
      id: 'UTILITY-MISSING-XF', type: 'utility_source', voltage: 13800,
      thevenin_mva: 500, connections: [{ target: 'XF-MISSING', sourcePort: 0, targetPort: 0 }]
    },
    {
      id: 'XF-MISSING', type: 'transformer', subtype: 'two_winding',
      percent_secondary: 5, kva_secondary: 10000, volts_secondary: 480,
      connections: [{ target: 'BUS-MISSING', sourcePort: 1, targetPort: 0 }]
    },
    { id: 'BUS-MISSING', type: 'bus', subtype: 'Bus', kV: 0.48 }
  ];
  const missing = runShortCircuit(model, { method })['BUS-MISSING'];
  assert.equal(missing.validity, 'unevaluated', `${method} missing winding voltage should be unevaluated`);
  assert.equal(missing.calculationStatus, 'incomplete');
  assert.equal(missing.threePhaseKA, null);
  assert.ok(missing.requiredInputs.some(message => message.includes('winding voltages')));

  const threeWinding = structuredClone(model);
  threeWinding[1].subtype = 'three_winding';
  threeWinding[1].volts_hv = 13800;
  threeWinding[1].volts_lv = 480;
  threeWinding[1].volts_tv = 4160;
  threeWinding[1].z_hv_lv_percent = 5;
  threeWinding[1].kva_hv = 10000;
  threeWinding[1].kva_lv = 10000;
  const unsupported = runShortCircuit(threeWinding, { method })['BUS-MISSING'];
  assert.equal(unsupported.validity, 'unevaluated', `${method} unsupported three-winding referral should be unevaluated`);
  assert.equal(unsupported.threePhaseKA, null);
}

console.log('Fault/protection evidence benchmarks passed.');
