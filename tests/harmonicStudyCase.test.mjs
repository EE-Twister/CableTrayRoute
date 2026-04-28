import assert from 'node:assert/strict';
import {
  buildHarmonicFilterAlternatives,
  buildHarmonicStudyPackage,
  buildIeee519ComplianceRows,
  HARMONIC_STUDY_CASE_VERSION,
  normalizeHarmonicSourceRows,
  normalizeHarmonicStudyCase,
  parseHarmonicSpectrum,
  renderHarmonicStudyHTML,
  runHarmonicStudyCase,
} from '../analysis/harmonicStudyCase.mjs';

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

const baseStudyCase = {
  pccBus: 'PCC-1',
  pccTag: 'PCC <Main>',
  nominalVoltageKv: 0.48,
  utilityScMva: 5,
  utilityXrRatio: 10,
  maximumDemandCurrentA: 100,
  demandCurrentBasis: 'Measured 15-minute peak',
  complianceBasis: 'IEEE519-2022',
  reportPreset: 'fullStudy',
};

const baseSources = [
  {
    id: 'vfd-1',
    tag: 'VFD <Pump>',
    sourceType: 'vfd',
    busId: 'PCC-1',
    componentId: 'vfd-1',
    fundamentalCurrentA: 500,
    spectrumText: '5:80,7:60,11:25',
  },
];

describe('harmonic study case normalization', () => {
  it('normalizes study-case defaults and required PCC metadata', () => {
    const studyCase = normalizeHarmonicStudyCase(baseStudyCase);
    assert.equal(studyCase.pccTag, 'PCC <Main>');
    assert.equal(studyCase.complianceBasis, 'IEEE519-2022');
    assert.equal(studyCase.triplenTreatment, 'screening');
    assert.equal(studyCase.ieee519VoltageClass, 'lowVoltage');
  });

  it('rejects invalid voltage, compliance basis, and report presets', () => {
    assert.throws(() => normalizeHarmonicStudyCase({ nominalVoltageKv: 0 }), /voltage/i);
    assert.throws(() => normalizeHarmonicStudyCase({ complianceBasis: 'badBasis' }), /compliance/i);
    assert.throws(() => normalizeHarmonicStudyCase({ reportPreset: 'badPreset' }), /report/i);
  });

  it('normalizes source spectra from text and JSON rows', () => {
    assert.deepEqual(parseHarmonicSpectrum('5:35,7:25 11:9'), { 5: 35, 7: 25, 11: 9 });
    assert.deepEqual(parseHarmonicSpectrum('{"5":35,"7":25}'), { 5: 35, 7: 25 });
    const rows = normalizeHarmonicSourceRows([
      { id: 'ups-1', tag: 'UPS-1', sourceType: 'ups', fundamentalCurrentA: 80, spectrumText: '{"3":10,"5":22}', interharmonic: true },
    ]);
    assert.equal(rows[0].sourceType, 'ups');
    assert.equal(rows[0].spectrum[5], 22);
    assert.equal(rows[0].status, 'review');
    assert(rows[0].warnings.some(w => w.code === 'interharmonicReview'));
  });

  it('rejects unsupported source types', () => {
    assert.throws(() => normalizeHarmonicSourceRows([{ sourceType: 'welder', fundamentalCurrentA: 10 }]), /source type/i);
  });
});

describe('IEEE 519 compliance and filter alternatives', () => {
  it('classifies VTHD, individual distortion, and TDD pass/warn/fail deterministically', () => {
    const rows = buildIeee519ComplianceRows({
      studyCase: baseStudyCase,
      sourceRows: baseSources,
      harmonicResults: { 'vfd-1': { ithd: 102.47, vthd: 12 } },
    });
    const vthd = rows.find(row => row.checkType === 'VTHD');
    const individual = rows.find(row => row.checkType === 'Individual Voltage');
    const tdd = rows.find(row => row.checkType === 'TDD');
    assert.equal(vthd.status, 'fail');
    assert.equal(individual.status, 'fail');
    assert.equal(tdd.status, 'fail');
    assert(tdd.iscIlRatio > 50);
  });

  it('marks demand-current and utility short-circuit gaps as missing data', () => {
    const rows = buildIeee519ComplianceRows({
      studyCase: { pccBus: 'PCC-1', nominalVoltageKv: 0.48 },
      sourceRows: baseSources,
      harmonicResults: {},
    });
    assert(rows.some(row => row.status === 'missingData' && row.missingFields.includes('maximumDemandCurrentA')));
    assert(rows.some(row => row.missingFields.includes('utilityScMva')));
  });

  it('uses frequency-scan and capacitor context to flag resonance/filter review risk', () => {
    const filters = buildHarmonicFilterAlternatives({
      studyCase: baseStudyCase,
      sourceRows: baseSources,
      frequencyScan: {
        resonances: [{ h: 5, risk: 'danger', type: 'parallel', description: '5th harmonic resonance' }],
      },
      capacitorBank: {
        detuning: { detuningPct: 5.67, tunedToOrder: 4.3, rationale: 'Detune below 5th.' },
      },
    });
    assert(filters.length >= 1);
    assert.equal(filters[0].frequencyScanResonanceRisk, 'danger');
    assert.equal(filters[0].reactorPercent, 5.67);
    assert(filters[0].targetHarmonics.includes(5));
  });
});

describe('harmonic study package', () => {
  it('runs a deterministic study case and builds the public package payload', () => {
    const result = runHarmonicStudyCase({
      studyCase: baseStudyCase,
      sourceRows: baseSources,
      frequencyScan: { resonances: [{ h: 5, risk: 'danger' }] },
    });
    const pkg = buildHarmonicStudyPackage({
      projectName: 'North Unit',
      ...result,
    });
    assert.equal(pkg.version, HARMONIC_STUDY_CASE_VERSION);
    assert.equal(pkg.projectName, 'North Unit');
    assert.equal(pkg.summary.sourceCount, 1);
    assert(pkg.summary.fail > 0);
    assert(pkg.complianceRows.length >= 3);
    assert(pkg.filterAlternatives.length >= 1);
    assert(pkg.warnings.some(w => w.code === 'ieee519ComplianceFailure'));
    assert(pkg.assumptions.some(text => /screening/i.test(text)));
  });

  it('keeps legacy harmonic result maps reportable', () => {
    const pkg = buildHarmonicStudyPackage({
      projectName: 'Legacy Harmonics',
      studyCase: baseStudyCase,
      harmonics: { 'vfd-1': { ithd: 30, vthd: 2, limit: 8, warning: false } },
      sourceRows: [{ ...baseSources[0], spectrumText: '5:20,7:14' }],
    });
    assert.equal(pkg.version, HARMONIC_STUDY_CASE_VERSION);
    assert.equal(pkg.results['vfd-1'].vthd, 2);
    assert(pkg.complianceRows.some(row => row.sourceId === 'vfd-1'));
  });

  it('escapes user labels, source tags, notes, and filter names in rendered HTML', () => {
    const pkg = buildHarmonicStudyPackage({
      projectName: 'Escaping',
      studyCase: { ...baseStudyCase, reviewNotes: '<script>alert(1)</script>' },
      sourceRows: [{ ...baseSources[0], tag: 'VFD <Pump>' }],
      filterAlternatives: [{ id: 'f1', name: 'Filter <A>', filterType: 'activeFilter', targetHarmonics: [5], status: 'review' }],
    });
    const html = renderHarmonicStudyHTML(pkg);
    assert(html.includes('VFD &lt;Pump&gt;'));
    assert(html.includes('Filter &lt;A&gt;'));
    assert(!html.includes('VFD <Pump>'));
    assert(!html.includes('Filter <A>'));
  });
});
