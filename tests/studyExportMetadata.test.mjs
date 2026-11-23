import assert from 'node:assert/strict';
import { studyExportMetadata, studyLifecycleMetadataLines } from '../analysis/studyExportMetadata.mjs';

const assessment = {
  validity: { state: 'evaluated' },
  freshness: 'current',
  eligible: false,
  label: 'Dependency blocked',
  provenance: {
    capturedAt: '2026-09-17T12:00:00Z',
    calculationRevision: 'calc-v2',
    optionsSnapshot: { mode: 'conservative', note: 'line 1\nline 2' },
    inputSourcesSnapshot: { source: 'fixture' },
    assumptions: ['context assumption'],
    warnings: ['context warning'],
    units: { current: 'A' },
  },
};

const metadata = studyExportMetadata({
  resultEligibility: 'eligible',
  resultStatus: 'Current saved result',
  assumptions: ['result assumption'],
  warnings: ['result warning'],
}, { assessment });

assert.equal(metadata.resultEligibility, 'withheld');
assert.equal(metadata.resultStatus, 'Dependency blocked');
assert.equal(metadata.calculationVersion, 'calc-v2');
assert.equal(metadata.calculatedAt, '2026-09-17T12:00:00Z');
assert.deepEqual(JSON.parse(metadata.studyOptions), { mode: 'conservative', note: 'line 1\nline 2' });
assert.deepEqual(JSON.parse(metadata.inputSources), { source: 'fixture' });
assert.deepEqual(JSON.parse(metadata.assumptions), ['context assumption', 'result assumption']);
assert.deepEqual(JSON.parse(metadata.warnings), ['context warning', 'result warning']);
assert.deepEqual(JSON.parse(metadata.units), { current: 'A' });

const lines = studyLifecycleMetadataLines({ warnings: ['clearance, unknown'] }, { assessment });
const warningLine = lines.find((line) => line.startsWith('# warnings,'));
assert.equal(warningLine, '# warnings,"[""context warning"",""clearance, unknown""]"');
assert.ok(lines.some((line) => line.includes('line 1\\nline 2')));

console.log('studyExportMetadata tests passed');
