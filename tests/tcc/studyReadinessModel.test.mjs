import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildTccWorkflowContext, summarizeTccStudyReadiness } from '../../analysis/tcc/studyReadinessModel.mjs';

console.log('TCC study readiness model');

{
  const result = summarizeTccStudyReadiness([]);
  assert.equal(result.status, 'empty');
  assert.equal(result.counts.selected, 0);
  assert.match(result.heading, /Choose protective devices/);
  console.log('  ✓ guides an empty study without implying a result');
}

{
  const screening = buildTccWorkflowContext([
    { baseDevice: { id: 'CB-1', type: 'breaker', settings: { pickup: 100 } }, libraryAssessment: { status: 'screening', label: 'Screening only' } },
    { baseDevice: { id: 'CB-2', type: 'breaker', settings: { pickup: 200 } }, libraryAssessment: { status: 'calculation_ready', label: 'Calculation-ready' } },
  ], { faultCurrentA: 12000 });
  assert.equal(screening.autoCoordination.allowed, false);
  assert.equal(screening.settingsExport.allowed, false);
  assert.match(screening.autoCoordination.reason, /not calculation-ready/);

  const readyEntries = screening.protectiveEntries.map(entry => ({
    ...entry,
    libraryAssessment: { status: 'calculation_ready', label: 'Calculation-ready' },
  }));
  const missingFault = buildTccWorkflowContext(readyEntries);
  assert.equal(missingFault.autoCoordination.allowed, false);
  assert.match(missingFault.autoCoordination.reason, /No assumed fault current/);
  assert.equal(missingFault.settingsExport.allowed, true);

  const ready = buildTccWorkflowContext(readyEntries, {
    faultCurrentA: 12000,
    faultCurrentSource: 'Short Circuit study — BUS-1 (three-phase)',
    componentId: 'BUS-1',
  });
  assert.equal(ready.autoCoordination.allowed, true);
  assert.equal(ready.settingsExport.allowed, true);
  assert.equal(ready.provenance.faultCurrentA, 12000);
  assert.match(ready.provenance.inputFingerprint, /^[0-9a-f]{8}$/);
  assert.equal(ready.provenance.devices.length, 2);
  const changedFault = buildTccWorkflowContext(readyEntries, { faultCurrentA: 13000 });
  assert.notEqual(changedFault.provenance.inputFingerprint, ready.provenance.inputFingerprint);
  console.log('  ✓ gates automatic settings by device evidence and project fault-current basis');
}

{
  const result = summarizeTccStudyReadiness([
    { libraryAssessment: { status: 'calculation_ready' } },
    { libraryAssessment: { status: 'screening' } },
    { kind: 'cable' },
  ]);
  assert.equal(result.status, 'screening');
  assert.deepEqual(result.counts, {
    selected: 3,
    calculationReady: 1,
    sourceVerified: 0,
    standardsReference: 0,
    screening: 1,
    references: 1,
  });
  assert.match(result.summary, /preliminary comparison only/);
  assert.match(result.summary, /not issued settings or arc-flash clearing times/);
  console.log('  ✓ restricts screening curves while retaining project reference counts');
}

{
  const result = summarizeTccStudyReadiness([
    { libraryAssessment: { status: 'source_verified' } },
    { libraryAssessment: { status: 'calculation_ready' } },
  ]);
  assert.equal(result.status, 'review');
  assert.match(result.heading, /Independent review required/);
  assert.match(result.summary, /awaiting peer review/);
  console.log('  ✓ keeps source-verified curves behind the independent-review gate');
}

{
  const standardsResult = summarizeTccStudyReadiness([
    { libraryAssessment: { status: 'standards_reference' } },
  ]);
  assert.equal(standardsResult.status, 'review');
  assert.match(standardsResult.summary, /associated interrupting device/);

  const readyResult = summarizeTccStudyReadiness([
    { libraryAssessment: { status: 'calculation_ready' } },
  ]);
  assert.equal(readyResult.status, 'ready');
  assert.match(readyResult.summary, /Confirm project topology/);
  console.log('  ✓ separates standards-reference and calculation-ready device evidence');
}

{
  const source = await readFile(new URL('../../analysis/tcc/studyReadinessModel.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\bdocument\s*\.|\b(?:window|HTMLElement|HTMLCanvasElement|d3)\b/);
  console.log('  ✓ remains independent of browser and chart APIs');
}
