import assert from 'assert';
import {
  EMF_EXPOSURE_VERSION,
  normalizeEmfStudyCase,
  normalizeEmfCircuitRows,
  buildEmfConductorGeometry,
  evaluateEmfExposureCase,
  buildEmfExposurePackage,
  renderEmfExposureHTML,
  fieldFromSingleConductor,
} from '../analysis/emf.mjs';
import { buildDesignCoachActions } from '../analysis/designCoach.mjs';
import { buildReportPackageSections } from '../reports/reportPackage.mjs';

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

const baseContext = {
  projectName: 'EMF Test Project',
  studyCase: {
    name: 'PCC <EMF>',
    frequencyHz: 60,
    exposureBasis: 'custom',
    customLimit_uT: 15,
    geometryMode: 'tray',
    profileHeightM: 0.6,
    warningMarginPct: 80,
  },
  circuitRows: [{
    id: 'ckt-1',
    tag: 'Tray <A>',
    geometryMode: 'tray',
    currentA: 500,
    trayWidthM: 0.4,
    phaseSpacingM: 0.08,
    conductorOdM: 0.03,
    nParallelSets: 1,
  }],
  measurementPoints: [
    { id: 'p1', label: 'Public <Fence>', xM: 0.1, yM: 0.6 },
    { id: 'p2', label: 'Worker 1 m', xM: 1, yM: 0.6 },
  ],
};

describe('EMF exposure study case', () => {
  it('preserves legacy helper behavior', () => {
    assert.strictEqual(Math.round(fieldFromSingleConductor(100, 1)), 20);
  });

  it('normalizes defaults and rejects invalid study-case inputs', () => {
    const normalized = normalizeEmfStudyCase({});
    assert.strictEqual(normalized.frequencyHz, 60);
    assert.strictEqual(normalized.exposureBasis, 'icnirpPublic');
    assert.strictEqual(normalized.geometryMode, 'tray');
    assert.throws(() => normalizeEmfStudyCase({ exposureBasis: 'bad' }), /Exposure basis/);
    assert.throws(() => normalizeEmfStudyCase({ frequencyHz: 0 }), /Frequency/);
    assert.throws(() => normalizeEmfStudyCase({ geometryMode: 'mesh' }), /Geometry mode/);
    assert.throws(() => normalizeEmfStudyCase({ reportPreset: 'audit' }), /Report preset/);
  });

  it('normalizes tray, ductbank/direct-burial, and custom circuit geometry rows', () => {
    const rows = normalizeEmfCircuitRows([
      { tag: 'Tray', currentA: 100, geometryMode: 'tray' },
      { tag: 'DB', currentA: 100, geometryMode: 'ductbank', depthM: 1.2 },
      { tag: 'Custom', currentA: 100, geometryMode: 'custom', xM: 2, elevationM: 1 },
    ]);
    assert.strictEqual(rows.length, 3);
    assert.strictEqual(rows[1].yM, -1.2);
    assert.strictEqual(rows[2].xM, 2);
    assert.throws(() => normalizeEmfCircuitRows([{ currentA: -1 }]), /current/);
  });

  it('builds deterministic multi-circuit conductor geometry', () => {
    const geometry = buildEmfConductorGeometry(baseContext);
    assert.strictEqual(geometry.conductors.length, 3);
    assert.ok(geometry.bounds.minX < geometry.bounds.maxX);
    assert.strictEqual(geometry.conductors[0].circuitTag, 'Tray <A>');
  });

  it('phase sequence and explicit current angles are represented deterministically', () => {
    const abc = evaluateEmfExposureCase(baseContext);
    const acb = evaluateEmfExposureCase({
      ...baseContext,
      circuitRows: [{ ...baseContext.circuitRows[0], phaseSequence: 'ACB' }],
    });
    const explicit = evaluateEmfExposureCase({
      ...baseContext,
      circuitRows: [{ ...baseContext.circuitRows[0], phaseAnglesDeg: [0, 0, 180] }],
    });
    assert.notDeepStrictEqual(
      abc.conductorGeometry.conductors.map(row => row.phaseAngleDeg),
      acb.conductorGeometry.conductors.map(row => row.phaseAngleDeg),
    );
    assert.notStrictEqual(abc.fieldRows[0].bRms_uT, explicit.fieldRows[0].bRms_uT);
  });

  it('depth/profile height and shielding modifiers affect field rows deterministically', () => {
    const base = evaluateEmfExposureCase(baseContext);
    const shielded = evaluateEmfExposureCase({
      ...baseContext,
      studyCase: { ...baseContext.studyCase, shieldingMode: 'screeningFactor', shieldingFactor: 0.5 },
    });
    const buried = evaluateEmfExposureCase({
      ...baseContext,
      circuitRows: [{ ...baseContext.circuitRows[0], geometryMode: 'directBurial', depthM: 1.5 }],
    });
    assert.ok(shielded.fieldRows[0].bRms_uT < base.fieldRows[0].bRms_uT);
    assert.ok(buried.fieldRows[0].bRms_uT < base.fieldRows[0].bRms_uT);
    assert.ok(shielded.warningRows.some(row => row.code === 'shielding-screening'));
  });

  it('classifies exposure rows against custom and ICNIRP limits', () => {
    const custom = evaluateEmfExposureCase(baseContext);
    assert.ok(custom.fieldRows.some(row => row.status === 'fail' || row.status === 'warn'));
    const publicCase = evaluateEmfExposureCase({
      ...baseContext,
      studyCase: { ...baseContext.studyCase, exposureBasis: 'icnirpPublic', customLimit_uT: null },
    });
    assert.ok(publicCase.fieldRows.every(row => row.limit_uT === 200));
  });

  it('compares measured validation rows and flags mismatch', () => {
    const result = evaluateEmfExposureCase({
      ...baseContext,
      validationRows: [{
        id: 'val-1',
        label: 'Field tech <reading>',
        pointId: 'p1',
        measuredB_uT: 999,
        source: 'meter <A>',
      }],
    });
    assert.strictEqual(result.validationRows[0].status, 'warn');
    assert.ok(result.warningRows.some(row => row.code === 'validation-mismatch'));
  });

  it('builds package JSON and escapes rendered HTML', () => {
    const pkg = buildEmfExposurePackage({
      ...baseContext,
      validationRows: [{ pointId: 'p1', label: 'Source <script>', measuredB_uT: 1, source: 'meter <x>' }],
    });
    assert.strictEqual(pkg.version, EMF_EXPOSURE_VERSION);
    assert.ok(pkg.fieldRows.length);
    assert.ok(pkg.profileRows.length);
    const html = renderEmfExposureHTML(pkg);
    assert.ok(html.includes('&lt;EMF&gt;') || html.includes('PCC &lt;EMF&gt;'));
    assert.ok(html.includes('Source &lt;script&gt;'));
    assert.ok(!html.includes('<script>'));
  });

  it('integrates with report package sections and Design Coach actions', () => {
    const pkg = buildEmfExposurePackage({
      ...baseContext,
      validationRows: [{ pointId: 'p1', label: 'Mismatch', measuredB_uT: 999 }],
    });
    const report = { summary: { projectName: 'Test' }, emfExposure: pkg };
    const sections = buildReportPackageSections(report, { includeSections: ['emfExposure'] });
    assert.strictEqual(sections.length, 1);
    assert.strictEqual(sections[0].id, 'emfExposure');
    assert.ok(sections[0].rows.some(row => row.recordType === 'field'));
    const actions = buildDesignCoachActions({ projectReport: report, studies: { emfExposure: pkg } }, { includeDecided: true });
    assert.ok(actions.some(action => action.source.type === 'emfExposure'));
  });
});
