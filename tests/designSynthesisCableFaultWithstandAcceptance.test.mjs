import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateDesignSynthesisCableFaultWithstand as evaluate } from '../analysis/designSynthesisCableFaultWithstand.mjs';
import { SOUTHWIRE_MC_SOURCE, SOUTHWIRE_SPEC45301_CATALOG_FINGERPRINT, SOURCED_MC_R_X } from '../analysis/designSynthesisCableCatalog.mjs';

// Independently transcribed Class B nominal metal areas from SPEC10080 pages 2–3.
const areas = {
  '#8 AWG': 16510, '#6 AWG': 26240, '#4 AWG': 41740, '#3 AWG': 52620,
  '#2 AWG': 66360, '#1 AWG': 83690, '1/0 AWG': 105600, '2/0 AWG': 133100,
  '3/0 AWG': 167800, '4/0 AWG': 211600, '250 kcmil': 250000, '350 kcmil': 350000,
  '500 kcmil': 500000, '600 kcmil': 600000, '750 kcmil': 750000
};
function cable(size = '#8 AWG', id = 'C') {
  const row = SOURCED_MC_R_X[size];
  return {
    id, tag: id, from: 'S', to: 'L', conductor_size: size, conductorSize: size,
    conductorMaterial: 'cu', conductor_material: 'cu', conductor_count: 3, cable_rating: 600,
    cableStockId: row.stockId, cableCatalogFingerprint: SOUTHWIRE_SPEC45301_CATALOG_FINGERPRINT,
    r_ohm_per_kft: row.r, x_ohm_per_kft: row.x, impedanceBasis: row.source, source: row.source,
    cableConstructionSource: row.source, cable_od: row.od, outerDiameterIn: row.od,
    length: 100, lengthFt: 100, impedance: { r: row.r / 10, x: row.x / 10 }
  };
}
function fixture({ cables = [cable()], knots = [0, 0.2], currents = [{ re: 2, im: 0 }, { re: 2, im: 0 }], endpoint = 0.2 } = {}) {
  const timeRows = knots.map((timeS, index) => ({ timeS, branchCurrents: cables.map(item => ({
    branchId: item.id, fromBusId: item.from, toBusId: item.to,
    fromCurrentIntoBranchKA: { ...currents[index] }, toCurrentIntoBranchKA: { re: -currents[index].re, im: -currents[index].im }
  })) }));
  return {
    request: {
      schemaVersion: '1.0.0', cableSelection: { mode: 'all-modeled' }, faultSelection: { mode: 'all-generated-bus-fault-cases' },
      clearing: { maximumTotalClearingTimeS: endpoint, reference: 'Synthetic independently bounded total clearing', applicabilityReference: 'Synthetic all-source case applicability', appliesToAllModeledSources: true },
      thermal: { conductorMaterial: 'copper', maximumInitialTemperatureC: 90, finalTemperatureC: 250, singleEvent: true, adequateRecoveryBeforeEvent: true, reference: 'Synthetic recovered initial conductor state' }
    },
    proposal: { cables, cableCatalogSource: structuredClone(SOUTHWIRE_MC_SOURCE), faultEvolution: { horizonS: knots.at(-1) } },
    faultStudyValidation: { status: 'evaluated', coverage: { status: 'complete' }, cases: [{ status: 'evaluated', busId: 'L' }] },
    faultEvolutionValidation: {
      status: 'evaluated', modelInputFingerprint: 'synthetic-math-fixture-only', timeKnotsS: [...knots],
      coverage: { status: 'complete', faultBusIds: ['L'], historyCaseCount: 1 },
      faultCases: [{ caseId: 'bus-fault:L', caseKind: 'generated-bus-fault', faultBusId: 'L', timeRows }]
    }
  };
}
function close(actual, expected, message) {
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= Math.max(1e-8, Math.abs(expected) * 1e-13), `${message}: ${actual} versus ${expected}`);
}
function evaluated(input) {
  const before = structuredClone(input);
  const result = evaluate(input);
  assert.deepEqual(input, before, 'The calculation is read-only');
  assert.equal(result.status, 'evaluated', JSON.stringify(result.issues));
  assert.equal(result.qualificationStatus, 'unevaluated');
  assert.equal(result.protectionAdequacy, 'unevaluated');
  assert.equal(result.coverage.scope, 'generated-bus-fault-cases-only');
  assert.ok(result.coverage.excludedCoverage.some(text => /interior|midspan/.test(text)));
  assert.ok(result.modelInputFingerprint);
  return result;
}

test('all 15 source areas produce per-phase allowances and a literal constant-current exposure without a factor of three', () => {
  const input = fixture({ cables: Object.keys(areas).map((size, index) => cable(size, `C-${index}`)) });
  const result = evaluated(input);
  assert.equal(result.cases.length, 15);
  assert.equal(result.comparison, 'pass');
  for (const item of result.cases) {
    assert.equal(item.conductorAreaCmil, areas[item.conductorSize]);
    // 2000 A squared × .2 s = 800000 A²s, one phase conductor.
    close(item.currentSquaredExposureA2S, 800000, item.cableId);
    close(item.fromCurrentSquaredExposureA2S, 800000, 'from terminal');
    close(item.toCurrentSquaredExposureA2S, 800000, 'to terminal');
    const expected = areas[item.conductorSize] ** 2 * 0.0719 ** 2;
    close(item.allowableCurrentSquaredExposureA2S, expected, 'Published factor and independent area');
    close(item.exposureToAllowanceRatio, 800000 / expected, 'Utilization');
  }
  assert.equal(result.worstCase.conductorSize, '#8 AWG');
  assert.equal(result.source.coefficientSource.sha256, '7a67e2e2e4c660f12484182f6c7f3ce27f16a2e7a64144d05a57d70a4cc80d5a');
  assert.equal(result.source.conductorAreaSource.sha256, '418590a1934e4b90d8422fd1d9b2b03dbad4e2c217e8ae2513d66dae9ec1160d');
});

test('complex rotation, cancellation and a partial-knot endpoint follow separately integrated polynomials', () => {
  const rotation = fixture({ currents: [{ re: 1, im: 0 }, { re: 0, im: 1 }] });
  close(evaluated(rotation).cases[0].currentSquaredExposureA2S, 400000 / 3, 'Full rotating phasor');
  rotation.request.clearing.maximumTotalClearingTimeS = 0.1;
  close(evaluated(rotation).cases[0].currentSquaredExposureA2S, 200000 / 3, 'Half rotating phasor');
  const cancellation = fixture({ currents: [{ re: 1, im: 0 }, { re: -1, im: 0 }] });
  close(evaluated(cancellation).cases[0].currentSquaredExposureA2S, 200000 / 3, 'Interior zero-current cancellation');
  const reverse = fixture({ currents: [{ re: -1, im: 0 }, { re: 1, im: 0 }] });
  close(evaluated(reverse).cases[0].currentSquaredExposureA2S, 200000 / 3, 'Reversed direction');
});

test('the exact material-limit case and a small real breach are distinguished without changing the limit', () => {
  // 250000 cmil × .0719 = exactly 17975 A; at 1 s allowance is 323100625 A²s.
  const input = fixture({ cables: [cable('250 kcmil')], knots: [0, 1], currents: [{ re: 17.975, im: 0 }, { re: 17.975, im: 0 }], endpoint: 1 });
  const atLimit = evaluated(input);
  close(atLimit.cases[0].allowableCurrentSquaredExposureA2S, 323100625, 'Literal material allowance');
  close(atLimit.cases[0].currentSquaredExposureA2S, 323100625, 'Literal constant-current stress');
  assert.equal(atLimit.comparison, 'pass');
  const above = fixture({ cables: [cable('250 kcmil')], knots: [0, 1], currents: [{ re: 17.9751, im: 0 }, { re: 17.9751, im: 0 }], endpoint: 1 });
  assert.equal(evaluated(above).comparison, 'fail');
});

test('requested malformed data, incomplete scope and unsupported conditions return blocked without numbers or exceptions', () => {
  const mutations = [
    input => { input.request = null; },
    input => { input.request.cableSelection = { mode: 'selected', cableIds: 7 }; },
    input => { input.request.clearing.maximumTotalClearingTimeS = '0.2'; },
    input => { input.request.clearing.maximumTotalClearingTimeS = 0.099; },
    input => { input.request.clearing.maximumTotalClearingTimeS = 5.001; },
    input => { input.request.clearing.maximumTotalClearingTimeS = 0.21; },
    input => { delete input.request.clearing.reference; },
    input => { input.request.clearing.appliesToAllModeledSources = false; },
    input => { input.request.thermal.maximumInitialTemperatureC = 91; },
    input => { input.request.thermal.maximumInitialTemperatureC = -273.15; },
    input => { input.request.thermal.finalTemperatureC = 200; },
    input => { input.request.thermal.adequateRecoveryBeforeEvent = false; },
    input => { input.request.thermal.singleEvent = false; },
    input => { delete input.proposal.cableCatalogSource; },
    input => { input.proposal.cableCatalogSource.sha256 = 'not-the-archive'; },
    input => { input.proposal.cables[0].conductorSize = '#6 AWG'; },
    input => { input.proposal.cables[0].conductor_material = 'al'; },
    input => { input.faultStudyValidation.cases = {}; },
    input => { input.faultStudyValidation.cases.push({ status: 'blocked', busId: 'OTHER' }); },
    input => { input.faultEvolutionValidation.coverage.faultBusIds = []; },
    input => { input.faultEvolutionValidation.faultCases.push(structuredClone(input.faultEvolutionValidation.faultCases[0])); input.faultEvolutionValidation.coverage.historyCaseCount = 2; },
    input => { input.faultEvolutionValidation.timeKnotsS = [0, 0]; },
    input => { input.faultEvolutionValidation.faultCases[0].caseId = 'bus-fault:OTHER'; },
    input => { input.faultEvolutionValidation.faultCases[0].timeRows[1].branchCurrents = []; },
    input => { input.faultEvolutionValidation.faultCases[0].timeRows[1].branchCurrents = {}; },
    input => { input.faultEvolutionValidation.faultCases[0].timeRows[1].branchCurrents = [null]; },
    input => { input.faultEvolutionValidation.faultCases[0].timeRows[1].branchCurrents[0].fromBusId = 'OTHER'; },
    input => { input.faultEvolutionValidation.faultCases[0].timeRows[1].branchCurrents[0].fromCurrentIntoBranchKA.re = NaN; }
  ];
  for (const [index, mutate] of mutations.entries()) {
    const input = fixture(); mutate(input);
    const result = evaluate(input);
    assert.equal(result.status, 'blocked', `Invalid fixture ${index}`);
    assert.deepEqual(result.cases, [], `Invalid fixture ${index} exposes no evaluated numbers`);
    assert.ok(result.issues.length > 0, `Invalid fixture ${index}`);
  }
  for (const invalid of [null, 3, 'invalid', []]) assert.equal(evaluate(invalid).status, 'blocked');
});
