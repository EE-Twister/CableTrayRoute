import assert from 'assert';
import fs from 'fs';
import { buildSupplementalStudySections } from '../analysis/reportSupplementalSections.mjs';
import { buildStudyProvenance, captureStudyRunContext } from '../analysis/studyLifecycle.mjs';
import { buildSustainabilityReport } from '../analysis/sustainabilityFootprint.mjs';
import { runHazAreaStudy } from '../analysis/hazAreaClassification.mjs';
import { runInsulationCoordinationStudy } from '../analysis/insulationCoordination.mjs';
import { runLightingStudy } from '../analysis/lighting.mjs';

// Sections must read the shapes the study pages save, so every fixture is real
// engine output passed through the same JSON round trip as project storage.

const roundTrip = value => JSON.parse(JSON.stringify(value));

function lifecycleOptions(studyKey, result) {
  const context = captureStudyRunContext(studyKey, {
    projectSnapshot: { project: 'report-supplemental-test' },
    inputs: { studyKey, revision: 1 },
    options: { mode: 'test' },
    scenario: 'Base',
    projectIdentity: { projectId: 'report-supplemental-test', projectName: 'Report Supplemental Test' },
  });
  return {
    studyProvenance: { [studyKey]: buildStudyProvenance(studyKey, result, context, { validity: 'evaluated' }) },
    currentStudyContext: context,
  };
}

function section(sectionKey, studyKey, stored, approvals = {}) {
  return buildSupplementalStudySections({ [studyKey]: stored }, approvals, lifecycleOptions(studyKey, stored))[sectionKey];
}

const labels = sectionData => sectionData.headers.map(header => header.label);

function sustainabilityStored(options = { gridRegion: 'us', projectLifeYears: 25, lossesKw: 1.5 }) {
  // Shape saved by sustainability.js: { _inputs, _result, _bom }.
  const bom = [
    { id: 'CBL-101', type: 'cable', quantity: 30.48, size: '4 AWG', material: 'Cu', conductors: 3 },
    { id: 'TRAY-1', type: 'tray', quantity: 15.24, widthIn: 12, material: 'steel' },
    { id: 'CND-7', type: 'conduit', quantity: 6.096, tradeSizeIn: 1, material: 'emt' },
    { id: 'BAD-1', type: 'widget', quantity: 1 },
  ];
  return roundTrip({ _inputs: { gridRegion: options.gridRegion }, _result: buildSustainabilityReport(bom, options), _bom: bom });
}

(function testEmptyWhenStudyAbsent() {
  const sections = buildSupplementalStudySections({}, {}, {});
  assert.deepStrictEqual(Object.keys(sections).sort(), ['hazAreaClass', 'insulationCoord', 'lighting', 'sustainability', 'tccSettings']);
  assert.deepStrictEqual(sections.sustainability, { key: 'sustainability', title: 'Sustainability Footprint', empty: true });
  assert.deepStrictEqual(sections.tccSettings, { key: 'tccSettings', title: 'TCC Settings Manifest', empty: true });
  assert.deepStrictEqual(sections.hazAreaClass, { key: 'hazAreaClass', title: 'Hazardous Area Classification', empty: true });
  assert.deepStrictEqual(sections.insulationCoord, { key: 'insulationCoord', title: 'Insulation Coordination (BIL/SIL)', empty: true });
  assert.deepStrictEqual(sections.lighting, { key: 'lighting', title: 'Egress Lighting (NFPA 101)', empty: true });
  assert.strictEqual(buildSupplementalStudySections(undefined, undefined, undefined).lighting.empty, true);
  console.log('✓ supplemental sections are empty when the study result is absent');
})();

(function testSustainabilitySectionReadsSavedFootprint() {
  const stored = sustainabilityStored();
  const result = stored._result;
  const approval = { status: 'reviewed', reviewedBy: 'Engineer' };
  const sec = section('sustainability', 'sustainabilityFootprint', stored, { sustainabilityFootprint: approval });

  assert.strictEqual(sec.key, 'sustainability');
  assert.strictEqual(sec.title, 'Sustainability Footprint');
  assert.strictEqual(sec.approval, approval, 'approval is looked up by the study key');
  assert.deepStrictEqual(labels(sec), [
    'BOM item', 'Category', 'Quantity', 'Quantity unit', 'Emission factor (kgCO2e per unit)',
    'Embodied carbon (kgCO2e)', 'Factor quality', 'Factor basis',
  ]);
  assert.deepStrictEqual(sec.rows.map(row => row.id), ['CBL-101', 'TRAY-1', 'CND-7'], 'one row per included BOM line');
  const cable = sec.rows[0];
  const cableLine = result.embodied.lines[0];
  assert.strictEqual(cable.resultEligibility, 'eligible');
  assert.strictEqual(cable.category, 'Cable');
  assert.strictEqual(cable.quantity, 30.48);
  assert.strictEqual(cable.quantityUnit, 'm');
  assert.strictEqual(cable.factorKgPerUnit, cableLine.co2eKgPerUnit);
  assert.strictEqual(cable.embodiedKg, cableLine.subtotalKg);
  assert.strictEqual(cable.factorQuality, 'Screening library average');

  assert.strictEqual(sec.summary['Total footprint (kgCO2e)'], result.totalKg);
  assert.strictEqual(sec.summary['Embodied carbon, Scope 3 (kgCO2e)'], result.embodied.totalKg);
  assert.strictEqual(sec.summary['Operating carbon, Scope 2 lifetime (kgCO2e)'], result.operating.lifetimeKgCO2e);
  assert.strictEqual(sec.summary['Annual conductor losses (kWh/yr)'], 1.5 * 8760);
  assert.strictEqual(sec.summary['Grid emission factor (kgCO2e/kWh)'], result.gridFactorKgPerKwh);
  assert.strictEqual(sec.summary['Grid factor basis'], result.gridFactorProvenance.label);
  assert.strictEqual(sec.summary['Project life (years)'], 25);
  assert.strictEqual(sec.summary['Embodied carbon, cable (kgCO2e)'], cableLine.subtotalKg);
  assert.strictEqual(sec.summary['BOM lines skipped'], 1);
  assert.ok(sec.warnings.some(warning => /Skipped BOM item BAD-1/.test(warning)), 'skipped BOM items are reported');

  const noLosses = section('sustainability', 'sustainabilityFootprint', sustainabilityStored({ gridRegion: 'us', projectLifeYears: 25 }));
  assert.match(noLosses.summary['Operating carbon, Scope 2 lifetime (kgCO2e)'], /Not included/, 'missing losses are not reported as zero');
  assert.ok(!('Annual conductor losses (kWh/yr)' in noLosses.summary));
  console.log('✓ sustainability section reads the saved footprint');
})();

(function testTccSectionReadsSavedCoordinationPairs() {
  const sample = JSON.parse(fs.readFileSync(new URL('../samples/project-workflow-core.json', import.meta.url), 'utf8'));
  const stored = roundTrip(sample.settings.studies.tcc);
  const sec = section('tccSettings', 'tcc', stored, sample.settings.studyApprovals);

  assert.strictEqual(sec.key, 'tccSettings');
  assert.strictEqual(sec.title, 'TCC Settings Manifest');
  assert.strictEqual(sec.approval.status, 'reviewed');
  assert.deepStrictEqual(labels(sec), [
    'Upstream device', 'Downstream device', 'Fault current (kA)', 'Coordination time interval (s)', 'Saved coordination status',
  ]);
  assert.strictEqual(sec.rows.length, stored.pairs.length);
  const first = sec.rows[0];
  assert.strictEqual(first.resultEligibility, 'eligible');
  assert.strictEqual(first.from, 'MAIN-SWBD-101');
  assert.strictEqual(first.to, 'FDR-MCC-101');
  assert.strictEqual(first.faultCurrentKA, 16.3);
  assert.strictEqual(first.intervalSeconds, 0.36);
  assert.strictEqual(first.status, 'Coordinated');
  assert.strictEqual(sec.summary['Minimum coordination interval (s)'], 0.3);
  assert.strictEqual(sec.summary['Device pairs'], 5);
  assert.strictEqual(sec.summary['Smallest saved interval (s)'], 0.32);
  assert.strictEqual(sec.summary.Method, stored.method);

  const noPairs = section('tccSettings', 'tcc', { status: 'Draft' });
  assert.strictEqual(noPairs.rows.length, 0);
  assert.ok(noPairs.warnings.some(warning => /no coordinated device pairs/.test(warning)));
  console.log('✓ TCC section reads saved coordination pairs');
})();

(function testHazAreaSectionJoinsAreasAndEquipment() {
  // Shape saved by hazareaclassification.js: the runHazAreaStudy() result.
  const { valid, result } = runHazAreaStudy({
    areas: [
      { id: 'pump-room', label: 'Pump Room', standard: 'NEC', necClass: 'I', necDivision: '2', gasGroup: 'D', tRating: 'T3' },
      { id: 'tank-farm', label: 'Tank Farm', standard: 'IEC', iecZone: '1', gasGroup: 'IIA', tRating: 'T3' },
    ],
    equipment: [
      { id: 'JB-101', label: 'Junction Box', hazAreaId: 'pump-room', exProtection: 'd', exGroup: 'IIB', tRating: 'T4', certNumber: 'IECEx TEST 1' },
      { id: 'LT-102', label: 'Light Fixture', hazAreaId: 'pump-room', exProtection: 'e', exGroup: 'IIB', tRating: 'T2', certNumber: 'IECEx TEST 2' },
      { id: 'MTR-9', label: 'Motor', hazAreaId: 'missing-area', exProtection: 'd' },
    ],
  });
  assert.ok(valid, 'fixture study is valid');
  const stored = roundTrip(result);
  const sec = section('hazAreaClass', 'hazAreaClassification', stored);

  assert.strictEqual(sec.key, 'hazAreaClass');
  assert.strictEqual(sec.title, 'Hazardous Area Classification');
  assert.deepStrictEqual(labels(sec), [
    'Area ID', 'Area', 'Classification', 'Gas / dust group', 'Area T-rating', 'Equipment ID', 'Equipment',
    'Ex protection', 'Equipment group', 'Equipment T-rating', 'Certificate', 'Status', 'Issues',
  ]);
  assert.deepStrictEqual(sec.rows.map(row => [row.areaId, row.id]), [
    ['pump-room', 'JB-101'], ['pump-room', 'LT-102'], ['tank-farm', null], ['missing-area', 'MTR-9'],
  ]);
  const jb = sec.rows[0];
  assert.strictEqual(jb.resultEligibility, 'eligible');
  assert.strictEqual(jb.classification, 'Class I Div 2 (NEC)');
  assert.strictEqual(jb.gasGroup, 'D');
  assert.strictEqual(jb.areaTRating, 'T3');
  assert.strictEqual(jb.exProtection, 'd');
  assert.strictEqual(jb.equipmentTRating, 'T4');
  assert.strictEqual(jb.certNumber, 'IECEx TEST 1');
  assert.strictEqual(jb.status, 'PASS');
  assert.strictEqual(jb.issues, null);
  const light = sec.rows[1];
  assert.strictEqual(light.status, 'FAIL');
  assert.match(light.issues, /T-rating T2/);
  const emptyArea = sec.rows[2];
  assert.strictEqual(emptyArea.classification, 'Zone 1 (IEC)');
  assert.strictEqual(emptyArea.status, 'INFO', 'an area without equipment is not reported as a pass');
  const motor = sec.rows[3];
  assert.strictEqual(motor.status, 'WARN');
  assert.match(motor.issues, /not found/);

  assert.strictEqual(sec.summary['Overall status'], 'FAIL');
  assert.strictEqual(sec.summary['Classified areas'], 2);
  assert.strictEqual(sec.summary['Equipment items checked'], 3);
  assert.strictEqual(sec.summary['Equipment failing'], 1);

  const noEquipment = roundTrip(runHazAreaStudy({
    areas: [{ id: 'z1', label: 'Zone 1 Area', standard: 'IEC', iecZone: '1' }],
    equipment: [],
  }).result);
  const noEquipmentSection = section('hazAreaClass', 'hazAreaClassification', noEquipment);
  assert.strictEqual(noEquipmentSection.summary['Overall status'], 'No equipment checked', 'an empty check is not a pass');
  console.log('✓ hazardous area section joins areas and equipment');
})();

(function testInsulationSectionReportsSavedChecks() {
  // Shape saved by insulationcoordination.js: the engine result plus projectLink.
  const engine = runInsulationCoordinationStudy({
    studyLabel: '13.8 kV switchgear',
    nominalVoltageKv: 13.8,
    umKv: 15.5,
    altitudeM: 0,
    groundingType: 'solidly_grounded',
    approach: 'deterministic',
    lightningImpulse: { representativeKvPeak: 60, arresterResidualKvPeak: 45 },
    surgeArresterMcovKv: 10.2,
  });
  const stored = roundTrip({ ...engine, projectLink: { scopeValue: 'equipment:SWGR-1' } });
  const sec = section('insulationCoord', 'insulationCoordination', stored);

  assert.strictEqual(sec.key, 'insulationCoord');
  assert.strictEqual(sec.title, 'Insulation Coordination (BIL/SIL)');
  assert.deepStrictEqual(labels(sec), [
    'Check', 'Voltage basis', 'Representative overvoltage (kV)', 'Required withstand / minimum (kV)',
    'Selected standard level / provided (kV)', 'Arrester protective margin (%)', 'Required margin (%)', 'Result', 'Note',
  ]);
  assert.deepStrictEqual(sec.rows.map(row => row.check), [
    'Lightning impulse (BIL)', 'Temporary overvoltage (PFWV)', 'Surge arrester MCOV',
  ]);
  const li = sec.rows[0];
  assert.strictEqual(li.resultEligibility, 'eligible');
  assert.strictEqual(li.voltageBasis, 'kV peak');
  assert.strictEqual(li.representativeKv, 60);
  assert.strictEqual(li.requiredKv, engine.liResult.ucwKvPeak);
  assert.strictEqual(li.selectedKv, 75);
  assert.strictEqual(li.marginPct, engine.liResult.protectiveMargin.marginPct);
  assert.strictEqual(li.minMarginPct, 20);
  assert.strictEqual(li.status, 'PASS');
  const tov = sec.rows[1];
  assert.strictEqual(tov.voltageBasis, 'kV rms');
  assert.strictEqual(tov.selectedKv, engine.tovResult.selectedPfwvKv);
  assert.strictEqual(tov.status, null, 'no saved verdict is invented for the TOV check');
  const mcov = sec.rows[2];
  assert.strictEqual(mcov.requiredKv, engine.mcovCheck.requiredMcovKv);
  assert.strictEqual(mcov.selectedKv, 10.2);
  assert.strictEqual(mcov.status, 'PASS');

  assert.strictEqual(sec.summary['Standard Um used (kV)'], 17.5);
  assert.strictEqual(sec.summary['Entered Um (kV)'], 15.5);
  assert.strictEqual(sec.summary['IEC 60071-1 range'], 'I');
  assert.strictEqual(sec.summary['Checks assessed'], 3);
  assert.strictEqual(sec.summary['Overall result'], 'PASS');
  assert.ok(sec.warnings.some(warning => /not a standard value/.test(warning)), 'engine warnings are carried');

  const rangeOne = roundTrip(runInsulationCoordinationStudy({
    nominalVoltageKv: 13.8,
    umKv: 17.5,
    altitudeM: 1500,
    lightningImpulse: { representativeKvPeak: 60 },
    switchingImpulse: { representativeKvPeak: 40, arresterResidualKvPeak: 30 },
  }));
  const rangeOneSection = section('insulationCoord', 'insulationCoordination', rangeOne);
  const liNoArrester = rangeOneSection.rows.find(row => row.check === 'Lightning impulse (BIL)');
  assert.strictEqual(liNoArrester.status, null, 'no margin verdict without an arrester level');
  assert.match(liNoArrester.note, /not checked/);
  const si = rangeOneSection.rows.find(row => row.check === 'Switching impulse (SIL)');
  assert.strictEqual(si.selectedKv, 'No standard SIWV for this Um');
  assert.strictEqual(si.status, null);
  assert.match(si.note, /Not assessed/);
  assert.strictEqual(rangeOneSection.summary['Checks assessed'], 2, 'the unassessed SIL row is not counted');

  const overstressed = roundTrip(runInsulationCoordinationStudy({
    nominalVoltageKv: 13.8,
    umKv: 17.5,
    lightningImpulse: { representativeKvPeak: 200, arresterResidualKvPeak: 60 },
  }));
  const failedSection = section('insulationCoord', 'insulationCoordination', overstressed);
  const failedLi = failedSection.rows.find(row => row.check === 'Lightning impulse (BIL)');
  assert.strictEqual(failedLi.selectedKv, 'None found');
  assert.strictEqual(failedLi.status, null, 'no margin verdict without a selected BIL');
  assert.match(failedLi.note, /No standard BIL meets the required withstand/);
  assert.strictEqual(failedSection.summary['Overall result'], 'FAIL');
  console.log('✓ insulation coordination section reports saved checks');
})();

(function testLightingSectionReadsSavedEgressCheck() {
  const inputs = {
    label: 'Corridor 1',
    roomLengthFt: 40,
    roomWidthFt: 8,
    ceilingHeightFt: 10,
    mountingHeightFt: 9,
    workplaneHeightFt: 0,
    numFixtures: 2,
    lumensPerFixture: 1500,
    llf: 0.8,
    ceilingReflPct: 80,
    wallReflPct: 50,
    fixturePositions: [{ x: 10, y: 4 }, { x: 30, y: 4 }],
    vertAngles: [0, 30, 60, 90],
    candelas: [400, 350, 150, 0],
  };
  const engine = runLightingStudy(inputs);
  // Shape saved by lighting.js: { ...result, _inputs, _iesData, _iesFileName }.
  const stored = roundTrip({ ...engine, _inputs: inputs, _iesData: null, _iesFileName: 'corridor.ies' });
  const sec = section('lighting', 'lighting', stored);

  assert.strictEqual(sec.key, 'lighting');
  assert.strictEqual(sec.title, 'Egress Lighting (NFPA 101)');
  assert.deepStrictEqual(labels(sec), [
    'Egress area', 'Area (sq ft)', 'Luminaires', 'Lumens per luminaire (lm)', 'Mounting height (ft)',
    'Calculation plane height (ft)', 'Average illuminance (fc)', 'Minimum illuminance (fc)',
    'Maximum illuminance (fc)', 'Max:min ratio', 'Compliance basis', 'NFPA 101 result',
  ]);
  assert.strictEqual(sec.rows.length, 1);
  const room = sec.rows[0];
  assert.strictEqual(room.resultEligibility, 'eligible');
  assert.strictEqual(room.label, 'Corridor 1');
  assert.strictEqual(room.areaSqFt, 320);
  assert.strictEqual(room.luminaires, 2);
  assert.strictEqual(room.avgFc, engine.egressCheck.avgFc);
  assert.strictEqual(room.minFc, engine.pointGrid.minFc);
  assert.strictEqual(room.maxFc, engine.pointGrid.maxFc);
  assert.ok(Math.abs(room.maxMinRatio - engine.pointGrid.maxFc / engine.pointGrid.minFc) < 1e-9);
  assert.strictEqual(room.basis, 'Point-by-point grid (10 x 10 points)');
  assert.strictEqual(room.status, engine.egressCheck.pass ? 'PASS' : 'FAIL');
  assert.strictEqual(sec.summary['Room cavity ratio'], engine.lumenMethod.rcr);
  assert.strictEqual(sec.summary['Grid minimum (fc)'], engine.pointGrid.minFc);
  assert.strictEqual(sec.summary['NFPA 101 max:min ratio limit'], '40:1');
  assert.strictEqual(sec.summary['Photometric file'], 'corridor.ies');

  const averageOnly = { ...inputs, fixturePositions: null, vertAngles: null, candelas: null };
  const averageSection = section('lighting', 'lighting', roundTrip({ ...runLightingStudy(averageOnly), _inputs: averageOnly }));
  assert.strictEqual(averageSection.rows[0].basis, 'Lumen-method average only');
  assert.strictEqual(averageSection.rows[0].minFc, null, 'no minimum without a point grid');
  assert.strictEqual(averageSection.rows[0].maxFc, null);
  assert.ok(averageSection.warnings.some(warning => /Point-by-point grid not computed/.test(warning)));

  // lighting.js also saves runs that failed input validation.
  const invalidInputs = { ...inputs, roomLengthFt: Number.NaN };
  const invalid = roundTrip({ ...runLightingStudy(invalidInputs), _inputs: invalidInputs });
  const invalidSection = section('lighting', 'lighting', invalid);
  assert.strictEqual(invalidSection.rows[0].resultEligibility, 'withheld');
  assert.strictEqual(invalidSection.rows[0].status, 'not evaluated');
  assert.ok(invalidSection.warnings.some(warning => /Input error: Room length/.test(warning)));
  assert.ok(invalidSection.summary['Result summary'], 'an invalid run never shows a result summary');
  console.log('✓ lighting section reads the saved egress check');
})();

(function testRowsWithheldWithoutProvenance() {
  const stored = sustainabilityStored();
  const sections = buildSupplementalStudySections({ sustainabilityFootprint: stored, hazAreaClassification: roundTrip(runHazAreaStudy({
    areas: [{ id: 'pump-room', label: 'Pump Room', standard: 'NEC', necClass: 'I', necDivision: '2', gasGroup: 'D', tRating: 'T3' }],
    equipment: [{ id: 'JB-101', label: 'Junction Box', hazAreaId: 'pump-room', exProtection: 'd', exGroup: 'IIB', tRating: 'T4', certNumber: 'C-1' }],
  }).result) }, {}, {});

  const sus = sections.sustainability;
  const cable = sus.rows.find(row => row.id === 'CBL-101');
  assert.ok(cable, 'the BOM item identity stays visible');
  assert.strictEqual(cable.resultEligibility, 'withheld');
  assert.strictEqual(cable.embodiedKg, '—');
  assert.strictEqual(cable.category, 'Cable', 'identity columns are preserved');
  assert.strictEqual(cable.historicalValues.embodiedKg, stored._result.embodied.lines[0].subtotalKg);
  assert.ok(sus.summary['Result summary'], 'summary is replaced with the lifecycle label');
  assert.ok(sus.summary['Historical summary (withheld)']);
  assert.ok(!('Total footprint (kgCO2e)' in sus.summary));

  const haz = sections.hazAreaClass.rows[0];
  assert.strictEqual(haz.areaId, 'pump-room');
  assert.strictEqual(haz.id, 'JB-101');
  assert.strictEqual(haz.status, 'not evaluated', 'a withheld verdict is not reported as a pass');
  assert.strictEqual(haz.exProtection, '—');
  console.log('✓ supplemental rows are withheld without current provenance');
})();
