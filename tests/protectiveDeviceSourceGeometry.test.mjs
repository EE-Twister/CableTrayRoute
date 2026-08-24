import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const evidenceText = await readFile(
  new URL('../docs/protective-device-source-geometry-smu20-2026-08-12.json', import.meta.url),
  'utf8',
);
const evidence = JSON.parse(evidenceText);

assert.equal(evidence.status, 'technical_candidate_only_not_for_promotion');
assert.equal(evidence.records.length, 3);
assert.equal(evidence.records.flatMap(record => record.profiles).length, 6);
assert.equal(
  evidence.records.flatMap(record => record.profiles)
    .reduce((total, profile) => total + profile.rawCurve.length, 0),
  522,
);
assert.ok(evidence.sourceDocuments.every(source => source.url.startsWith('https://www.sandc.com/')));

evidence.records.forEach(record => {
  assert.equal(record.disposition, 'retain_canonical_record_unchanged');
  record.profiles.forEach(profile => {
    assert.equal(profile.rawCurve.length, profile.sourcePointCount);
    assert.equal(profile.candidateBoundaryComparison.rejectedPointCount, 0);
    assert.ok(profile.candidateBoundaryComparison.maximumLog10Error <= 1e-12);
    assert.equal(profile.canonicalBoundaryComparison.rejectedPointCount, 0);
    assert.ok(Number.isFinite(profile.canonicalBoundaryComparison.maximumLog10Error));
  });
});

assert.doesNotMatch(evidenceText, /"reviewer"|"approved"|"calculation_ready"/i);

console.log('protective-device source geometry evidence passed');
