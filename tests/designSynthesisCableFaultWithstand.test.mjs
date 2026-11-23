import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateDesignSynthesisCableFaultWithstand } from '../analysis/designSynthesisCableFaultWithstand.mjs';
import { SOUTHWIRE_MC_SOURCE, SOUTHWIRE_SPEC45301_CATALOG_FINGERPRINT, SOURCED_MC_R_X } from '../analysis/designSynthesisCableCatalog.mjs';

const cable = () => {
  const row = SOURCED_MC_R_X['#8 AWG'];
  return {
    id: 'C-1', from: 'SOURCE', to: 'LOAD', conductor_size: '#8 AWG', conductorMaterial: 'cu', conductor_material: 'cu',
    tag: 'C-1', length: 100, lengthFt: 100,
    cableStockId: row.stockId, cableCatalogFingerprint: SOUTHWIRE_SPEC45301_CATALOG_FINGERPRINT,
    r_ohm_per_kft: row.r, x_ohm_per_kft: row.x, impedanceBasis: row.source,
    cable_od: row.od, outerDiameterIn: row.od, conductor_count: 3, cable_rating: 600, cableConstructionSource: row.source,
  };
};
const request = ({ duration = 1.5, cableIds = ['C-1'] } = {}) => ({
  schemaVersion: '1.0.0',
  cableSelection: { mode: 'selected', cableIds },
  faultSelection: { mode: 'all-generated-bus-fault-cases' },
  clearing: { maximumTotalClearingTimeS: duration, reference: 'supplied curve row', applicabilityReference: 'covers every modeled source', appliesToAllModeledSources: true },
  thermal: { conductorMaterial: 'copper', maximumInitialTemperatureC: 80, finalTemperatureC: 250, singleEvent: true, adequateRecoveryBeforeEvent: true, reference: 'single event with recovery' },
});
const row = (timeS, re, im = 0) => ({ timeS, branchCurrents: [{ branchId: 'C-1', fromBusId: 'SOURCE', toBusId: 'LOAD', fromCurrentIntoBranchKA: { re, im }, toCurrentIntoBranchKA: { re: -re, im: -im } }] });
const history = rows => ({ status: 'evaluated', method: 'fixture', modelInputFingerprint: 'history-fingerprint', timeKnotsS: rows.map(item => item.timeS), faultCases: [
  { caseId: 'bus-fault:LOAD', caseKind: 'generated-bus-fault', faultBusId: 'LOAD', timeRows: rows },
  { caseId: 'immediate-load-side-fault:C-1', caseKind: 'immediate-load-side-zero-impedance-fault', faultBusId: 'LOAD', timeRows: rows },
] , coverage: { status: 'complete', faultBusIds: ['LOAD'], historyCaseCount: 2 } });
const faultStudyValidation = { status: 'evaluated', coverage: { status: 'complete' }, cases: [{ status: 'evaluated', busId: 'LOAD' }] };
const proposal = () => ({ cables: [cable()], cableCatalogSource: SOUTHWIRE_MC_SOURCE, faultEvolution: { horizonS: 2 } });
const evaluate = (req, proposed, evidence) => evaluateDesignSynthesisCableFaultWithstand({ request: req, proposal: proposed, faultStudyValidation, faultEvolutionValidation: evidence });

test('integrates phasors to a partial clearing endpoint and checks both cable terminals independently', () => {
  const result = evaluate(request(), proposal(), history([row(0, 1), row(1, 1), row(2, 2)]));
  assert.equal(result.status, 'evaluated');
  assert.equal(result.coverage.scope, 'generated-bus-fault-cases-only');
  assert.equal(result.coverage.excludedImmediateLoadSideCaseCount, 1);
  assert.equal(result.qualificationStatus, 'unevaluated');
  assert.equal(result.protectionAdequacy, 'unevaluated');
  assert.equal(result.cases.length, 1);
  assert.ok(Math.abs(result.cases[0].fromCurrentSquaredExposureA2S - 1_791_666.6666666667) < 1e-8);
  assert.ok(Math.abs(result.cases[0].toCurrentSquaredExposureA2S - 1_791_666.6666666667) < 1e-8);
  assert.equal(result.cases[0].controllingTerminal, 'from');
  assert.equal(result.cases[0].allowableCurrentSquaredExposureA2S, (16510 * 0.0719) ** 2);
  assert.equal(result.cases[0].comparison, 'fail');
  assert.ok(Math.abs(result.cases[0].exposureToAllowanceRatio - (1_791_666.6666666667 / ((16510 * 0.0719) ** 2))) < 1e-12);
});

test('integrates endpoint phasors separately instead of switching between their per-knot envelope', () => {
  const rows = [row(0, 2, 0), row(1, 0, 2)];
  rows[1].branchCurrents[0].toCurrentIntoBranchKA = { re: 0, im: -2.000000002 };
  rows[0].branchCurrents[0].toCurrentIntoBranchKA = { re: -2.000000002, im: 0 };
  const proposed = proposal(); proposed.faultEvolution.horizonS = 1;
  const evidence = history(rows); evidence.timeKnotsS = [0, 1]; evidence.coverage.faultBusIds = ['LOAD'];
  const result = evaluate(request({ duration: 1 }), proposed, evidence);
  assert.equal(result.status, 'evaluated');
  assert.ok(Math.abs(result.cases[0].fromCurrentSquaredExposureA2S - 2_666_666.6666666665) < 1e-8);
  assert.ok(result.cases[0].toCurrentSquaredExposureA2S > result.cases[0].fromCurrentSquaredExposureA2S);
  assert.equal(result.cases[0].currentSquaredExposureA2S, result.cases[0].toCurrentSquaredExposureA2S);
});

test('blocks missing branch knots, inconsistent terminals, catalog tampering and unsupported clearing claims', () => {
  const incomplete = history([row(0, 1), row(2, 1)]);
  incomplete.faultCases[0].timeRows[1].branchCurrents = [];
  assert.equal(evaluate(request(), proposal(), incomplete).status, 'blocked');
  const inconsistent = history([row(0, 1), row(2, 1)]);
  inconsistent.faultCases[0].timeRows[1].branchCurrents[0].toCurrentIntoBranchKA.re = -0.5;
  assert.equal(evaluate(request(), proposal(), inconsistent).status, 'blocked');
  const badCable = proposal(); badCable.cables[0].cableStockId = 'wrong';
  assert.equal(evaluate(request(), badCable, history([row(0, 1), row(2, 1)])).status, 'blocked');
  const badRequest = request(); badRequest.clearing.appliesToAllModeledSources = false;
  assert.equal(evaluate(badRequest, proposal(), history([row(0, 1), row(2, 1)])).status, 'blocked');
  assert.equal(evaluateDesignSynthesisCableFaultWithstand(null).status, 'blocked');
  const malformedRequest = request(); malformedRequest.cableSelection.cableIds = 7;
  assert.equal(evaluate(malformedRequest, proposal(), history([row(0, 1), row(2, 1)])).status, 'blocked');
});

test('transfers the independent nominal circular-mil areas for all 15 supported size labels', () => {
  const areas = [
    ['#8 AWG', 16510], ['#6 AWG', 26240], ['#4 AWG', 41740], ['#3 AWG', 52620], ['#2 AWG', 66360],
    ['#1 AWG', 83690], ['1/0 AWG', 105600], ['2/0 AWG', 133100], ['3/0 AWG', 167800], ['4/0 AWG', 211600],
    ['250 kcmil', 250000], ['350 kcmil', 350000], ['500 kcmil', 500000], ['600 kcmil', 600000], ['750 kcmil', 750000],
  ];
  for (const [size, area] of areas) {
    const source = SOURCED_MC_R_X[size];
    const selectedCable = { ...cable(), conductor_size: size, conductorSize: size, cableStockId: source.stockId, r_ohm_per_kft: source.r, x_ohm_per_kft: source.x, impedanceBasis: source.source, cable_od: source.od, outerDiameterIn: source.od, cableConstructionSource: source.source };
    const proposed = { cables: [selectedCable], cableCatalogSource: SOUTHWIRE_MC_SOURCE, faultEvolution: { horizonS: 0.1 } };
    const evidence = history([row(0, 0.001), row(0.1, 0.001)]);
    evidence.timeKnotsS = [0, 0.1];
    const result = evaluate(request({ duration: 0.1 }), proposed, evidence);
    assert.equal(result.status, 'evaluated', size);
    assert.equal(result.cases[0].conductorAreaCmil, area, size);
    assert.equal(result.cases[0].allowableCurrentSquaredExposureA2S, (area * 0.0719) ** 2, size);
  }
});
