import assert from 'node:assert/strict';
import {
  CATHODIC_PROTECTION_NETWORK_VERSION,
  normalizeCpNetworkCase,
  normalizeCpStructureRows,
  normalizeCpAnodeRows,
  normalizeCpRectifierRows,
  normalizeCpBondRows,
  normalizeCpInterferenceSourceRows,
  normalizeCpPolarizationRows,
  evaluateCpNetworkModel,
  buildCpPotentialProfileRows,
  buildCathodicProtectionNetworkPackage,
  renderCathodicProtectionNetworkHTML,
} from '../analysis/cathodicProtectionNetwork.mjs';
import { runCathodicProtectionAnalysis } from '../cathodicprotection.js';
import { buildDesignCoachActions } from '../analysis/designCoach.mjs';
import { buildReportPackageSections } from '../reports/reportPackage.mjs';
import baselineFixture from './cp/fixtures/baseline-sizing.fixture.json' with { type: 'json' };

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

function baseContext(overrides = {}) {
  return {
    projectName: 'CP Network <Project>',
    networkCase: {
      name: 'Pipeline <Network>',
      criteriaBasis: 'naceSp0169',
      seasonalCase: 'nominal',
      profileStationSpacingM: 50,
      reportPreset: 'fullStudy',
    },
    structureRows: [{
      id: 's1',
      tag: 'Pipe <A>',
      structureType: 'pipe',
      zone: 'North',
      surfaceAreaM2: 100,
      coatingBreakdownFactor: 0.2,
      currentDensityMaM2: 10,
      soilResistivityOhmM: 100,
      lengthM: 100,
    }],
    anodeRows: [{
      id: 'a1',
      tag: 'Anode <Bed>',
      anodeType: 'impressedCurrent',
      zone: 'North',
      ratedOutputA: 0.4,
      bedResistanceOhm: 1.5,
    }],
    rectifierRows: [{
      id: 'r1',
      tag: 'Rectifier <R1>',
      zone: 'North',
      voltageRatingV: 24,
      currentRatingA: 0.5,
      operatingCurrentA: 0.3,
      operatingVoltageV: 12,
    }],
    bondRows: [{
      id: 'b1',
      tag: 'Bond <1>',
      bondType: 'isolationJoint',
      fromStructureId: 's1',
      toStructureId: 'foreign-1',
      zone: 'North',
    }],
    interferenceRows: [{
      id: 'i1',
      label: 'Transit <DC>',
      sourceType: 'dcTraction',
      zone: 'North',
      riskLevel: 'high',
      mitigationStatus: 'unresolved',
      notes: 'Shared corridor <risk>',
    }],
    polarizationRows: [{
      id: 'p1',
      structureId: 's1',
      testStationRef: 'TS <1>',
      instantOffMv: -870,
      polarizationShiftMv: 110,
      source: 'meter <A>',
    }],
    ...overrides,
  };
}

describe('cathodic protection network model', () => {
  it('wraps legacy CP sizing packages into package-compatible output', () => {
    const legacy = runCathodicProtectionAnalysis(baselineFixture.input);
    const pkg = buildCathodicProtectionNetworkPackage({ projectName: 'Legacy', legacySizing: legacy });
    assert.equal(pkg.version, CATHODIC_PROTECTION_NETWORK_VERSION);
    assert.ok(pkg.structureRows.length >= 1);
    assert.ok(pkg.criteriaRows.length >= 1);
  });

  it('normalizes network case defaults and rejects invalid enums/numerics', () => {
    const normalized = normalizeCpNetworkCase({});
    assert.equal(normalized.criteriaBasis, 'naceSp0169');
    assert.equal(normalized.seasonalCase, 'nominal');
    assert.throws(() => normalizeCpNetworkCase({ criteriaBasis: 'bad' }), /Criteria basis/);
    assert.throws(() => normalizeCpNetworkCase({ profileStationSpacingM: 0 }), /Profile station spacing/);
  });

  it('normalizes row types and rejects invalid numeric values', () => {
    assert.equal(normalizeCpStructureRows([{ surfaceAreaM2: 10, currentDensityMaM2: 5 }])[0].requiredCurrentA, 0.01);
    assert.equal(normalizeCpAnodeRows([{ ratedOutputA: 1 }])[0].ratedOutputA, 1);
    assert.equal(normalizeCpRectifierRows([{ voltageRatingV: 24, currentRatingA: 2 }])[0].currentRatingA, 2);
    assert.equal(normalizeCpBondRows([{ bondType: 'solidBond', fromStructureId: 's1' }])[0].bondType, 'solidBond');
    assert.equal(normalizeCpInterferenceSourceRows([{ sourceType: 'foreignStructure' }])[0].sourceType, 'foreignStructure');
    assert.equal(normalizeCpPolarizationRows([{ instantOffMv: -860, polarizationShiftMv: 100 }])[0].status, 'pending');
    assert.throws(() => normalizeCpStructureRows([{ surfaceAreaM2: -1, currentDensityMaM2: 5 }]), /surfaceAreaM2/);
    assert.throws(() => normalizeCpAnodeRows([{ ratedOutputA: -1 }]), /ratedOutputA/);
    assert.throws(() => normalizeCpRectifierRows([{ voltageRatingV: -1, currentRatingA: 1 }]), /voltage rating/);
  });

  it('evaluates current demand, source allocation, and rectifier capacity deterministically', () => {
    const result = evaluateCpNetworkModel(baseContext());
    const currentRow = result.criteriaRows.find(row => row.checkType === 'currentAllocation');
    const rectifierRow = result.criteriaRows.find(row => row.checkType === 'rectifierCapacity');
    assert.equal(currentRow.requiredCurrentA, 0.2);
    assert.equal(currentRow.allocatedCurrentA, 0.9);
    assert.equal(currentRow.status, 'pass');
    assert.equal(rectifierRow.status, 'pass');
    assert.equal(result.summary.totalDemandA, 0.2);
    assert.equal(result.summary.totalSourceA, 0.9);
  });

  it('classifies under-protected structures and seasonal soil profile warnings', () => {
    const result = evaluateCpNetworkModel(baseContext({
      networkCase: { seasonalCase: 'dry', profileStationSpacingM: 50 },
      anodeRows: [{ ratedOutputA: 0.01, zone: 'North' }],
      rectifierRows: [],
    }));
    assert.equal(result.criteriaRows.find(row => row.checkType === 'currentAllocation').status, 'fail');
    assert.ok(result.potentialProfileRows.some(row => row.status === 'fail' || row.status === 'warn'));
    assert.ok(result.warningRows.some(row => row.code === 'under-protected-zone'));
  });

  it('classifies polarization, bond, and interference rows', () => {
    const result = evaluateCpNetworkModel(baseContext({
      polarizationRows: [{ structureId: 's1', testStationRef: 'TS weak', instantOffMv: -780, polarizationShiftMv: 60 }],
    }));
    assert.equal(result.polarizationRows[0].status, 'fail');
    assert.equal(result.bondRows[0].status, 'warn');
    assert.equal(result.interferenceRows[0].status, 'fail');
    assert.equal(result.summary.interferenceRiskLevel, 'medium');
  });

  it('builds potential profiles independently from an evaluation object', () => {
    const result = evaluateCpNetworkModel(baseContext());
    const profileRows = buildCpPotentialProfileRows(result, { stationSpacingM: 25 });
    assert.equal(profileRows.length, 5);
    assert.ok(profileRows.every(row => Number.isFinite(row.stationM)));
  });

  it('builds package JSON and escapes rendered HTML', () => {
    const pkg = buildCathodicProtectionNetworkPackage(baseContext());
    const html = renderCathodicProtectionNetworkHTML(pkg);
    assert.equal(pkg.version, CATHODIC_PROTECTION_NETWORK_VERSION);
    assert.ok(html.includes('CP Network &lt;Project&gt;'));
    assert.ok(html.includes('Pipe &lt;A&gt;'));
    assert.ok(html.includes('Transit &lt;DC&gt;'));
    assert.ok(!html.includes('<Project>'));
  });

  it('integrates with report package and Design Coach actions', () => {
    const pkg = buildCathodicProtectionNetworkPackage(baseContext({
      anodeRows: [{ ratedOutputA: 0.01, zone: 'North' }],
      rectifierRows: [],
    }));
    const report = { summary: { projectName: 'Test' }, cathodicProtectionNetwork: pkg };
    const sections = buildReportPackageSections(report, { includeSections: ['cathodicProtectionNetwork'] });
    assert.equal(sections.length, 1);
    assert.ok(sections[0].rows.some(row => row.recordType === 'criteria'));
    const actions = buildDesignCoachActions({ projectReport: report, studies: { cathodicProtectionNetwork: pkg } }, { includeDecided: true });
    assert.ok(actions.some(action => action.source.type === 'cathodicProtectionNetwork'));
  });
});
